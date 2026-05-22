import { captureJawJpegDataUrl } from "./annotationLocks.js";

const state = {
  bgImage: null,
  strokes: [],
  redoStack: [],
  currentStroke: null,
  isDrawing: false,
  tool: "pen",
  color: "#7B3FF2",
  size: 6,
  resolveSave: null,
  linePending: null,
  caseLabel: null, // { text, point: {x,y}, color, size } — draggable case-ID label
};

let canvas = null;
let ctx = null;
let resizeObserver = null;
let textInputEl = null;
let textInputPoint = null;
const draggingText = {
  active: false,
  target: null, // reference to stroke OR state.caseLabel
  offsetX: 0,
  offsetY: 0,
  moved: false,
};

function getModal() {
  return document.getElementById("instructionEditorModal");
}

function dpr() {
  return window.devicePixelRatio || 1;
}

function resizeCanvas() {
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  const ratio = dpr();
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  redraw();
}

function loadBgImage(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      state.bgImage = null;
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => {
      state.bgImage = img;
      resolve();
    };
    img.onerror = () => {
      state.bgImage = null;
      resolve();
    };
    img.src = dataUrl;
  });
}

function getBgRect() {
  if (!canvas) return null;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!state.bgImage) return { x: 0, y: 0, w: cw, h: ch };
  const iw = state.bgImage.width;
  const ih = state.bgImage.height;
    // Pad so the jaws don't sit flush against the canvas edges.
  const padding = Math.min(cw, ch) * 0.01;
  const availW = Math.max(1, cw - padding * 2);
  const availH = Math.max(1, ch - padding * 3);
  const scale = Math.min(availW / iw, availH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

function redraw() {
  if (!ctx || !canvas) return;
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fill the whole canvas with white so the shrunken bg image
  // blends seamlessly into a continuous white "page" — only the
  // jaws appear smaller, not the whole panel.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);

  if (state.bgImage) {
    const r = getBgRect();
    ctx.drawImage(state.bgImage, r.x, r.y, r.w, r.h);
  }

  const off = document.createElement("canvas");
  off.width = cw;
  off.height = ch;
  const offCtx = off.getContext("2d");
  const ratio = dpr();
  const allStrokes = state.currentStroke
    ? [...state.strokes, state.currentStroke]
    : state.strokes;
  for (const stroke of allStrokes) {
    drawStrokeOn(offCtx, stroke, ratio);
  }
  ctx.drawImage(off, 0, 0);

  if (state.linePending) {
    drawLinePendingMarker(state.linePending);
  }
}

// Compute approximate bounding box of a text stroke in canvas-CSS coords.
function textBoundsForStroke(stroke) {
  if (!ctx || !stroke || !stroke.text || !stroke.point) return null;
  const fontSize = stroke.fontSize
    ? Math.max(8, stroke.fontSize)
    : Math.max(10, stroke.size * 2);
  const ratio = dpr();
  ctx.save();
  // Measure at the same canvas-pixel size used by drawStrokeOn so the
  // returned width corresponds to the rendered glyphs.
  ctx.font = `600 ${fontSize * ratio}px "Montserrat", "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(stroke.text);
  ctx.restore();
  const w = metrics.width / ratio;
  const h = fontSize * 1.2;
  return {
    x: stroke.point.x,
    y: stroke.point.y,
    w,
    h,
  };
}

function findTextAtPoint(point) {
  // The case-ID watermark is intentionally non-interactive — skip it so the
  // user can draw / drag in the area it occupies. Hit-test committed text
  // strokes only (top-most first).
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    const s = state.strokes[i];
    if (s.tool !== "text") continue;
    const b = textBoundsForStroke(s);
    if (!b) continue;
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) {
      return s;
    }
  }
  return null;
}

function drawLinePendingMarker(point) {
  const ratio = dpr();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.arc(point.x * ratio, point.y * ratio, Math.max(5, state.size * ratio * 0.6), 0, Math.PI * 2);
  ctx.fillStyle = state.color;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5 * ratio;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}

// Draws the case-ID watermark centered between the jaws. Non-interactive —
// just a visual stamp baked into the exported image.
function drawWatermark(c, stroke, ratio) {
  if (!stroke?.text || !stroke?.point) return;
  c.save();
  c.globalCompositeOperation = "source-over";
  const fontSize = stroke.fontSize || Math.max(18, (stroke.size || 16) * 2);
  c.font = `700 ${fontSize * ratio}px "Montserrat", "Segoe UI", sans-serif`;
  c.fillStyle = "rgba(40, 60, 80, 0.55)";
  c.textBaseline = "top";
  c.shadowColor = "rgba(255, 255, 255, 0.85)";
  c.shadowBlur = 4 * ratio;
  c.fillText(stroke.text, stroke.point.x * ratio, stroke.point.y * ratio);
  c.restore();
}

function drawStrokeOn(c, stroke, ratio) {
  if (stroke.tool === "text") {
    if (!stroke.text || !stroke.point) return;
    c.save();
    c.globalCompositeOperation = "source-over";
    // Prefer an explicit pixel `fontSize` (set by the resizable text box)
    // and fall back to the legacy `size * 2` derivation for older strokes.
    const fontSize = stroke.fontSize
      ? Math.max(8, stroke.fontSize)
      : Math.max(10, stroke.size * 2);
    c.font = `600 ${fontSize * ratio}px "Montserrat", "Segoe UI", sans-serif`;
    c.fillStyle = stroke.color;
    c.textBaseline = "top";
    c.fillText(stroke.text, stroke.point.x * ratio, stroke.point.y * ratio);
    c.restore();
    return;
  }
  if (!stroke.points || stroke.points.length === 0) return;
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = stroke.size * ratio;
  if (stroke.tool === "eraser") {
    c.globalCompositeOperation = "destination-out";
    c.strokeStyle = "rgba(0,0,0,1)";
  } else {
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = stroke.color;
  }
  c.beginPath();
  const p0 = stroke.points[0];
  c.moveTo(p0.x * ratio, p0.y * ratio);
  if (stroke.points.length === 1) {
    c.lineTo((p0.x + 0.01) * ratio, p0.y * ratio);
  } else {
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      c.lineTo(p.x * ratio, p.y * ratio);
    }
  }
  c.stroke();
  c.restore();
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function isFreehandTool(t) {
  return t === "pen" || t === "brush" || t === "eraser";
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const point = pointFromEvent(event);

  // Text tool: click on existing text → edit it; click empty → new text.
  if (state.tool === "text") {
    const hit = findTextAtPoint(point);
    if (hit) {
      editExistingText(hit);
      event.preventDefault();
      return;
    }
    spawnTextInput(point);
    return;
  }

  // Other tools (except eraser): click on existing text → drag to move.
  if (state.tool !== "eraser") {
    const hit = findTextAtPoint(point);
    if (hit) {
      draggingText.active = true;
      draggingText.target = hit;
      draggingText.offsetX = point.x - hit.point.x;
      draggingText.offsetY = point.y - hit.point.y;
      draggingText.moved = false;
      canvas.setPointerCapture?.(event.pointerId ?? 0);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }
  }
  if (state.tool === "line") {
    handleLineClick(point);
    return;
  }
  if (!isFreehandTool(state.tool)) return;
  state.isDrawing = true;
  state.redoStack = [];
  state.currentStroke = {
    tool: state.tool,
    color: state.color,
    size: state.size,
    points: [point],
  };
  canvas.setPointerCapture?.(event.pointerId ?? 0);
  redraw();
  updateUndoRedoButtons();
}

function onPointerMove(event) {
  if (draggingText.active && draggingText.target) {
    const point = pointFromEvent(event);
    draggingText.target.point = {
      x: point.x - draggingText.offsetX,
      y: point.y - draggingText.offsetY,
    };
    draggingText.moved = true;
    redraw();
    return;
  }
  if (!state.isDrawing || !state.currentStroke) return;
  state.currentStroke.points.push(pointFromEvent(event));
  redraw();
}

function onPointerUp(event) {
  if (draggingText.active) {
    try { canvas.releasePointerCapture?.(event.pointerId ?? 0); } catch {}
    draggingText.active = false;
    draggingText.target = null;
    applyCanvasCursor();
    redraw();
    return;
  }
  if (!state.isDrawing) return;
  state.isDrawing = false;
  if (state.currentStroke) {
    state.strokes.push(state.currentStroke);
    state.currentStroke = null;
  }
  try { canvas.releasePointerCapture?.(event.pointerId ?? 0); } catch {}
  redraw();
  updateUndoRedoButtons();
}

function handleLineClick(point) {
  if (!state.linePending) {
    state.linePending = point;
    redraw();
    return;
  }
  state.strokes.push({
    tool: "line",
    color: state.color,
    size: state.size,
    points: [state.linePending, point],
  });
  state.linePending = null;
  state.redoStack = [];
  redraw();
  updateUndoRedoButtons();
}

// Snapshot of the stroke being edited so Escape can restore the original.
// Shape: { stroke, idx } | { caseLabel: true, value }
let editingOriginal = null;

function removeTextInput() {
  if (textInputEl) {
    textInputEl._resizeObserver?.disconnect();
    (textInputEl._wrap || textInputEl).remove();
    textInputEl = null;
  }
  textInputPoint = null;
}

// Re-add the original (used by Escape).
function restoreEditingOriginal() {
  if (!editingOriginal) return;
  if (editingOriginal.caseLabel) {
    state.caseLabel = editingOriginal.value;
  } else {
    state.strokes.splice(editingOriginal.idx, 0, editingOriginal.stroke);
  }
  editingOriginal = null;
}

function cancelTextInput() {
  removeTextInput();
  restoreEditingOriginal();
  redraw();
}

// × button: throw away both the live box AND the original (if editing).
function deleteTextInput() {
  removeTextInput();
  editingOriginal = null;
  redraw();
  updateUndoRedoButtons();
}

function commitTextInput() {
  if (!textInputEl || !textInputPoint) {
    removeTextInput();
    editingOriginal = null;
    return;
  }
  const value = (textInputEl.textContent || "").trim();
  const point = textInputPoint;
  const color = textInputEl.dataset.color || state.color;
  const fontSize = Number(textInputEl.dataset.fontSize) || INITIAL_TEXT_FONT_PX;

  removeTextInput();
  const wasEditing = editingOriginal;
  editingOriginal = null;

  if (!value) {
    // Empty commit = delete. If we were editing an existing stroke, it stays
    // removed; if it was a fresh box, nothing was added in the first place.
    redraw();
    updateUndoRedoButtons();
    return;
  }

  const newStroke = {
    tool: "text",
    color,
    size: fontSize / 2,
    fontSize,
    text: value,
    point,
  };

  if (wasEditing?.caseLabel) {
    state.caseLabel = newStroke;
  } else {
    state.strokes.push(newStroke);
  }
  state.redoStack = [];
  redraw();
  updateUndoRedoButtons();
}

const INITIAL_TEXT_FONT_PX = 22;

function spawnTextInput(point, prefill = null) {
  if (textInputEl) commitTextInput();
  const parent = canvas.parentElement;
  if (!parent) return;

  const initialFontPx = prefill?.fontSize || INITIAL_TEXT_FONT_PX;
  const initialWidth = Math.max(120, Math.round(initialFontPx * 6));
  const color = prefill?.color || state.color;

  // Wrap holds the contenteditable + the × remove button so positioning the
  // remove button doesn't fight with the resize handle on the editor itself.
  const wrap = document.createElement("div");
  wrap.className = "instruction-editor-text-wrap";
  wrap.style.position = "absolute";
  wrap.style.left = `${point.x}px`;
  wrap.style.top = `${point.y}px`;
  wrap.style.zIndex = "10";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "instruction-editor-text-remove";
  removeBtn.setAttribute("aria-label", "Remove text box");
  removeBtn.title = "Remove";
  removeBtn.innerHTML = "&times;";
  // Stop blur on mousedown so the editor doesn't commit before our click fires.
  removeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTextInput();
  });

  const div = document.createElement("div");
  div.className = "instruction-editor-text-input";
  div.contentEditable = "true";
  div.setAttribute("role", "textbox");
  div.setAttribute("aria-label", "Type text — drag corner to resize");
  div.dataset.placeholder = "Type…";
  div.style.color = color;
  div.style.fontSize = `${initialFontPx}px`;
  div.style.width = `${initialWidth}px`;
  div.style.minHeight = `${initialFontPx + 8}px`;
  div.style.resize = "both";
  div.style.overflow = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordBreak = "break-word";
  div.dataset.color = color;
  div.dataset.fontSize = String(initialFontPx);

  if (prefill?.text) div.textContent = prefill.text;

  // Scale font-size proportionally with WIDTH (not height) — width is set by
  // the corner-drag and isn't affected by typing line-wraps, so the font
  // only changes when the user explicitly resizes the box.
  if (typeof ResizeObserver !== "undefined") {
    let lastFontPx = initialFontPx;
    const ro = new ResizeObserver(() => {
      const w = div.clientWidth;
      if (!w) return;
      const ratio = w / initialWidth;
      const newSize = Math.max(8, Math.round(initialFontPx * ratio));
      if (newSize === lastFontPx) return;
      lastFontPx = newSize;
      div.style.fontSize = `${newSize}px`;
      div.dataset.fontSize = String(newSize);
    });
    ro.observe(div);
    div._resizeObserver = ro;
  }

  wrap.appendChild(removeBtn);
  wrap.appendChild(div);
  parent.appendChild(wrap);

  textInputEl = div;
  textInputEl._wrap = wrap;
  textInputPoint = point;

  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitTextInput();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTextInput();
    }
    e.stopPropagation();
  });

  div.addEventListener("blur", () => {
    setTimeout(() => {
      if (textInputEl === div && document.activeElement !== div) {
        commitTextInput();
      }
    }, 50);
  });

  setTimeout(() => {
    div.focus();
    if (prefill?.text) {
      // Put cursor at end so the user can keep typing immediately.
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, 0);
}

// Replace an existing committed text stroke (or the case label) with a fresh
// editable text box prefilled with its content.
function editExistingText(target) {
  if (textInputEl) commitTextInput();

  if (target === state.caseLabel) {
    editingOriginal = { caseLabel: true, value: { ...state.caseLabel } };
    state.caseLabel = null;
  } else {
    const idx = state.strokes.indexOf(target);
    if (idx < 0) return;
    editingOriginal = { stroke: target, idx };
    state.strokes.splice(idx, 1);
  }

  const fontPx = target.fontSize || Math.max(10, target.size * 2);
  spawnTextInput({ x: target.point.x, y: target.point.y }, {
    text: target.text,
    fontSize: fontPx,
    color: target.color,
  });
  redraw();
}

function undo() {
  if (state.strokes.length === 0) return;
  const last = state.strokes.pop();
  state.redoStack.push(last);
  redraw();
  updateUndoRedoButtons();
}

function redoStroke() {
  if (state.redoStack.length === 0) return;
  const next = state.redoStack.pop();
  state.strokes.push(next);
  redraw();
  updateUndoRedoButtons();
}

function clearAll() {
  state.strokes = [];
  state.redoStack = [];
  state.currentStroke = null;
  state.linePending = null;
  removeTextInput();
  redraw();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undoDrawBtn");
  const redoBtn = document.getElementById("redoDrawBtn");
  if (undoBtn) undoBtn.disabled = state.strokes.length === 0;
  if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
}

function eraserCursor(size) {
  // Clamp because browsers cap custom cursor sizes around 128px.
  const d = Math.max(6, Math.min(96, Math.round(size * 2)));
  const r = d / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d + 2}" height="${d + 2}" viewBox="0 0 ${d + 2} ${d + 2}">` +
    `<circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="rgba(255,255,255,0.35)" stroke="#1a1a1a" stroke-width="1"/>` +
    `</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const hot = Math.round(r + 1);
  return `url("${url}") ${hot} ${hot}, cell`;
}

function applyCanvasCursor() {
  if (!canvas) return;
  if (state.tool === "eraser") canvas.style.cursor = eraserCursor(state.size);
  else if (state.tool === "text") canvas.style.cursor = "text";
  else canvas.style.cursor = "crosshair";
}

function setTool(tool) {
  if (state.tool !== tool) {
    state.linePending = null;
    if (textInputEl) commitTextInput();
  }
  state.tool = tool;
  document.querySelectorAll("[data-instruction-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.instructionTool === tool);
  });
  if (tool === "brush") setSize(12);
  applyCanvasCursor();
  redraw();
}

function setColor(color) {
  state.color = color;
  document.querySelectorAll("[data-instruction-color]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.instructionColor === color);
  });
  const swatch = document.getElementById("colorPickerSwatch");
  if (swatch) swatch.style.background = color;
  const picker = document.getElementById("colorPickerInput");
  if (picker && picker.value.toLowerCase() !== color.toLowerCase()) {
    picker.value = color;
  }
}

function setSize(size) {
  state.size = Number(size);
  const valEl = document.getElementById("strokeSizeValue");
  if (valEl) valEl.textContent = state.size.toFixed(1);
  const input = document.getElementById("strokeSizeInput");
  if (input && Number(input.value) !== state.size) input.value = String(state.size);
  if (state.tool === "eraser") applyCanvasCursor();
}

function exportComposedDataUrl() {
  if (!canvas) return null;
  return canvas.toDataURL("image/jpeg", 0.92);
}

function bindOnce() {
  if (bindOnce.done) return;
  bindOnce.done = true;

  document.getElementById("instructionEditorCancelBtn")?.addEventListener("click", () => {
    closeEditor(null);
  });
  document.getElementById("instructionEditorSaveBtn")?.addEventListener("click", () => {
    const dataUrl = exportComposedDataUrl();
    // The watermark is auto-regenerated every time the editor opens, so we
    // don't commit it into the saved strokes — otherwise it would render
    // twice on re-open (once as the live watermark, once as a baked stroke).
    const strokes = JSON.parse(JSON.stringify(state.strokes));
    closeEditor({ dataUrl, strokes });
  });
  document.getElementById("clearDrawingsBtn")?.addEventListener("click", clearAll);
  document.getElementById("undoDrawBtn")?.addEventListener("click", undo);
  document.getElementById("redoDrawBtn")?.addEventListener("click", redoStroke);
  document.getElementById("strokeSizeInput")?.addEventListener("input", (e) => {
    setSize(e.target.value);
  });

  document.querySelectorAll("[data-instruction-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.instructionTool));
  });
  document.querySelectorAll("[data-instruction-color]").forEach((btn) => {
    btn.addEventListener("click", () => setColor(btn.dataset.instructionColor));
  });
  const colorPicker = document.getElementById("colorPickerInput");
  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => setColor(e.target.value));
    colorPicker.addEventListener("change", (e) => setColor(e.target.value));
  }

  document
    .getElementById("instructionEditorModal")
    ?.querySelector(".instruction-editor-backdrop")
    ?.addEventListener("click", () => closeEditor(null));

  document.addEventListener("keydown", (e) => {
    const modal = getModal();
    if (!modal || modal.classList.contains("is-hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeEditor(null);
      return;
    }
    const key = String(e.key || "").toLowerCase();
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key === "z") {
      e.preventDefault();
      undo();
    } else if ((e.metaKey || e.ctrlKey) && (key === "y" || (e.shiftKey && key === "z"))) {
      e.preventDefault();
      redoStroke();
    }
  });
}

function bindCanvasEvents() {
  if (!canvas || canvas._instructionBound) return;
  canvas._instructionBound = true;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", (e) => {
    if (state.isDrawing) onPointerUp(e);
  });
}

function closeEditor(result) {
  const modal = getModal();
  if (!modal) return;
  removeTextInput();
  state.linePending = null;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener("resize", resizeCanvas);
  const resolver = state.resolveSave;
  state.resolveSave = null;
  resolver?.(result);
}

export async function openInstructionEditor(options = {}) {
  const modal = getModal();
  if (!modal) return null;

  canvas = document.getElementById("instructionEditorCanvas");
  if (!canvas) return null;
  ctx = canvas.getContext("2d");

  bindOnce();
  bindCanvasEvents();

  state.strokes = Array.isArray(options.initialStrokes)
    ? JSON.parse(JSON.stringify(options.initialStrokes))
    : [];
  state.redoStack = [];
  state.currentStroke = null;
  state.isDrawing = false;
  state.linePending = null;
  state.caseLabel = null;
  removeTextInput();
  setTool("pen");
  setColor(state.color);
  setSize(state.size);
  const sizeInput = document.getElementById("strokeSizeInput");
  if (sizeInput) sizeInput.value = String(state.size);
  updateUndoRedoButtons();

  const bgDataUrl = options.initialImage || (await captureJawJpegDataUrl(0.92));
  await loadBgImage(bgDataUrl);

  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");

  // Wait for layout, then size canvas
  await new Promise((r) => requestAnimationFrame(r));
  resizeCanvas();

  // The case-ID watermark is now baked into the background image by
  // composeJawCanvas (so it sits between the jaws even when one is taller),
  // so we don't draw a second watermark on top.
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas.parentElement);
  }
  window.addEventListener("resize", resizeCanvas);

  return new Promise((resolve) => {
    state.resolveSave = resolve;
  });
}

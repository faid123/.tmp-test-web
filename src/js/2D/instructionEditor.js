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
  if (state.caseLabel) {
    drawStrokeOn(offCtx, { ...state.caseLabel, tool: "text" }, ratio);
  }
  ctx.drawImage(off, 0, 0);

  if (state.linePending) {
    drawLinePendingMarker(state.linePending);
  }
}

// Compute approximate bounding box of a text stroke in canvas-CSS coords.
function textBoundsForStroke(stroke) {
  if (!ctx || !stroke || !stroke.text || !stroke.point) return null;
  const fontSize = Math.max(10, stroke.size * 2);
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
  // Check case label first (drawn on top), then committed text strokes (top-most first).
  if (state.caseLabel) {
    const b = textBoundsForStroke(state.caseLabel);
    if (b && point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) {
      return state.caseLabel;
    }
  }
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

function drawStrokeOn(c, stroke, ratio) {
  if (stroke.tool === "text") {
    if (!stroke.text || !stroke.point) return;
    c.save();
    c.globalCompositeOperation = "source-over";
    const fontSize = Math.max(10, stroke.size * 2);
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

  // Always allow dragging an existing text label (regardless of current tool) —
  // except when erasing, since the eraser is meant to remove ink, not move text.
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

  if (state.tool === "text") {
    spawnTextInput(point);
    return;
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
    canvas.style.cursor = state.tool === "text" ? "text" : "crosshair";
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

function removeTextInput() {
  if (textInputEl) {
    textInputEl.remove();
    textInputEl = null;
  }
  textInputPoint = null;
}

function commitTextInput() {
  if (!textInputEl || !textInputPoint) {
    removeTextInput();
    return;
  }
  const value = textInputEl.value.trim();
  const point = textInputPoint;
  const color = textInputEl.dataset.color || state.color;
  const size = Number(textInputEl.dataset.size) || state.size;
  removeTextInput();
  if (!value) return;
  state.strokes.push({ tool: "text", color, size, text: value, point });
  state.redoStack = [];
  redraw();
  updateUndoRedoButtons();
}

function spawnTextInput(point) {
  if (textInputEl) commitTextInput();
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "instruction-editor-text-input";
  input.placeholder = "Type…";
  const fontSize = Math.max(12, state.size * 2);
  input.style.left = `${point.x}px`;
  input.style.top = `${point.y}px`;
  input.style.color = state.color;
  input.style.fontSize = `${fontSize}px`;
  input.dataset.color = state.color;
  input.dataset.size = String(state.size);
  wrap.appendChild(input);
  textInputEl = input;
  textInputPoint = point;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTextInput();
    } else if (e.key === "Escape") {
      e.preventDefault();
      removeTextInput();
      redraw();
    }
    e.stopPropagation();
  });
  input.addEventListener("blur", () => commitTextInput());
  setTimeout(() => input.focus(), 0);
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

function setTool(tool) {
  if (state.tool !== tool) {
    state.linePending = null;
    if (textInputEl) commitTextInput();
  }
  state.tool = tool;
  document.querySelectorAll("[data-instruction-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.instructionTool === tool);
  });
  if (canvas) {
    if (tool === "eraser") canvas.style.cursor = "cell";
    else if (tool === "text") canvas.style.cursor = "text";
    else canvas.style.cursor = "crosshair";
  }
  if (tool === "brush") setSize(12);
  redraw();
}

function setColor(color) {
  state.color = color;
  document.querySelectorAll("[data-instruction-color]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.instructionColor === color);
  });
}

function setSize(size) {
  state.size = Number(size);
  const valEl = document.getElementById("strokeSizeValue");
  if (valEl) valEl.textContent = state.size.toFixed(1);
  const input = document.getElementById("strokeSizeInput");
  if (input && Number(input.value) !== state.size) input.value = String(state.size);
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
    const strokes = JSON.parse(JSON.stringify(state.strokes));
    // Commit the draggable case label into the saved strokes so it's
    // preserved when re-opening the editor or rendering the thumbnail.
    if (state.caseLabel && state.caseLabel.text) {
      strokes.push({ tool: "text", ...JSON.parse(JSON.stringify(state.caseLabel)) });
    }
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

  // Seed a draggable case-ID label between the upper and lower jaws.
  const caseLabelText = (options.caseLabel || "").trim();
  if (caseLabelText && canvas) {
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;
    const labelSize = 14;
    const fontPx = labelSize * 2;
    const ratio = dpr();
    ctx.save();
    ctx.font = `600 ${fontPx * ratio}px "Montserrat", "Segoe UI", sans-serif`;
    const labelWidth = ctx.measureText(caseLabelText).width / ratio;
    ctx.restore();
    state.caseLabel = {
      text: caseLabelText,
      color: state.color,
      size: labelSize,
      point: {
        x: Math.max(8, (cssWidth - labelWidth) / 2),
        y: Math.max(8, cssHeight / 2 - fontPx / 2),
      },
    };
    redraw();
  }
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas.parentElement);
  }
  window.addEventListener("resize", resizeCanvas);

  return new Promise((resolve) => {
    state.resolveSave = resolve;
  });
}

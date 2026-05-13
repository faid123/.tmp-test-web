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
};

let canvas = null;
let ctx = null;
let resizeObserver = null;
let textInputEl = null;
let textInputPoint = null;

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
  const scale = Math.min(cw / iw, ch / ih);
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
  if (!state.isDrawing || !state.currentStroke) return;
  state.currentStroke.points.push(pointFromEvent(event));
  redraw();
}

function onPointerUp(event) {
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
    closeEditor(dataUrl);
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

  state.strokes = [];
  state.redoStack = [];
  state.currentStroke = null;
  state.isDrawing = false;
  state.linePending = null;
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
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas.parentElement);
  }
  window.addEventListener("resize", resizeCanvas);

  return new Promise((resolve) => {
    state.resolveSave = resolve;
  });
}

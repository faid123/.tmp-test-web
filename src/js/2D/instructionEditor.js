import { captureJawJpegDataUrl } from "./annotationLocks.js";

const state = {
  bgImage: null,
  strokes: [],
  redoStack: [],
  currentStroke: null,
  isDrawing: false,
  tool: "none", // "none" = idle (no drawing); brush mode sets pen/spray/eraser
  shape: "rectangle", // active shape when tool === "shape"
  brushStyle: "pen", // brush mode flavour: "pen" | "spray"
  color: "#7B3FF2",
  size: 6,
  textAlign: "center", // text mode: "left" | "center" | "right"
  textBg: "transparent", // text mode: "transparent" | "white" | "black"
  textBold: false,
  textItalic: false,
  textUnderline: false,
  resolveSave: null,
  linePending: null,
  caseLabel: null, // { text, point: {x,y}, color, size } — draggable case-ID label
  // Crop & rotate mode. rect is the crop frame in CSS px relative to the canvas
  // wrap; rotation = base (0/90/180/270 from the rotate button) + fine (the
  // ±45° dial). Total applied angle = base + fine.
  crop: { active: false, rect: null, base: 0, fine: 0, source: null },
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
// Dragging a placed shape (line/curve/square/…) to reposition it.
const draggingShape = { active: false, target: null, lastX: 0, lastY: 0 };
// No-mode (idle) editing: drag ANY element by delta + show a trash button.
const draggingElement = { active: false, target: null, lastX: 0, lastY: 0, moved: false };
let selectedStroke = null;

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
    if (state.crop.active) {
      drawRotatedBg();
    } else {
      const r = getBgRect();
      ctx.drawImage(state.bgImage, r.x, r.y, r.w, r.h);
    }
  }

  // Strokes/markers are hidden while cropping — the crop tool acts on the
  // background image only.
  if (state.crop.active) return;

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

// ===================== Crop & rotate mode =====================
// Total applied rotation = 90° steps (rotate button) + fine dial offset.
function cropAngleDeg() {
  return state.crop.base + state.crop.fine;
}

// Fit size (canvas px) for the bg image at the current crop angle, so the whole
// rotated image stays visible within the canvas ("contain", rotation-aware).
// The image the crop tool operates on: while cropping it's the flattened
// composite (background + drawings) so edits ride along; otherwise the bg.
function cropImage() {
  return state.crop.source || state.bgImage;
}

// Snapshot the current (normal-mode) composite — bg + all strokes — so cropping
// keeps the user's drawings (they're baked into this source image).
function flattenCanvas() {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  off.getContext("2d").drawImage(canvas, 0, 0);
  return off;
}

function getCropFitSize() {
  const cw = canvas.width;
  const ch = canvas.height;
  const pad = Math.min(cw, ch) * 0.06;
  const availW = Math.max(1, cw - pad * 2);
  const availH = Math.max(1, ch - pad * 2);
  const src = cropImage();
  const iw = src.width;
  const ih = src.height;
  const rad = (cropAngleDeg() * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const s = Math.min(
    availW / (iw * cos + ih * sin),
    availH / (iw * sin + ih * cos)
  );
  return { w: iw * s, h: ih * s };
}

function drawRotatedBg() {
  const { w, h } = getCropFitSize();
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((cropAngleDeg() * Math.PI) / 180);
  ctx.drawImage(cropImage(), -w / 2, -h / 2, w, h);
  ctx.restore();
}

function cropUI() {
  return document.getElementById("ieCropUI");
}

function wrapSizeCss() {
  const wrap = canvas.parentElement;
  const r = wrap.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

// Crop frame (CSS px) covering the whole fitted image, centered in the wrap.
function defaultCropRect() {
  const ratio = dpr();
  const { w, h } = getCropFitSize();
  const cssW = w / ratio;
  const cssH = h / ratio;
  const ws = wrapSizeCss();
  return { x: (ws.w - cssW) / 2, y: (ws.h - cssH) / 2, w: cssW, h: cssH };
}

// Starting crop frame when entering crop mode: a touch smaller than the full
// image and nudged upward, so the user begins from a tighter, slightly higher
// selection (the full image is still reachable by dragging the handles).
function initialCropRect() {
  const full = defaultCropRect();
  const scale = 0.9;
  const w = full.w * scale;
  const h = full.h * scale;
  const x = full.x + (full.w - w) / 2;
  const y = Math.max(0, full.y + (full.h - h) / 2 - full.h * 0.06);
  return { x, y, w, h };
}

function layoutCropFrame() {
  const frame = document.getElementById("ieCropFrame");
  const r = state.crop.rect;
  if (!frame || !r) return;
  frame.style.left = `${r.x}px`;
  frame.style.top = `${r.y}px`;
  frame.style.width = `${r.w}px`;
  frame.style.height = `${r.h}px`;
}

function updateDialValue() {
  const v = document.getElementById("ieCropDialValue");
  if (v) v.textContent = `${Math.round(state.crop.fine)}°`;
}

function ensureCropUI() {
  let ui = cropUI();
  if (ui) return ui;
  const wrap = canvas?.parentElement;
  if (!wrap) return null;

  ui = document.createElement("div");
  ui.id = "ieCropUI";
  ui.className = "ie-crop is-hidden";
  ui.innerHTML =
    '<div class="ie-crop-frame" id="ieCropFrame">' +
    '<span class="ie-crop-grid"></span>' +
    '<span class="ie-crop-handle ie-crop-handle-nw" data-crop-handle="nw"></span>' +
    '<span class="ie-crop-handle ie-crop-handle-ne" data-crop-handle="ne"></span>' +
    '<span class="ie-crop-handle ie-crop-handle-sw" data-crop-handle="sw"></span>' +
    '<span class="ie-crop-handle ie-crop-handle-se" data-crop-handle="se"></span>' +
    "</div>" +
    '<div class="ie-crop-bar">' +
    '<div class="ie-crop-bar-top">' +
    '<button type="button" class="ie-crop-iconbtn" id="ieCropRotate90" aria-label="Rotate 90°" title="Rotate 90°">' +
    '<img src="../../assets/instruction%20editor/rotate.svg" alt="" class="ie-crop-iconimg" />' +
    "</button>" +
    '<div class="ie-crop-dial" id="ieCropDial" title="Drag to rotate">' +
    '<span class="ie-crop-dial-track"></span>' +
    '<span class="ie-crop-dial-pointer"></span>' +
    '<span class="ie-crop-dial-value" id="ieCropDialValue">0°</span>' +
    "</div>" +
    '<button type="button" class="ie-crop-iconbtn" id="ieCropAspect" aria-label="Aspect ratio" title="Aspect ratio">' +
    '<img src="../../assets/instruction%20editor/image_aspect_ratio.svg" alt="" class="ie-crop-iconimg" />' +
    "</button>" +
    "</div>" +
    '<div class="ie-crop-bar-bottom">' +
    '<button type="button" class="ie-crop-text" id="ieCropCancel">Cancel</button>' +
    '<button type="button" class="ie-crop-text ie-crop-done" id="ieCropDone">Done</button>' +
    "</div>" +
    "</div>" +
    '<div class="ie-crop-aspect-menu is-hidden" id="ieCropAspectMenu">' +
    '<div class="ie-crop-aspect-sheet">' +
    '<button type="button" data-ratio="original">Original</button>' +
    '<button type="button" data-ratio="fit">Fit to screen</button>' +
    '<button type="button" data-ratio="1">Square</button>' +
    '<button type="button" data-ratio="1.5">3:2</button>' +
    '<button type="button" data-ratio="1.6667">5:3</button>' +
    '<button type="button" data-ratio="1.3333">4:3</button>' +
    '<button type="button" data-ratio="1.25">5:4</button>' +
    '<button type="button" data-ratio="1.4">7:5</button>' +
    '<button type="button" class="ie-crop-aspect-cancel" data-ratio="cancel">Cancel</button>' +
    "</div>" +
    "</div>";
  wrap.appendChild(ui);

  ui.querySelectorAll("[data-crop-handle]").forEach((h) => {
    h.addEventListener("pointerdown", (e) => startHandleDrag(e, h.dataset.cropHandle));
  });
  const frame = ui.querySelector("#ieCropFrame");
  frame.addEventListener("pointerdown", (e) => {
    if (e.target.dataset.cropHandle) return;
    startFrameDrag(e);
  });
  ui.querySelector("#ieCropDial").addEventListener("pointerdown", startDialDrag);
  ui.querySelector("#ieCropRotate90").addEventListener("click", () => rotate90());
  ui.querySelector("#ieCropAspect").addEventListener("click", () => openAspectMenu());
  ui.querySelector("#ieCropCancel").addEventListener("click", () => exitCropMode());
  ui.querySelector("#ieCropDone").addEventListener("click", () => applyCrop());

  const menu = ui.querySelector("#ieCropAspectMenu");
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ratio]");
    if (!btn) {
      if (e.target === menu) closeAspectMenu(); // backdrop tap
      return;
    }
    const token = btn.dataset.ratio;
    if (token !== "cancel") setCropAspect(token);
    closeAspectMenu();
  });
  return ui;
}

function rotate90() {
  state.crop.base = (state.crop.base + 90) % 360;
  redraw();
}

function openAspectMenu() {
  document.getElementById("ieCropAspectMenu")?.classList.remove("is-hidden");
}
function closeAspectMenu() {
  document.getElementById("ieCropAspectMenu")?.classList.add("is-hidden");
}

// Resize the crop frame to a fixed aspect ratio, centered within the fitted
// image area. token: "fit" (whole area), "original" (image's native ratio), or
// a numeric width/height ratio.
function setCropAspect(token) {
  const area = defaultCropRect();
  let ratio = null;
  if (token === "original" && cropImage()) {
    ratio = cropImage().width / cropImage().height;
  } else if (token !== "fit") {
    ratio = parseFloat(token);
  }
  if (!ratio || !isFinite(ratio)) {
    state.crop.rect = area;
  } else {
    let w = area.w;
    let h = w / ratio;
    if (h > area.h) {
      h = area.h;
      w = h * ratio;
    }
    state.crop.rect = {
      x: area.x + (area.w - w) / 2,
      y: area.y + (area.h - h) / 2,
      w,
      h,
    };
  }
  layoutCropFrame();
}

let cropHandleDrag = null;
function startHandleDrag(e, corner) {
  e.preventDefault();
  e.stopPropagation();
  cropHandleDrag = { corner, x: e.clientX, y: e.clientY, rect: { ...state.crop.rect } };
  window.addEventListener("pointermove", onHandleMove);
  window.addEventListener("pointerup", endHandleDrag);
}
function onHandleMove(e) {
  if (!cropHandleDrag) return;
  const dx = e.clientX - cropHandleDrag.x;
  const dy = e.clientY - cropHandleDrag.y;
  const r0 = cropHandleDrag.rect;
  const ws = wrapSizeCss();
  const minS = 40;
  let { x, y, w, h } = r0;
  if (cropHandleDrag.corner.includes("w")) {
    const nx = Math.max(0, Math.min(r0.x + dx, r0.x + r0.w - minS));
    x = nx;
    w = r0.x + r0.w - nx;
  }
  if (cropHandleDrag.corner.includes("e")) {
    w = Math.max(minS, Math.min(r0.w + dx, ws.w - r0.x));
  }
  if (cropHandleDrag.corner.includes("n")) {
    const ny = Math.max(0, Math.min(r0.y + dy, r0.y + r0.h - minS));
    y = ny;
    h = r0.y + r0.h - ny;
  }
  if (cropHandleDrag.corner.includes("s")) {
    h = Math.max(minS, Math.min(r0.h + dy, ws.h - r0.y));
  }
  state.crop.rect = { x, y, w, h };
  layoutCropFrame();
}
function endHandleDrag() {
  cropHandleDrag = null;
  window.removeEventListener("pointermove", onHandleMove);
  window.removeEventListener("pointerup", endHandleDrag);
}

let cropFrameDrag = null;
function startFrameDrag(e) {
  e.preventDefault();
  cropFrameDrag = { x: e.clientX, y: e.clientY, rect: { ...state.crop.rect } };
  window.addEventListener("pointermove", onFrameMove);
  window.addEventListener("pointerup", endFrameDrag);
}
function onFrameMove(e) {
  if (!cropFrameDrag) return;
  const dx = e.clientX - cropFrameDrag.x;
  const dy = e.clientY - cropFrameDrag.y;
  const r0 = cropFrameDrag.rect;
  const ws = wrapSizeCss();
  const x = Math.max(0, Math.min(r0.x + dx, ws.w - r0.w));
  const y = Math.max(0, Math.min(r0.y + dy, ws.h - r0.h));
  state.crop.rect = { x, y, w: r0.w, h: r0.h };
  layoutCropFrame();
}
function endFrameDrag() {
  cropFrameDrag = null;
  window.removeEventListener("pointermove", onFrameMove);
  window.removeEventListener("pointerup", endFrameDrag);
}

let cropDialDrag = null;
function startDialDrag(e) {
  e.preventDefault();
  cropDialDrag = { x: e.clientX, fine: state.crop.fine };
  window.addEventListener("pointermove", onDialMove);
  window.addEventListener("pointerup", endDialDrag);
}
function onDialMove(e) {
  if (!cropDialDrag) return;
  // Drag right → rotate clockwise. ~0.25° per px.
  let a = cropDialDrag.fine + (e.clientX - cropDialDrag.x) * 0.25;
  a = Math.max(-45, Math.min(45, a));
  state.crop.fine = a;
  updateDialValue();
  redraw();
}
function endDialDrag() {
  cropDialDrag = null;
  window.removeEventListener("pointermove", onDialMove);
  window.removeEventListener("pointerup", endDialDrag);
}

function enterCropMode() {
  if (!canvas || !state.bgImage) return;
  // Flatten the current composite (bg + drawings) and crop THAT, so the user's
  // edits are preserved (and rotate together with the image).
  redraw();
  state.crop.source = flattenCanvas();
  state.crop.active = true;
  state.crop.base = 0;
  state.crop.fine = 0;
  ensureCropUI();
  state.crop.rect = initialCropRect();
  layoutCropFrame();
  updateDialValue();
  cropUI()?.classList.remove("is-hidden");
  getModal()?.classList.add("is-cropping");
  redraw();
}

function exitCropMode() {
  state.crop.active = false;
  state.crop.source = null;
  cropUI()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-cropping");
  redraw();
}

// Done: copy the framed region straight off the canvas (which shows the rotated
// flattened composite — bg + baked-in drawings) into a new background image,
// then leave crop mode. Strokes are cleared because they're now baked in.
function applyCrop() {
  if (!canvas || !state.crop.rect) {
    exitCropMode();
    return;
  }
  const ratio = dpr();
  const r = state.crop.rect;
  const sx = Math.round(r.x * ratio);
  const sy = Math.round(r.y * ratio);
  const sw = Math.max(1, Math.round(r.w * ratio));
  const sh = Math.max(1, Math.round(r.h * ratio));
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const octx = out.getContext("2d");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, sw, sh);
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = out.toDataURL("image/png");
  loadBgImage(dataUrl).then(() => {
    // Drawings are now baked into the cropped background, so clear the live
    // strokes (keeping them would double-draw and they'd no longer line up).
    state.strokes = [];
    state.redoStack = [];
    clearSelection();
    updateUndoRedoButtons();
    exitCropMode();
  });
}

// Text-box geometry shared by the renderer + hit-testing so they always agree.
const TEXT_LINE_HEIGHT = 1.3;
const TEXT_PAD_X = 6; // CSS px
const TEXT_PAD_Y = 4; // CSS px

// Word-wrap `text` to `maxWidth` (in the units of c's current font), honoring
// explicit line breaks. Returns an array of lines.
function wrapTextLines(c, text, maxWidth) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (!para) {
      out.push("");
      continue;
    }
    if (!maxWidth || maxWidth <= 0) {
      out.push(para);
      continue;
    }
    const tokens = para.match(/\s+|\S+/g) || [para];
    let line = "";
    for (const t of tokens) {
      const test = line + t;
      if (line && c.measureText(test).width > maxWidth) {
        out.push(line.replace(/\s+$/, ""));
        line = t.replace(/^\s+/, "");
      } else {
        line = test;
      }
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
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
  let w, lines;
  if (stroke.width) {
    w = stroke.width;
    const innerW = Math.max(1, (stroke.width - TEXT_PAD_X * 2) * ratio);
    lines = wrapTextLines(ctx, stroke.text, innerW);
  } else {
    w = ctx.measureText(stroke.text).width / ratio + TEXT_PAD_X * 2;
    lines = [stroke.text];
  }
  ctx.restore();
  const h = lines.length * fontSize * TEXT_LINE_HEIGHT + TEXT_PAD_Y * 2;
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

// Hit-test placed shapes (top-most first) by their bounding box plus a small
// tolerance, so thin shapes (lines) are still grabbable.
function findShapeAtPoint(point) {
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    const s = state.strokes[i];
    if (s.tool !== "shape" || !s.start || !s.end) continue;
    const minX = Math.min(s.start.x, s.end.x);
    const maxX = Math.max(s.start.x, s.end.x);
    const minY = Math.min(s.start.y, s.end.y);
    const maxY = Math.max(s.start.y, s.end.y);
    const tol = Math.max(10, s.size);
    if (
      point.x >= minX - tol &&
      point.x <= maxX + tol &&
      point.y >= minY - tol &&
      point.y <= maxY + tol
    ) {
      return s;
    }
  }
  return null;
}

// Bounding box (CSS px, canvas-relative) for any element type — used both to
// hit-test in no-mode and to position the selection overlay + trash button.
function strokeBoundsCss(s) {
  if (!s) return null;
  if (s.tool === "text") return textBoundsForStroke(s);
  if (s.tool === "shape" && s.start && s.end) {
    return {
      x: Math.min(s.start.x, s.end.x),
      y: Math.min(s.start.y, s.end.y),
      w: Math.abs(s.end.x - s.start.x),
      h: Math.abs(s.end.y - s.start.y),
    };
  }
  if (Array.isArray(s.points) && s.points.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return null;
}

function pointInBounds(p, b, tol) {
  return (
    p.x >= b.x - tol && p.x <= b.x + b.w + tol &&
    p.y >= b.y - tol && p.y <= b.y + b.h + tol
  );
}

// Top-most element (text / shape / freehand / line) under the point. Used by
// no-mode to pick something to drag or trash. The case-ID watermark lives in
// state.caseLabel (not state.strokes), so it's naturally excluded.
function findStrokeAtPoint(point) {
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    const s = state.strokes[i];
    const b = strokeBoundsCss(s);
    if (!b) continue;
    const tol = s.tool === "text" ? 0 : Math.max(10, s.size || 0);
    if (pointInBounds(point, b, tol)) return s;
  }
  return null;
}

// Move any element by a delta (CSS px). Each element type carries its own
// geometry (text: point, shape: start/end, freehand/line: points).
function translateStroke(s, dx, dy) {
  if (!s) return;
  if (s.point) s.point = { x: s.point.x + dx, y: s.point.y + dy };
  if (s.start) s.start = { x: s.start.x + dx, y: s.start.y + dy };
  if (s.end) s.end = { x: s.end.x + dx, y: s.end.y + dy };
  if (Array.isArray(s.points)) s.points = s.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

// Lazily build the no-mode selection overlay: a dashed outline + a trash button.
// It's a DOM overlay in the canvas wrap (same coord space as the text boxes) so
// it never bakes into the exported canvas image.
function ensureSelectOverlay() {
  let box = document.getElementById("ieSelectBox");
  if (box) return box;
  const parent = canvas?.parentElement;
  if (!parent) return null;
  box = document.createElement("div");
  box.id = "ieSelectBox";
  box.className = "ie-select-box is-hidden";
  const trash = document.createElement("button");
  trash.type = "button";
  trash.className = "ie-select-trash";
  trash.setAttribute("aria-label", "Delete element");
  trash.title = "Delete";
  trash.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2h-6a2 2 0 01-2-2V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Don't let the trash press start a canvas drag / deselect.
  trash.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); });
  trash.addEventListener("click", (e) => { e.stopPropagation(); deleteSelectedStroke(); });
  box.appendChild(trash);
  parent.appendChild(box);
  return box;
}

function positionSelectOverlay() {
  if (!selectedStroke) return;
  const box = ensureSelectOverlay();
  const b = strokeBoundsCss(selectedStroke);
  if (!box || !b) { clearSelection(); return; }
  box.style.left = `${b.x}px`;
  box.style.top = `${b.y}px`;
  box.style.width = `${Math.max(8, b.w)}px`;
  box.style.height = `${Math.max(8, b.h)}px`;
  box.classList.remove("is-hidden");
}

function selectStroke(s) {
  selectedStroke = s;
  positionSelectOverlay();
}

function clearSelection() {
  selectedStroke = null;
  document.getElementById("ieSelectBox")?.classList.add("is-hidden");
}

function deleteSelectedStroke() {
  if (!selectedStroke) return;
  const idx = state.strokes.indexOf(selectedStroke);
  if (idx >= 0) state.strokes.splice(idx, 1);
  clearSelection();
  redraw();
  updateUndoRedoButtons();
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
    // 500 vs 800 so bold lands on a heavier face than normal even with the
    // Helvetica fallback (which would otherwise map both 600 and 800 → 700).
    const weight = stroke.bold ? "800" : "500";
    const slant = stroke.italic ? "italic " : "";
    c.font = `${slant}${weight} ${fontSize * ratio}px "Montserrat", "Segoe UI", sans-serif`;
    c.textBaseline = "top";
    const padX = TEXT_PAD_X * ratio;
    const padY = TEXT_PAD_Y * ratio;
    const lineH = fontSize * TEXT_LINE_HEIGHT * ratio;
    const x0 = stroke.point.x * ratio;
    const y0 = stroke.point.y * ratio;
    const align = stroke.align || "left";
    // Box width: explicit stored width (from the resizable box) or the single
    // line's measured width for legacy strokes.
    const boxW = stroke.width
      ? stroke.width * ratio
      : c.measureText(stroke.text).width + padX * 2;
    const innerW = Math.max(1, boxW - padX * 2);
    const lines = wrapTextLines(c, stroke.text, innerW);
    const boxH = lines.length * lineH + padY * 2;
    // Optional background plate behind the text.
    if (stroke.bg === "white" || stroke.bg === "black") {
      c.fillStyle = stroke.bg === "white" ? "#ffffff" : "#000000";
      roundRectPath(c, x0, y0, boxW, boxH, 6 * ratio);
      c.fill();
    }
    c.fillStyle = stroke.color;
    let tx;
    if (align === "center") {
      c.textAlign = "center";
      tx = x0 + boxW / 2;
    } else if (align === "right") {
      c.textAlign = "right";
      tx = x0 + boxW - padX;
    } else {
      c.textAlign = "left";
      tx = x0 + padX;
    }
    let ty = y0 + padY;
    for (const line of lines) {
      c.fillText(line, tx, ty);
      // Canvas has no text-decoration, so underline is drawn manually,
      // positioned per the active alignment.
      if (stroke.underline && line) {
        const lw = c.measureText(line).width;
        let ux1;
        if (align === "center") ux1 = tx - lw / 2;
        else if (align === "right") ux1 = tx - lw;
        else ux1 = tx;
        const uy = ty + fontSize * ratio * 0.96;
        c.save();
        c.strokeStyle = stroke.color;
        c.lineWidth = Math.max(1, fontSize * ratio * 0.07);
        c.beginPath();
        c.moveTo(ux1, uy);
        c.lineTo(ux1 + lw, uy);
        c.stroke();
        c.restore();
      }
      ty += lineH;
    }
    c.restore();
    return;
  }
  if (stroke.tool === "shape") {
    drawShape(c, stroke, ratio);
    return;
  }
  if (stroke.tool === "spray") {
    drawSpray(c, stroke, ratio);
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

// Small deterministic PRNG so the spray scatter is identical on every redraw.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Airbrush: scatter dots in a disc around each path point. Spread is tied to
// the stroke size; the per-point seed (derived from its coords + index) keeps
// the pattern stable across redraws.
function drawSpray(c, stroke, ratio) {
  const pts = stroke.points;
  if (!pts || !pts.length) return;
  c.save();
  c.globalCompositeOperation = "source-over";
  c.fillStyle = stroke.color;
  const spread = Math.max(8, stroke.size * 2.2) * ratio;
  const dots = 14;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const seed =
      (i * 2654435761) ^ (Math.round(p.x * 8.5) * 40503) ^ (Math.round(p.y * 8.5) * 73)
    ;
    const rand = mulberry32(seed);
    for (let d = 0; d < dots; d++) {
      const ang = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * spread; // uniform over the disc
      const dotR = (0.5 + rand() * 1.1) * ratio;
      c.globalAlpha = 0.35 + rand() * 0.4;
      c.beginPath();
      c.arc(p.x * ratio + Math.cos(ang) * rr, p.y * ratio + Math.sin(ang) * rr, dotR, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

// Draw a vector shape (line / curve / square / rectangle / triangle / circle)
// defined by its drag bounds (start → end). Stroke-only; width = size, colour
// = stroke.color.
function drawShape(c, stroke, ratio) {
  const { start, end, shape } = stroke;
  if (!start || !end) return;
  const x1 = start.x * ratio;
  const y1 = start.y * ratio;
  const x2 = end.x * ratio;
  const y2 = end.y * ratio;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  c.save();
  c.globalCompositeOperation = "source-over";
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = stroke.size * ratio;
  c.strokeStyle = stroke.color;
  c.beginPath();
  switch (shape) {
    case "line":
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      break;
    case "curve": {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      // Bow the line out perpendicular to itself by ~30% of its length.
      const off = len * 0.3;
      c.moveTo(x1, y1);
      c.quadraticCurveTo(mx + (-dy / len) * off, my + (dx / len) * off, x2, y2);
      break;
    }
    case "square": {
      const s = Math.max(w, h);
      const sx = x2 >= x1 ? x1 : x1 - s;
      const sy = y2 >= y1 ? y1 : y1 - s;
      c.rect(sx, sy, s, s);
      break;
    }
    case "triangle":
      c.moveTo((left + left + w) / 2, top);
      c.lineTo(left, top + h);
      c.lineTo(left + w, top + h);
      c.closePath();
      break;
    case "circle":
      c.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "rectangle":
    default:
      c.rect(left, top, w, h);
      break;
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
  return t === "pen" || t === "brush" || t === "eraser" || t === "spray";
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (state.crop.active) return; // crop overlay handles its own input
  const point = pointFromEvent(event);

  // Text tool: entering text mode spawns a box at the canvas center so the user
  // can start typing right away. Clicking an existing saved text edits it in
  // place; clicking an empty spot drops a fresh text box THERE, so a comment can
  // be placed at a specific location instead of only the middle.
  if (state.tool === "text") {
    const hit = findTextAtPoint(point);
    if (hit) {
      editExistingText(hit);
      event.preventDefault();
      return;
    }
    // Place a new (empty) text box at the clicked point. spawnTextInput commits
    // any current box first — an empty centered default is simply discarded, so
    // this effectively moves the caret to where the user clicked.
    const available = (canvas.clientWidth || 320) - 24;
    // Clamp x so at least the minimum box width fits; the box starts small
    // there and auto-grows with the text up to the canvas's right edge.
    const x = Math.min(Math.max(0, point.x), Math.max(0, available - TEXT_BOX_MIN_WIDTH));
    const y = Math.max(0, point.y);
    spawnTextInput({ x, y });
    event.preventDefault();
    return;
  }

  // Shape tool: click an existing shape to drag it; otherwise drag out a new one.
  if (state.tool === "shape") {
    const hitShape = findShapeAtPoint(point);
    if (hitShape) {
      draggingShape.active = true;
      draggingShape.target = hitShape;
      draggingShape.lastX = point.x;
      draggingShape.lastY = point.y;
      canvas.setPointerCapture?.(event.pointerId ?? 0);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }
    state.isDrawing = true;
    state.redoStack = [];
    state.currentStroke = {
      tool: "shape",
      shape: state.shape,
      color: state.color,
      size: state.size,
      start: point,
      end: point,
    };
    canvas.setPointerCapture?.(event.pointerId ?? 0);
    redraw();
    updateUndoRedoButtons();
    return;
  }

  // No-mode (idle): drag any element to reposition it and show a trash button to
  // delete it. Clicking empty space deselects.
  if (state.tool === "none") {
    const hit = findStrokeAtPoint(point);
    if (hit) {
      selectStroke(hit);
      draggingElement.active = true;
      draggingElement.target = hit;
      draggingElement.lastX = point.x;
      draggingElement.lastY = point.y;
      draggingElement.moved = false;
      canvas.setPointerCapture?.(event.pointerId ?? 0);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }
    clearSelection();
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
  if (draggingElement.active && draggingElement.target) {
    const point = pointFromEvent(event);
    translateStroke(draggingElement.target, point.x - draggingElement.lastX, point.y - draggingElement.lastY);
    draggingElement.lastX = point.x;
    draggingElement.lastY = point.y;
    draggingElement.moved = true;
    positionSelectOverlay();
    redraw();
    return;
  }
  if (draggingShape.active && draggingShape.target) {
    const point = pointFromEvent(event);
    const dx = point.x - draggingShape.lastX;
    const dy = point.y - draggingShape.lastY;
    const s = draggingShape.target;
    s.start = { x: s.start.x + dx, y: s.start.y + dy };
    s.end = { x: s.end.x + dx, y: s.end.y + dy };
    draggingShape.lastX = point.x;
    draggingShape.lastY = point.y;
    redraw();
    return;
  }
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
  if (state.currentStroke.tool === "shape") {
    state.currentStroke.end = pointFromEvent(event);
    redraw();
    return;
  }
  state.currentStroke.points.push(pointFromEvent(event));
  redraw();
}

function onPointerUp(event) {
  if (draggingElement.active) {
    try { canvas.releasePointerCapture?.(event.pointerId ?? 0); } catch {}
    draggingElement.active = false;
    draggingElement.target = null;
    applyCanvasCursor();
    positionSelectOverlay();
    redraw();
    return;
  }
  if (draggingShape.active) {
    try { canvas.releasePointerCapture?.(event.pointerId ?? 0); } catch {}
    draggingShape.active = false;
    draggingShape.target = null;
    applyCanvasCursor();
    redraw();
    return;
  }
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
    // Discard a shape that was just a click (no real drag).
    const s = state.currentStroke;
    const degenerate =
      s.tool === "shape" &&
      Math.abs(s.end.x - s.start.x) < 3 &&
      Math.abs(s.end.y - s.start.y) < 3;
    if (!degenerate) state.strokes.push(s);
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
function commitTextInput() {
  if (!textInputEl || !textInputPoint) {
    removeTextInput();
    editingOriginal = null;
    return;
  }
  // innerText preserves the user's line breaks (textContent drops them).
  const value = (textInputEl.innerText || textInputEl.textContent || "").trim();
  const point = textInputPoint;
  const color = textInputEl.dataset.color || state.color;
  const fontSize = Number(textInputEl.dataset.fontSize) || INITIAL_TEXT_FONT_PX;
  const align = textInputEl.dataset.align || state.textAlign;
  const bg = textInputEl.dataset.bg || state.textBg;
  const width = textInputEl.clientWidth || undefined;
  const bold = textInputEl.dataset.bold === "1";
  const italic = textInputEl.dataset.italic === "1";
  const underline = textInputEl.dataset.underline === "1";

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
    align,
    bg,
    width,
    bold,
    italic,
    underline,
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

// Fresh text box width: stretches from its spawn point to the canvas's right
// edge, so text wraps only at the canvas boundary (no artificial word cap).
const TEXT_BOX_MIN_WIDTH = 70;

function textBoxMaxWidth(startX = 0) {
  const available = (canvas?.clientWidth || 320) - 24;
  return Math.max(TEXT_BOX_MIN_WIDTH, available - startX);
}

// Sync a text box's live background to the chosen mode. Transparent keeps the
// dashed editing border; white/black fill behind the glyphs.
function applyTextBoxBg(div, bg) {
  div.dataset.bg = bg;
  if (bg === "white") {
    div.style.background = "#ffffff";
  } else if (bg === "black") {
    div.style.background = "#000000";
  } else {
    div.style.background = "transparent";
  }
}

// Sync a text box's live font styling (bold / italic / underline).
// Normal=500, bold=800: deliberately on opposite sides of the system fallback
// font's faces so bold is visibly heavier even when Montserrat isn't loaded
// (Helvetica Neue collapses 600–900 → 700, so a 600 "normal" looked bold).
function applyTextBoxStyle(div, { bold, italic, underline }) {
  div.dataset.bold = bold ? "1" : "0";
  div.dataset.italic = italic ? "1" : "0";
  div.dataset.underline = underline ? "1" : "0";
  div.style.fontWeight = bold ? "800" : "500";
  div.style.fontStyle = italic ? "italic" : "normal";
  div.style.textDecoration = underline ? "underline" : "none";
}

function spawnTextInput(point, prefill = null, options = {}) {
  if (textInputEl) commitTextInput();
  const parent = canvas.parentElement;
  if (!parent) return;

  // Resizing (drag-corner to scale the font) is only offered when re-opening
  // an already-saved text — fresh entry stays a clean, borderless caret.
  const resizable = !!options.resizable;
  const initialFontPx = prefill?.fontSize || INITIAL_TEXT_FONT_PX;
  // Fresh boxes start small and auto-grow with the text (width: auto below);
  // this width only applies to re-edit boxes, which keep their stored width.
  const initialWidth = prefill?.width || textBoxMaxWidth(point.x);
  const color = prefill?.color || state.color;
  const align = prefill?.align || state.textAlign;
  const bg = prefill?.bg || state.textBg;
  const bold = prefill ? !!prefill.bold : state.textBold;
  const italic = prefill ? !!prefill.italic : state.textItalic;
  const underline = prefill ? !!prefill.underline : state.textUnderline;

  // Wrap holds the contenteditable text box. The × remove button was removed —
  // text mode now uses a single fixed box; Cancel discards it instead.
  const wrap = document.createElement("div");
  wrap.className = "instruction-editor-text-wrap";
  wrap.style.position = "absolute";
  wrap.style.left = `${point.x}px`;
  wrap.style.top = `${point.y}px`;
  wrap.style.zIndex = "10";

  const div = document.createElement("div");
  div.className = "instruction-editor-text-input";
  div.contentEditable = "true";
  div.setAttribute("role", "textbox");
  div.setAttribute("aria-label", resizable ? "Edit text — drag corner to resize" : "Type text");
  div.dataset.placeholder = "Type…";
  div.style.color = color;
  div.style.fontSize = `${initialFontPx}px`;
  if (resizable) {
    // Re-edit boxes keep their stored width (drag-corner resizes it).
    div.style.width = `${initialWidth}px`;
  } else {
    // Fresh boxes start small and expand with the text, capped at the canvas's
    // right edge — wrapping only kicks in once the cap is reached.
    div.style.width = "auto";
    div.style.minWidth = `${TEXT_BOX_MIN_WIDTH}px`;
    div.style.maxWidth = `${textBoxMaxWidth(point.x)}px`;
  }
  div.style.minHeight = `${initialFontPx + 8}px`;
  // No resize handle / border while typing fresh text; both appear only when
  // re-editing a saved text so it can be made bigger/smaller after save.
  div.style.resize = resizable ? "both" : "none";
  // Visible border so the box reads as an editable field. Resizable (re-edit)
  // boxes keep the dashed style; fresh boxes get a solid accent border.
  div.style.border = resizable ? "1px dashed var(--rose-500)" : "1.5px solid var(--rose-500)";
  div.style.boxShadow = resizable ? "" : "0 2px 8px rgba(26, 77, 63, 0.15)";
  div.style.overflow = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordBreak = "break-word";
  div.style.textAlign = align;
  div.dataset.color = color;
  div.dataset.fontSize = String(initialFontPx);
  div.dataset.align = align;
  applyTextBoxBg(div, bg);
  applyTextBoxStyle(div, { bold, italic, underline });

  if (prefill?.text) div.textContent = prefill.text;

  // Scale font-size proportionally with WIDTH (not height) — width is set by
  // the corner-drag and isn't affected by typing line-wraps, so the font
  // only changes when the user explicitly resizes the box. Only active for
  // resizable (re-edit) boxes.
  if (resizable && typeof ResizeObserver !== "undefined") {
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

  // Move by clicking and dragging the box itself. A small movement threshold
  // distinguishes a plain click (place the caret / type) from a drag (move the
  // box). Dragging updates textInputPoint so the committed stroke lands where
  // it's dropped; text selection is suppressed while a drag is in progress.
  let dragging = false;
  let dragStart = null;
  const DRAG_THRESHOLD = 4; // CSS px before a press becomes a drag
  div.addEventListener("pointerdown", (e) => {
    // Leave the bottom-right resize corner (re-edit boxes) to the browser.
    if (resizable) {
      const r = div.getBoundingClientRect();
      if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) return;
    }
    dragStart = {
      x: e.clientX,
      y: e.clientY,
      ox: textInputPoint.x,
      oy: textInputPoint.y,
      id: e.pointerId,
      started: false,
    };
  });
  div.addEventListener("pointermove", (e) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragStart.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return; // still just a click
      dragStart.started = true;
      dragging = true;
      div.setPointerCapture?.(dragStart.id ?? 0);
      div.classList.add("is-dragging");
    }
    const availW = canvas?.clientWidth || 320;
    const availH = canvas?.clientHeight || 320;
    let nx = Math.min(Math.max(0, dragStart.ox + dx), Math.max(0, availW - div.offsetWidth));
    let ny = Math.min(Math.max(0, dragStart.oy + dy), Math.max(0, availH - div.offsetHeight));
    wrap.style.left = `${nx}px`;
    wrap.style.top = `${ny}px`;
    textInputPoint = { x: nx, y: ny };
    window.getSelection()?.removeAllRanges(); // don't select text while moving
    e.preventDefault();
  });
  const endBoxDrag = () => {
    if (!dragStart) return;
    const wasDragging = dragStart.started;
    div.releasePointerCapture?.(dragStart.id ?? 0);
    dragStart = null;
    if (wasDragging) {
      dragging = false;
      div.classList.remove("is-dragging");
      div.focus();
    }
  };
  div.addEventListener("pointerup", endBoxDrag);
  div.addEventListener("pointercancel", endBoxDrag);

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
      // Don't commit while the user is dragging the box by its handle (the
      // contentEditable loses focus on handle pointerdown).
      if (dragging) return;
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
  spawnTextInput(
    { x: target.point.x, y: target.point.y },
    {
      text: target.text,
      fontSize: fontPx,
      color: target.color,
      align: target.align,
      bg: target.bg,
      width: target.width,
      bold: target.bold,
      italic: target.italic,
      underline: target.underline,
    },
    { resizable: true }
  );
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
  clearSelection();
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
  else if (state.tool === "none") canvas.style.cursor = "default";
  else canvas.style.cursor = "crosshair";
}

function setTool(tool) {
  if (state.tool !== tool) {
    state.linePending = null;
    if (textInputEl) commitTextInput();
    clearSelection();
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

// ===================== Shapes picker =====================
const SHAPE_ICONS = {
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
  curve:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18C8 6 16 6 20 18"/></svg>',
  square:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>',
  rectangle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="1"/></svg>',
  triangle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 4l8 16H4z"/></svg>',
  circle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>',
};
const SHAPE_ORDER = ["line", "curve", "square", "rectangle", "triangle", "circle"];

// Shared undo (back-arrow) glyph used by the shape / text / brush mode UIs.
const UNDO_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a6 6 0 0 1 0 12h-3"/></svg>';

function shapePanel() {
  return document.getElementById("ieShapeUI");
}

// Vertical colour-bar gradient — same stops drive the CSS (display) and the
// 1×256 sampling canvas (pick).
const COLORBAR_CSS =
  "linear-gradient(to bottom,#ffffff 0%,#000000 10%,#ff0000 16%,#ffff00 30%,#00ff00 44%,#00ffff 58%,#0000ff 72%,#ff00ff 86%,#ff0000 100%)";
const COLORBAR_STOPS = [
  [0.0, "#ffffff"],
  [0.1, "#000000"],
  [0.16, "#ff0000"],
  [0.3, "#ffff00"],
  [0.44, "#00ff00"],
  [0.58, "#00ffff"],
  [0.72, "#0000ff"],
  [0.86, "#ff00ff"],
  [1.0, "#ff0000"],
];
let colorBarCanvas = null;
// JSON snapshot of strokes taken on entering shape mode, so Cancel can revert.
let shapeBackup = null;

function ensureColorBarCanvas() {
  if (colorBarCanvas) return colorBarCanvas;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 256;
  const cx = c.getContext("2d");
  const g = cx.createLinearGradient(0, 0, 0, 256);
  for (const [pos, col] of COLORBAR_STOPS) g.addColorStop(pos, col);
  cx.fillStyle = g;
  cx.fillRect(0, 0, 1, 256);
  colorBarCanvas = c;
  return c;
}

// Sample a colour from a vertical rainbow bar. `bar`/`thumb` default to the
// shapes picker's bar; pass the text picker's bar to reuse the same logic.
function pickColorFromBar(clientY, bar, thumb) {
  bar = bar || document.getElementById("ieColorBar");
  thumb = thumb || document.getElementById("ieColorThumb");
  if (!bar) return null;
  const rect = bar.getBoundingClientRect();
  let rel = (clientY - rect.top) / rect.height;
  rel = Math.max(0, Math.min(1, rel));
  const cx = ensureColorBarCanvas().getContext("2d");
  const d = cx.getImageData(0, Math.min(255, Math.round(rel * 255)), 1, 1).data;
  const hex =
    "#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
  setColor(hex);
  if (thumb) {
    thumb.style.top = `${rel * 100}%`;
    thumb.style.background = hex;
  }
  return hex;
}

// Attach drag-to-pick handlers to a colour bar. `onPick(hex)` runs after each
// sample (used by text mode to recolour the live text box).
function wireColorBar(bar, thumb, onPick) {
  bar.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const apply = (cy) => {
      const hex = pickColorFromBar(cy, bar, thumb);
      if (hex) onPick?.(hex);
    };
    apply(e.clientY);
    const move = (ev) => apply(ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

function ensureShapePanel() {
  let ui = shapePanel();
  if (ui) return ui;
  const host =
    getModal()?.querySelector(".ie-frame") ||
    getModal()?.querySelector(".instruction-editor-panel");
  if (!host) return null;

  ui = document.createElement("div");
  ui.id = "ieShapeUI";
  ui.className = "ie-shapeui is-hidden";
  let row = '<div class="ie-shape-row">';
  for (const name of SHAPE_ORDER) {
    row +=
      `<button type="button" class="ie-shape-btn" data-shape="${name}" aria-label="${name}" data-tooltip="${name}" title="${name[0].toUpperCase() + name.slice(1)}">` +
      SHAPE_ICONS[name] +
      "</button>";
  }
  row += "</div>";
  ui.innerHTML =
    '<div class="ie-shape-top">' +
    '<button type="button" class="ie-shape-undo" id="ieShapeUndo" aria-label="Undo" title="Undo">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a6 6 0 0 1 0 12h-3"/></svg>' +
    "</button>" +
    row +
    "</div>" +
    `<div class="ie-colorbar" id="ieColorBar" style="background:${COLORBAR_CSS}">` +
    '<span class="ie-colorbar-thumb" id="ieColorThumb"></span>' +
    "</div>" +
    '<div class="ie-brush-presets">' +
    SHAPE_SIZES.map(
      (s) =>
        `<button type="button" class="ie-brush-preset" data-shapesize="${s}" aria-label="${s}px line" title="${s}px">${SHAPE_SIZE_ICONS[s]}</button>`
    ).join("") +
    "</div>" +
    '<div class="ie-shape-bar">' +
    '<button type="button" class="ie-shape-text" id="ieShapeCancel">Cancel</button>' +
    '<button type="button" class="ie-shape-text ie-shape-done" id="ieShapeDone">Done</button>' +
    "</div>";
  host.appendChild(ui);

  ui.querySelectorAll(".ie-shape-btn").forEach((btn) => {
    btn.addEventListener("click", () => setShape(btn.dataset.shape));
  });
  ui.querySelectorAll("[data-shapesize]").forEach((btn) => {
    btn.addEventListener("click", () => setShapeSize(Number(btn.dataset.shapesize)));
  });
  ui.querySelector("#ieShapeUndo").addEventListener("click", () => undo());
  ui.querySelector("#ieShapeCancel").addEventListener("click", () => exitShapeMode(false));
  ui.querySelector("#ieShapeDone").addEventListener("click", () => exitShapeMode(true));
  wireColorBar(ui.querySelector("#ieColorBar"), ui.querySelector("#ieColorThumb"));
  return ui;
}

const SHAPE_SIZE_ICONS = {
  2: '<svg viewBox="0 0 28 28"><rect x="4" y="13" width="20" height="2" rx="1" fill="currentColor"/></svg>',
  4: '<svg viewBox="0 0 28 28"><rect x="4" y="12" width="20" height="4" rx="2" fill="currentColor"/></svg>',
  6: '<svg viewBox="0 0 28 28"><rect x="4" y="11" width="20" height="6" rx="3" fill="currentColor"/></svg>',
  10: '<svg viewBox="0 0 28 28"><rect x="4" y="9" width="20" height="10" rx="5" fill="currentColor"/></svg>',
};
const SHAPE_SIZES = ["2", "4", "6", "10"];

function setShapeSize(px) {
  setSize(px);
  highlightActiveShapeSize();
}

function highlightActiveShapeSize() {
  shapePanel()
    ?.querySelectorAll("[data-shapesize]")
    .forEach((btn) => {
      btn.classList.toggle("is-active", state.size === Number(btn.dataset.shapesize));
    });
}

function highlightActiveShape() {
  shapePanel()
    ?.querySelectorAll(".ie-shape-btn")
    .forEach((btn) => {
      btn.classList.toggle(
        "is-active",
        state.tool === "shape" && btn.dataset.shape === state.shape
      );
    });
}

function setShape(shape) {
  state.tool = "shape";
  state.shape = shape;
  state.linePending = null;
  if (textInputEl) commitTextInput();
  highlightActiveShape();
  applyCanvasCursor();
}

// Shape mode mirrors crop mode: clicking the shapes icon takes over the editor
// (its own × / send chrome is hidden) and the shapes UI shows its own
// Cancel / Done at the bottom. Cancel reverts to the strokes as they were when
// the mode was entered; Done keeps them.
function enterShapeMode() {
  const ui = ensureShapePanel();
  if (!ui) return;
  shapeBackup = JSON.stringify(state.strokes);
  ui.classList.remove("is-hidden");
  getModal()?.classList.add("is-shaping");
  document.querySelector('[data-ie-tool="icon"]')?.classList.add("is-active");
  // Snap to a preset stroke width so one is highlighted.
  if (![2, 4, 6, 10].includes(state.size)) setSize(6);
  setShape(state.shape);
  setColor(state.color);
  highlightActiveShapeSize();
}

function exitShapeMode(commit) {
  if (!commit && shapeBackup != null) {
    state.strokes = JSON.parse(shapeBackup);
    state.redoStack = [];
    updateUndoRedoButtons();
    redraw();
  }
  shapeBackup = null;
  shapePanel()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-shaping");
  document.querySelector('[data-ie-tool="icon"]')?.classList.remove("is-active");
  setTool("none");
}

// ===================== Text mode =====================
// Mirrors shape mode: the text toolbar icon takes over the editor (× / send
// chrome hidden) and shows its own controls — an alignment toggle + a text-
// background toggle (top-right), a colour bar (right) and Cancel / Done.
const ALIGN_ICONS = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
  center:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/></svg>',
};
const ALIGN_ORDER = ["left", "center", "right"];
const TEXTBG_ORDER = ["transparent", "white", "black"];

function textUI() {
  return document.getElementById("ieTextUI");
}

function ensureTextUI() {
  let ui = textUI();
  if (ui) return ui;
  const host =
    getModal()?.querySelector(".ie-frame") ||
    getModal()?.querySelector(".instruction-editor-panel");
  if (!host) return null;

  ui = document.createElement("div");
  ui.id = "ieTextUI";
  ui.className = "ie-textui is-hidden";
  ui.innerHTML =
    '<div class="ie-text-top">' +
    '<button type="button" class="ie-shape-undo" id="ieTextUndo" aria-label="Undo" title="Undo">' +
    UNDO_SVG +
    "</button>" +
    '<div class="ie-text-row">' +
    '<button type="button" class="ie-text-ctl" id="ieTextAlign" aria-label="Align text" title="Align"></button>' +
    '<button type="button" class="ie-text-ctl" id="ieTextBg" aria-label="Text background" title="Background">' +
    '<span class="ie-text-bg-swatch"></span>' +
    "</button>" +
    "</div>" +
    "</div>" +
    `<div class="ie-colorbar" id="ieTextColorBar" style="background:${COLORBAR_CSS}">` +
    '<span class="ie-colorbar-thumb" id="ieTextColorThumb"></span>' +
    "</div>" +
    '<div class="ie-brush-presets">' +
    '<button type="button" class="ie-brush-preset" data-textstyle="bold" aria-label="Bold" title="Bold"><span style="font-weight:800">B</span></button>' +
    '<button type="button" class="ie-brush-preset" data-textstyle="italic" aria-label="Italic" title="Italic"><span style="font-style:italic;font-weight:700">I</span></button>' +
    '<button type="button" class="ie-brush-preset" data-textstyle="underline" aria-label="Underline" title="Underline"><span style="text-decoration:underline;font-weight:700">U</span></button>' +
    "</div>" +
    '<div class="ie-shape-bar">' +
    '<button type="button" class="ie-shape-text" id="ieTextCancel">Cancel</button>' +
    '<button type="button" class="ie-shape-text ie-shape-done" id="ieTextDone">Done</button>' +
    "</div>";
  host.appendChild(ui);

  // Keep the contenteditable focused when tapping any control (otherwise blur
  // would auto-commit the live box before the control's click runs).
  ui.querySelectorAll("button, .ie-colorbar").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => e.preventDefault());
  });

  ui.querySelector("#ieTextUndo").addEventListener("click", () => undo());
  ui.querySelector("#ieTextAlign").addEventListener("click", () => cycleTextAlign());
  ui.querySelector("#ieTextBg").addEventListener("click", () => cycleTextBg());
  ui.querySelectorAll("[data-textstyle]").forEach((btn) => {
    btn.addEventListener("click", () => toggleTextStyle(btn.dataset.textstyle));
  });
  ui.querySelector("#ieTextCancel").addEventListener("click", () => exitTextMode(false));
  ui.querySelector("#ieTextDone").addEventListener("click", () => exitTextMode(true));
  wireColorBar(
    ui.querySelector("#ieTextColorBar"),
    ui.querySelector("#ieTextColorThumb"),
    (hex) => {
      if (textInputEl) {
        textInputEl.style.color = hex;
        textInputEl.dataset.color = hex;
      }
    }
  );
  return ui;
}

function setTextAlign(align) {
  state.textAlign = align;
  const btn = document.getElementById("ieTextAlign");
  if (btn) btn.innerHTML = ALIGN_ICONS[align] || ALIGN_ICONS.left;
  if (textInputEl) {
    textInputEl.style.textAlign = align;
    textInputEl.dataset.align = align;
  }
}

function cycleTextAlign() {
  const i = ALIGN_ORDER.indexOf(state.textAlign);
  setTextAlign(ALIGN_ORDER[(i + 1) % ALIGN_ORDER.length]);
}

function setTextBg(bg) {
  state.textBg = bg;
  const sw = document.querySelector("#ieTextBg .ie-text-bg-swatch");
  if (sw) {
    sw.classList.toggle("is-transparent", bg === "transparent");
    sw.style.background = bg === "white" ? "#fff" : bg === "black" ? "#000" : "transparent";
  }
  if (textInputEl) applyTextBoxBg(textInputEl, bg);
}

function cycleTextBg() {
  const i = TEXTBG_ORDER.indexOf(state.textBg);
  setTextBg(TEXTBG_ORDER[(i + 1) % TEXTBG_ORDER.length]);
}

// Bold / Italic / Underline are independent toggles; "normal" clears all.
function toggleTextStyle(s) {
  if (s === "normal") {
    state.textBold = false;
    state.textItalic = false;
    state.textUnderline = false;
  } else if (s === "bold") {
    state.textBold = !state.textBold;
  } else if (s === "italic") {
    state.textItalic = !state.textItalic;
  } else if (s === "underline") {
    state.textUnderline = !state.textUnderline;
  }
  if (textInputEl) {
    applyTextBoxStyle(textInputEl, {
      bold: state.textBold,
      italic: state.textItalic,
      underline: state.textUnderline,
    });
  }
  highlightActiveTextStyle();
}

function highlightActiveTextStyle() {
  const ui = textUI();
  if (!ui) return;
  ui.querySelectorAll("[data-textstyle]").forEach((btn) => {
    const s = btn.dataset.textstyle;
    let active = false;
    if (s === "bold") active = state.textBold;
    else if (s === "italic") active = state.textItalic;
    else if (s === "underline") active = state.textUnderline;
    btn.classList.toggle("is-active", active);
  });
}

// Drop a fresh, empty text box in the middle of the canvas so the user can
// start typing immediately on entering text mode.
function spawnCenteredTextInput() {
  if (!canvas) return;
  // Small box centered on the canvas; it auto-grows rightward as text is typed.
  const available = canvas.clientWidth || 320;
  const x = Math.max(12, (available - TEXT_BOX_MIN_WIDTH) / 2);
  const y = Math.max(0, canvas.clientHeight / 2 - 20);
  spawnTextInput({ x, y });
}

function enterTextMode() {
  const ui = ensureTextUI();
  if (!ui) return;
  state.tool = "text";
  ui.classList.remove("is-hidden");
  getModal()?.classList.add("is-texting");
  document.querySelector('[data-ie-tool="text"]')?.classList.add("is-active");
  setTextAlign(state.textAlign);
  setTextBg(state.textBg);
  highlightActiveTextStyle();
  setColor(state.color);
  applyCanvasCursor();
  spawnCenteredTextInput();
}

function exitTextMode(commit) {
  if (commit) {
    if (textInputEl) commitTextInput();
  } else if (textInputEl) {
    cancelTextInput();
  }
  textUI()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-texting");
  document.querySelector('[data-ie-tool="text"]')?.classList.remove("is-active");
  setTool("none");
}

// ===================== Brush mode =====================
// Opens from the pencil toolbar icon. Like the other modes it takes over the
// editor and offers a brush/eraser toggle, the colour bar, undo and
// Cancel/Done. Drawing uses the existing freehand stroke pipeline.
const BRUSH_ICONS = {
  pen: '<img src="../../assets/instruction%20editor/pencil.png" alt="" class="ie-brush-icon" />',
  eraser: '<img src="../../assets/instruction%20editor/eraser.png" alt="" class="ie-brush-icon" />',
};
// Bottom-row presets: thin / medium / thick pen strokes (squiggle at 3 widths)
// + a spray. The squiggle path is shared; only the stroke-width changes.
const SQUIGGLE = "M4 17C8 8 11 9 14 14s6 5 10 -4";
const BRUSH_PRESET_ICONS = {
  2: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"><path d="${SQUIGGLE}"/></svg>`,
  5: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.4"><path d="${SQUIGGLE}"/></svg>`,
  10: `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="6.4"><path d="${SQUIGGLE}"/></svg>`,
  spray:
    '<svg viewBox="0 0 28 28" fill="currentColor"><circle cx="9" cy="10" r="1.1"/><circle cx="13" cy="7" r="1.1"/><circle cx="14" cy="13" r="1.4"/><circle cx="18" cy="10" r="1.1"/><circle cx="10" cy="15" r="1.1"/><circle cx="17" cy="16" r="1.2"/><circle cx="21" cy="14" r="1"/><circle cx="13" cy="19" r="1.1"/><circle cx="8" cy="20" r="1"/><circle cx="20" cy="20" r="1"/></svg>',
};
const BRUSH_PRESETS = ["2", "5", "10", "spray"];
let brushBackup = null;

function brushUI() {
  return document.getElementById("ieBrushUI");
}

function ensureBrushUI() {
  let ui = brushUI();
  if (ui) return ui;
  const host =
    getModal()?.querySelector(".ie-frame") ||
    getModal()?.querySelector(".instruction-editor-panel");
  if (!host) return null;

  ui = document.createElement("div");
  ui.id = "ieBrushUI";
  ui.className = "ie-brushui is-hidden";
  ui.innerHTML =
    '<div class="ie-shape-top">' +
    '<button type="button" class="ie-shape-undo" id="ieBrushUndo" aria-label="Undo" title="Undo">' +
    UNDO_SVG +
    "</button>" +
    '<div class="ie-shape-row">' +
    `<button type="button" class="ie-shape-btn" data-brush="pen" aria-label="Brush" title="Brush">${BRUSH_ICONS.pen}</button>` +
    `<button type="button" class="ie-shape-btn" data-brush="eraser" aria-label="Eraser" title="Eraser">${BRUSH_ICONS.eraser}</button>` +
    "</div>" +
    "</div>" +
    `<div class="ie-colorbar" id="ieBrushColorBar" style="background:${COLORBAR_CSS}">` +
    '<span class="ie-colorbar-thumb" id="ieBrushColorThumb"></span>' +
    "</div>" +
    '<div class="ie-brush-presets">' +
    BRUSH_PRESETS.map(
      (p) =>
        `<button type="button" class="ie-brush-preset" data-preset="${p}" aria-label="${
          p === "spray" ? "Spray" : p + "px brush"
        }" title="${p === "spray" ? "Spray" : p + "px"}">${BRUSH_PRESET_ICONS[p]}</button>`
    ).join("") +
    "</div>" +
    '<div class="ie-shape-bar">' +
    '<button type="button" class="ie-shape-text" id="ieBrushCancel">Cancel</button>' +
    '<button type="button" class="ie-shape-text ie-shape-done" id="ieBrushDone">Done</button>' +
    "</div>";
  host.appendChild(ui);

  ui.querySelectorAll("[data-brush]").forEach((btn) => {
    btn.addEventListener("click", () => setBrushTool(btn.dataset.brush));
  });
  ui.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => setBrushPreset(btn.dataset.preset));
  });
  ui.querySelector("#ieBrushUndo").addEventListener("click", () => undo());
  ui.querySelector("#ieBrushCancel").addEventListener("click", () => exitBrushMode(false));
  ui.querySelector("#ieBrushDone").addEventListener("click", () => exitBrushMode(true));
  // Eraser has no colour; the bar drives the brush colour only.
  wireColorBar(ui.querySelector("#ieBrushColorBar"), ui.querySelector("#ieBrushColorThumb"));
  return ui;
}

function highlightActiveBrush() {
  const ui = brushUI();
  if (!ui) return;
  const erasing = state.tool === "eraser";
  // Top toggle: Brush vs Eraser.
  ui.querySelectorAll("[data-brush]").forEach((btn) => {
    const isErase = btn.dataset.brush === "eraser";
    btn.classList.toggle("is-active", isErase ? erasing : !erasing);
  });
  // Bottom presets: matched against the active brush flavour + size.
  ui.querySelectorAll("[data-preset]").forEach((btn) => {
    const p = btn.dataset.preset;
    let active = false;
    if (!erasing) {
      if (p === "spray") active = state.tool === "spray";
      else active = state.tool === "pen" && state.size === Number(p);
    }
    btn.classList.toggle("is-active", active);
  });
}

// Top toggle: "Brush" resumes the current flavour (pen or spray); "Eraser"
// switches to erasing.
function setBrushTool(t) {
  setTool(t === "eraser" ? "eraser" : state.brushStyle);
  highlightActiveBrush();
}

// Bottom presets: 2/5/10 = pen at that width; "spray" = airbrush.
function setBrushPreset(p) {
  if (p === "spray") {
    state.brushStyle = "spray";
    setTool("spray");
  } else {
    state.brushStyle = "pen";
    setSize(Number(p));
    setTool("pen");
  }
  highlightActiveBrush();
}

function enterBrushMode() {
  const ui = ensureBrushUI();
  if (!ui) return;
  // Snapshot so Cancel can drop everything drawn during this session.
  brushBackup = JSON.stringify(state.strokes);
  ui.classList.remove("is-hidden");
  getModal()?.classList.add("is-brushing");
  document.querySelector('[data-ie-tool="pencil"]')?.classList.add("is-active");
  // Start on a brush (never eraser), with a size that matches a preset.
  if (state.brushStyle === "pen" && ![2, 5, 10].includes(state.size)) setSize(5);
  setTool(state.brushStyle);
  setColor(state.color);
  highlightActiveBrush();
}

function exitBrushMode(commit) {
  if (!commit && brushBackup != null) {
    state.strokes = JSON.parse(brushBackup);
    state.redoStack = [];
    updateUndoRedoButtons();
    redraw();
  }
  brushBackup = null;
  brushUI()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-brushing");
  document.querySelector('[data-ie-tool="pencil"]')?.classList.remove("is-active");
  setTool("none");
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
  // Crop toolbar icon → enter crop & rotate mode.
  document
    .querySelector('[data-ie-tool="crop"]')
    ?.addEventListener("click", () => enterCropMode());
  // Square toolbar icon → open the shapes picker (line/curve/square/rectangle/
  // triangle/circle), drawn with adjustable size + colour.
  document
    .querySelector('[data-ie-tool="icon"]')
    ?.addEventListener("click", () => enterShapeMode());
  // Text toolbar icon → enter text mode (alignment + background toggles).
  document
    .querySelector('[data-ie-tool="text"]')
    ?.addEventListener("click", () => enterTextMode());
  // Pencil toolbar icon → enter brush mode (freehand draw + eraser).
  document
    .querySelector('[data-ie-tool="pencil"]')
    ?.addEventListener("click", () => enterBrushMode());
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
  clearSelection();
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
  // Make sure we never re-open straight into a stale crop session.
  state.crop = { active: false, rect: null, base: 0, fine: 0, source: null };
  cropUI()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-cropping");
  // Close the shapes picker, drop any shape-mode takeover, and clear its
  // toolbar highlight.
  shapeBackup = null;
  shapePanel()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-shaping");
  document.querySelector('[data-ie-tool="icon"]')?.classList.remove("is-active");
  // Drop any text-mode takeover too.
  textUI()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-texting");
  document.querySelector('[data-ie-tool="text"]')?.classList.remove("is-active");
  // …and any brush-mode takeover.
  brushBackup = null;
  brushUI()?.classList.add("is-hidden");
  getModal()?.classList.remove("is-brushing");
  document.querySelector('[data-ie-tool="pencil"]')?.classList.remove("is-active");
  removeTextInput();
  setTool("none");
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
  // captureJawJpegDataUrl (below the arches — side by side on desktop, stacked
  // on phones), so we don't draw a second watermark on top.
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas.parentElement);
  }
  window.addEventListener("resize", resizeCanvas);

  return new Promise((resolve) => {
    state.resolveSave = resolve;
  });
}

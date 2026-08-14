// Reference Images tab of the preview panel: the folder tabs, the gallery and
// its full-pane image view. The 3D pane is hidden and its render loop paused
// while the gallery is up — never torn down, a rebuild costs a WebGL context.

import { state } from "./2DAnnotation.js";
import { setPreview3DRenderPaused } from "./preview3D.js";
import { VIEWER_UUID } from "../shared/config.js";
import { getLoggedInUser } from "../shared/api.js";
import {
  fetchReferenceImageRows,
  referenceImageSrc,
  referenceImageTitle,
} from "../shared/caseEnrichment.js";

// Loaded on first visit to the tab, then kept: [{ src, title }].
let images = null;
let loadPromise = null;
let viewer = null;

function paneEls() {
  return {
    shell: document.querySelector(".annotation-shell"),
    tabs: document.querySelectorAll(".preview-tab"),
    frame: document.getElementById("imagePreviewArea"),
    pane: document.getElementById("referenceImagesPane"),
    body: document.getElementById("referenceImagesBody"),
    maximizeBtn: document.getElementById("preview3dMaximizeBtn"),
    countEl: document.querySelector(".preview-tab-count"),
  };
}

export function initReferenceImages() {
  const { tabs } = paneEls();
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showPreviewTab(tab.dataset.previewTab));
  });
  showPreviewTab("3d");
}

export function showPreviewTab(name) {
  const { shell, tabs, frame, pane, maximizeBtn } = paneEls();
  if (!frame || !pane) return;
  const refs = name === "refs";

  // The maximize/restore control lives inside the 3D frame, so leaving the tab
  // while maximized would strand the user with no way back to the split view.
  if (refs && shell?.classList.contains("preview-maximized")) maximizeBtn?.click();

  tabs.forEach((tab) => {
    const active = tab.dataset.previewTab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  });
  frame.classList.toggle("is-hidden", refs);
  pane.classList.toggle("is-hidden", !refs);
  setPreview3DRenderPaused(refs);
  if (refs) loadReferenceImages();
  // Leaving the tab returns the pane to the grid, so its arrow-key handler never
  // outlives the view it drives.
  else closeViewer();
}

function loadReferenceImages({ force = false } = {}) {
  const { body } = paneEls();
  if (!body) return Promise.resolve();
  if (force) {
    images = null;
    loadPromise = null;
  }
  if (images) {
    renderGallery(images);
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  if (!state.caseIntID) {
    renderMessage("No case selected.");
    return Promise.resolve();
  }
  renderMessage("Loading reference images…");

  // Guests (shared link, no login) read under the viewer identity, same as the
  // rest of the page.
  const uuid = getLoggedInUser()?.uuid || VIEWER_UUID;
  loadPromise = fetchReferenceImageRows(state.caseIntID, uuid)
    .then((rows) => {
      images = rows
        .map((row, i) => ({ src: referenceImageSrc(row), title: referenceImageTitle(row, i) }))
        .filter((img) => img.src);
      renderGallery(images);
      updateTabCount(images.length);
    })
    .catch((err) => {
      console.warn("[referenceImages] load failed", err);
      renderMessage("Could not load reference images.", { retry: true });
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

function renderMessage(text, { retry = false } = {}) {
  const { body } = paneEls();
  if (!body) return;
  closeViewer();
  body.replaceChildren();
  const box = document.createElement("div");
  box.className = "preview-refs-empty";
  const p = document.createElement("p");
  p.textContent = text;
  box.appendChild(p);
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preview-refs-retry";
    btn.textContent = "Try again";
    btn.addEventListener("click", () => loadReferenceImages({ force: true }));
    box.appendChild(btn);
  }
  body.appendChild(box);
}

function renderGallery(list) {
  const { body } = paneEls();
  if (!body) return;
  if (!list.length) {
    renderMessage("No reference images were uploaded with this case.");
    return;
  }
  closeViewer();
  body.replaceChildren();
  const grid = document.createElement("div");
  grid.className = "preview-refs-grid";
  list.forEach((img, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "preview-refs-card";
    card.title = img.title;
    card.setAttribute("aria-label", `Open ${img.title}`);
    const thumb = document.createElement("img");
    thumb.className = "preview-refs-thumb";
    thumb.src = img.src;
    thumb.alt = img.title;
    thumb.loading = "lazy";
    const cap = document.createElement("span");
    cap.className = "preview-refs-caption";
    cap.textContent = img.title;
    card.append(thumb, cap);
    card.addEventListener("click", () => openViewer(i));
    grid.appendChild(card);
  });
  body.appendChild(grid);
}

function updateTabCount(n) {
  const { countEl } = paneEls();
  if (!countEl) return;
  countEl.textContent = n ? String(n) : "";
  countEl.classList.toggle("is-hidden", !n);
}

// ---- in-pane viewer ------------------------------------------------------
// Opening an image swaps the grid for a full-pane view of it — inside the panel
// border, not a modal over the page — with a Back link to the grid.

function ensureViewer() {
  if (viewer) return viewer;
  const { pane } = paneEls();
  if (!pane) return null;
  const el = document.createElement("div");
  el.className = "preview-refs-viewer is-hidden";
  el.innerHTML = `
    <div class="preview-refs-viewer-bar">
      <button type="button" class="preview-refs-back">&#8249; All images</button>
      <span class="preview-refs-viewer-title"></span>
      <span class="preview-refs-viewer-count"></span>
      <div class="preview-refs-zoom">
        <button type="button" class="preview-refs-zoom-btn" data-zoom="out" aria-label="Zoom out">&minus;</button>
        <button type="button" class="preview-refs-zoom-level" aria-label="Reset zoom" title="Reset zoom">100%</button>
        <button type="button" class="preview-refs-zoom-btn" data-zoom="in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <div class="preview-refs-stage">
      <button type="button" class="preview-refs-nav preview-refs-prev" aria-label="Previous image">&#8249;</button>
      <img class="preview-refs-full" alt="" />
      <button type="button" class="preview-refs-nav preview-refs-next" aria-label="Next image">&#8250;</button>
    </div>
  `;
  pane.appendChild(el);
  el.querySelector(".preview-refs-back").addEventListener("click", closeViewer);
  el.querySelector(".preview-refs-prev").addEventListener("click", () => stepViewer(-1));
  el.querySelector(".preview-refs-next").addEventListener("click", () => stepViewer(1));
  el.querySelector('[data-zoom="in"]').addEventListener("click", () => setZoom(zoom * ZOOM_STEP));
  el.querySelector('[data-zoom="out"]').addEventListener("click", () => setZoom(zoom / ZOOM_STEP));
  el.querySelector(".preview-refs-zoom-level").addEventListener("click", () => setZoom(1));
  viewer = { el, idx: 0 };
  bindStageGestures(el.querySelector(".preview-refs-stage"));
  return viewer;
}

// ---- zoom & pan ----------------------------------------------------------
// Zoom is a transform on the <img>: the stage clips it, so a magnified image
// still stays inside the panel. 1 = fit, and pan is only possible above that.

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.35;

let zoom = 1;
let panX = 0;
let panY = 0;

function applyZoom() {
  if (!viewer) return;
  const { el } = viewer;
  const full = el.querySelector(".preview-refs-full");
  full.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  el.querySelector(".preview-refs-stage").classList.toggle("is-zoomed", zoom > 1);
  el.querySelector(".preview-refs-zoom-level").textContent = `${Math.round(zoom * 100)}%`;
  el.querySelector('[data-zoom="out"]').disabled = zoom <= ZOOM_MIN + 0.001;
  el.querySelector('[data-zoom="in"]').disabled = zoom >= ZOOM_MAX - 0.001;
}

// Keeps the magnified image overlapping the stage — panning can reach its edges
// and no further.
function clampPan() {
  if (!viewer) return;
  const stage = viewer.el.querySelector(".preview-refs-stage");
  const full = viewer.el.querySelector(".preview-refs-full");
  // offsetWidth/Height are the fitted (untransformed) size, so the overflow is
  // whatever the scale adds beyond the stage.
  const maxX = Math.max(0, (full.offsetWidth * zoom - stage.clientWidth) / 2);
  const maxY = Math.max(0, (full.offsetHeight * zoom - stage.clientHeight) / 2);
  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

// `focus` (stage-centre-relative point) is the spot that must stay put — that is
// what makes wheel and pinch zoom land where the user is pointing.
function setZoom(next, focus) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  if (focus && zoom > 0) {
    const k = z / zoom;
    panX = focus.x - k * (focus.x - panX);
    panY = focus.y - k * (focus.y - panY);
  }
  zoom = z;
  if (zoom === ZOOM_MIN) {
    panX = 0;
    panY = 0;
  }
  clampPan();
  applyZoom();
}

function resetZoom() {
  zoom = 1;
  panX = 0;
  panY = 0;
  applyZoom();
}

function stageFocus(stage, clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
}

function bindStageGestures(stage) {
  if (!stage) return;

  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), stageFocus(stage, e.clientX, e.clientY));
    },
    { passive: false }
  );

  stage.addEventListener("dblclick", (e) => {
    if (e.target.closest(".preview-refs-nav")) return;
    setZoom(zoom > ZOOM_MIN ? ZOOM_MIN : 2, stageFocus(stage, e.clientX, e.clientY));
  });

  // One pointer drags the magnified image, two pinch it. Pointer events cover
  // mouse, pen and touch with the same handlers.
  const points = new Map();
  let pinch = null;

  const spread = () => {
    const [a, b] = [...points.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".preview-refs-nav")) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2) {
      const s = spread();
      pinch = { dist: s.dist, zoom };
    } else if (points.size === 1 && zoom > ZOOM_MIN) {
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("is-panning");
    }
  });

  stage.addEventListener("pointermove", (e) => {
    const prev = points.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (points.size === 2 && pinch) {
      const s = spread();
      if (pinch.dist > 0) setZoom(pinch.zoom * (s.dist / pinch.dist), stageFocus(stage, s.mx, s.my));
      return;
    }
    if (points.size === 1 && zoom > ZOOM_MIN) {
      panX += dx;
      panY += dy;
      clampPan();
      applyZoom();
    }
  });

  const release = (e) => {
    points.delete(e.pointerId);
    if (points.size < 2) pinch = null;
    if (!points.size) stage.classList.remove("is-panning");
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("pointerleave", release);
}

function openViewer(idx) {
  const { body } = paneEls();
  if (!images?.length || !body) return;
  const v = ensureViewer();
  if (!v) return;
  v.idx = idx;
  body.classList.add("is-hidden");
  v.el.classList.remove("is-hidden");
  document.addEventListener("keydown", onViewerKey);
  paintViewer();
}

function stepViewer(delta) {
  if (!viewer || !images?.length) return;
  viewer.idx = (viewer.idx + delta + images.length) % images.length;
  paintViewer();
}

function paintViewer() {
  if (!viewer) return;
  const { el, idx } = viewer;
  const img = images[idx];
  const full = el.querySelector(".preview-refs-full");
  full.src = img.src;
  full.alt = img.title;
  // Each image starts fitted — a zoom carried over from the previous one would
  // land on a different part of a differently shaped photo.
  resetZoom();
  el.querySelector(".preview-refs-viewer-title").textContent = img.title;
  const total = images.length;
  el.querySelector(".preview-refs-viewer-count").textContent =
    total > 1 ? `${idx + 1} / ${total}` : "";
  const nav = total > 1 ? "" : "hidden";
  el.querySelector(".preview-refs-prev").style.visibility = nav;
  el.querySelector(".preview-refs-next").style.visibility = nav;
}

function closeViewer() {
  const { body } = paneEls();
  viewer?.el.classList.add("is-hidden");
  body?.classList.remove("is-hidden");
  document.removeEventListener("keydown", onViewerKey);
}

function onViewerKey(e) {
  if (e.key === "Escape") closeViewer();
  else if (e.key === "ArrowLeft") stepViewer(-1);
  else if (e.key === "ArrowRight") stepViewer(1);
  else if (e.key === "+" || e.key === "=") setZoom(zoom * ZOOM_STEP);
  else if (e.key === "-") setZoom(zoom / ZOOM_STEP);
  else if (e.key === "0") setZoom(ZOOM_MIN);
}

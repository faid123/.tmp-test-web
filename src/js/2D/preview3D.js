import { state, setMessage, fetchCaseDetail } from "./2DAnnotation.js";
import { saveAsJpeg } from "./annotationLocks.js";
import { toast, confirmModal } from "../toast.js";

let THREE = null;
let TrackballControls = null;
let STLLoader = null;

const PREVIEW_MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const PREVIEW_FALLBACK_UUID = "AC4gRQXZJoNz9EhhW36Q8jMJXBsf";
const SMARTRPD_API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
// Case thumbnail slots on POST /thumbnails (carousel pulls all via /thumbnails/get).
// Slot 0 = composite 2D; slots 1/2 = upper/lower jaw renders (create-case seeds them).
// A capture overwrites the slot of whichever jaw is visible — isolating one jaw
// refreshes only its thumbnail; both visible → write both so neither goes stale.
const JAW_UPPER_THUMBNAIL_SLOT = 1;
const JAW_LOWER_THUMBNAIL_SLOT = 2;
// Default RPD jaw color used as the "no undercut" base in vertex-color renders.
const DEFAULT_TOOTH_COLOR = [208 / 255, 190 / 255, 141 / 255];
const PREVIEW_DESKTOP_PIXEL_RATIO_CAP = 1.25;
const PREVIEW_EDGE_DESKTOP_PIXEL_RATIO_CAP = 1;
const PREVIEW_MOBILE_PIXEL_RATIO_CAP = 1.5;
const PREVIEW_MAX_DISPLAY_TRIANGLES = 120000;
const PREVIEW_MIN_SIMPLIFY_TRIANGLES = 160000;
const preview3DState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  frameId: 0,
  resizeObserver: null,
  mount: null,
  modelRoot: null,
  groups: { upper: null, lower: null },
  // Uploaded "other 3D files" live in jaw_stls_extra_slot_1..4:
  //   occupiedSlots  - slots the backend holds (drives the modal list)
  //   extraFileNames - slot -> filename for each occupied slot
  //   extraGroups    - slot -> { group, row } for meshes in the panel
  // A slot can be backend-occupied but removed from the panel (row trash = session-only
  // "remove from preview"; modal X = permanent delete).
  extraGroups: {},
  extraFileNames: {},
  occupiedSlots: null,
  // Slot currently uploading (drives that row's inline progress bar), plus the
  // live progress-bar element refs for that row so setUpload3dBusy can update it.
  uploadingSlot: null,
  slotProgressRefs: null,
  upload3dModal: null,
  upload3dKeyHandler: null,
  uploadCleanup: null,
  area: null,
  activeView: "both",
  topControls: null,
  caseData: null,
  // Base64 STL of each shown jaw ({ data, type, filename }), kept so the jaw
  // trash buttons can POST the current STL to /stlclosed/.
  jawFiles: {},
  heatmapEnabled: false,
  heatmapToggleBtn: null,
  heatmapBoard: null,
  meshQuality: null,
  meshQualityPromptCleanup: null,
  meshQualityPromptResolve: null,
  meshQualityOverlay: null,
  meshQualityProgressFill: null,
  meshQualityProgressPercent: null,
  meshQualityProgressJaw: null,
  // Flat view-navigation gizmo (bottom-right of the preview).
  previewNav: null,
};

// Four fixed, named extra-STL slots per case (one per jaw_stls_extra_slot_N).
// The slot number is the backend key; the name is a display label only — the
// backend slots are not semantically typed, so a file previously uploaded to a
// slot simply shows under that slot's label.
const EXTRA_STL_SLOTS = [1, 2, 3, 4];
const EXTRA_STL_SLOT_NAMES = {
  1: "Upper jaw",
  2: "Upper metal RPD",
  3: "Lower jaw",
  4: "Lower metal RPD",
};

// Custom image icon per slot, shown ONLY on a populated (uploaded) slot row in
// the "Other 3D files" list. Paths are relative to src/js/2D/. `black: true`
// renders the image fully black (via CSS filter) — used for the occlusal PNGs.
const EXTRA_STL_SLOT_ICONS = {
  1: { src: "../../assets/Icon_UpperJaw_Occlusal.png", black: true },
  2: { src: "../../assets/upper.svg" },
  3: { src: "../../assets/Icon_LowerJaw_Occlusal.png", black: true },
  4: { src: "../../assets/lower.svg" },
};

// Display label for a slot, e.g. "Slot 1: Upper jaw".
function slotLabel(slot) {
  return `Slot ${slot}: ${EXTRA_STL_SLOT_NAMES[slot] || "3D file"}`;
}
// Same flat tan as the upper-jaw material so extras match the original jaws.
const EXTRA_STL_COLOR = 0xb0875a;
// Metal-RPD slots (Upper/Lower metal RPD) render with a metallic finish instead
// of the tan jaw colour.
const METAL_RPD_SLOTS = new Set([2, 4]);
const METAL_RPD_COLOR = 0xd6dadf; // brushed cobalt-chrome / stainless

export async function loadInteractiveJawPreview(area) {
  showPreviewLoading(area, "Loading 3D jaws...");
  try {
    // Start the three.js CDN import and all network fetches together so the
    // module download overlaps the STL/undercut requests instead of running
    // strictly before them (the fetches don't need THREE to be ready).
    const depsPromise = ensureThreeDeps();
    // Fetch the heatmap up front so both render paths can use it.
    const undercutPromise = fetchUndercutForCase();
    const jawFilesPromise = fetchJawFilesForCase();
    // Prefetch case data so SET SURVEY ANGLE can preserve the unmodified jaw's
    // angles without an extra round-trip when the button is clicked.
    fetchCaseData().then((data) => {
      if (data) preview3DState.caseData = data;
    });

    const depsReady = await depsPromise;
    if (!depsReady) {
      teardown3DPreview();
      return false;
    }

    init3DPreview(area);
    hidePreviewLoading(area);
    const meshQualityPromise = promptMeshQualityChoice();

    const meshFiles = await fetchParameterisedMeshForCase();
    if (meshFiles.length) {
      const [undercut, meshQuality] = await Promise.all([undercutPromise, meshQualityPromise]);
      await waitForPreviewPaint();
      try {
        await populateJawPreviewFromOFF(meshFiles, undercut, meshQuality);
        await finishMeshQualityProgress();
      } catch (err) {
        clearMeshQualityProgress();
        throw err;
      }
      // Extra STLs are secondary — load them in the background so the spinner
      // clears as soon as the jaws are painted.
      loadExtraStlsIntoPreview().catch((err) =>
        console.warn("[preview3D] extra STL background load failed", err)
      );
      return true;
    }

    const jawFiles = await jawFilesPromise;
    if (jawFiles.length) {
      const [undercut, meshQuality] = await Promise.all([undercutPromise, meshQualityPromise]);
      await waitForPreviewPaint();
      try {
        await populateJawPreview(jawFiles, undercut, meshQuality);
        await finishMeshQualityProgress();
      } catch (err) {
        clearMeshQualityProgress();
        throw err;
      }
    } else {
      dismissMeshQualityPrompt();
      // No jaw STLs yet (or all removed): keep the panel up with both rows in
      // their empty/upload state so the user can still add 3D files.
      showEmptyJawPanel();
    }
    // Don't block first paint on the extra-slot fetches (usually empty 404s);
    // they pop into the scene and re-center when they arrive.
    loadExtraStlsIntoPreview().catch((err) =>
      console.warn("[preview3D] extra STL background load failed", err)
    );
    return true;
  } finally {
    hidePreviewLoading(area);
  }
}

async function ensureThreeDeps() {
  if (THREE && TrackballControls && STLLoader) return true;
  try {
    const [threeMod, trackballMod, stlMod] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/TrackballControls.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/STLLoader.js"),
    ]);
    THREE = threeMod;
    TrackballControls = trackballMod.TrackballControls;
    STLLoader = stlMod.STLLoader;
    return true;
  } catch (err) {
    console.error("Failed loading three.js dependencies", err);
    return false;
  }
}

function getPreviewPixelRatioCap() {
  const ua = navigator.userAgent || "";
  const isEdge = /\bEdg\//.test(ua);
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(ua) ||
    window.matchMedia?.("(pointer: coarse)")?.matches;
  if (isMobile) return PREVIEW_MOBILE_PIXEL_RATIO_CAP;
  return isEdge ? PREVIEW_EDGE_DESKTOP_PIXEL_RATIO_CAP : PREVIEW_DESKTOP_PIXEL_RATIO_CAP;
}

function dismissMeshQualityPrompt(defaultQuality = "low") {
  if (preview3DState.meshQualityPromptCleanup) {
    preview3DState.meshQualityPromptCleanup(defaultQuality);
    preview3DState.meshQualityPromptCleanup = null;
  }
  clearMeshQualityProgress();
}

function promptMeshQualityChoice() {
  const mount = preview3DState.mount;
  if (!mount) {
    preview3DState.meshQuality = "low";
    return Promise.resolve("low");
  }

  dismissMeshQualityPrompt("low");

  return new Promise((resolve) => {
    let settled = false;
    const overlay = document.createElement("div");
    overlay.className = "jaw-preview-quality-prompt";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Choose mesh quality");
    preview3DState.meshQualityOverlay = overlay;
    overlay.innerHTML = `
      <div class="jaw-preview-quality-panel">
        <div class="jaw-preview-quality-title">Choose mesh quality</div>
        <div class="jaw-preview-quality-actions">
          <button type="button" class="jaw-preview-quality-btn is-primary" data-quality="low">
            <span>Low Quality</span>
            <small>Faster</small>
          </button>
          <button type="button" class="jaw-preview-quality-btn" data-quality="high">
            <span>High Quality</span>
            <small>Original</small>
          </button>
        </div>
      </div>
    `

    const choose = (quality, { showProgress = true } = {}) => {
      if (settled) return;
      settled = true;
      const normalized = quality === "high" ? "high" : "low";
      preview3DState.meshQuality = normalized;
      preview3DState.meshQualityPromptResolve = null;
      preview3DState.meshQualityPromptCleanup = null;
      if (showProgress) {
        showMeshQualityProgress(overlay, normalized);
        requestAnimationFrame(() => resolve(normalized));
      } else {
        overlay.remove();
        clearMeshQualityProgress();
        resolve(normalized);
      }
    };

    overlay.querySelectorAll("[data-quality]").forEach((btn) => {
      btn.addEventListener("click", () => choose(btn.dataset.quality));
    });

    preview3DState.meshQualityPromptResolve = choose;
    preview3DState.meshQualityPromptCleanup = (defaultQuality = "low") =>
      choose(defaultQuality, { showProgress: false });
    mount.appendChild(overlay);
  });
}

function showMeshQualityProgress(overlay, meshQuality) {
  const label = meshQuality === "high" ? "High Quality" : "Low Quality";
  overlay.setAttribute("aria-label", "Loading 3D jaw mesh");
  overlay.innerHTML = `
    <div class="jaw-preview-quality-panel jaw-preview-quality-panel-loading">
      <div class="jaw-preview-quality-title">Loading ${label} Mesh</div>
      <div class="jaw-preview-quality-status">Preparing jaw mesh...</div>
      <div class="jaw-preview-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="jaw-preview-progress-fill"></div>
      </div>
      <div class="jaw-preview-progress-meta">
        <span class="jaw-preview-progress-jaw">Waiting for jaw data</span>
        <span class="jaw-preview-progress-percent">0%</span>
      </div>
    </div>
  `;
  preview3DState.meshQualityOverlay = overlay;
  preview3DState.meshQualityProgressFill = overlay.querySelector(".jaw-preview-progress-fill");
  preview3DState.meshQualityProgressPercent = overlay.querySelector(".jaw-preview-progress-percent");
  preview3DState.meshQualityProgressJaw = overlay.querySelector(".jaw-preview-progress-jaw");
  updateMeshQualityProgress(4, "Waiting for jaw data");
}

function updateMeshQualityProgress(percent, jawLabel = "Loading jaw mesh") {
  const overlay = preview3DState.meshQualityOverlay;
  const fill = preview3DState.meshQualityProgressFill;
  const percentEl = preview3DState.meshQualityProgressPercent;
  const jawEl = preview3DState.meshQualityProgressJaw;
  if (!overlay || !fill || !percentEl || !jawEl) return;
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  fill.style.width = `${value}%`;
  percentEl.textContent = `${value}%`;
  jawEl.textContent = jawLabel;
  overlay.querySelector(".jaw-preview-progress")?.setAttribute("aria-valuenow", String(value));
}

async function updateJawMeshProgress(index, total, stage, upper, action) {
  const jawName = upper ? "Upper jaw" : "Lower jaw";
  const safeTotal = Math.max(total || 1, 1);
  const safeIndex = Math.max(index || 0, 0);
  const stageRatio = Math.max(0, Math.min(1, stage || 0));
  const percent = 8 + ((safeIndex + stageRatio) / safeTotal) * 86;
  updateMeshQualityProgress(percent, `${action} ${jawName}`);
  await waitForPreviewPaint();
}

async function finishMeshQualityProgress() {
  if (!preview3DState.meshQualityOverlay) return;
  updateMeshQualityProgress(100, "3D jaw mesh ready");
  await waitForPreviewPaint();
  clearMeshQualityProgress();
}

function clearMeshQualityProgress() {
  preview3DState.meshQualityOverlay?.remove();
  preview3DState.meshQualityOverlay = null;
  preview3DState.meshQualityProgressFill = null;
  preview3DState.meshQualityProgressPercent = null;
  preview3DState.meshQualityProgressJaw = null;
}

function waitForPreviewPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Snapshot the current 3D view as a data URL. We re-render immediately before
// reading the canvas because WebGL's drawing buffer is not preserved between
// frames; keeping preserveDrawingBuffer off is much faster on Windows/Edge.
export function capture3DPreviewDataUrl() {
  const { renderer, scene, camera } = preview3DState;
  if (!renderer || !scene || !camera) return "";
  try {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } catch (err) {
    console.warn("capture3DPreviewDataUrl failed", err);
    return "";
  }
}

// Dispose every mesh under an Object3D: geometry, material(s), and the cached
// heatmap/flat materials we stash in userData. Used by teardown and by the jaw/
// extra-STL removal paths so disposal logic lives in exactly one place.
function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
    else node.material?.dispose?.();
    node.userData?.heatmapMaterial?.dispose?.();
    node.userData?.flatMaterial?.dispose?.();
  });
}

export function teardown3DPreview() {
  if (preview3DState.frameId) {
    cancelAnimationFrame(preview3DState.frameId);
    preview3DState.frameId = 0;
  }
  if (preview3DState.resizeObserver) {
    preview3DState.resizeObserver.disconnect();
    preview3DState.resizeObserver = null;
  }
  if (preview3DState.controls) {
    preview3DState.controls.dispose();
    preview3DState.controls = null;
  }
  disposeObject3D(preview3DState.scene);
  if (preview3DState.renderer) {
    preview3DState.renderer.dispose();
    preview3DState.renderer.domElement.remove();
    preview3DState.renderer = null;
  }

  const area = document.getElementById("imagePreviewArea");
  if (area) {
    area.querySelectorAll(".jaw-preview-shell, .jaw-preview-loading").forEach((node) => node.remove());
    area.classList.remove("is-3d-ready");
  }

  preview3DState.scene = null;
  preview3DState.camera = null;
  preview3DState.mount = null;
  preview3DState.modelRoot = null;
  preview3DState.groups = { upper: null, lower: null };
  preview3DState.jawFiles = {};
  preview3DState.extraGroups = {};
  preview3DState.extraFileNames = {};
  preview3DState.occupiedSlots = null;
  preview3DState.area = null;
  preview3DState.topControls = null;
  closeUpload3dModal();
  closeDownloadJawProfileModal();
  preview3DState.caseData = null;
  if (preview3DState.meshQualityPromptCleanup) {
    preview3DState.meshQualityPromptCleanup();
    preview3DState.meshQualityPromptCleanup = null;
  }
  clearMeshQualityProgress();
  preview3DState.heatmapEnabled = false;
  preview3DState.heatmapToggleBtn = null;
  preview3DState.heatmapBoard = null;
  preview3DState.meshQuality = null;
  if (preview3DState.captureCleanup) {
    preview3DState.captureCleanup();
    preview3DState.captureCleanup = null;
  }
  if (preview3DState.downloadJawCleanup) {
    preview3DState.downloadJawCleanup();
    preview3DState.downloadJawCleanup = null;
  }
  if (preview3DState.uploadCleanup) {
    preview3DState.uploadCleanup();
    preview3DState.uploadCleanup = null;
  }
  preview3DState.capturing = false;
}

function getLoggedInUser() {
  try {
    const raw = localStorage.getItem("loggedInUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Save the latest 3D preview snapshot to the upper/lower thumbnail slot of whichever
// jaw is visible. POST /thumbnails upserts by (case_int_id, slot), so each slot keeps
// only its latest capture. Best-effort: failure is surfaced but non-blocking.
async function uploadLatest3DCapture(dataUrl) {
  const caseIntID = state.caseIntID;
  const user = getLoggedInUser();
  if (!caseIntID || !user?.uuid || !dataUrl) {
    toast.error("Screen capture failed — please reload and try again.");
    return;
  }

  // Visibility is the user's intent: hidden jaws aren't in the captured pixels,
  // so writing the capture into their slot would replace a good render with a
  // misleading one. Skip slots whose jaw is hidden right now.
  const upperVisible = !!preview3DState.groups?.upper?.visible;
  const lowerVisible = !!preview3DState.groups?.lower?.visible;
  const slots = [];
  if (upperVisible) slots.push(JAW_UPPER_THUMBNAIL_SLOT);
  if (lowerVisible) slots.push(JAW_LOWER_THUMBNAIL_SLOT);
  if (!slots.length) {
    toast.warning("No jaw is visible to capture.");
    return;
  }

  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  const results = await Promise.all(
    slots.map((slot) =>
      fetch(`${SMARTRPD_API_BASE}/thumbnails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { machine_id: PREVIEW_MACHINE_ID, uuid: user.uuid, caseIntID },
          { case_id: caseIntID, slot, data: base64 },
        ]),
      })
        .then((res) => ({ slot, ok: res.ok, status: res.status }))
        .catch((err) => {
          console.error(`[preview3D] thumbnail slot ${slot} fetch failed:`, err);
          return { slot, ok: false, status: 0 };
        })
    )
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("[preview3D] failed thumbnail slots:", failed);
    const msg = `Case thumbnail update failed for slot${failed.length > 1 ? "s" : ""} ${failed.map((r) => r.slot).join(", ")}.`;
    setMessage(msg, true);
    toast.error(msg);
    return;
  }
  const labels = slots
    .map((s) => (s === JAW_UPPER_THUMBNAIL_SLOT ? "upper" : "lower"))
    .join(" + ");
  setMessage(`${labels} thumbnail updated.`, false);
  toast.success(`Screen capture saved to ${labels} thumbnail.`);
}

// Capture a single jaw on its own and upsert it into that jaw's case-thumbnail
// slot (1=upper, 2=lower). Called after a jaw STL upload so the case tile picks
// up the new model without the user having to hit the capture button. The other
// jaw is hidden for the shot, then prior visibility is restored. Best-effort.
async function uploadJawThumbnail(jaw) {
  const { renderer, scene, camera } = preview3DState;
  const caseIntID = state.caseIntID;
  const user = getLoggedInUser();
  if (!renderer || !scene || !camera || !caseIntID || !user?.uuid) return;
  if (!preview3DState.groups?.[jaw]) return;

  const slot = jaw === "upper" ? JAW_UPPER_THUMBNAIL_SLOT : JAW_LOWER_THUMBNAIL_SLOT;

  // Isolate the target jaw for the capture, then restore the prior visibility so
  // the on-screen view is left exactly as it was.
  const prev = {
    upper: preview3DState.groups?.upper?.visible,
    lower: preview3DState.groups?.lower?.visible,
  };
  if (preview3DState.groups?.upper) preview3DState.groups.upper.visible = jaw === "upper";
  if (preview3DState.groups?.lower) preview3DState.groups.lower.visible = jaw === "lower";

  let base64 = "";
  try {
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const commaIdx = dataUrl.indexOf(",");
    base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  } catch (err) {
    console.warn(`[preview3D] thumbnail capture (${jaw}) failed`, err);
  } finally {
    if (preview3DState.groups?.upper) preview3DState.groups.upper.visible = !!prev.upper;
    if (preview3DState.groups?.lower) preview3DState.groups.lower.visible = !!prev.lower;
    renderer.render(scene, camera);
  }
  if (!base64) return;

  try {
    const res = await fetch(`${SMARTRPD_API_BASE}/thumbnails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: PREVIEW_MACHINE_ID, uuid: user.uuid, caseIntID },
        { case_id: caseIntID, slot, data: base64 },
      ]),
    });
    if (res.ok) {
      console.log(`[preview3D] ✓ thumbnail slot ${slot} (${jaw}) updated`);
    } else {
      console.error(`[preview3D] ✕ thumbnail slot ${slot} (${jaw}) status=${res.status}`);
    }
  } catch (err) {
    console.error(`[preview3D] thumbnail slot ${slot} (${jaw}) fetch failed`, err);
  }
}

async function fetchJawFilesForCase() {
  if (!state.caseIntID) return [];
  const user = getLoggedInUser();
  if (!user?.uuid) return [];

  const payload = [
    { machine_id: PREVIEW_MACHINE_ID, uuid: user.uuid, caseIntID: state.caseIntID },
    { case_id: state.caseIntID, case_int_id: state.caseIntID, caseIntID: state.caseIntID },
  ];

  const tryEndpoint = async (endpoint, requestPayload) => {
    const path = endpoint.replace(SMARTRPD_API_BASE, "");
    const t0 = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const dt = Math.round(performance.now() - t0);
      const tag = res.ok ? "✓" : "✕";
      console.log(`[preview3D] ${tag} POST ${path} status=${res.status} ${dt}ms`);
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      return list
        .filter((item) => item?.data && getJawKeyFromFile(item))
        .map((item) => ({ ...item, __sourcePath: path }));
    } catch (err) {
      console.warn(`[preview3D] ✕ POST ${path} failed`, err);
      return [];
    }
  };

  // Primary STL source for preview: /stl/get. Fall back to /stl/raw/get for
  // older cases that only have raw jaw uploads.
  const all = await tryEndpoint(`${SMARTRPD_API_BASE}/stl/get`, payload);
  const validAll = filterRenderableJawFiles(all, "/stl/get");
  if (validAll.length) {
    console.log(`[preview3D] STL source selected: /stl/get (${validAll.length} file(s))`);
    return validAll;
  }
  if (all.length) {
    console.warn("[preview3D] /stl/get returned mesh data, but none of it is renderable as STL/OFF. Trying /stl/raw/get.");
  }

  const raw = await tryEndpoint(`${SMARTRPD_API_BASE}/stl/raw/get`, payload);
  const validRaw = filterRenderableJawFiles(raw, "/stl/raw/get");
  if (validRaw.length) {
    console.log(`[preview3D] STL source selected: /stl/raw/get (${validRaw.length} file(s))`);
    return validRaw;
  }
  if (raw.length) {
    console.warn("[preview3D] /stl/raw/get returned mesh data, but none of it is renderable as STL/OFF.");
  }

  // Fallback per-jaw route: /stl/get/:type (1=upper, 2=lower).
  const upperPayload = [payload[0], { ...payload[1], type: 1, jaw_type: "upper_jaw" }];
  const lowerPayload = [payload[0], { ...payload[1], type: 2, jaw_type: "lower_jaw" }];
  const [upperOnly, lowerOnly] = await Promise.all([
    tryEndpoint(`${SMARTRPD_API_BASE}/stl/get/1`, upperPayload),
    tryEndpoint(`${SMARTRPD_API_BASE}/stl/get/2`, lowerPayload),
  ]);

  const byJaw = new Map();
  [...upperOnly, ...lowerOnly].forEach((item) => {
    const jaw = getJawKeyFromFile(item);
    if (jaw && !byJaw.has(jaw)) byJaw.set(jaw, item);
  });
  if (byJaw.size) {
    console.log(`[preview3D] STL source selected: /stl/get/:type (${byJaw.size} file(s))`);
  }
  return [...byJaw.values()];
}

// Drop a jaw's mesh from the 3D view (dispose + clear the group) and re-center
// what remains. The jaw's row stays in the panel and flips to its empty/upload
// state — only the mesh is removed.
function removeJawMesh(jaw) {
  const group = preview3DState.groups[jaw];
  if (group) {
    preview3DState.modelRoot?.remove(group);
    disposeObject3D(group);
    preview3DState.groups[jaw] = null;
  }
  delete preview3DState.jawFiles[jaw];
  setJawRowMode(jaw, false);
  if (preview3DState.modelRoot) centerRootOnCombinedBounds(preview3DState.modelRoot);
}

// Jaw trash button: save the jaw's currently-shown STL to the closed bucket
// (POST /stlclosed/), then remove it from the preview. Confirms first.
async function saveJawToClosed(jaw) {
  const file = preview3DState.jawFiles?.[jaw];
  if (!file?.data) {
    setMessage?.("No STL data available for this jaw.");
    return;
  }
  const jawLabel = jaw[0].toUpperCase() + jaw.slice(1);
  const confirmed = await confirmModal({
    title: `Remove ${jawLabel} Jaw`,
    message: `Save the ${jaw} jaw to closed and remove it from the preview?`,
    confirmText: "Remove",
    cancelText: "Cancel",
    variant: "danger",
  });
  if (!confirmed) return;
  setMessage?.(`Saving ${jaw} jaw to closed...`);
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}/stlclosed/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        extraSlotAuth(),
        { type: file.type, filename: file.filename, data: file.data },
      ]),
    });
    if (!res.ok) {
      console.error(`[preview3D] ✕ POST /stlclosed/ (${jaw}) status=${res.status}`);
      setMessage?.("Failed to save STL to closed. Please try again.");
      return;
    }
    removeJawMesh(jaw);
    setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw saved to closed.`);
  } catch (err) {
    console.error(`[preview3D] ✕ POST /stlclosed/ (${jaw}) failed`, err);
    setMessage?.("Failed to save STL to closed. Please try again.");
  }
}

// ---- Upload other 3D files (jaw_stls_extra_slot_1..4) --------------------

function extraSlotAuth() {
  const user = getLoggedInUser();
  return {
    machine_id: PREVIEW_MACHINE_ID,
    uuid: user?.uuid || PREVIEW_FALLBACK_UUID,
    caseIntID: state.caseIntID,
  };
}

// Fetch every populated extra slot for the case. The backend returns one
// object per slot ({ filename, data, slotNumber, ... }) or 404 when empty.
async function fetchExtraStlsForCase() {
  if (!state.caseIntID) return [];
  const auth = extraSlotAuth();
  const results = await Promise.all(
    EXTRA_STL_SLOTS.map(async (slotNumber) => {
      try {
        const res = await fetch(`${SMARTRPD_API_BASE}/stl/slot/get`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([auth, { slotNumber }]),
        });
        if (!res.ok) return null; // 404 = empty slot
        const data = await res.json();
        const item = Array.isArray(data) ? data[0] : data;
        if (!item?.data) return null;
        return { slotNumber, filename: item.filename || `slot${slotNumber}.stl`, data: item.data };
      } catch (err) {
        console.warn(`[preview3D] ✕ POST /stl/slot/get (slot ${slotNumber}) failed`, err);
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function loadExtraStlsIntoPreview() {
  preview3DState.extraGroups = {};
  preview3DState.extraFileNames = {};
  preview3DState.occupiedSlots = new Set();
  const extras = await fetchExtraStlsForCase();
  for (const extra of extras) {
    preview3DState.occupiedSlots.add(extra.slotNumber);
    preview3DState.extraFileNames[extra.slotNumber] = extra.filename;
    // Isolate per-slot failures: a single corrupt/undecodable extra STL must not
    // abort the whole interactive preview (the jaws are already loaded by now).
    try {
      await renderExtraStl(extra);
    } catch (err) {
      console.warn(
        `[preview3D] ✕ extra STL slot ${extra.slotNumber} failed to render — skipping`,
        err
      );
    }
  }
  if (extras.length) {
    centerRootOnCombinedBounds(preview3DState.modelRoot);
    fitPreviewCamera();
  }
  renderUpload3dList();
}

// Parse a base64 STL into a mesh and add it to the model root. Jaw slots use the
// same tan as the original jaws; the metal-RPD slots (2 & 4) use a metallic
// finish. Extras have no undercut/surveying data so they never use the heatmap.
// The file list/controls live in the upload modal, not the view bar.
async function renderExtraStl({ slotNumber, filename, data }) {
  if (!(await ensureThreeDeps())) return;
  const root = preview3DState.modelRoot;
  if (!root) return;

  const loader = new STLLoader();
  let geometry = loader.parse(base64ToArrayBuffer(data));
  geometry = mergeStlVertices(geometry);
  geometry = getDisplayGeometryForQuality(geometry, filename || `slot ${slotNumber}`);
  geometry.computeVertexNormals();

  const isMetal = METAL_RPD_SLOTS.has(slotNumber);
  const material = new THREE.MeshStandardMaterial({
    color: isMetal ? METAL_RPD_COLOR : EXTRA_STL_COLOR,
    metalness: isMetal ? 0.85 : 0.05,
    roughness: isMetal ? 0.32 : 0.6,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  root.add(group);

  preview3DState.extraFileNames[slotNumber] = filename;
  preview3DState.extraGroups[slotNumber] = { group };
}

// Dispose an extra STL's mesh and drop it from the model root.
function removeExtraStlMesh(slotNumber) {
  const entry = preview3DState.extraGroups[slotNumber];
  if (!entry) return;
  preview3DState.modelRoot?.remove(entry.group);
  disposeObject3D(entry.group);
  delete preview3DState.extraGroups[slotNumber];
  if (preview3DState.modelRoot) centerRootOnCombinedBounds(preview3DState.modelRoot);
}

// Permanently delete an extra STL (modal X): frees the backend slot, then drops
// it from the panel + modal list. No confirmation (per product decision).
async function deleteExtraStl(slotNumber) {
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}/stl/slot/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([extraSlotAuth(), { slotNumber }]),
    });
    if (!res.ok) {
      console.error(`[preview3D] ✕ POST /stl/slot/delete (slot ${slotNumber}) status=${res.status}`);
      setMessage?.("Failed to delete 3D file. Please try again.");
      return;
    }
    preview3DState.occupiedSlots?.delete(slotNumber);
    delete preview3DState.extraFileNames[slotNumber];
    removeExtraStlMesh(slotNumber);
    renderUpload3dList();
    setMessage?.("3D file deleted.");
  } catch (err) {
    console.error(`[preview3D] ✕ POST /stl/slot/delete (slot ${slotNumber}) failed`, err);
    setMessage?.("Failed to delete 3D file. Please try again.");
  }
}

// Read a File as base64 (chunked to stay off the call stack for big STLs).
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// POST the slot via XHR (not fetch) so we can report real upload progress.
// `onProgress` receives a 0..1 fraction of bytes sent.
function uploadSlotXHR(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SMARTRPD_API_BASE}/stl/slot/`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.responseText)
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(payload);
  });
}

// Open a transient file picker for a specific extra slot and hand the file to
// uploadExtraStl targeting that slot. One-shot input, removed after the pick.
function pickAndUploadExtraStl(slot) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".stl";
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (file) uploadExtraStl(file, slot);
  });
  input.click();
}

// Upload a user-picked STL into a specific slot (or the next free slot when no
// target is given), then render it.
async function uploadExtraStl(file, targetSlot = null) {
  if (!state.caseIntID) {
    setMessage?.("Open a case before uploading a 3D file.");
    return;
  }
  if (!preview3DState.occupiedSlots) preview3DState.occupiedSlots = new Set();
  let freeSlot;
  if (targetSlot != null) {
    if (preview3DState.occupiedSlots.has(targetSlot)) {
      setMessage?.(`${slotLabel(targetSlot)} already has a file. Delete it first.`);
      return;
    }
    freeSlot = targetSlot;
  } else {
    freeSlot = EXTRA_STL_SLOTS.find((n) => !preview3DState.occupiedSlots.has(n));
  }
  if (!freeSlot) {
    setMessage?.("All 4 extra 3D file slots are in use. Delete one first.");
    return;
  }
  if (!/\.stl$/i.test(file.name)) {
    setMessage?.("Only .stl files are supported.");
    return;
  }

  // Draw this slot's row as an inline progress bar, then start the upload.
  preview3DState.uploadingSlot = freeSlot;
  renderUpload3dList();
  setUpload3dBusy(true, 0);
  setMessage?.(`Uploading ${file.name}...`);
  try {
    const base64 = await fileToBase64(file);
    const payload = JSON.stringify([
      extraSlotAuth(),
      { slotNumber: freeSlot, filename: file.name, data: base64 },
    ]);
    await uploadSlotXHR(payload, (frac) => setUpload3dBusy(true, frac));
    preview3DState.occupiedSlots.add(freeSlot);
    await renderExtraStl({ slotNumber: freeSlot, filename: file.name, data: base64 });
    if (preview3DState.modelRoot) {
      centerRootOnCombinedBounds(preview3DState.modelRoot);
      fitPreviewCamera();
    }
    setMessage?.(`${file.name} uploaded.`);
  } catch (err) {
    console.error("[preview3D] ✕ extra STL upload failed", err);
    setMessage?.("Upload failed. Please try again.");
  } finally {
    setUpload3dBusy(false);
    preview3DState.uploadingSlot = null;
    preview3DState.slotProgressRefs = null;
    renderUpload3dList();
  }
}

// Open a transient file picker for a jaw-row upload and hand the file to
// uploadJawStl. One-shot input, removed after the pick.
function pickAndUploadJawStl(jaw) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".stl";
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (file) uploadJawStl(jaw, file);
  });
  input.click();
}

// Upload a user-picked STL as the case's actual upper/lower jaw — mirrors the
// case-creation path (POST /stl/raw + POST /stl) so it round-trips as a real
// jaw, then renders it into groups[jaw] so the icon toggle / trash / survey
// controls all operate on it.
async function uploadJawStl(jaw, file) {
  if (!state.caseIntID) {
    setMessage?.("Open a case before uploading a 3D file.");
    return;
  }
  if (!/\.stl$/i.test(file.name)) {
    setMessage?.("Only .stl files are supported.");
    return;
  }

  const jawType = jaw === "upper" ? "upper_jaw" : "lower_jaw";
  const dbType = jaw === "upper" ? 1 : 2;
  const auth = extraSlotAuth(); // { machine_id, uuid, caseIntID }
  // /stl/raw keys on the case name string (caseData.case_id); /stl keys on the
  // integer id. Fall back to caseIntID for case_id if case data isn't loaded.
  const caseId = preview3DState.caseData?.case_id || state.caseIntID;

  setMessage?.(`Uploading ${jaw} jaw...`);
  setJawRowUploading(jaw, true);

  // Combined upload progress across both buckets (each tracked 0..1), surfaced
  // as a single % in the row's SET SURVEY ANGLE slot.
  const frac = { raw: 0, stl: 0 };
  const reportProgress = () =>
    setJawRowUploadProgress(jaw, ((frac.raw + frac.stl) / 2) * 100);

  // POST one endpoint via XHR (so we get real upload-progress events) and log
  // the exact outcome (status + body on failure) so an asymmetric upper/lower
  // problem is visible in the console.
  const postStl = (path, payloadBody, key) =>
    new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SMARTRPD_API_BASE}${path}`);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) { frac[key] = e.loaded / e.total; reportProgress(); }
        };
        xhr.upload.onload = () => { frac[key] = 1; reportProgress(); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log(`[preview3D] ✓ POST ${path} (${jaw}) status=${xhr.status} type=${JSON.stringify(payloadBody.type)} case_id=${JSON.stringify(payloadBody.case_id)}`);
            resolve(true);
          } else {
            console.error(`[preview3D] ✕ POST ${path} (${jaw}) status=${xhr.status} type=${JSON.stringify(payloadBody.type)} case_id=${JSON.stringify(payloadBody.case_id)} body=${(xhr.responseText || "").slice(0, 300)}`);
            resolve(false);
          }
        };
        xhr.onerror = () => {
          console.error(`[preview3D] ✕ POST ${path} (${jaw}) network error`);
          resolve(false);
        };
        xhr.send(JSON.stringify([auth, payloadBody]));
      } catch (err) {
        console.error(`[preview3D] ✕ POST ${path} (${jaw}) threw`, err);
        resolve(false);
      }
    });

  try {
    const base64 = await fileToBase64(file);

    // Both buckets are attempted independently — a failure in one must not skip
    // the other (the desktop client and the web preview read different tables).
    const [rawOk, stlOk] = await Promise.all([
      postStl("/stl/raw", { case_id: caseId, type: jawType, data: base64, filename: file.name }, "raw"),
      postStl("/stl", { case_id: state.caseIntID, type: dbType, data: base64, filename: file.name }, "stl"),
    ]);

    if (!rawOk && !stlOk) {
      setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw upload failed (server rejected both buckets — see console).`);
      return;
    }

    await renderJawStl(jaw, { data: base64, type: jawType, filename: file.name });
    // Auto-refresh this jaw's case thumbnail from the freshly rendered model so
    // the case tile updates without a manual capture. Best-effort.
    await uploadJawThumbnail(jaw);
    if (rawOk && stlOk) {
      setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw uploaded.`);
    } else {
      setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw uploaded, but ${rawOk ? "/stl" : "/stl/raw"} failed — desktop may not update (see console).`);
    }
  } catch (err) {
    console.error(`[preview3D] ✕ jaw upload (${jaw}) failed`, err);
    setMessage?.("Upload failed. Please try again.");
  } finally {
    setJawRowUploading(jaw, false);
  }
}

// Parse a jaw STL into a flat-shaded mesh and install it as groups[jaw]. No
// heatmap (a freshly uploaded jaw has no surveying data yet — it gets one on
// the next backend processing pass), so the heatmap toggle leaves it flat.
async function renderJawStl(jaw, file) {
  if (!(await ensureThreeDeps())) return;
  const root = preview3DState.modelRoot;
  if (!root) return;

  // Clear any existing mesh for this jaw first (also resets the row + jawFiles).
  removeJawMesh(jaw);

  const loader = new STLLoader();
  let geometry = loader.parse(base64ToArrayBuffer(file.data));
  geometry = mergeStlVertices(geometry);
  geometry = getDisplayGeometryForQuality(geometry, file.filename || `${jaw}.stl`);
  geometry.computeVertexNormals();

  const flatMat = new THREE.MeshStandardMaterial({
    color: 0xD2B89C,
    metalness: 0.05,
    roughness: jaw === "upper" ? 0.6 : 0.62,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, flatMat);
  mesh.userData.flatMaterial = flatMat;

  const group = new THREE.Group();
  group.add(mesh);
  root.add(group);

  preview3DState.groups[jaw] = group;
  preview3DState.jawFiles[jaw] = { data: file.data, type: file.type, filename: file.filename };
  setJawRowMode(jaw, true);
  applyJawVisibility();
  centerRootOnCombinedBounds(root);
  fitPreviewCamera();
}

// ---- Upload popover ------------------------------------------------------
// The footer "Upload other 3D files" icon opens this as a drop-up popover
// anchored to the icon (not a centered modal). Lazily built once; element refs
// cached on preview3DState.
function ensureUpload3dModal() {
  if (preview3DState.upload3dModal) return preview3DState.upload3dModal;

  const overlay = document.createElement("div");
  overlay.className = "upload3d-modal is-hidden";
  overlay.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("div");
  backdrop.className = "upload3d-modal-backdrop";
  backdrop.addEventListener("click", closeUpload3dModal);

  const panel = document.createElement("div");
  panel.className = "upload3d-modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "upload3dModalTitle");

  const header = document.createElement("div");
  header.className = "upload3d-modal-header";
  const title = document.createElement("h2");
  title.id = "upload3dModalTitle";
  title.className = "upload3d-modal-title";
  title.textContent = "Other 3D files";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "upload3d-modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = '<i class="fa fa-xmark" aria-hidden="true"></i>';
  closeBtn.addEventListener("click", closeUpload3dModal);
  header.appendChild(title);
  header.appendChild(closeBtn);

  const card = document.createElement("div");
  card.className = "upload3d-card";

  const list = document.createElement("div");
  list.className = "upload3d-list";

  card.appendChild(list);
  panel.appendChild(header);
  panel.appendChild(card);
  overlay.appendChild(backdrop);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  preview3DState.upload3dModal = { overlay, panel, list };
  return preview3DState.upload3dModal;
}

function openUpload3dModal() {
  const modal = ensureUpload3dModal();
  renderUpload3dList();
  modal.overlay.classList.remove("is-hidden");
  modal.overlay.setAttribute("aria-hidden", "false");
  positionUpload3dPanel();
  if (!preview3DState.upload3dKeyHandler) {
    preview3DState.upload3dKeyHandler = (e) => {
      if (e.key === "Escape") closeUpload3dModal();
    };
    document.addEventListener("keydown", preview3DState.upload3dKeyHandler);
  }
  // Keep the popover glued to the icon if the window resizes while it's open.
  if (!preview3DState.upload3dRepositionHandler) {
    preview3DState.upload3dRepositionHandler = () => positionUpload3dPanel();
    window.addEventListener("resize", preview3DState.upload3dRepositionHandler);
  }
}

// Pin the popover to the lower-left corner of the viewer, sitting just above
// the footer (so it no longer covers the jaw view). Falls back to a fixed
// bottom margin if the footer icon isn't present.
function positionUpload3dPanel() {
  const modal = preview3DState.upload3dModal;
  if (!modal) return;
  const panel = modal.panel;
  const margin = 12;
  const gap = 10;
  panel.style.left = `${margin}px`;
  const anchor = document.getElementById("footerUpload3dBtn");
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    panel.style.bottom = `${Math.round(window.innerHeight - r.top + gap)}px`;
  } else {
    panel.style.bottom = `${margin}px`;
  }
}

function closeUpload3dModal() {
  const modal = preview3DState.upload3dModal;
  if (modal) {
    modal.overlay.classList.add("is-hidden");
    modal.overlay.setAttribute("aria-hidden", "true");
  }
  if (preview3DState.upload3dKeyHandler) {
    document.removeEventListener("keydown", preview3DState.upload3dKeyHandler);
    preview3DState.upload3dKeyHandler = null;
  }
  if (preview3DState.upload3dRepositionHandler) {
    window.removeEventListener("resize", preview3DState.upload3dRepositionHandler);
    preview3DState.upload3dRepositionHandler = null;
  }
}

// ---- Download Jaw Profile (STL zip / JPEG) -------------------------------
// `request-download-jaw-profile` (footer + noticeboard buttons) opens this menu:
//   • Download STL file → bundle upper + lower jaw STLs into one .zip
//   • Download as JPEG  → reuse the "Save as JPEG" arch export
function ensureDownloadJawProfileModal() {
  if (preview3DState.downloadJawModal) return preview3DState.downloadJawModal;

  const overlay = document.createElement("div");
  overlay.className = "jaw-dl-modal is-hidden";
  overlay.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("div");
  backdrop.className = "jaw-dl-backdrop";
  backdrop.addEventListener("click", closeDownloadJawProfileModal);

  const panel = document.createElement("div");
  panel.className = "jaw-dl-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Download jaw profile");

  const header = document.createElement("div");
  header.className = "jaw-dl-header";
  const title = document.createElement("h2");
  title.className = "jaw-dl-title";
  title.textContent = "Download Jaw Profile";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "jaw-dl-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = '<i class="fa fa-xmark" aria-hidden="true"></i>';
  closeBtn.addEventListener("click", closeDownloadJawProfileModal);
  header.appendChild(title);
  header.appendChild(closeBtn);

  const options = document.createElement("div");
  options.className = "jaw-dl-options";

  const stlBtn = document.createElement("button");
  stlBtn.type = "button";
  stlBtn.className = "jaw-dl-option";
  stlBtn.innerHTML =
    '<i class="fa fa-cube" aria-hidden="true"></i>' +
    '<span class="jaw-dl-option-title">Download STL file</span>' +
    '<span class="jaw-dl-option-sub">Upper &amp; lower jaws as a .zip</span>';
  stlBtn.addEventListener("click", () => {
    closeDownloadJawProfileModal();
    downloadJawStlsAsZip();
  });

  const jpegBtn = document.createElement("button");
  jpegBtn.type = "button";
  jpegBtn.className = "jaw-dl-option";
  jpegBtn.innerHTML =
    '<i class="fa fa-image" aria-hidden="true"></i>' +
    '<span class="jaw-dl-option-title">Download as JPEG</span>' +
    '<span class="jaw-dl-option-sub">Arch annotation image</span>';
  jpegBtn.addEventListener("click", () => {
    closeDownloadJawProfileModal();
    // Reuse the existing "Save as JPEG" flow (also re-uploads the 2D thumbnail).
    saveAsJpeg();
  });

  options.appendChild(stlBtn);
  options.appendChild(jpegBtn);
  panel.appendChild(header);
  panel.appendChild(options);
  overlay.appendChild(backdrop);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  preview3DState.downloadJawModal = { overlay };
  return preview3DState.downloadJawModal;
}

function openDownloadJawProfileMenu() {
  const modal = ensureDownloadJawProfileModal();
  modal.overlay.classList.remove("is-hidden");
  modal.overlay.setAttribute("aria-hidden", "false");
  if (!preview3DState.downloadJawKeyHandler) {
    preview3DState.downloadJawKeyHandler = (e) => {
      if (e.key === "Escape") closeDownloadJawProfileModal();
    };
    document.addEventListener("keydown", preview3DState.downloadJawKeyHandler);
  }
}

function closeDownloadJawProfileModal() {
  const modal = preview3DState.downloadJawModal;
  if (modal) {
    modal.overlay.classList.add("is-hidden");
    modal.overlay.setAttribute("aria-hidden", "true");
  }
  if (preview3DState.downloadJawKeyHandler) {
    document.removeEventListener("keydown", preview3DState.downloadJawKeyHandler);
    preview3DState.downloadJawKeyHandler = null;
  }
}

// Collect upper + lower jaw STLs as { jaw, data(base64), filename }. Prefers the
// jaws currently shown in the 3D preview; falls back to a backend fetch.
async function collectJawStlFiles() {
  const fromState = ["upper", "lower"]
    .map((jaw) => {
      const f = preview3DState.jawFiles?.[jaw];
      return f?.data ? { jaw, data: f.data, filename: f.filename } : null;
    })
    .filter(Boolean);
  if (fromState.length) return fromState;

  const files = await fetchJawFilesForCase();
  const byJaw = {};
  files.forEach((item) => {
    const jaw = getJawKeyFromFile(item);
    if (jaw && !byJaw[jaw] && item?.data) {
      byJaw[jaw] = { jaw, data: item.data, filename: item.filename };
    }
  });
  return Object.values(byJaw);
}

async function downloadJawStlsAsZip() {
  if (typeof window.JSZip === "undefined") {
    setMessage("ZIP library failed to load — cannot download STL files.", true);
    return;
  }
  try {
    setMessage("Preparing STL download…", false);
    const jaws = await collectJawStlFiles();
    if (!jaws.length) {
      setMessage("No jaw STL files found for this case.", true);
      return;
    }
    const zip = new window.JSZip();
    jaws.forEach(({ jaw, data }) => {
      zip.file(`${jaw}.stl`, jawDataToStlBytes(data));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `case_${state.caseIntID ?? "unknown"}_jaw_profile.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${jaws.length} jaw STL file(s) as ZIP.`, false);
  } catch (err) {
    console.error("[preview3D] STL zip download failed", err);
    setMessage("Failed to download STL files.", true);
  }
}

// A jaw payload from /stl/get may be a real STL *or* an OFF mesh (both render
// in the preview). A `.stl`-named file that actually holds OFF text opens blank
// in STL viewers, so convert OFF → binary STL here; pass STL bytes through.
function jawDataToStlBytes(data) {
  const buffer = base64ToArrayBuffer(data);
  const info = inspectMeshPayload(buffer);
  if (info.format === "off") {
    const geometry = parseOFFToGeometry(new TextDecoder().decode(buffer));
    if (geometry) return geometryToBinaryStl(geometry);
    console.warn("[preview3D] OFF jaw could not be parsed for STL export; shipping raw bytes.");
  }
  return buffer;
}

// Serialize a THREE.BufferGeometry (indexed or not) to a binary STL ArrayBuffer.
function geometryToBinaryStl(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = (index ? index.count : pos.count) / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true); // 80-byte header left zeroed
  const vert = (i) => {
    const vi = index ? index.getX(i) : i;
    return [pos.getX(vi), pos.getY(vi), pos.getZ(vi)];
  };
  let offset = 84;
  for (let t = 0; t < triCount; t += 1) {
    const a = vert(t * 3);
    const b = vert(t * 3 + 1);
    const c = vert(t * 3 + 2);
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;
    for (const v of [a, b, c]) {
      view.setFloat32(offset, v[0], true); offset += 4;
      view.setFloat32(offset, v[1], true); offset += 4;
      view.setFloat32(offset, v[2], true); offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2; // attribute byte count
  }
  return buffer;
}

// Toggle the modal's busy (uploading) state and drive the progress bar.
// `frac` is the 0..1 upload fraction; at 1 the server is still processing.
function setUpload3dBusy(busy, frac) {
  const modal = preview3DState.upload3dModal;
  if (!modal) return;
  // The `is-busy` class disables pointer events on the whole list, so every
  // other slot's upload button / drop zone is blocked while an upload runs.
  modal.overlay.classList.toggle("is-busy", !!busy);
  const refs = preview3DState.slotProgressRefs;
  if (busy && refs) {
    const pct = Math.round((frac ?? 0) * 100);
    refs.fill.style.width = `${pct}%`;
    refs.label.textContent = pct >= 100 ? "Processing…" : `Uploading… ${pct}%`;
  }
}

// Always render all four fixed, named slots in order. An occupied slot shows
// its filename with show/hide + delete controls; an empty slot shows its name
// with its own upload button.
function renderUpload3dList() {
  const modal = preview3DState.upload3dModal;
  if (!modal) return;
  const list = modal.list;
  list.innerHTML = "";

  const occupied = preview3DState.occupiedSlots || new Set();
  EXTRA_STL_SLOTS.forEach((slot) => {
    if (slot === preview3DState.uploadingSlot) {
      list.appendChild(buildUpload3dUploadingRow(slot));
    } else if (occupied.has(slot)) {
      const filename = preview3DState.extraFileNames[slot] || `slot${slot}.stl`;
      list.appendChild(buildUpload3dFileRow(slot, filename));
    } else {
      list.appendChild(buildUpload3dSlotRow(slot));
    }
  });
}

// True when a drag event carries files (mirrors createCase.js).
function dragEventHasFiles(e) {
  const types = e?.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).some((t) => t === "Files");
}

// Wire an empty slot row as a .stl drop zone that uploads into `slot`
// (same affordance as the create-case jaw tiles).
function enableSlotDropZone(el, slot) {
  el.addEventListener("dragenter", (e) => {
    if (!dragEventHasFiles(e)) return;
    e.preventDefault();
    el.classList.add("is-dragover");
  });
  el.addEventListener("dragover", (e) => {
    if (!dragEventHasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    el.classList.add("is-dragover");
  });
  el.addEventListener("dragleave", (e) => {
    if (el.contains(e.relatedTarget)) return;
    el.classList.remove("is-dragover");
  });
  el.addEventListener("drop", (e) => {
    el.classList.remove("is-dragover");
    if (!dragEventHasFiles(e)) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!/\.stl$/i.test(file.name)) {
      setMessage?.("Only .stl files are supported.");
      return;
    }
    uploadExtraStl(file, slot);
  });
}

// Toggle a SINGLE uploaded extra STL's visibility (clicking its file icon). Each slot
// has its own THREE.Group in extraGroups[slot], so this shows/hides only that file.
// Flip the group's `visible` flag (render loop repaints) and dim just this icon.
function toggleExtraStlVisibility(slot, iconEl) {
  const entry = preview3DState.extraGroups?.[slot];
  if (!entry?.group) {
    setMessage?.("That 3D file isn't loaded in the view.");
    return;
  }
  entry.group.visible = !entry.group.visible;
  iconEl?.classList.toggle("is-hidden-extra", !entry.group.visible);
}

// One populated file row: file icon w/ slot number (click to show/hide just
// this file in the 3D view), X delete, filename.
function buildUpload3dFileRow(slot, filename) {
  const row = document.createElement("div");
  row.className = "upload3d-row";

  const icon = document.createElement("span");
  icon.className = "upload3d-file-icon";
  icon.setAttribute("role", "button");
  icon.setAttribute("tabindex", "0");
  icon.title = "Show / hide in 3D view";
  icon.setAttribute("aria-label", `Show or hide ${filename} in the 3D view`);
  const customIcon = EXTRA_STL_SLOT_ICONS[slot];
  icon.innerHTML = customIcon
    ? `<img class="upload3d-slot-img${customIcon.black ? " upload3d-slot-img--black" : ""}" src="${customIcon.src}" alt="" />`
    : '<i class="fa fa-file" aria-hidden="true"></i>';
  // Reflect this slot's current visibility, then wire per-file toggling.
  if (preview3DState.extraGroups?.[slot]?.group?.visible === false) {
    icon.classList.add("is-hidden-extra");
  }
  icon.addEventListener("click", () => toggleExtraStlVisibility(slot, icon));
  icon.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExtraStlVisibility(slot, icon);
    }
  });

  const xBtn = document.createElement("button");
  xBtn.type = "button";
  xBtn.className = "upload3d-row-delete";
  xBtn.setAttribute("aria-label", `Delete ${filename}`);
  xBtn.title = `Delete ${filename}`;
  xBtn.innerHTML = '<i class="fa fa-xmark" aria-hidden="true"></i>';
  xBtn.addEventListener("click", () => deleteExtraStl(slot));

  const text = document.createElement("div");
  text.className = "upload3d-row-text";
  const slotName = document.createElement("span");
  slotName.className = "upload3d-slot-name";
  slotName.textContent = slotLabel(slot);
  const name = document.createElement("span");
  name.className = "upload3d-row-name";
  name.textContent = filename;
  name.title = filename;
  text.appendChild(slotName);
  text.appendChild(name);

  row.appendChild(icon);
  row.appendChild(xBtn);
  row.appendChild(text);
  return row;
}

// An empty, named slot row: slot label + "No file uploaded" and a per-slot
// upload button that targets exactly this slot.
function buildUpload3dSlotRow(slot) {
  const row = document.createElement("div");
  row.className = "upload3d-row upload3d-slot-row";

  const icon = document.createElement("span");
  icon.className = "upload3d-file-icon is-empty";
  icon.innerHTML =
    '<i class="fa fa-image" aria-hidden="true"></i>' +
    '<i class="fa fa-slash upload3d-slash" aria-hidden="true"></i>';

  const text = document.createElement("div");
  text.className = "upload3d-row-text";
  const slotName = document.createElement("span");
  slotName.className = "upload3d-slot-name";
  slotName.textContent = slotLabel(slot);
  const status = document.createElement("span");
  status.className = "upload3d-row-name is-muted";
  status.append("Drag & drop .stl or ");
  const uploadLink = document.createElement("a");
  uploadLink.href = "#";
  uploadLink.className = "upload3d-upload-link";
  uploadLink.textContent = "Upload";
  uploadLink.setAttribute("role", "button");
  uploadLink.setAttribute("aria-label", `Upload ${slotLabel(slot)}`);
  uploadLink.title = `Upload ${slotLabel(slot)}`;
  uploadLink.addEventListener("click", (e) => {
    e.preventDefault();
    pickAndUploadExtraStl(slot);
  });
  status.appendChild(uploadLink);
  text.appendChild(slotName);
  text.appendChild(status);

  row.appendChild(icon);
  row.appendChild(text);
  enableSlotDropZone(row, slot);
  return row;
}

// A slot mid-upload: slot label + an inline progress bar. The bar's fill/label
// refs are stashed on preview3DState so setUpload3dBusy can drive them live.
function buildUpload3dUploadingRow(slot) {
  const row = document.createElement("div");
  row.className = "upload3d-row upload3d-slot-row upload3d-uploading-row";

  const icon = document.createElement("span");
  icon.className = "upload3d-file-icon";
  icon.innerHTML = '<i class="fa fa-cloud-arrow-up" aria-hidden="true"></i>';

  const text = document.createElement("div");
  text.className = "upload3d-row-text";
  const slotName = document.createElement("span");
  slotName.className = "upload3d-slot-name";
  slotName.textContent = slotLabel(slot);

  const progress = document.createElement("div");
  progress.className = "upload3d-progress";
  const fill = document.createElement("div");
  fill.className = "upload3d-progress-fill";
  const label = document.createElement("span");
  label.className = "upload3d-progress-label";
  label.textContent = "Uploading… 0%";
  progress.appendChild(fill);
  progress.appendChild(label);

  text.appendChild(slotName);
  text.appendChild(progress);
  row.appendChild(icon);
  row.appendChild(text);

  preview3DState.slotProgressRefs = { fill, label };
  return row;
}

async function fetchParameterisedMeshForCase() {
  // The /parameterisation, /parameterization, /surface, /surface/mesh mesh/getall
  // variants all 404 on the live backend, so skip them and let the caller fall
  // through to fetchJawFilesForCase. Restore the loop if any come online.
  return [];
}

async function fetchUndercutForCase() {
  if (!state.caseIntID) return { upper: null, lower: null };
  const user = getLoggedInUser();
  const uuid = user?.uuid || PREVIEW_FALLBACK_UUID;

  const baseBody = {
    machine_id: PREVIEW_MACHINE_ID,
    uuid,
    case_int_id: state.caseIntID,
    caseIntID: state.caseIntID,
  };

  const requestJaw = async (jawType, label) => {
    const t0 = performance.now();
    try {
      const res = await fetch(`${SMARTRPD_API_BASE}/undercutheatmap/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody, jaw_type: jawType }),
      });
      const dt = Math.round(performance.now() - t0);
      const tag = res.ok ? "✓" : "✕";
      console.log(`[preview3D] ${tag} POST /undercutheatmap/get (${label}) status=${res.status} ${dt}ms`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`[preview3D] ✕ POST /undercutheatmap/get (${label}) failed`, err);
      return null;
    }
  };

  const normalizeJawType = (value) => {
    if (value === 2 || value === "2") return "upper";
    if (value === 1 || value === "1") return "lower";
    const s = String(value || "").toLowerCase();
    if (s.includes("upper")) return "upper";
    if (s.includes("lower")) return "lower";
    return null;
  };

  const [upperReq, lowerReq] = await Promise.all([
    requestJaw(2, "upper"),
    requestJaw(1, "lower"),
  ]);

  let upper = null;
  let lower = null;
  for (const item of [upperReq, lowerReq]) {
    const key = normalizeJawType(item?.jaw_type);
    if (key === "upper") upper = item;
    else if (key === "lower") lower = item;
  }

  // Fallback to request-order if backend omits jaw_type.
  if (!upper) upper = upperReq;
  if (!lower) lower = lowerReq;

  return { upper, lower };
}

// Reuse the single shared /case/get round-trip started during 2D init instead
// of firing a duplicate request here (same endpoint + payload). Only used to
// preserve the unmodified jaw's survey angles, so a null result is harmless.
function fetchCaseData() {
  return fetchCaseDetail();
}

// Capture the camera position as an XYZ Euler. X = pitch from the horizontal
// plane (asin of the y component), Y = azimuth around the world up axis,
// Z = 0 since we only store position-derived angles (no camera roll). Stored
// in radians to match the DECIMAL(9,8) range in the cases table.
function eulerFromCameraOrbit(camera, controls) {
  const offset = camera.position.clone().sub(controls.target);
  if (offset.lengthSq() < 1e-9) return { x: 0, y: 0, z: 0 };
  const dir = offset.normalize();
  const clampedY = Math.max(-1, Math.min(1, dir.y));
  return {
    x: Math.asin(clampedY),
    y: Math.atan2(dir.x, dir.z),
    z: 0,
  };
}

function setHeatmapEnabled(enabled) {
  preview3DState.heatmapEnabled = !!enabled;
  const swap = (group) => {
    if (!group) return;
    group.traverse((obj) => {
      if (!obj.isMesh) return;
      const heat = obj.userData?.heatmapMaterial;
      const flat = obj.userData?.flatMaterial;
      if (!heat || !flat) return;
      obj.material = enabled ? heat : flat;
    });
  };
  swap(preview3DState.groups.upper);
  swap(preview3DState.groups.lower);
  const btn = preview3DState.heatmapToggleBtn;
  if (btn) {
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    const icon = btn.querySelector("i");
    if (icon) icon.className = enabled ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
  }
  preview3DState.heatmapBoard?.classList.toggle("is-off", !enabled);
}

function reapplyHeatmap(undercut) {
  const repaint = (group, surface) => {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        applyUndercutVertexColors(obj.geometry, surface);
        smoothVertexColors(obj.geometry, 5);
      }
    });
  };
  repaint(preview3DState.groups.upper, undercut?.upper);
  repaint(preview3DState.groups.lower, undercut?.lower);
}

async function saveSurveyAngle(jaw, btn) {
  const camera = preview3DState.camera;
  const controls = preview3DState.controls;
  if (!camera || !controls || !state.caseIntID) return;

  if (!preview3DState.caseData) {
    preview3DState.caseData = await fetchCaseData();
  }
  if (!preview3DState.caseData) {
    console.warn("[preview3D] cannot save survey angle: case data unavailable");
    return;
  }

  const { x, y, z } = eulerFromCameraOrbit(camera, controls);
  const current = preview3DState.caseData;
  const updated = { ...current };
  if (jaw === "upper") {
    updated.upper_insertion_angle_x = x;
    updated.upper_insertion_angle_y = y;
    updated.upper_insertion_angle_z = z;
  } else {
    updated.lower_insertion_angle_x = x;
    updated.lower_insertion_angle_y = y;
    updated.lower_insertion_angle_z = z;
  }

  const user = getLoggedInUser();
  const uuid = user?.uuid || PREVIEW_FALLBACK_UUID;
  const auth = {
    machine_id: PREVIEW_MACHINE_ID,
    uuid,
    caseIntID: state.caseIntID,
  };
  const caseBody = {
    case_id: updated.case_id || "",
    upper_insertion_angle_x: Number(updated.upper_insertion_angle_x) || 0,
    upper_insertion_angle_y: Number(updated.upper_insertion_angle_y) || 0,
    upper_insertion_angle_z: Number(updated.upper_insertion_angle_z) || 0,
    lower_insertion_angle_x: Number(updated.lower_insertion_angle_x) || 0,
    lower_insertion_angle_y: Number(updated.lower_insertion_angle_y) || 0,
    lower_insertion_angle_z: Number(updated.lower_insertion_angle_z) || 0,
    process_upper: Number(updated.process_upper) || 0,
    process_lower: Number(updated.process_lower) || 0,
  };

  const originalLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "SAVING…";
  }

  const path = `/case/${state.caseIntID}`;
  const t0 = performance.now();
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([auth, caseBody]),
    });
    const dt = Math.round(performance.now() - t0);
    const tag = res.ok ? "✓" : "✕";
    console.log(`[preview3D] ${tag} PUT ${path} status=${res.status} ${dt}ms`);
    if (!res.ok) return;
    preview3DState.caseData = updated;

    const newUndercut = await fetchUndercutForCase();
    reapplyHeatmap(newUndercut);
  } catch (err) {
    console.error(`[preview3D] ✕ PUT ${path} failed`, err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel || "SET SURVEY ANGLE";
    }
  }
}

function init3DPreview(area) {
  teardown3DPreview();

  area.classList.add("is-3d-ready");
  preview3DState.area = area;
  preview3DState.extraGroups = {};
  preview3DState.extraFileNames = {};
  preview3DState.occupiedSlots = new Set();

  const shell = document.createElement("section");
  shell.className = "jaw-preview-shell";

  const toolbar = document.createElement("div");
  toolbar.className = "jaw-preview-toolbar";

  const rows = document.createElement("div");
  rows.className = "jaw-preview-rows";

  const mount = document.createElement("div");
  mount.className = "jaw-preview-3d-mount";

  const rowUpper = buildJawRow({
    jaw: "upper",
    icon: "../../assets/Icon_UpperJaw_Occlusal.png",
    label: "ALLOW PROCESSING",
  });
  const rowLower = buildJawRow({
    jaw: "lower",
    icon: "../../assets/Icon_LowerJaw_Occlusal.png",
    label: "ALLOW PROCESSING",
  });

  rows.appendChild(rowUpper.row);
  rows.appendChild(rowLower.row);
  toolbar.appendChild(rows);

  const undercut = document.createElement("div");
  undercut.className = "jaw-preview-undercut is-off";
  undercut.innerHTML = `
    <div class="jaw-preview-undercut-header">
      <span class="jaw-preview-undercut-title">Undercut (mm)</span>
      <button type="button" class="jaw-preview-undercut-toggle" aria-pressed="false" title="Toggle heatmap" aria-label="Toggle heatmap">
        <i class="fa-solid fa-eye-slash" aria-hidden="true"></i>
      </button>
    </div>
    <div class="jaw-preview-undercut-body">
      <div class="jaw-preview-undercut-scale">
        <span style="background:#fff3bf"></span>
        <span style="background:#ffd43b"></span>
        <span style="background:#ff922b"></span>
        <span style="background:#fa5252"></span>
      </div>
      <div class="jaw-preview-undercut-labels">
        <span>0.25</span><span>0.5</span><span>0.75</span><span>&gt;0.75</span>
      </div>
    </div>
  `;
  const heatmapToggleBtn = undercut.querySelector(".jaw-preview-undercut-toggle");
  heatmapToggleBtn.addEventListener("click", () => {
    setHeatmapEnabled(!preview3DState.heatmapEnabled);
  });

  // Download Jaw Profile was moved to the app footer, which dispatches
  // `request-download-jaw-profile`; we open a small two-option menu here
  // (Download STL file / Download as JPEG). (The "Upload other 3D files"
  // footer button dispatches `request-open-upload-3d`, wired below.)
  const handleDownloadJawProfileRequest = () => {
    openDownloadJawProfileMenu();
  };
  preview3DState.downloadJawCleanup?.();
  window.addEventListener("request-download-jaw-profile", handleDownloadJawProfileRequest);
  preview3DState.downloadJawCleanup = () => {
    window.removeEventListener("request-download-jaw-profile", handleDownloadJawProfileRequest);
  };

  // "Upload other 3D files" footer button opens the upload modal.
  const handleOpenUpload3d = () => openUpload3dModal();
  preview3DState.uploadCleanup?.();
  window.addEventListener("request-open-upload-3d", handleOpenUpload3d);
  preview3DState.uploadCleanup = () => {
    window.removeEventListener("request-open-upload-3d", handleOpenUpload3d);
  };

  shell.appendChild(toolbar);
  shell.appendChild(mount);
  mount.appendChild(undercut);
  area.appendChild(shell);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getPreviewPixelRatioCap()));
  renderer.setClearColor(0xdce3e8, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.willChange = "transform";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 40, 160);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xfff1f5, 0.8);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(80, 140, 120);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, .4);
  fillLight.position.set(-90, 60, -40);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
  rimLight.position.set(0, -100, -80);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const modelRoot = new THREE.Group();
  // Dental STL files are typically exported Z-up; rotate so the occlusal plane
  // sits horizontal under Three.js's Y-up camera (upper jaw shows upright).
  modelRoot.rotation.x = -Math.PI / 2;
  scene.add(modelRoot);

  // TrackballControls (arcball-style): true free 360° rotation in any
  // direction, no up-vector lock and no polar limits. Switched from
  // OrbitControls so users can spin the jaw freely to inspect every surface.
  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 3.2;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.noRotate = false;
  controls.noZoom = false;
  // Lock the jaw at the centre: disable panning so the right mouse button can't
  // drag the model off-centre. Rotation (left) and zoom (wheel) stay active.
  controls.noPan = true;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0;
  controls.minDistance = 35;
  controls.maxDistance = 700;
  controls.target.set(0, 0, 0);

  rowUpper.surveyBtn.addEventListener("click", () =>
    saveSurveyAngle("upper", rowUpper.surveyBtn)
  );
  rowLower.surveyBtn.addEventListener("click", () =>
    saveSurveyAngle("lower", rowLower.surveyBtn)
  );

  // Screen-capture handler: the in-canvas camera button was removed in favor
  // of a footer-level button. The footer dispatches `request-3d-capture` and
  // we run the same render+upload pipeline. preview3DState.capturing serves as
  // a single-flight guard so rapid clicks don't fire multiple uploads.
  const handleCaptureRequest = async () => {
    if (preview3DState.capturing) return;
    preview3DState.capturing = true;
    try {
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      // Footer capture is thumbnails-only: upsert the upper/lower case-thumbnail
      // slots from this render. Adding to the noticeboard is now exclusively the
      // noticeboard's own "Add Viewcapture" button.
      await uploadLatest3DCapture(dataUrl);
    } catch (err) {
      console.error("Failed to capture 3D preview screenshot:", err);
      toast.error("Screen capture failed.");
    } finally {
      setTimeout(() => { preview3DState.capturing = false; }, 400);
    }
  };
  preview3DState.captureCleanup?.();
  window.addEventListener("request-3d-capture", handleCaptureRequest);
  preview3DState.captureCleanup = () => {
    window.removeEventListener("request-3d-capture", handleCaptureRequest);
  };

  // Intentionally keep ALLOW PROCESSING checkboxes as display-only (no jaw visibility behavior).

  // Jaw row icon toggles that jaw's mesh visibility (no-op if it has no STL).
  const toggleJawVisibility = (jaw) => {
    const group = preview3DState.groups[jaw];
    if (!group) return;
    group.visible = !group.visible;
    const row = jaw === "upper" ? rowUpper.row : rowLower.row;
    row.classList.toggle("is-hidden-jaw", !group.visible);
  };
  const onJawIconKeydown = (jaw) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleJawVisibility(jaw);
    }
  };
  rowUpper.iconEl.addEventListener("click", () => toggleJawVisibility("upper"));
  rowLower.iconEl.addEventListener("click", () => toggleJawVisibility("lower"));
  rowUpper.iconEl.addEventListener("keydown", onJawIconKeydown("upper"));
  rowLower.iconEl.addEventListener("keydown", onJawIconKeydown("lower"));

  // Trash icon saves the jaw's current STL to /stlclosed/ then removes it from
  // the preview (confirms first).
  rowUpper.deleteBtn.addEventListener("click", () => saveJawToClosed("upper"));
  rowLower.deleteBtn.addEventListener("click", () => saveJawToClosed("lower"));

  // Empty-state upload icon: pick a .stl and store it as the actual jaw.
  rowUpper.uploadBtn.addEventListener("click", () => pickAndUploadJawStl("upper"));
  rowLower.uploadBtn.addEventListener("click", () => pickAndUploadJawStl("lower"));

  preview3DState.renderer = renderer;
  preview3DState.scene = scene;
  preview3DState.camera = camera;
  preview3DState.controls = controls;
  preview3DState.mount = mount;
  preview3DState.modelRoot = modelRoot;
  preview3DState.groups = { upper: null, lower: null };
  preview3DState.activeView = "both";
  preview3DState.topControls = { rowUpper, rowLower };
  preview3DState.heatmapEnabled = false;
  preview3DState.heatmapToggleBtn = heatmapToggleBtn;
  preview3DState.heatmapBoard = undercut;
  // Flat view-navigation gizmo (bottom-right). Plain DOM, removed with the shell.
  preview3DState.previewNav = buildPreviewNavGizmo();
  mount.appendChild(preview3DState.previewNav);

  const resize = () => {
    const rect = mount.getBoundingClientRect();
    const w = Math.max(220, Math.floor(rect.width));
    const h = Math.max(220, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // TrackballControls maps screen coords to arcball math, so it needs to be
    // re-anchored whenever the canvas size changes — otherwise rotation feels
    // off after a layout change.
    controls.handleResize?.();
  };

  preview3DState.resizeObserver = new ResizeObserver(resize);
  preview3DState.resizeObserver.observe(mount);
  resize();

  const animate = () => {
    preview3DState.frameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

async function populateJawPreview(jawFiles, undercut, meshQuality = "low") {
  const loader = new STLLoader();
  const upperGroup = new THREE.Group();
  const lowerGroup = new THREE.Group();
  const heatmapMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.05,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  // DoubleSide + explicit opaque so the hollow STL shell's open base/underside
  // renders solid from every angle instead of letting you see through it.
  const flatBaseProps = {
    color: 0xD2B89C,
    metalness: 0,
    roughness: 0.8,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  };
  const flatUpper = new THREE.MeshStandardMaterial(flatBaseProps);
  const flatLower = new THREE.MeshStandardMaterial(flatBaseProps);

  preview3DState.jawFiles = {};

  const totalFiles = Math.max(jawFiles.length, 1);
  for (let i = 0; i < jawFiles.length; i += 1) {
    const file = jawFiles[i];
    const upper = isUpper(file);
    await updateJawMeshProgress(i, totalFiles, 0.05, upper, "Reading");
    const primarySurface = upper ? undercut?.upper : undercut?.lower;
    const secondarySurface = upper ? undercut?.lower : undercut?.upper;

    const surveyingVerts = (surface) => {
      const bytes = surface?.surveying_values?.data;
      if (!bytes?.length) return 0;
      return Math.floor(new Float32Array(new Uint8Array(bytes).buffer).length / 4);
    };

    const stlBuffer = base64ToArrayBuffer(file.data);
    const payloadInfo = file.__payloadInfo || inspectMeshPayload(stlBuffer);
    const sourcePath = file.__sourcePath || "selected STL source";
    await updateJawMeshProgress(i, totalFiles, 0.2, upper, "Parsing");
    console.log(`[preview3D] ${sourcePath} parse check for ${file?.filename || "unknown"}`, payloadInfo);
    if (!["binary-stl", "ascii-stl", "off"].includes(payloadInfo.format)) {
      console.warn(
        `[preview3D] ${file?.filename || "unknown"} is ${payloadInfo.format}, not a renderable STL/OFF mesh. Parse skipped.`
      );
      continue;
    }

    let geometry;
    let useHeatmap = false;

    if (payloadInfo.format === "off") {
      const offText = new TextDecoder().decode(stlBuffer);
      geometry = parseOFFToGeometry(offText);
      if (!geometry) {
        console.warn(`[preview3D] ${file?.filename || "unknown"} looked like OFF but could not be parsed.`);
        continue;
      }
      applyUndercutVertexColors(geometry, primarySurface);
      useHeatmap = true;
      await updateJawMeshProgress(i, totalFiles, 0.55, upper, "Applying undercut heatmap");
      console.log(`[preview3D] OFF mesh rendered for ${file?.filename || "unknown"}`, {
        source: sourcePath,
        vertices: geometry.attributes.position.count,
      });
    } else {
      geometry = loader.parse(stlBuffer);
      await updateJawMeshProgress(i, totalFiles, 0.35, upper, "Matching undercut vertices");

    // Determine which heatmap surface to use, then dedup the mesh to match
    // its vertex count so the backend's first-occurrence vertex indices align
    // with ours. Prefer the same-jaw surface; only fall back to the opposite
    // if the same-jaw one is empty.
    const primaryVerts = surveyingVerts(primarySurface);
    const secondaryVerts = surveyingVerts(secondarySurface);

    let target = null;
    if (primaryVerts > 0) {
      target = { label: upper ? "upper" : "lower", surface: primarySurface, verts: primaryVerts };
    } else if (secondaryVerts > 0) {
      target = { label: upper ? "lower" : "upper", surface: secondarySurface, verts: secondaryVerts };
    }

    if (target) {
      // Dual-dedup: walk raw STL corners once, building our dedup AND a
      // surrogate of the backend's. Each of our verts records the backend
      // vert it first co-occurs with in the raw stream — colors come from
      // spatial co-occurrence, not blind index alignment.
      const dual = buildDualDedupGeometry(geometry, target.surface, target.verts);
      geometry = dual.geometry;
      useHeatmap = true;
      const diff = Math.abs(dual.backendVertCount - target.verts);
      console.log(`[preview3D] dual-dedup heatmap applied for ${file?.filename || "unknown"}`, {
        ourVerts: geometry.attributes.position.count,
        heatmapVerts: target.verts,
        surrogateBackendVerts: dual.backendVertCount,
        countDiff: diff,
      });
      if (target.surface !== primarySurface) {
        console.warn("[preview3D] used opposite-jaw heatmap (same-jaw empty)", {
          file: file?.filename || file?.type || "unknown",
          expectedJaw: upper ? "upper" : "lower",
          usedJaw: target.label,
        });
      }
    } else {
      geometry = mergeStlVertices(geometry);
    }
    }
    await updateJawMeshProgress(i, totalFiles, 0.7, upper, meshQuality === "high" ? "Keeping original mesh" : "Building low quality display mesh");
    geometry = getDisplayGeometryForQuality(
      geometry,
      file?.filename || (upper ? "upper jaw" : "lower jaw"),
      meshQuality
    );
    geometry.computeVertexNormals();
    await updateJawMeshProgress(i, totalFiles, 0.88, upper, "Adding to viewport");

    const heatMat = heatmapMaterial.clone();
    const flatMat = (upper ? flatUpper : flatLower).clone();
    const activeMat = (useHeatmap && preview3DState.heatmapEnabled) ? heatMat : flatMat;
    const mesh = new THREE.Mesh(geometry, activeMat);
    mesh.userData.heatmapMaterial = heatMat;
    mesh.userData.flatMaterial = flatMat;
    if (upper) upperGroup.add(mesh);
    else lowerGroup.add(mesh);

    preview3DState.jawFiles[upper ? "upper" : "lower"] = {
      data: file.data,
      type: file.type ?? file.jaw_type ?? (upper ? "upper_jaw" : "lower_jaw"),
      filename: file.filename || file.name || `${upper ? "upper" : "lower"}.stl`,
    };
    await updateJawMeshProgress(i, totalFiles, 0.98, upper, "Loaded");
  }

  const root = preview3DState.modelRoot;
  if (!root) return;
  updateMeshQualityProgress(94, "Positioning jaw mesh");
  await waitForPreviewPaint();
  root.clear();
  if (upperGroup.children.length) root.add(upperGroup);
  if (lowerGroup.children.length) root.add(lowerGroup);

  centerRootOnCombinedBounds(root);

  preview3DState.groups.upper = upperGroup.children.length ? upperGroup : null;
  preview3DState.groups.lower = lowerGroup.children.length ? lowerGroup : null;
  setJawRowMode("upper", !!preview3DState.groups.upper);
  setJawRowMode("lower", !!preview3DState.groups.lower);
  applyJawVisibility();
  fitPreviewCamera();
  updateMeshQualityProgress(98, "Finalizing viewport");
  await waitForPreviewPaint();
}

// Put both jaw rows into their empty/upload state for a case with no jaw STLs.
function showEmptyJawPanel() {
  preview3DState.groups.upper = null;
  preview3DState.groups.lower = null;
  preview3DState.jawFiles = {};
  setJawRowMode("upper", false);
  setJawRowMode("lower", false);
}

async function populateJawPreviewFromOFF(meshFiles, undercut, meshQuality = "low") {
  const upperGroup = new THREE.Group();
  const lowerGroup = new THREE.Group();

  // vertexColors: true makes the per-vertex undercut RGB show through. Side: DoubleSide
  // so the inside of the jaw isn't dark when the camera tilts under the occlusal plane.
  const meshMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.05,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const flatColor = new THREE.Color(
    DEFAULT_TOOTH_COLOR[0],
    DEFAULT_TOOTH_COLOR[1],
    DEFAULT_TOOTH_COLOR[2]
  );
  const flatBase = new THREE.MeshStandardMaterial({
    color: flatColor,
    metalness: 0.05,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const totalFiles = Math.max(meshFiles.length, 1);
  for (let i = 0; i < meshFiles.length; i += 1) {
    const file = meshFiles[i];
    const upper = isUpper(file);
    await updateJawMeshProgress(i, totalFiles, 0.08, upper, "Reading parameterized mesh");
    const offText = atob(file.data);
    let geometry = parseOFFToGeometry(offText);
    if (!geometry) continue;

    const surface = upper ? undercut?.upper : undercut?.lower;
    await updateJawMeshProgress(i, totalFiles, 0.35, upper, "Applying undercut heatmap");
    applyUndercutVertexColors(geometry, surface);
    await updateJawMeshProgress(i, totalFiles, 0.68, upper, meshQuality === "high" ? "Keeping original mesh" : "Building low quality display mesh");
    geometry = getDisplayGeometryForQuality(
      geometry,
      file?.filename || (upper ? "upper OFF mesh" : "lower OFF mesh"),
      meshQuality
    );
    geometry.computeVertexNormals();
    await updateJawMeshProgress(i, totalFiles, 0.86, upper, "Adding to viewport");

    const heatMat = meshMaterial.clone();
    const flatMat = flatBase.clone();
    const mesh = new THREE.Mesh(geometry, preview3DState.heatmapEnabled ? heatMat : flatMat);
    mesh.userData.heatmapMaterial = heatMat;
    mesh.userData.flatMaterial = flatMat;
    if (upper) upperGroup.add(mesh);
    else lowerGroup.add(mesh);
    await updateJawMeshProgress(i, totalFiles, 0.98, upper, "Loaded");
  }

  const root = preview3DState.modelRoot;
  if (!root) return;
  updateMeshQualityProgress(94, "Positioning jaw mesh");
  await waitForPreviewPaint();
  root.clear();
  if (upperGroup.children.length) root.add(upperGroup);
  if (lowerGroup.children.length) root.add(lowerGroup);

  centerRootOnCombinedBounds(root);

  preview3DState.groups.upper = upperGroup.children.length ? upperGroup : null;
  preview3DState.groups.lower = lowerGroup.children.length ? lowerGroup : null;
  setJawRowMode("upper", !!preview3DState.groups.upper);
  setJawRowMode("lower", !!preview3DState.groups.lower);
  applyJawVisibility();
  fitPreviewCamera();
  updateMeshQualityProgress(98, "Finalizing viewport");
  await waitForPreviewPaint();
}

function parseOFFToGeometry(text) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length || lines[0].trim() !== "OFF") return null;

  const header = lines[1].trim().split(/\s+/).map(Number);
  const numVertices = header[0];
  const numFaces = header[1];
  if (!Number.isFinite(numVertices) || !Number.isFinite(numFaces)) return null;

  const vertices = new Float32Array(numVertices * 3);
  for (let i = 0; i < numVertices; i += 1) {
    const parts = lines[2 + i].trim().split(/\s+/);
    vertices[i * 3] = Number(parts[0]);
    vertices[i * 3 + 1] = Number(parts[1]);
    vertices[i * 3 + 2] = Number(parts[2]);
  }

  const indices = [];
  const faceStart = 2 + numVertices;
  for (let i = 0; i < numFaces; i += 1) {
    const parts = lines[faceStart + i].trim().split(/\s+/).map(Number);
    if (parts[0] === 3) indices.push(parts[1], parts[2], parts[3]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices.length > 65535
    ? new THREE.Uint32BufferAttribute(indices, 1)
    : new THREE.Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// Mirrors STLMeshLoader.mergeVertices in src/STLMeshLoader.js — the backend computes
// the undercut heatmap against the deduplicated STL, so we must dedupe with the same
// threshold for vertex indices to align.
function mergeStlVerticesWithThreshold(geometry, threshold) {
  const positions = geometry.attributes.position.array;
  const merged = [];
  const indices = [];
  const map = {};
  let next = 0;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const key = `${Math.round(x / threshold)},${Math.round(y / threshold)},${Math.round(z / threshold)}`;
    if (map[key] === undefined) {
      merged.push(x, y, z);
      map[key] = next;
      indices.push(next);
      next += 1;
    } else {
      indices.push(map[key]);
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(merged, 3));
  out.setIndex(indices.length > 65535
    ? new THREE.Uint32BufferAttribute(indices, 1)
    : new THREE.Uint16BufferAttribute(indices, 1));
  return out;
}

function mergeStlVertices(geometry) {
  return mergeStlVerticesWithThreshold(geometry, 1e-4);
}

function countUniquePositionsAtThreshold(positions, threshold) {
  const seen = new Set();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    seen.add(`${Math.round(x / threshold)},${Math.round(y / threshold)},${Math.round(z / threshold)}`);
  }
  return seen.size;
}

function estimateBackendThreshold(positions, targetCount) {
  let lo = 1e-6;
  let hi = 1e-1;
  let bestThreshold = 1e-4;
  let bestDiff = Infinity;
  for (let iter = 0; iter < 28; iter += 1) {
    const mid = Math.sqrt(lo * hi);
    const count = countUniquePositionsAtThreshold(positions, mid);
    const diff = Math.abs(count - targetCount);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestThreshold = mid;
    }
    if (count > targetCount) lo = mid;
    else hi = mid;
    if (hi / lo < 1.0001) break;
  }
  for (const factor of [0.95, 0.97, 0.99, 1.01, 1.03, 1.05, 0.9, 1.1]) {
    const t = bestThreshold * factor;
    const count = countUniquePositionsAtThreshold(positions, t);
    const diff = Math.abs(count - targetCount);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

function buildDualDedupGeometry(rawGeometry, surface, targetBackendCount) {
  const positions = rawGeometry.attributes.position.array;
  const ourThreshold = 1e-4;
  const backendThreshold = estimateBackendThreshold(positions, targetBackendCount);

  const ourMap = new Map();
  const backendMap = new Map();
  const ourVertPositions = [];
  const ourVertToBackendIdx = [];
  const indices = [];
  let nextOur = 0;
  let nextBackend = 0;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    const ourKey = `${Math.round(x / ourThreshold)},${Math.round(y / ourThreshold)},${Math.round(z / ourThreshold)}`;
    const backendKey = `${Math.round(x / backendThreshold)},${Math.round(y / backendThreshold)},${Math.round(z / backendThreshold)}`;

    let ourIdx = ourMap.get(ourKey);
    if (ourIdx === undefined) {
      ourIdx = nextOur++;
      ourMap.set(ourKey, ourIdx);
      ourVertPositions.push(x, y, z);
      ourVertToBackendIdx.push(-1);
    }
    indices.push(ourIdx);

    let backendIdx = backendMap.get(backendKey);
    if (backendIdx === undefined) {
      backendIdx = nextBackend++;
      backendMap.set(backendKey, backendIdx);
    }

    if (ourVertToBackendIdx[ourIdx] === -1) {
      ourVertToBackendIdx[ourIdx] = backendIdx;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(ourVertPositions, 3));
  geometry.setIndex(indices.length > 65535
    ? new THREE.Uint32BufferAttribute(indices, 1)
    : new THREE.Uint16BufferAttribute(indices, 1));

  const surveyingBuffer = surface?.surveying_values?.data;
  const heatmap = surveyingBuffer ? new Float32Array(new Uint8Array(surveyingBuffer).buffer) : null;
  const heatmapVerts = heatmap ? Math.floor(heatmap.length / 4) : 0;

  const colors = new Float32Array(nextOur * 3);
  for (let i = 0; i < nextOur; i += 1) {
    let r = DEFAULT_TOOTH_COLOR[0];
    let g = DEFAULT_TOOTH_COLOR[1];
    let b = DEFAULT_TOOTH_COLOR[2];
    const bIdx = ourVertToBackendIdx[i];
    if (heatmap && bIdx >= 0 && bIdx < heatmapVerts) {
      [r, g, b] = normalizeUndercutColor(
        heatmap[bIdx * 4],
        heatmap[bIdx * 4 + 1],
        heatmap[bIdx * 4 + 2]
      );
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // Laplacian smoothing: average each vert's color with its neighbors several times.
  // Without backend positions the raw colors are noisy; heavy smoothing collapses the
  // misaligned streaks into soft red→yellow zones (closer to the desktop render).
  // Strong undercut regions stay visible; the dedup speckle washes out.
  smoothVertexColors(geometry, 5);

  return { geometry, backendVertCount: nextBackend };
}

/**
 * Laplacian smoothing of an indexed BufferGeometry's color attribute: each iteration
 * replaces every vertex color with the average of itself and its direct neighbors.
 * 2 iterations kills speckle while keeping gross structure (red bands stay red).
 */
function smoothVertexColors(geometry, iterations = 2) {
  const colorAttr = geometry.getAttribute("color");
  const indexAttr = geometry.getIndex();
  if (!colorAttr || !indexAttr) return;

  const vertexCount = colorAttr.count;
  const indices = indexAttr.array;

  // Build adjacency once. For each triangle the three corners are mutual
  // neighbors. Stored as flat parallel arrays (offsets + neighbors) so the
  // hot loop doesn't iterate a Set per vert.
  const neighborSets = new Array(vertexCount);
  for (let v = 0; v < vertexCount; v += 1) neighborSets[v] = new Set();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    neighborSets[a].add(b); neighborSets[a].add(c);
    neighborSets[b].add(a); neighborSets[b].add(c);
    neighborSets[c].add(a); neighborSets[c].add(b);
  }
  const offsets = new Uint32Array(vertexCount + 1);
  let total = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    offsets[v] = total;
    total += neighborSets[v].size;
  }
  offsets[vertexCount] = total;
  const flatNeighbors = new Uint32Array(total);
  let cursor = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    for (const n of neighborSets[v]) flatNeighbors[cursor++] = n;
  }

  let current = new Float32Array(colorAttr.array);
  let next = new Float32Array(current.length);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let v = 0; v < vertexCount; v += 1) {
      const start = offsets[v];
      const end = offsets[v + 1];
      let r = current[v * 3];
      let g = current[v * 3 + 1];
      let b = current[v * 3 + 2];
      let count = 1;
      for (let k = start; k < end; k += 1) {
        const n = flatNeighbors[k];
        r += current[n * 3];
        g += current[n * 3 + 1];
        b += current[n * 3 + 2];
        count += 1;
      }
      next[v * 3] = r / count;
      next[v * 3 + 1] = g / count;
      next[v * 3 + 2] = b / count;
    }
    const tmp = current;
    current = next;
    next = tmp;
  }

  colorAttr.array.set(current);
  colorAttr.needsUpdate = true;
}

function applyUndercutVertexColors(geometry, surface, options = {}) {
  const vertexCount = geometry.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);

  // Default everything to the base tooth color.
  for (let i = 0; i < vertexCount; i += 1) {
    colors[i * 3] = DEFAULT_TOOTH_COLOR[0];
    colors[i * 3 + 1] = DEFAULT_TOOTH_COLOR[1];
    colors[i * 3 + 2] = DEFAULT_TOOTH_COLOR[2];
  }

  // surveying_values is the undercut heatmap (yellow→red). Channels of (1,1,1) mark
  // "no undercut" — the API uses that as a sentinel, so we keep the default color there.
  const surveyingBuffer = surface?.surveying_values?.data;
  if (surveyingBuffer) {
    const heatmap = new Float32Array(new Uint8Array(surveyingBuffer).buffer);
    const heatmapVerts = Math.floor(heatmap.length / 4);
    const trimTail = Math.max(0, Number(options?.trimTailVertices) || 0);
    // When counts differ (backend dedup vs frontend dedup), color the overlapping
    // prefix and leave the rest as default — better than skipping the heatmap entirely.
    const limit = Math.max(0, Math.min(vertexCount, heatmapVerts) - trimTail);
    for (let i = 0; i < limit; i += 1) {
      const [r, g, b] = normalizeUndercutColor(
        heatmap[i * 4],
        heatmap[i * 4 + 1],
        heatmap[i * 4 + 2]
      );
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function normalizeUndercutColor(r, g, b) {
  // The backend uses pure white as "no undercut". Real yellow/red heatmap
  // colors may still contain a 1.0 channel, so only full white maps to tooth tan.
  if (r === 1 && g === 1 && b === 1) {
    return DEFAULT_TOOTH_COLOR;
  }
  return [r, g, b];
}

function getUndercutColorSeverity(r, g, b) {
  const dr = r - DEFAULT_TOOTH_COLOR[0];
  const dg = g - DEFAULT_TOOTH_COLOR[1];
  const db = b - DEFAULT_TOOTH_COLOR[2];
  return dr * dr + dg * dg + db * db;
}

function getDisplayGeometryForQuality(geometry, label, meshQuality = preview3DState.meshQuality) {
  if (meshQuality === "high") {
    console.log(`[preview3D] high quality mesh selected for ${label}; decimation skipped`);
    return geometry;
  }
  return createDisplayGeometry(geometry, label);
}

function getGeometryTriangleCount(geometry) {
  const index = geometry?.getIndex?.();
  const position = geometry?.getAttribute?.("position");
  if (index) return Math.floor(index.count / 3);
  return position ? Math.floor(position.count / 3) : 0;
}

function buildClusteredGeometry(geometry, cellSize) {
  const positionAttr = geometry.getAttribute("position");
  if (!positionAttr || positionAttr.count < 3 || !Number.isFinite(cellSize) || cellSize <= 0) {
    return null;
  }

  const colorAttr = geometry.getAttribute("color");
  const hasColors = colorAttr && colorAttr.count === positionAttr.count;
  const positions = positionAttr.array;
  const colors = hasColors ? colorAttr.array : null;
  const indexAttr = geometry.getIndex();
  const sourceIndex = indexAttr?.array || null;
  const vertexCount = positionAttr.count;
  const sourceToCluster = new Uint32Array(vertexCount);
  const clusters = new Map();

  const keyFor = (x, y, z) =>
    `${Math.round(x / cellSize)},${Math.round(y / cellSize)},${Math.round(z / cellSize)}`;

  for (let v = 0; v < vertexCount; v += 1) {
    const p = v * 3;
    const x = positions[p];
    const y = positions[p + 1];
    const z = positions[p + 2];
    const key = keyFor(x, y, z);
    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = {
        out: clusters.size,
        count: 0,
        x: 0,
        y: 0,
        z: 0,
        r: 0,
        g: 0,
        b: 0,
        heatR: DEFAULT_TOOTH_COLOR[0],
        heatG: DEFAULT_TOOTH_COLOR[1],
        heatB: DEFAULT_TOOTH_COLOR[2],
        heatSeverity: -1,
      };
      clusters.set(key, cluster);
    }
    cluster.count += 1;
    cluster.x += x;
    cluster.y += y;
    cluster.z += z;
    if (hasColors) {
      const r = colors[p];
      const g = colors[p + 1];
      const b = colors[p + 2];
      cluster.r += r;
      cluster.g += g;
      cluster.b += b;
      const severity = getUndercutColorSeverity(r, g, b);
      if (severity > cluster.heatSeverity) {
        cluster.heatR = r;
        cluster.heatG = g;
        cluster.heatB = b;
        cluster.heatSeverity = severity;
      }
    }
    sourceToCluster[v] = cluster.out;
  }

  const outputVertexCount = clusters.size;
  if (outputVertexCount < 3 || outputVertexCount >= vertexCount) return null;

  const outputPositions = new Float32Array(outputVertexCount * 3);
  const outputColors = hasColors ? new Float32Array(outputVertexCount * 3) : null;
  for (const cluster of clusters.values()) {
    const p = cluster.out * 3;
    const inv = 1 / cluster.count;
    outputPositions[p] = cluster.x * inv;
    outputPositions[p + 1] = cluster.y * inv;
    outputPositions[p + 2] = cluster.z * inv;
    if (hasColors) {
      if (cluster.heatSeverity > 1e-6) {
        outputColors[p] = cluster.heatR;
        outputColors[p + 1] = cluster.heatG;
        outputColors[p + 2] = cluster.heatB;
      } else {
        outputColors[p] = cluster.r * inv;
        outputColors[p + 1] = cluster.g * inv;
        outputColors[p + 2] = cluster.b * inv;
      }
    }
  }

  const sourceIndexCount = sourceIndex ? sourceIndex.length : vertexCount;
  const outputIndices = [];
  const seenTriangles = new Set();
  const getSourceVertex = sourceIndex ? (i) => sourceIndex[i] : (i) => i;
  for (let i = 0; i + 2 < sourceIndexCount; i += 3) {
    const a = sourceToCluster[getSourceVertex(i)];
    const b = sourceToCluster[getSourceVertex(i + 1)];
    const c = sourceToCluster[getSourceVertex(i + 2)];
    if (a === b || b === c || a === c) continue;
    const sorted = [a, b, c].sort((left, right) => left - right);
    const key = `${sorted[0]},${sorted[1]},${sorted[2]}`;
    if (seenTriangles.has(key)) continue;
    seenTriangles.add(key);
    outputIndices.push(a, b, c);
  }

  if (outputIndices.length < 3) return null;

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(outputPositions, 3));
  if (outputColors) out.setAttribute("color", new THREE.BufferAttribute(outputColors, 3));
  out.setIndex(outputVertexCount > 65535
    ? new THREE.Uint32BufferAttribute(outputIndices, 1)
    : new THREE.Uint16BufferAttribute(outputIndices, 1));
  return out;
}

function createDisplayGeometry(geometry, label = "mesh") {
  const sourceTriangles = getGeometryTriangleCount(geometry);
  if (sourceTriangles < PREVIEW_MIN_SIMPLIFY_TRIANGLES) return geometry;

  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) return geometry;

  const targetVertices = Math.max(5000, Math.floor(PREVIEW_MAX_DISPLAY_TRIANGLES * 0.7));
  const baseDivisions = Math.max(8, Math.round(Math.cbrt(targetVertices)));
  const baseCellSize = longest / baseDivisions;
  let best = null;
  let bestTriangles = sourceTriangles;

  for (const factor of [1, 1.25, 1.6, 2.05, 2.65, 3.4]) {
    const candidate = buildClusteredGeometry(geometry, baseCellSize * factor);
    const triangles = getGeometryTriangleCount(candidate);
    if (!candidate || triangles < 1000) continue;
    if (!best || Math.abs(triangles - PREVIEW_MAX_DISPLAY_TRIANGLES) < Math.abs(bestTriangles - PREVIEW_MAX_DISPLAY_TRIANGLES)) {
      best?.dispose?.();
      best = candidate;
      bestTriangles = triangles;
    } else {
      candidate.dispose();
    }
    if (triangles <= PREVIEW_MAX_DISPLAY_TRIANGLES) break;
  }

  if (!best || bestTriangles >= sourceTriangles) {
    best?.dispose?.();
    return geometry;
  }

  best.computeVertexNormals();
  console.log(`[preview3D] display mesh simplified for ${label}`, {
    sourceTriangles,
    displayTriangles: bestTriangles,
    reductionPct: Math.round((1 - bestTriangles / sourceTriangles) * 100),
  });
  geometry.dispose();
  return best;
}

function centerRootOnCombinedBounds(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -center.y, -center.z);
}

function applyJawVisibility() {
  const upper = preview3DState.groups.upper;
  const lower = preview3DState.groups.lower;
  const view = preview3DState.activeView;
  if (upper) upper.visible = view === "both" || view === "upper";
  if (lower) lower.visible = view === "both" || view === "lower";
}

function fitPreviewCamera() {
  const root = preview3DState.modelRoot;
  const camera = preview3DState.camera;
  const controls = preview3DState.controls;
  if (!root || !camera || !controls) return;

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  // Distance at which the model's largest dimension just fills the vertical FOV,
  // padded out so the loaded jaws don't start uncomfortably close to the camera.
  const FIT_PADDING = 1.5;
  const fitDist = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * FIT_PADDING;
  camera.up.set(0, 1, 0);
  camera.position.set(center.x, center.y + fitDist * 0.35, center.z + fitDist * 1.25);
  controls.target.copy(center);
  controls.update();
  // OrbitControls had saveState(); TrackballControls doesn't. Call it only if
  // present so we stay compatible if controls ever get swapped again.
  controls.saveState?.();
}

// Camera offset dir + up-vector per orthographic snap, in the MODEL's local frame
// (Z-up: +Z = occlusal). modelRoot is tilted -PI/2 on X, so these are rotated by its
// world quaternion at snap time — that's why "top" shows the occlusal surface, not a
// world-axis side. Keys match the ViewCube's BoxGeometry face order (same quaternion).
const PREVIEW_VIEW_PRESETS = {
  top: { dir: [0, -1, 0], up: [0, 0, 1] },
  bottom: { dir: [0, 1, 0], up: [0, 0, 1] },
  left: { dir: [-1, 0, 0], up: [0, 1, 0] },
  right: { dir: [1, 0, 0], up: [0, 1, 0] },
  front: { dir: [0, 0, 1], up: [0, 1, 0] },
  back: { dir: [0, 0, -1], up: [0, 1, 0] },
};

// Snap the preview camera to a named orthographic view (or re-fit on "fit").
function snapPreviewView(view) {
  if (view === "fit") {
    fitPreviewCamera();
    return;
  }
  const preset = PREVIEW_VIEW_PRESETS[view];
  const root = preview3DState.modelRoot;
  const camera = preview3DState.camera;
  const controls = preview3DState.controls;
  if (!preset || !root || !camera || !controls) return;

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fitDist = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.5;

  // Rotate the model-local direction/up into world space so the view follows the
  // jaw's actual orientation regardless of modelRoot's tilt.
  const modelQuat = root.getWorldQuaternion(new THREE.Quaternion());
  const dir = new THREE.Vector3(preset.dir[0], preset.dir[1], preset.dir[2])
    .applyQuaternion(modelQuat)
    .normalize();
  const up = new THREE.Vector3(preset.up[0], preset.up[1], preset.up[2])
    .applyQuaternion(modelQuat)
    .normalize();
  camera.up.copy(up);
  camera.position.copy(center).addScaledVector(dir, fitDist);
  controls.target.copy(center);
  controls.update();
  controls.saveState?.();
}

// Flat view-navigation gizmo (bottom-right): an isometric 3D cube ringed by beveled
// SVG arrows pointing inward. Each arrow snaps the camera to a standard view via
// snapPreviewView; all share one "points down" shape, rotated per position.
function buildPreviewNavGizmo() {
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgNode = (tag, attrs = {}) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };

  // Beveled arrow (base shape points DOWN); `rotateDeg` aims it at the cube.
  const makeArrow = (rotateDeg, gradId) => {
    const svg = svgNode("svg", { viewBox: "0 0 24 24", width: 22, height: 22 });
    svg.style.transform = `rotate(${rotateDeg}deg)`;
    const defs = svgNode("defs");
    const grad = svgNode("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svgNode("stop", { offset: 0, "stop-color": "#5fd0b6" }));
    grad.appendChild(svgNode("stop", { offset: 1, "stop-color": "#2f9079" }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    svg.appendChild(
      svgNode("path", {
        d: "M12 19.5 L4 9.5 H8.5 V4.5 H15.5 V9.5 H20 Z",
        fill: `url(#${gradId})`,
        stroke: "#25735f",
        "stroke-width": 0.8,
        "stroke-linejoin": "round",
      })
    );
    return svg;
  };

  // Isometric cube: top (lightest), left (mid), right (darkest) faces.
  const makeCube = () => {
    const svg = svgNode("svg", { viewBox: "0 0 32 34", width: 30, height: 32 });
    const faces = [
      { points: "16,3 29,10.5 16,18 3,10.5", fill: "#dfe4ea" },
      { points: "3,10.5 16,18 16,31 3,23.5", fill: "#a9afb8" },
      { points: "29,10.5 16,18 16,31 29,23.5", fill: "#868c95" },
    ];
    for (const f of faces) {
      svg.appendChild(
        svgNode("polygon", {
          points: f.points,
          fill: f.fill,
          stroke: "#565c65",
          "stroke-width": 0.8,
          "stroke-linejoin": "round",
        })
      );
    }
    return svg;
  };

  const nav = document.createElement("div");
  nav.className = "jaw-preview-nav";

  const grid = document.createElement("div");
  grid.className = "jpnav-grid";

  // rot is clockwise from the base "down" arrow so every arrow points at the cube
  // (top→down, right→left, etc.). Top/bottom and front/back are swapped: the top
  // control snaps to the bottom view and vice versa, likewise front-corner ↔ back.
  const items = [
    { cls: "jpnav-top", snap: "bottom", label: "Bottom view", rot: 0 },
    { cls: "jpnav-front", snap: "back", label: "Back view", rot: 45 },
    { cls: "jpnav-left", snap: "left", label: "Left view", rot: 270 },
    { cls: "jpnav-cube", snap: "fit", label: "Default view", cube: true },
    { cls: "jpnav-right", snap: "right", label: "Right view", rot: 90 },
    { cls: "jpnav-back", snap: "front", label: "Front view", rot: 225 },
    { cls: "jpnav-bottom", snap: "top", label: "Top view", rot: 180 },
  ];
  items.forEach((def, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `jpnav-btn ${def.cls}`;
    btn.title = def.label;
    btn.appendChild(def.cube ? makeCube() : makeArrow(def.rot, `jpnav-grad-${i}`));
    btn.addEventListener("click", () => snapPreviewView(def.snap));
    grid.appendChild(btn);
  });
  nav.appendChild(grid);
  return nav;
}

function base64ToArrayBuffer(base64) {
  let cleaned = String(base64 || "").trim();
  // Some backend payloads (e.g. /stl/slot/get) arrive as a data-URI or URL-safe
  // base64 with stray whitespace — plain atob() throws InvalidCharacterError on
  // those. Normalize to standard base64 + correct padding before decoding, the
  // same way safeAtob() does in jawStructCodec.js / clinicalInfo.js.
  const comma = cleaned.indexOf(",");
  if (cleaned.startsWith("data:") && comma !== -1) {
    cleaned = cleaned.slice(comma + 1);
  }
  cleaned = cleaned.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  cleaned += "=".repeat((4 - (cleaned.length % 4)) % 4);
  const raw = atob(cleaned);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function inspectMeshPayload(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  const byteLength = bytes.byteLength;
  const previewLength = Math.min(byteLength, 96);
  let header = "";
  for (let i = 0; i < previewLength; i += 1) {
    const code = bytes[i];
    header += code >= 32 && code <= 126 ? String.fromCharCode(code) : " ";
  }
  const trimmedHeader = header.trim();
  const upperHeader = trimmedHeader.toUpperCase();

  if (upperHeader.startsWith("OFF")) {
    return {
      format: "off",
      byteLength,
      header: trimmedHeader.slice(0, 80),
    };
  }

  if (/^SOLID\b/i.test(trimmedHeader)) {
    return {
      format: "ascii-stl",
      byteLength,
      header: trimmedHeader.slice(0, 80),
    };
  }

  if (byteLength >= 84) {
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    const expectedBinaryBytes = 84 + triangleCount * 50;
    return {
      format: expectedBinaryBytes === byteLength ? "binary-stl" : "unknown-binary",
      byteLength,
      binaryStlTriangleCount: triangleCount,
      expectedBinaryStlBytes: expectedBinaryBytes,
      header: trimmedHeader.slice(0, 80),
    };
  }

  return {
    format: "unknown",
    byteLength,
    header: trimmedHeader.slice(0, 80),
  };
}

function filterRenderableJawFiles(files, sourcePath) {
  const valid = [];
  for (const file of files || []) {
    let payloadInfo;
    try {
      payloadInfo = inspectMeshPayload(base64ToArrayBuffer(file.data));
    } catch (err) {
      console.warn(`[preview3D] ${sourcePath} payload check failed for ${file?.filename || "unknown"}`, err);
      continue;
    }

    const checkedFile = { ...file, __sourcePath: sourcePath, __payloadInfo: payloadInfo };
    console.log(`[preview3D] ${sourcePath} payload check for ${file?.filename || "unknown"}`, payloadInfo);

    if (["binary-stl", "ascii-stl", "off"].includes(payloadInfo.format)) {
      valid.push(checkedFile);
    } else {
      console.warn(
        `[preview3D] ${sourcePath} returned ${payloadInfo.format} for ${file?.filename || "unknown"}; expected STL or OFF.`
      );
    }
  }
  return valid;
}

function isUpper(file) {
  return getJawKeyFromFile(file) === "upper";
}

function getJawKeyFromFile(file) {
  const typeRaw = file?.type ?? file?.jaw_type ?? file?.slot ?? file?.jawSlot;
  if (typeRaw === 1 || typeRaw === "1") return "upper";
  if (typeRaw === 2 || typeRaw === "2") return "lower";
  const type = String(typeRaw || "").toLowerCase();
  const name = String(file?.filename || file?.name || "").toLowerCase();
  if (type.includes("upper") || name.includes("upper")) return "upper";
  if (type.includes("lower") || name.includes("lower")) return "lower";
  return null;
}

// The single trash button used everywhere in the preview view bar (jaw rows
// and slot-STL rows). Don't re-create this markup elsewhere — call this.
function buildPreviewTrashButton({ ariaLabel, title }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "jaw-preview-delete-btn";
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = title;
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2h-6a2 2 0 01-2-2V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return btn;
}

function buildJawRow({ jaw, icon, label }) {
  const row = document.createElement("div");
  row.className = "jaw-preview-row";

  const iconEl = document.createElement("img");
  iconEl.className = "jaw-preview-row-icon";
  iconEl.src = icon;
  iconEl.alt = jaw;
  iconEl.role = "button";
  iconEl.tabIndex = 0;
  iconEl.title = `Toggle ${jaw} jaw`;
  iconEl.setAttribute("aria-label", `Toggle ${jaw} jaw visibility`);

  const allowWrap = document.createElement("label");
  allowWrap.className = "jaw-preview-row-check";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = true;
  const txt = document.createElement("span");
  txt.textContent = label;
  allowWrap.appendChild(toggle);
  allowWrap.appendChild(txt);

  const deleteBtn = buildPreviewTrashButton({
    ariaLabel: `Hide ${jaw} jaw`,
    title: `Hide ${jaw} jaw`,
  });

  const surveyBtn = document.createElement("button");
  surveyBtn.type = "button";
  surveyBtn.className = "jaw-preview-survey-btn";
  surveyBtn.textContent = "SET SURVEY ANGLE";

  // Shown only when the jaw has no STL (empty state): clicking it opens the
  // file picker so a new 3D file can be uploaded for this jaw. Hidden while a
  // jaw STL is loaded (the trash + survey controls take over instead).
  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "jaw-preview-upload-btn";
  uploadBtn.setAttribute("aria-label", `Upload ${jaw} 3D file`);
  uploadBtn.title = `Upload ${jaw} 3D file`;
  uploadBtn.innerHTML = '<i class="fa fa-arrow-up-from-bracket" aria-hidden="true"></i>';

  // Inline progress shown in the SET SURVEY ANGLE slot while a freshly picked
  // jaw STL is uploading. Hidden until the row gets `is-uploading-jaw`.
  const surveyLoading = document.createElement("div");
  surveyLoading.className = "jaw-preview-survey-loading";
  surveyLoading.innerHTML =
    '<span class="jaw-preview-survey-loading-label">UPLOADING…</span>' +
    '<span class="jaw-preview-survey-loading-track"><span class="jaw-preview-survey-loading-bar"></span></span>';

  row.appendChild(iconEl);
  row.appendChild(allowWrap);
  row.appendChild(deleteBtn);
  row.appendChild(surveyBtn);
  row.appendChild(uploadBtn);
  row.appendChild(surveyLoading);
  return { row, toggle, deleteBtn, surveyBtn, uploadBtn, surveyLoading, iconEl };
}

// Switch a jaw's row between its "loaded" controls (trash + SET SURVEY ANGLE)
// and its "empty" upload affordance. The row itself always stays visible so the
// 3D panel never collapses when a jaw STL is missing or removed.
function setJawRowMode(jaw, hasStl) {
  const rowKey = jaw === "upper" ? "rowUpper" : "rowLower";
  const ctrl = preview3DState.topControls?.[rowKey];
  if (!ctrl) return;
  ctrl.row.style.display = "grid";
  // Which buttons show is driven entirely by CSS off this class — toggling the
  // `hidden` attribute here doesn't work because the buttons' own `display`
  // rules override the UA `[hidden]` style.
  ctrl.row.classList.toggle("is-empty-jaw", !hasStl);
  ctrl.toggle.checked = hasStl;
  ctrl.toggle.disabled = !hasStl;
}

// Show/hide the inline upload progress bar in a jaw row's SET SURVEY ANGLE slot.
// While set, the survey/trash/upload controls are replaced by the loading bar.
function setJawRowUploading(jaw, uploading) {
  const rowKey = jaw === "upper" ? "rowUpper" : "rowLower";
  const ctrl = preview3DState.topControls?.[rowKey];
  if (!ctrl) return;
  ctrl.row.classList.toggle("is-uploading-jaw", uploading);
  if (uploading) setJawRowUploadProgress(jaw, 0);
}

// Update the inline upload progress (0..100) shown in a jaw row's SET SURVEY
// ANGLE slot — drives both the "UPLOADING… N%" label and the bar width.
function setJawRowUploadProgress(jaw, pct) {
  const rowKey = jaw === "upper" ? "rowUpper" : "rowLower";
  const wrap = preview3DState.topControls?.[rowKey]?.surveyLoading;
  if (!wrap) return;
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const label = wrap.querySelector(".jaw-preview-survey-loading-label");
  const bar = wrap.querySelector(".jaw-preview-survey-loading-bar");
  if (label) label.textContent = `UPLOADING… ${clamped}%`;
  if (bar) bar.style.width = `${clamped}%`;
}


function showPreviewLoading(area, text) {
  if (!area) return;
  const existing = area.querySelector(".jaw-preview-loading");
  if (existing) {
    const label = existing.querySelector(".jaw-preview-loading-label");
    if (label) label.textContent = text || "Loading...";
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "jaw-preview-loading";
  overlay.innerHTML = `
    <div class="jaw-preview-loading-card" role="status" aria-live="polite">
      <div class="jaw-preview-loading-label">${text || "Loading..."}</div>
      <div class="jaw-preview-loading-track"><span class="jaw-preview-loading-bar"></span></div>
    </div>
  `;
  area.appendChild(overlay);
}

function hidePreviewLoading(area) {
  if (!area) return;
  area.querySelectorAll(".jaw-preview-loading").forEach((node) => node.remove());
}

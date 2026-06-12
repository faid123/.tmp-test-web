import { state, setMessage, fetchCaseDetail } from "./2DAnnotation.js";
import { addViewcaptureFromImage } from "./noticeboard.js";
import { confirmModal } from "../confirmModal.js";

let THREE = null;
let TrackballControls = null;
let STLLoader = null;

const PREVIEW_MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const PREVIEW_FALLBACK_UUID = "AC4gRQXZJoNz9EhhW36Q8jMJXBsf";
const SMARTRPD_API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
// Case thumbnail slots on POST /thumbnails. The case-list detail carousel
// pulls all slots via /thumbnails/get, so a fresh capture from here lands in
// the case detail preview on the next case open. Slot 0 is the composite 2D
// annotation; slots 1/2 are the upper/lower jaw renders that create-case
// seeds at case-creation time. Camera captures here overwrite the upper or
// lower slot based on which jaw is currently visible — so isolating one jaw
// and capturing it refreshes only that jaw's thumbnail, leaving the other
// untouched. If both jaws are visible we write to both slots so neither one
// goes stale.
const JAW_UPPER_THUMBNAIL_SLOT = 1;
const JAW_LOWER_THUMBNAIL_SLOT = 2;
// Default RPD jaw color used as the "no undercut" base in vertex-color renders.
const DEFAULT_TOOTH_COLOR = [208 / 255, 190 / 255, 141 / 255];
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
  // Uploaded "other 3D files" live in the jaw_stls_extra_slot_1..4 tables.
  //   occupiedSlots  - Set of slots the backend holds (drives the modal list)
  //   extraFileNames - slot -> filename for every backend-occupied slot
  //   extraGroups    - slot -> { group, row } for meshes currently in the panel
  // A slot can be backend-occupied but removed from the panel (the row trash is
  // a session-only "remove from preview"; the modal X is the permanent delete).
  extraGroups: {},
  extraFileNames: {},
  occupiedSlots: null,
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
  // Flat view-navigation gizmo (bottom-right of the preview).
  previewNav: null,
};

// Up to four arbitrary extra STLs per case (one per jaw_stls_extra_slot_N).
const EXTRA_STL_SLOTS = [1, 2, 3, 4];
// Same flat tan as the upper-jaw material so extras match the original jaws.
const EXTRA_STL_COLOR = 0xb0875a;

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

    const meshFiles = await fetchParameterisedMeshForCase();
    if (meshFiles.length) {
      const undercut = await undercutPromise;
      init3DPreview(area);
      await populateJawPreviewFromOFF(meshFiles, undercut);
      // Extra STLs are secondary — load them in the background so the spinner
      // clears as soon as the jaws are painted.
      loadExtraStlsIntoPreview().catch((err) =>
        console.warn("[preview3D] extra STL background load failed", err)
      );
      return true;
    }

    const jawFiles = await jawFilesPromise;
    const undercut = await undercutPromise;
    init3DPreview(area);
    if (jawFiles.length) {
      await populateJawPreview(jawFiles, undercut);
    } else {
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

// Snapshot the current 3D view as a data URL. We re-render immediately before
// reading the canvas because WebGL's drawing buffer is cleared after the swap
// unless `preserveDrawingBuffer: true` (we don't set that, for perf).
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
  preview3DState.caseData = null;
  preview3DState.heatmapEnabled = false;
  preview3DState.heatmapToggleBtn = null;
  preview3DState.heatmapBoard = null;
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

// Save the latest 3D preview snapshot to the case's upper/lower thumbnail
// slot based on which jaw is currently visible. POST /thumbnails upserts by
// (case_int_id, slot), so the upper slot keeps only the latest upper capture
// and the lower slot keeps only the latest lower capture — they don't stomp
// each other. Best-effort: failure here doesn't block the noticeboard save.
async function uploadLatest3DCapture(dataUrl) {
  const caseIntID = state.caseIntID;
  const user = getLoggedInUser();
  if (!caseIntID || !user?.uuid || !dataUrl) return;

  // Visibility is the user's intent: hidden jaws aren't in the captured pixels,
  // so writing the capture into their slot would replace a good render with a
  // misleading one. Skip slots whose jaw is hidden right now.
  const upperVisible = !!preview3DState.groups?.upper?.visible;
  const lowerVisible = !!preview3DState.groups?.lower?.visible;
  const slots = [];
  if (upperVisible) slots.push(JAW_UPPER_THUMBNAIL_SLOT);
  if (lowerVisible) slots.push(JAW_LOWER_THUMBNAIL_SLOT);
  if (!slots.length) return;

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
    setMessage(
      `3D capture saved to noticeboard, but case thumbnail update failed for slot${failed.length > 1 ? "s" : ""} ${failed.map((r) => r.slot).join(", ")}.`,
      true
    );
    return;
  }
  const labels = slots
    .map((s) => (s === JAW_UPPER_THUMBNAIL_SLOT ? "upper" : "lower"))
    .join(" + ");
  setMessage(`3D capture saved (noticeboard + ${labels} thumbnail).`, false);
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

// Parse a base64 STL into a flat-shaded mesh (same tan as the jaws — extras
// have no undercut/surveying data so they never use the heatmap) and add it to
// the model root. The file list/controls live in the upload modal, not the
// view bar.
async function renderExtraStl({ slotNumber, filename, data }) {
  if (!(await ensureThreeDeps())) return;
  const root = preview3DState.modelRoot;
  if (!root) return;

  const loader = new STLLoader();
  let geometry = loader.parse(base64ToArrayBuffer(data));
  geometry = mergeStlVertices(geometry);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: EXTRA_STL_COLOR,
    metalness: 0.05,
    roughness: 0.6,
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

// Upload a user-picked STL into the next free slot, then render it.
async function uploadExtraStl(file) {
  if (!state.caseIntID) {
    setMessage?.("Open a case before uploading a 3D file.");
    return;
  }
  if (!preview3DState.occupiedSlots) preview3DState.occupiedSlots = new Set();
  const freeSlot = EXTRA_STL_SLOTS.find((n) => !preview3DState.occupiedSlots.has(n));
  if (!freeSlot) {
    setMessage?.("All 4 extra 3D file slots are in use. Delete one first.");
    return;
  }
  if (!/\.stl$/i.test(file.name)) {
    setMessage?.("Only .stl files are supported.");
    return;
  }

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

  // POST one endpoint and log the exact outcome (status + body on failure) so
  // an asymmetric upper/lower problem is visible in the console.
  const postStl = async (path, payloadBody) => {
    try {
      const res = await fetch(`${SMARTRPD_API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([auth, payloadBody]),
      });
      if (res.ok) {
        console.log(`[preview3D] ✓ POST ${path} (${jaw}) status=${res.status} type=${JSON.stringify(payloadBody.type)} case_id=${JSON.stringify(payloadBody.case_id)}`);
        return true;
      }
      let body = "";
      try { body = await res.text(); } catch {}
      console.error(`[preview3D] ✕ POST ${path} (${jaw}) status=${res.status} type=${JSON.stringify(payloadBody.type)} case_id=${JSON.stringify(payloadBody.case_id)} body=${body.slice(0, 300)}`);
      return false;
    } catch (err) {
      console.error(`[preview3D] ✕ POST ${path} (${jaw}) threw`, err);
      return false;
    }
  };

  try {
    const base64 = await fileToBase64(file);

    // Both buckets are attempted independently — a failure in one must not skip
    // the other (the desktop client and the web preview read different tables).
    const [rawOk, stlOk] = await Promise.all([
      postStl("/stl/raw", { case_id: caseId, type: jawType, data: base64, filename: file.name }),
      postStl("/stl", { case_id: state.caseIntID, type: dbType, data: base64, filename: file.name }),
    ]);

    if (!rawOk && !stlOk) {
      setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw upload failed (server rejected both buckets — see console).`);
      return;
    }

    await renderJawStl(jaw, { data: base64, type: jawType, filename: file.name });
    if (rawOk && stlOk) {
      setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw uploaded.`);
    } else {
      setMessage?.(`${jaw[0].toUpperCase() + jaw.slice(1)} jaw uploaded, but ${rawOk ? "/stl" : "/stl/raw"} failed — desktop may not update (see console).`);
    }
  } catch (err) {
    console.error(`[preview3D] ✕ jaw upload (${jaw}) failed`, err);
    setMessage?.("Upload failed. Please try again.");
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

// ---- Upload modal --------------------------------------------------------

// Lazily build the modal once; cache element refs on preview3DState.
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

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "upload3d-upload-btn";
  uploadBtn.innerHTML =
    '<i class="fa fa-cloud-arrow-up" aria-hidden="true"></i><span>UPLOAD OTHER 3D FILES</span>';

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".stl";
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // reset so re-picking the same file fires change
    if (file) uploadExtraStl(file);
  });
  uploadBtn.addEventListener("click", () => {
    if (!uploadBtn.disabled) fileInput.click();
  });

  // Upload progress bar (hidden unless an upload is in flight).
  const progress = document.createElement("div");
  progress.className = "upload3d-progress is-hidden";
  const progressFill = document.createElement("div");
  progressFill.className = "upload3d-progress-fill";
  const progressLabel = document.createElement("span");
  progressLabel.className = "upload3d-progress-label";
  progress.appendChild(progressFill);
  progress.appendChild(progressLabel);

  card.appendChild(list);
  card.appendChild(uploadBtn);
  card.appendChild(progress);
  panel.appendChild(header);
  panel.appendChild(card);
  panel.appendChild(fileInput);
  overlay.appendChild(backdrop);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  preview3DState.upload3dModal = { overlay, list, uploadBtn, fileInput, progress, progressFill, progressLabel };
  return preview3DState.upload3dModal;
}

function openUpload3dModal() {
  const modal = ensureUpload3dModal();
  renderUpload3dList();
  modal.overlay.classList.remove("is-hidden");
  modal.overlay.setAttribute("aria-hidden", "false");
  if (!preview3DState.upload3dKeyHandler) {
    preview3DState.upload3dKeyHandler = (e) => {
      if (e.key === "Escape") closeUpload3dModal();
    };
    document.addEventListener("keydown", preview3DState.upload3dKeyHandler);
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
}

// Toggle the modal's busy (uploading) state and drive the progress bar.
// `frac` is the 0..1 upload fraction; at 1 the server is still processing.
function setUpload3dBusy(busy, frac) {
  const modal = preview3DState.upload3dModal;
  if (!modal) return;
  modal.overlay.classList.toggle("is-busy", !!busy);
  modal.uploadBtn.disabled = !!busy;
  modal.progress.classList.toggle("is-hidden", !busy);
  const span = modal.uploadBtn.querySelector("span");
  if (span) span.textContent = busy ? "UPLOADING…" : "UPLOAD OTHER 3D FILES";
  if (busy) {
    const pct = Math.round((frac ?? 0) * 100);
    modal.progressFill.style.width = `${pct}%`;
    modal.progressLabel.textContent = pct >= 100 ? "Processing…" : `Uploading… ${pct}%`;
  } else {
    modal.progressFill.style.width = "0%";
  }
}

// Rebuild the modal's file list from the backend-occupied slots, plus a single
// "No file uploaded" placeholder when a free slot remains.
function renderUpload3dList() {
  const modal = preview3DState.upload3dModal;
  if (!modal) return;
  const list = modal.list;
  list.innerHTML = "";

  const slots = [...(preview3DState.occupiedSlots || [])].sort((a, b) => a - b);
  slots.forEach((slot) => {
    const filename = preview3DState.extraFileNames[slot] || `slot${slot}.stl`;
    list.appendChild(buildUpload3dFileRow(slot, filename));
  });

  const hasFree = (preview3DState.occupiedSlots?.size || 0) < EXTRA_STL_SLOTS.length;
  if (hasFree) list.appendChild(buildUpload3dPlaceholderRow());

  modal.uploadBtn.disabled = !hasFree;
  modal.uploadBtn.classList.toggle("is-disabled", !hasFree);
}

// One populated file row: file icon w/ slot number, X delete, filename.
function buildUpload3dFileRow(slot, filename) {
  const row = document.createElement("div");
  row.className = "upload3d-row";

  const icon = document.createElement("span");
  icon.className = "upload3d-file-icon";
  icon.innerHTML =
    '<i class="fa fa-file" aria-hidden="true"></i><span class="upload3d-file-badge">' +
    slot +
    "</span>";

  const xBtn = document.createElement("button");
  xBtn.type = "button";
  xBtn.className = "upload3d-row-delete";
  xBtn.setAttribute("aria-label", `Delete ${filename}`);
  xBtn.title = `Delete ${filename}`;
  xBtn.innerHTML = '<i class="fa fa-xmark" aria-hidden="true"></i>';
  xBtn.addEventListener("click", () => deleteExtraStl(slot));

  const name = document.createElement("span");
  name.className = "upload3d-row-name";
  name.textContent = filename;
  name.title = filename;

  row.appendChild(icon);
  row.appendChild(xBtn);
  row.appendChild(name);
  return row;
}

// The "No file uploaded" placeholder row — clicking it opens the file picker.
function buildUpload3dPlaceholderRow() {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "upload3d-row upload3d-placeholder";
  row.innerHTML =
    '<span class="upload3d-file-icon is-empty"><i class="fa fa-image" aria-hidden="true"></i><i class="fa fa-slash upload3d-slash" aria-hidden="true"></i></span>' +
    '<span class="upload3d-folder"><i class="fa fa-folder-open" aria-hidden="true"></i></span>' +
    '<span class="upload3d-row-name is-muted">No file uploaded</span>';
  row.addEventListener("click", () => {
    const modal = preview3DState.upload3dModal;
    if (modal && !modal.uploadBtn.disabled) modal.fileInput.click();
  });
  return row;
}

async function fetchParameterisedMeshForCase() {
  // The /parameterisation/mesh/getall, /parameterization/mesh/getall,
  // /surface/getall, and /surface/mesh/getall variants all 404 on the live
  // backend, so we skip them and let the caller fall through to
  // fetchJawFilesForCase. Restore the endpoint loop here if any of those
  // come online.
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
  // `request-download-jaw-profile`; we forward it to the save action here so
  // the screen-capture pattern stays consistent. (The "Upload other 3D files"
  // footer button dispatches `request-open-upload-3d`, wired below.)
  const handleDownloadJawProfileRequest = () => {
    document.getElementById("saveAnnotationBtn")?.click();
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
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xdce3e8, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
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
  controls.noPan = false;
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.18;
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
      // Noticeboard save (local cache) + case-thumbnail upload (server) run in
      // parallel — both keyed off the same dataUrl, neither depends on the
      // other completing first.
      addViewcaptureFromImage(dataUrl);
      await uploadLatest3DCapture(dataUrl);
    } catch (err) {
      console.error("Failed to capture 3D preview screenshot:", err);
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

async function populateJawPreview(jawFiles, undercut) {
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

  for (const file of jawFiles) {
    const upper = isUpper(file);
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
      console.log(`[preview3D] OFF mesh rendered for ${file?.filename || "unknown"}`, {
        source: sourcePath,
        vertices: geometry.attributes.position.count,
      });
    } else {
      geometry = loader.parse(stlBuffer);

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
    geometry.computeVertexNormals();

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
  }

  const root = preview3DState.modelRoot;
  if (!root) return;
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
}

// Put both jaw rows into their empty/upload state for a case with no jaw STLs.
function showEmptyJawPanel() {
  preview3DState.groups.upper = null;
  preview3DState.groups.lower = null;
  preview3DState.jawFiles = {};
  setJawRowMode("upper", false);
  setJawRowMode("lower", false);
}

async function populateJawPreviewFromOFF(meshFiles, undercut) {
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

  for (const file of meshFiles) {
    const offText = atob(file.data);
    const geometry = parseOFFToGeometry(offText);
    if (!geometry) continue;

    const upper = isUpper(file);
    const surface = upper ? undercut?.upper : undercut?.lower;
    applyUndercutVertexColors(geometry, surface);

    const heatMat = meshMaterial.clone();
    const flatMat = flatBase.clone();
    const mesh = new THREE.Mesh(geometry, preview3DState.heatmapEnabled ? heatMat : flatMat);
    mesh.userData.heatmapMaterial = heatMat;
    mesh.userData.flatMaterial = flatMat;
    if (upper) upperGroup.add(mesh);
    else lowerGroup.add(mesh);
  }

  const root = preview3DState.modelRoot;
  if (!root) return;
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
      let rr = heatmap[bIdx * 4];
      let gg = heatmap[bIdx * 4 + 1];
      let bb = heatmap[bIdx * 4 + 2];
      if (rr !== 1) r = rr;
      if (gg !== 1) g = gg;
      if (bb !== 1) b = bb;
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // Laplacian smoothing: average each vert's color with its mesh neighbors
  // several times. Without backend positions we can't get exact per-vert
  // alignment with the heatmap, so the raw colors are noisy. Heavy smoothing
  // collapses the misaligned-vert streaks into soft red→yellow zones that
  // look closer to the desktop app's render. Strong undercut regions stay
  // visible; the speckle from dedup divergence is washed out.
  smoothVertexColors(geometry, 5);

  return { geometry, backendVertCount: nextBackend };
}

/**
 * Laplacian smoothing of an indexed BufferGeometry's color attribute. Each
 * iteration replaces every vertex color with the average of itself and its
 * direct mesh neighbors. 2 iterations is enough to kill speckle while keeping
 * the heatmap's gross structure (red bands stay red, just less spiky).
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
      let r = heatmap[i * 4];
      let g = heatmap[i * 4 + 1];
      let b = heatmap[i * 4 + 2];
      if (r === 1) r = DEFAULT_TOOTH_COLOR[0];
      if (g === 1) g = DEFAULT_TOOTH_COLOR[1];
      if (b === 1) b = DEFAULT_TOOTH_COLOR[2];
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
  const fitDist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.up.set(0, 1, 0);
  camera.position.set(center.x, center.y + fitDist * 0.35, center.z + fitDist * 1.25);
  controls.target.copy(center);
  controls.update();
  // OrbitControls had saveState(); TrackballControls doesn't. Call it only if
  // present so we stay compatible if controls ever get swapped again.
  controls.saveState?.();
}

// Camera offset direction + up-vector for each orthographic snap, expressed in
// the MODEL's local frame (Z-up dental convention: +Z = occlusal/top). The model
// sits inside modelRoot, which is tilted -PI/2 on X, so these are rotated by
// modelRoot's world quaternion at snap time — that's what makes "top" show the
// occlusal surface instead of a world-axis side. Keys match the BoxGeometry face
// order used by the ViewCube, and the cube carries the same quaternion so a
// clicked face always shows that face of the model.
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

// Flat view-navigation gizmo (bottom-right of the preview). An isometric 3D cube
// in the center, ringed by beveled SVG arrows that all point inward toward it.
// Each arrow snaps the preview camera to a standard view via snapPreviewView;
// the arrows share one "points down" shape, rotated per position so they face
// the cube. No background panel, no text labels.
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

  // rot is clockwise from the base "down" arrow, so every arrow points at the
  // center cube: top→down, right→left, bottom→up, left→right, and the two
  // corners point diagonally inward. The top/bottom and front/back positions
  // are swapped: the top control snaps to the bottom view and vice versa, and
  // the front-corner control snaps to the back view and vice versa.
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

  row.appendChild(iconEl);
  row.appendChild(allowWrap);
  row.appendChild(deleteBtn);
  row.appendChild(surveyBtn);
  row.appendChild(uploadBtn);
  return { row, toggle, deleteBtn, surveyBtn, uploadBtn, iconEl };
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

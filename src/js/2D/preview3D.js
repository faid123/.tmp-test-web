import { state, setMessage } from "./2DAnnotation.js";
import { addViewcaptureFromImage } from "./noticeboard.js";

function showConfirmModal({ title = "Confirm", message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "jp-confirm-overlay";
    overlay.innerHTML = `
      <div class="jp-confirm-card" role="dialog" aria-modal="true">
        <h3 class="jp-confirm-title"></h3>
        <p class="jp-confirm-message"></p>
        <div class="jp-confirm-actions">
          <button type="button" class="jp-confirm-cancel"></button>
          <button type="button" class="jp-confirm-ok ${danger ? "is-danger" : ""}"></button>
        </div>
      </div>
    `;
    overlay.querySelector(".jp-confirm-title").textContent = title;
    overlay.querySelector(".jp-confirm-message").textContent = message;
    const cancelBtn = overlay.querySelector(".jp-confirm-cancel");
    const okBtn = overlay.querySelector(".jp-confirm-ok");
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = confirmLabel;

    const close = (result) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      else if (e.key === "Enter") { e.preventDefault(); close(true); }
    };

    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    setTimeout(() => okBtn.focus(), 0);
  });
}

let THREE = null;
let TrackballControls = null;
let STLLoader = null;
let threeMergeVertices = null;

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
  activeView: "both",
  topControls: null,
  caseData: null,
  heatmapEnabled: false,
  heatmapToggleBtn: null,
  heatmapBoard: null,
  // Lazy-loaded server STLs that aren't the upper/lower jaws (type 3+).
  // Keyed by stl type. Value: { mesh, visible, filename }.
  extrasGroup: null,
  loadedExtras: new Map(),
};

export async function loadInteractiveJawPreview(area) {
  showPreviewLoading(area, "Loading 3D jaws...");
  try {
    const depsReady = await ensureThreeDeps();
    if (!depsReady) {
      teardown3DPreview();
      return false;
    }

    // Fetch the heatmap up front so both render paths can use it.
    const undercutPromise = fetchUndercutForCase();
    // Prefetch case data so SET SURVEY ANGLE can preserve the unmodified jaw's
    // angles without an extra round-trip when the button is clicked.
    fetchCaseData().then((data) => {
      if (data) preview3DState.caseData = data;
    });

    const meshFiles = await fetchParameterisedMeshForCase();
    if (meshFiles.length) {
      const undercut = await undercutPromise;
      init3DPreview(area);
      await populateJawPreviewFromOFF(meshFiles, undercut);
      return true;
    }

    const jawFiles = await fetchJawFilesForCase();
    if (!jawFiles.length) {
      teardown3DPreview();
      return false;
    }
    const undercut = await undercutPromise;
    init3DPreview(area);
    await populateJawPreview(jawFiles, undercut);
    return true;
  } finally {
    hidePreviewLoading(area);
  }
}

async function ensureThreeDeps() {
  if (THREE && TrackballControls && STLLoader) return true;
  try {
    const [threeMod, trackballMod, stlMod, utilsMod] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/TrackballControls.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/STLLoader.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js"),
    ]);
    THREE = threeMod;
    TrackballControls = trackballMod.TrackballControls;
    STLLoader = stlMod.STLLoader;
    threeMergeVertices = utilsMod.mergeVertices;
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
  if (preview3DState.scene) {
    preview3DState.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m?.dispose?.());
        } else {
          obj.material?.dispose?.();
        }
        obj.userData?.heatmapMaterial?.dispose?.();
        obj.userData?.flatMaterial?.dispose?.();
      }
    });
  }
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
  preview3DState.topControls = null;
  preview3DState.caseData = null;
  preview3DState.heatmapEnabled = false;
  preview3DState.heatmapToggleBtn = null;
  preview3DState.heatmapBoard = null;
  preview3DState.extrasGroup = null;
  preview3DState.loadedExtras = new Map();
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
      return list.filter((item) => item?.data && getJawKeyFromFile(item));
    } catch (err) {
      console.warn(`[preview3D] ✕ POST ${path} failed`, err);
      return [];
    }
  };

  // Primary STL source for preview: /stl/get.
  const all = await tryEndpoint(`${SMARTRPD_API_BASE}/stl/get`, payload);
  if (all.length) return all;

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
  return [...byJaw.values()];
}

function ensureUploadModalStyle() {
  if (document.getElementById("jp-upload-modal-style")) return;
  const style = document.createElement("style");
  style.id = "jp-upload-modal-style";
  style.textContent = `
    .jp-upload-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); z-index: 2500; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .jp-upload-card { width: min(560px, 100%); background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 18px 48px rgba(2, 6, 23, 0.25); }
    .jp-upload-title { margin: 0 0 6px; font-size: 18px; font-weight: 700; color: #0f172a; }
    .jp-upload-sub { margin: 0 0 12px; font-size: 12px; color: #64748b; line-height: 1.45; }
    .jp-upload-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
    .jp-upload-label { margin: 0; font-size: 13px; font-weight: 600; color: #1e293b; }
    .jp-upload-file { margin: 3px 0 0; font-size: 12px; color: #64748b; word-break: break-all; }
    .jp-upload-actions { margin-top: 12px; display: flex; justify-content: flex-end; }
    .jp-upload-close { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 8px; padding: 7px 12px; font-weight: 600; cursor: pointer; }
    .jp-upload-replace { border: 0; background: #0f766e; color: #fff; border-radius: 8px; padding: 8px 12px; font-weight: 600; cursor: pointer; }
    .jp-upload-replace:disabled, .jp-upload-close:disabled { opacity: 0.65; cursor: wait; }
    .jp-stl-list { list-style: none; margin: 0 0 10px; padding: 0; max-height: 260px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 10px; }
    .jp-stl-item { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .jp-stl-item:last-child { border-bottom: 0; }
    .jp-stl-toggle { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; cursor: pointer; font-size: 13px; color: #0f172a; }
    .jp-stl-toggle input { cursor: pointer; }
    .jp-stl-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .jp-stl-tag { flex-shrink: 0; font-size: 11px; font-weight: 700; color: #0f766e; background: #ccfbf1; padding: 2px 8px; border-radius: 999px; }
    .jp-stl-empty { padding: 14px 12px; font-size: 12px; color: #64748b; text-align: center; }
  `;
  document.head.appendChild(style);
}

async function openUploadOther3DFilesModal() {
  ensureUploadModalStyle();
  await ensureThreeDeps();

  let files = [];

  const overlay = document.createElement("div");
  overlay.className = "jp-upload-overlay";
  overlay.innerHTML = `
    <div class="jp-upload-card" role="dialog" aria-modal="true" aria-label="STL files">
      <h3 class="jp-upload-title">STL files for this case</h3>
      <p class="jp-upload-sub">Check a file to display it in the viewer. Picking a non-jaw STL replaces the upper/lower jaws in the view.</p>
      <ul class="jp-stl-list"></ul>
      <div style="margin: 10px 0;">
        <button type="button" class="jp-upload-replace" data-action="upload-more">Upload another STL</button>
      </div>
      <div class="jp-upload-actions">
        <button type="button" class="jp-upload-close">Close</button>
      </div>
    </div>
  `;

  const listEl = overlay.querySelector(".jp-stl-list");
  const uploadBtn = overlay.querySelector('[data-action="upload-more"]');
  const closeBtn = overlay.querySelector(".jp-upload-close");

  const isChecked = (file) => {
    const jaw = getJawKeyFromFile(file);
    if (jaw === "upper") return !!preview3DState.groups.upper?.visible;
    if (jaw === "lower") return !!preview3DState.groups.lower?.visible;
    const entry = preview3DState.loadedExtras.get(Number(file.type));
    return !!entry?.visible;
  };

  const applySelection = async (file, checked) => {
    const jaw = getJawKeyFromFile(file);
    if (jaw === "upper" || jaw === "lower") {
      setJawVisibility(jaw, checked);
      return;
    }
    const type = Number(file.type);
    if (checked) {
      if (!preview3DState.loadedExtras.has(type)) {
        await loadServerStlAsExtra(file);
      } else {
        const entry = preview3DState.loadedExtras.get(type);
        entry.mesh.visible = true;
        entry.visible = true;
      }
      // Replace semantics: hide the case's upper/lower jaws so the chosen
      // STL takes over the viewer. User can re-check upper/lower if they
      // want to see them alongside.
      setJawVisibility("upper", false);
      setJawVisibility("lower", false);
    } else {
      const entry = preview3DState.loadedExtras.get(type);
      if (entry) {
        entry.mesh.visible = false;
        entry.visible = false;
      }
    }
  };

  const renderListUI = () => {
    listEl.innerHTML = "";
    if (!files.length) {
      const empty = document.createElement("li");
      empty.className = "jp-stl-empty";
      empty.textContent = "No STL files in this case yet.";
      listEl.appendChild(empty);
      return;
    }
    for (const file of files) {
      const jaw = getJawKeyFromFile(file);
      const li = document.createElement("li");
      li.className = "jp-stl-item";

      const label = document.createElement("label");
      label.className = "jp-stl-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isChecked(file);
      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        try {
          await applySelection(file, checkbox.checked);
          renderListUI();
        } catch (err) {
          console.error("[preview3D] STL toggle failed", err);
          setMessage(`Failed to ${checkbox.checked ? "show" : "hide"} STL. ${err.message || err}`, true);
          checkbox.checked = !checkbox.checked;
        } finally {
          checkbox.disabled = false;
        }
      });

      const name = document.createElement("span");
      name.className = "jp-stl-name";
      const displayName = file.filename || `stl_${file.type ?? "x"}.stl`;
      name.textContent = displayName;
      name.title = displayName;

      const tag = document.createElement("span");
      tag.className = "jp-stl-tag";
      tag.textContent = jaw === "upper" ? "Upper" : jaw === "lower" ? "Lower" : `Type ${file.type ?? "?"}`;

      label.appendChild(checkbox);
      label.appendChild(name);
      label.appendChild(tag);
      li.appendChild(label);
      listEl.appendChild(li);
    }
  };

  const refresh = async () => {
    try {
      files = await fetchAllStlsForCase();
    } catch (err) {
      console.warn("[preview3D] fetchAllStlsForCase failed", err);
      files = [];
    }
    renderListUI();
  };

  const onUploadAnother = async () => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".stl,model/stl,application/sla";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (!/\.stl$/i.test(file.name || "")) {
        setMessage("Please select an STL file (.stl).", true);
        return;
      }
      uploadBtn.disabled = true;
      closeBtn.disabled = true;
      setMessage(`Uploading ${file.name}…`, false);
      try {
        const existing = await fetchAllStlsForCase();
        const maxType = existing.reduce((max, f) => {
          const t = Number(f.type);
          return Number.isFinite(t) && t > max ? t : max;
        }, 2);
        const type = maxType + 1;
        await uploadGenericStl(file, type);
        setMessage(`Uploaded ${file.name} as type ${type}.`, false);
        await refresh();
        // Auto-display the freshly uploaded STL: replaces upper/lower view.
        const newFile = files.find((f) => Number(f.type) === type);
        if (newFile) {
          await applySelection(newFile, true);
          renderListUI();
        }
      } catch (err) {
        console.error("[preview3D] generic STL upload failed", err);
        setMessage(`Upload failed. ${err.message || err}`, true);
      } finally {
        uploadBtn.disabled = false;
        closeBtn.disabled = false;
      }
    }, { once: true });
    picker.click();
  };

  uploadBtn.addEventListener("click", onUploadAnother);
  closeBtn.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  await refresh();
}

// Parse a server-fetched STL (base64 in file.data) and add a mesh to the
// shared extrasGroup so it renders alongside upper/lower in the viewer.
async function loadServerStlAsExtra(file) {
  if (!STLLoader || !THREE) {
    const ok = await ensureThreeDeps();
    if (!ok) throw new Error("3D dependencies failed to load");
  }
  if (!preview3DState.modelRoot) throw new Error("3D viewer is not ready");

  const buf = base64ToArrayBuffer(file.data);
  const loader = new STLLoader();
  let geometry = loader.parse(buf);
  geometry = mergeStlVertices(geometry);
  geometry.computeVertexNormals();

  // Match the upper-jaw dental tan from populateJawPreview.
  const material = new THREE.MeshStandardMaterial({
    color: 0xd7b794,
    metalness: 0.05,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = true;

  if (!preview3DState.extrasGroup) {
    preview3DState.extrasGroup = new THREE.Group();
    preview3DState.modelRoot.add(preview3DState.extrasGroup);
  }
  preview3DState.extrasGroup.add(mesh);

  const type = Number(file.type);
  preview3DState.loadedExtras.set(type, {
    mesh,
    visible: true,
    filename: file.filename || `stl_${type}.stl`,
  });

  centerRootOnCombinedBounds(preview3DState.modelRoot);
  fitPreviewCamera();
}

// Returns every STL row stored for this case (no jaw filter). POST /stl/get
// is the canonical list endpoint per the backend router (smart.findAllSTLs).
async function fetchAllStlsForCase() {
  if (!state.caseIntID) return [];
  const user = getLoggedInUser();
  if (!user?.uuid) return [];

  const payload = [
    { machine_id: PREVIEW_MACHINE_ID, uuid: user.uuid, caseIntID: state.caseIntID },
    { case_id: state.caseIntID, case_int_id: state.caseIntID, caseIntID: state.caseIntID },
  ];

  const t0 = performance.now();
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}/stl/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dt = Math.round(performance.now() - t0);
    const tag = res.ok ? "✓" : "✕";
    console.log(`[preview3D] ${tag} POST /stl/get (all) status=${res.status} ${dt}ms`);
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : [data];
    return list.filter((item) => item?.data || item?.filename);
  } catch (err) {
    console.warn("[preview3D] /stl/get (all) failed", err);
    return [];
  }
}

// POST /stl/ (smart.createSTL) — inserts a new STL row for this case. Unlike
// /stl/slot/, this doesn't upsert on a slot, so each call adds a new row.
// Caller supplies the type number (use the next free value beyond 1/2).
async function uploadGenericStl(file, type) {
  if (!state.caseIntID) throw new Error("Missing case id");
  const user = getLoggedInUser();
  if (!user?.uuid) throw new Error("You must be logged in");

  const base64 = await fileToBase64(file);
  const payload = [
    { machine_id: PREVIEW_MACHINE_ID, uuid: user.uuid, caseIntID: state.caseIntID },
    {
      case_id: state.caseIntID,
      case_int_id: state.caseIntID,
      caseIntID: state.caseIntID,
      type,
      data: base64,
      filename: file.name || `stl_${type}.stl`,
    },
  ];

  const endpoint = `${SMARTRPD_API_BASE}/stl/`;
  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const dt = Math.round(performance.now() - t0);
  const tag = res.ok ? "✓" : "✕";
  console.log(`[preview3D] ${tag} POST /stl/ type=${type} status=${res.status} ${dt}ms`);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    throw new Error(`Upload failed (${res.status}) ${body.slice(0, 160)}`);
  }
}

function setJawVisibility(jaw, visible) {
  const group = preview3DState.groups[jaw];
  if (!group) return;
  group.visible = !!visible;
  const rowKey = jaw === "upper" ? "rowUpper" : "rowLower";
  const row = preview3DState.topControls?.[rowKey]?.row;
  row?.classList.toggle("is-hidden-jaw", !visible);
}

// POST /stl/slot/ (smart.createSlotSTL) — upserts the STL stored in the
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event?.target?.result;
        if (!arrayBuffer) {
          reject(new Error("No file buffer found"));
          return;
        }
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        resolve(btoa(binary));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed reading STL file"));
    reader.readAsArrayBuffer(file);
  });
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

async function fetchCaseData() {
  if (!state.caseIntID) return null;
  const user = getLoggedInUser();
  const uuid = user?.uuid || PREVIEW_FALLBACK_UUID;
  const path = `/case/get/${state.caseIntID}`;
  const t0 = performance.now();
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: PREVIEW_MACHINE_ID, uuid, caseIntID: state.caseIntID },
      ]),
    });
    const dt = Math.round(performance.now() - t0);
    const tag = res.ok ? "✓" : "✕";
    console.log(`[preview3D] ${tag} POST ${path} status=${res.status} ${dt}ms`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[preview3D] ✕ POST ${path} failed`, err);
    return null;
  }
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

  const footer = document.createElement("div");
  footer.className = "jaw-preview-footer";
  footer.innerHTML = `
    <button type="button" class="jaw-preview-footer-btn" data-action="upload-other-3d">Upload Other 3D Files</button>
    <button type="button" class="jaw-preview-footer-btn">Download Jaw Profile</button>
  `;
  const uploadOther3DBtn = footer.querySelector('[data-action="upload-other-3d"]');
  uploadOther3DBtn?.addEventListener("click", () => {
    openUploadOther3DFilesModal().catch((err) => {
      console.error("[preview3D] openUploadOther3DFilesModal failed", err);
      setMessage(`Failed to open upload dialog. ${err.message || err}`, true);
    });
  });

  const cameraBtn = document.createElement("button");
  cameraBtn.type = "button";
  cameraBtn.className = "jaw-preview-camera";
  cameraBtn.title = "Save screenshot to noticeboard";
  cameraBtn.setAttribute("aria-label", "Save screenshot to noticeboard");
  cameraBtn.innerHTML = `<i class="fa-solid fa-camera" aria-hidden="true"></i>`;

  shell.appendChild(toolbar);
  shell.appendChild(mount);
  mount.appendChild(undercut);
  mount.appendChild(cameraBtn);
  shell.appendChild(footer);
  area.appendChild(shell);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xffffff, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 40, 160);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xfff1f5, 1.55);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(80, 140, 120);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.65);
  fillLight.position.set(-90, 60, -40);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
  rimLight.position.set(0, -100, -80);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
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

  cameraBtn.addEventListener("click", async () => {
    if (cameraBtn.disabled) return;
    cameraBtn.disabled = true;
    cameraBtn.classList.add("is-flash");
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
      setTimeout(() => {
        cameraBtn.classList.remove("is-flash");
        cameraBtn.disabled = false;
      }, 400);
    }
  });

  // Intentionally keep ALLOW PROCESSING checkboxes as display-only (no jaw visibility behavior).

  const onIconToggleUpper = () => {
    if (!preview3DState.groups.upper) return;
    const visible = !preview3DState.groups.upper.visible;
    preview3DState.groups.upper.visible = visible;
    rowUpper.row.classList.toggle("is-hidden-jaw", !visible);
  };
  const onIconToggleLower = () => {
    if (!preview3DState.groups.lower) return;
    const visible = !preview3DState.groups.lower.visible;
    preview3DState.groups.lower.visible = visible;
    rowLower.row.classList.toggle("is-hidden-jaw", !visible);
  };
  rowUpper.iconEl.addEventListener("click", onIconToggleUpper);
  rowLower.iconEl.addEventListener("click", onIconToggleLower);
  rowUpper.iconEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onIconToggleUpper();
    }
  });
  rowLower.iconEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onIconToggleLower();
    }
  });

  const handleJawDelete = async (jaw, row, btn) => {
    if (btn.disabled) return;
    const label = jaw === "upper" ? "upper" : "lower";
    const confirmed = await showConfirmModal({
      title: `Hide ${label} jaw`,
      message: `Hide the ${label} jaw in this viewer only? The STL stays in the case and can be re-shown from the Upload Other 3D Files list.`,
      confirmLabel: "Hide",
      cancelLabel: "Cancel",
      danger: false,
    });
    if (!confirmed) return;
    btn.disabled = true;
    try {
      // Hide-only — keep the group attached so the modal list can re-show it
      // and the data isn't disposed.
      setJawVisibility(jaw, false);
      setMessage(`${label.charAt(0).toUpperCase() + label.slice(1)} jaw hidden from viewer.`, false);
    } finally {
      btn.disabled = false;
    }
  };
  rowUpper.deleteBtn.addEventListener("click", () =>
    handleJawDelete("upper", rowUpper.row, rowUpper.deleteBtn)
  );
  rowLower.deleteBtn.addEventListener("click", () =>
    handleJawDelete("lower", rowLower.row, rowLower.deleteBtn)
  );

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
  const flatUpper = new THREE.MeshStandardMaterial({ color: 0xd7b794, metalness: 0.05, roughness: 0.6 });
  const flatLower = new THREE.MeshStandardMaterial({ color: 0xc8a882, metalness: 0.05, roughness: 0.62 });

  for (const file of jawFiles) {
    const upper = isUpper(file);
    const primarySurface = upper ? undercut?.upper : undercut?.lower;
    const secondarySurface = upper ? undercut?.lower : undercut?.upper;

    const surveyingVerts = (surface) => {
      const bytes = surface?.surveying_values?.data;
      if (!bytes?.length) return 0;
      return Math.floor(new Float32Array(new Uint8Array(bytes).buffer).length / 4);
    };

    let geometry = loader.parse(base64ToArrayBuffer(file.data));
    let useHeatmap = false;

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
    geometry.computeVertexNormals();

    const heatMat = heatmapMaterial.clone();
    const flatMat = (upper ? flatUpper : flatLower).clone();
    const activeMat = (useHeatmap && preview3DState.heatmapEnabled) ? heatMat : flatMat;
    const mesh = new THREE.Mesh(geometry, activeMat);
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
  if (preview3DState.topControls) {
    preview3DState.topControls.rowUpper.row.style.display = preview3DState.groups.upper ? "grid" : "none";
    preview3DState.topControls.rowLower.row.style.display = preview3DState.groups.lower ? "grid" : "none";
  }
  applyJawVisibility();
  fitPreviewCamera();
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
  if (preview3DState.topControls) {
    preview3DState.topControls.rowUpper.row.style.display = preview3DState.groups.upper ? "grid" : "none";
    preview3DState.topControls.rowLower.row.style.display = preview3DState.groups.lower ? "grid" : "none";
  }
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

/**
 * Strip non-position attributes so Three.js's mergeVertices dedupes by position
 * alone — STL geometries carry per-face normals that would otherwise prevent
 * the merge from collapsing coincident corners.
 */
function dedupViaThreeJs(geometry, tolerance) {
  if (!threeMergeVertices || !THREE) return null;
  const positionsOnly = new THREE.BufferGeometry();
  positionsOnly.setAttribute("position", geometry.getAttribute("position").clone());
  return threeMergeVertices(positionsOnly, tolerance);
}

/**
 * Binary-search a single dedup algorithm for the threshold that yields the
 * count closest to targetCount. Returns { geometry, diff, threshold }.
 */
function searchAlgorithmToTarget(geometry, targetCount, dedupFn) {
  let lo = 1e-6;
  let hi = 1e-1;
  let bestGeom = null;
  let bestDiff = Infinity;
  let bestThreshold = null;

  const tryThreshold = (t) => {
    const m = dedupFn(geometry, t);
    if (!m) return Infinity;
    const count = m.attributes.position.count;
    const diff = Math.abs(count - targetCount);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestGeom = m;
      bestThreshold = t;
    }
    return count;
  };

  // Phase 1: binary search for the crossing.
  for (let iter = 0; iter < 28; iter += 1) {
    const mid = Math.sqrt(lo * hi);
    const count = tryThreshold(mid);
    if (bestDiff === 0) return { geometry: bestGeom, diff: 0, threshold: bestThreshold };
    if (count > targetCount) lo = mid;
    else hi = mid;
    if (hi / lo < 1.0001) break;
  }

  // Phase 2: nudge around the best to escape count plateaus.
  if (bestDiff > 0 && bestThreshold != null) {
    for (const factor of [0.95, 0.97, 0.99, 1.01, 1.03, 1.05, 0.9, 1.1]) {
      tryThreshold(bestThreshold * factor);
      if (bestDiff === 0) break;
    }
  }

  return { geometry: bestGeom, diff: bestDiff, threshold: bestThreshold };
}

/**
 * Dedup geometry to hit a target vertex count, trying both our grid-rounding
 * algorithm and Three.js's hash-based mergeVertices — they bucket differently,
 * so different targets fall on each one's reachable count curve.
 *
 * Returns { geometry, matched, diff, algorithm } where algorithm is "grid" or
 * "three" indicating which one won.
 */
function mergeStlVerticesToTarget(geometry, targetCount) {
  if (!Number.isFinite(targetCount) || targetCount <= 0) {
    const m = mergeStlVertices(geometry);
    return { geometry: m, matched: false, diff: Infinity, algorithm: "grid" };
  }

  const ours = searchAlgorithmToTarget(geometry, targetCount, mergeStlVerticesWithThreshold);

  // Skip Three's algorithm if it isn't loaded yet.
  if (!threeMergeVertices) {
    return { geometry: ours.geometry, matched: ours.diff === 0, diff: ours.diff, algorithm: "grid" };
  }

  const theirs = searchAlgorithmToTarget(geometry, targetCount, dedupViaThreeJs);
  const winner = ours.diff <= theirs.diff
    ? { ...ours, algorithm: "grid" }
    : { ...theirs, algorithm: "three" };

  return {
    geometry: winner.geometry,
    matched: winner.diff === 0,
    diff: winner.diff,
    algorithm: winner.algorithm,
  };
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

function base64ToArrayBuffer(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
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

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "jaw-preview-delete-btn";
  deleteBtn.setAttribute("aria-label", `Hide ${jaw} jaw`);
  deleteBtn.title = `Hide ${jaw} jaw`;
  deleteBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2h-6a2 2 0 01-2-2V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const surveyBtn = document.createElement("button");
  surveyBtn.type = "button";
  surveyBtn.className = "jaw-preview-survey-btn";
  surveyBtn.textContent = "SET SURVEY ANGLE";

  row.appendChild(iconEl);
  row.appendChild(allowWrap);
  row.appendChild(deleteBtn);
  row.appendChild(surveyBtn);
  return { row, toggle, deleteBtn, surveyBtn, iconEl };
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

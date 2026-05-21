import { state } from "./2DAnnotation.js";

let THREE = null;
let OrbitControls = null;
let STLLoader = null;

const PREVIEW_MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const PREVIEW_FALLBACK_UUID = "AC4gRQXZJoNz9EhhW36Q8jMJXBsf";
const SMARTRPD_API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
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
  if (THREE && OrbitControls && STLLoader) return true;
  try {
    const [threeMod, orbitMod, stlMod] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/STLLoader.js"),
    ]);
    THREE = threeMod;
    OrbitControls = orbitMod.OrbitControls;
    STLLoader = stlMod.STLLoader;
    return true;
  } catch (err) {
    console.error("Failed loading three.js dependencies", err);
    return false;
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
}

function getLoggedInUser() {
  try {
    const raw = localStorage.getItem("loggedInUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchJawFilesForCase() {
  if (!state.caseIntID) return [];
  const user = getLoggedInUser();
  if (!user?.uuid) return [];

  const payload = [
    { machine_id: PREVIEW_MACHINE_ID, uuid: user.uuid, caseIntID: state.caseIntID },
    { case_int_id: state.caseIntID },
  ];

  const endpoints = [
    `${SMARTRPD_API_BASE}/stl/raw/get`,
    `${SMARTRPD_API_BASE}/stl/get`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      const filtered = list.filter((item) => {
        if (!item?.data) return false;
        const type = String(item.type || item.jaw_type || "").toLowerCase();
        const name = String(item.filename || "").toLowerCase();
        return type.includes("upper") || type.includes("lower") || name.includes("upper") || name.includes("lower");
      });
      if (filtered.length) return filtered;
    } catch {
      // Try fallback endpoint.
    }
  }
  return [];
}

async function fetchParameterisedMeshForCase() {
  if (!state.caseIntID) return [];

  // Use the hardcoded service uuid (same as src/index.js) — the parameterisation
  // endpoint scopes by uuid and the logged-in user's uuid 404s here even though
  // the heatmap endpoint accepts it.
  const data = {
    machine_id: PREVIEW_MACHINE_ID,
    uuid: PREVIEW_FALLBACK_UUID,
    case_int_id: state.caseIntID,
    caseIntID: state.caseIntID,
    jaw_type: 2,
  };

  // Try multiple known endpoint spellings/variants because some deployments use
  // parameterisation, others parameterization, and some expose mesh under surface.
  const endpoints = [
    "/parameterisation/mesh/getall",
    "/parameterization/mesh/getall",
    "/surface/getall",
    "/surface/mesh/getall",
  ];
  const collected = [];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${SMARTRPD_API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([data]),
      });
      if (!res.ok) {
        console.warn(`[preview3D] ${endpoint} HTTP ${res.status}`);
        continue;
      }
      const body = await res.json();
      const list = Array.isArray(body) ? body : [body];
      for (const item of list) {
        if (!item?.data) continue;
        const type = String(item.type || item.jaw_type || "").toLowerCase();
        const name = String(item.filename || "").toLowerCase();
        const isJaw = type.includes("upper") || type.includes("lower") || name.includes("upper") || name.includes("lower");
        const isClosedVariant = name.includes("closed");
        if (isJaw && !isClosedVariant) collected.push(item);
      }
      if (collected.length) break;
    } catch (err) {
      console.warn(`[preview3D] ${endpoint} fetch failed:`, err);
    }
  }
  return collected;
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
    try {
      const res = await fetch(`${SMARTRPD_API_BASE}/undercutheatmap/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody, jaw_type: jawType }),
      });
      if (!res.ok) {
        console.warn(`[preview3D] undercut ${label} HTTP ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn(`[preview3D] undercut ${label} fetch failed:`, err);
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
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}/case/get/${state.caseIntID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: PREVIEW_MACHINE_ID, uuid, caseIntID: state.caseIntID },
      ]),
    });
    if (!res.ok) {
      console.warn(`[preview3D] case/get HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[preview3D] case/get failed:", err);
    return null;
  }
}

// Capture the OrbitControls camera position as an XYZ Euler. X = pitch from the
// horizontal plane (asin of the y component), Y = azimuth around the world up
// axis, Z = 0 since orbit cameras have no roll. Stored in radians to match the
// DECIMAL(9,8) range in the cases table.
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

function reapplyHeatmap(undercut) {
  const repaint = (group, surface) => {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        applyUndercutVertexColors(obj.geometry, surface);
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

  try {
    const res = await fetch(`${SMARTRPD_API_BASE}/case/${state.caseIntID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([auth, caseBody]),
    });
    if (!res.ok) {
      console.error(`[preview3D] PUT /case HTTP ${res.status}`);
      return;
    }
    preview3DState.caseData = updated;

    const newUndercut = await fetchUndercutForCase();
    reapplyHeatmap(newUndercut);
  } catch (err) {
    console.error("[preview3D] PUT /case failed:", err);
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
  undercut.className = "jaw-preview-undercut";
  undercut.innerHTML = `
    <div class="jaw-preview-undercut-title">Undercut (mm)</div>
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

  const footer = document.createElement("div");
  footer.className = "jaw-preview-footer";
  footer.innerHTML = `
    <button type="button" class="jaw-preview-footer-btn">Upload Other 3D Files</button>
    <button type="button" class="jaw-preview-footer-btn">Download Jaw Profile</button>
  `;

  shell.appendChild(toolbar);
  shell.appendChild(mount);
  mount.appendChild(undercut);
  shell.appendChild(footer);
  area.appendChild(shell);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.7;
  controls.panSpeed = 0.55;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 35;
  controls.maxDistance = 700;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
  controls.target.set(0, 0, 0);

  rowUpper.surveyBtn.addEventListener("click", () =>
    saveSurveyAngle("upper", rowUpper.surveyBtn)
  );
  rowLower.surveyBtn.addEventListener("click", () =>
    saveSurveyAngle("lower", rowLower.surveyBtn)
  );

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

  rowUpper.deleteBtn.addEventListener("click", () => {
    if (preview3DState.groups.upper) {
      preview3DState.groups.upper.visible = false;
      rowUpper.row.classList.add("is-hidden-jaw");
    }
  });
  rowLower.deleteBtn.addEventListener("click", () => {
    if (preview3DState.groups.lower) {
      preview3DState.groups.lower.visible = false;
      rowLower.row.classList.add("is-hidden-jaw");
    }
  });

  preview3DState.renderer = renderer;
  preview3DState.scene = scene;
  preview3DState.camera = camera;
  preview3DState.controls = controls;
  preview3DState.mount = mount;
  preview3DState.modelRoot = modelRoot;
  preview3DState.groups = { upper: null, lower: null };
  preview3DState.activeView = "both";
  preview3DState.topControls = { rowUpper, rowLower };

  const resize = () => {
    const rect = mount.getBoundingClientRect();
    const w = Math.max(220, Math.floor(rect.width));
    const h = Math.max(220, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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
    const merged = mergeStlVertices(geometry);
    const mergedVerts = merged.attributes.position.count;

    const candidates = [
      { label: upper ? "upper" : "lower", surface: primarySurface },
      { label: upper ? "lower" : "upper", surface: secondarySurface },
    ];

    let picked = null;
    for (const c of candidates) {
      const heatmapVerts = surveyingVerts(c.surface);
      if (heatmapVerts > 0 && heatmapVerts === mergedVerts) {
        picked = c;
        break;
      }
    }

    // No exact match — fall back to the primary (same-jaw) surface if it has heatmap
    // data. The backend's dedup threshold can differ slightly from ours (e.g. 130613 vs
    // 127895 verts on the lower jaw); applyUndercutVertexColors clips to the shorter
    // length so trailing verts simply keep the default tooth color.
    if (!picked && surveyingVerts(primarySurface) > 0) {
      picked = { label: upper ? "upper" : "lower", surface: primarySurface };
      console.warn("[preview3D] vertex/heatmap count mismatch — applying partial heatmap", {
        file: file?.filename || file?.type || "unknown",
        mergedVerts,
        primaryHeatmapVerts: surveyingVerts(primarySurface),
        oppositeHeatmapVerts: surveyingVerts(secondarySurface),
      });
    }

    if (picked) {
      geometry = merged;
      applyUndercutVertexColors(geometry, picked.surface);
      useHeatmap = true;
      if (picked.surface !== primarySurface) {
        console.warn("[preview3D] used opposite-jaw heatmap due to vertex match", {
          file: file?.filename || file?.type || "unknown",
          expectedJaw: upper ? "upper" : "lower",
          usedJaw: picked.label,
          mergedVerts,
        });
      }
    }
    geometry.computeVertexNormals();

    const material = useHeatmap ? heatmapMaterial.clone() : (upper ? flatUpper : flatLower);
    const mesh = new THREE.Mesh(geometry, material);
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

  for (const file of meshFiles) {
    const offText = atob(file.data);
    const geometry = parseOFFToGeometry(offText);
    if (!geometry) continue;

    const upper = isUpper(file);
    const surface = upper ? undercut?.upper : undercut?.lower;
    applyUndercutVertexColors(geometry, surface);

    const mesh = new THREE.Mesh(geometry, meshMaterial.clone());
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
function mergeStlVertices(geometry) {
  const threshold = 1e-4;
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

function applyUndercutVertexColors(geometry, surface) {
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
    // When counts differ (backend dedup vs frontend dedup), color the overlapping
    // prefix and leave the rest as default — better than skipping the heatmap entirely.
    const limit = Math.min(vertexCount, heatmapVerts);
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
  controls.saveState();
}

function base64ToArrayBuffer(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function isUpper(file) {
  const type = String(file?.type || file?.jaw_type || "").toLowerCase();
  const name = String(file?.filename || "").toLowerCase();
  return type.includes("upper") || name.includes("upper");
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

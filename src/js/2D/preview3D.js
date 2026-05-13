import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { state } from "./2DAnnotation.js";

const PREVIEW_MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
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
};

export async function loadInteractiveJawPreview(area) {
  showPreviewLoading(area, "Loading 3D jaws...");
  try {
    const jawFiles = await fetchJawFilesForCase();
    if (!jawFiles.length) {
      teardown3DPreview();
      return false;
    }
    init3DPreview(area);
    await populateJawPreview(jawFiles);
    return true;
  } finally {
    hidePreviewLoading(area);
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
    "https://live.api.smartrpdai.com/api/smartrpd/stl/raw/get",
    "https://live.api.smartrpdai.com/api/smartrpd/stl/get",
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

  rowUpper.surveyBtn.addEventListener("click", () => controls.reset());
  rowLower.surveyBtn.addEventListener("click", () => controls.reset());

  rowUpper.toggle.addEventListener("change", () => {
    if (preview3DState.groups.upper) {
      preview3DState.groups.upper.visible = rowUpper.toggle.checked;
    }
  });
  rowLower.toggle.addEventListener("change", () => {
    if (preview3DState.groups.lower) {
      preview3DState.groups.lower.visible = rowLower.toggle.checked;
    }
  });

  rowUpper.deleteBtn.addEventListener("click", () => {
    rowUpper.toggle.checked = false;
    if (preview3DState.groups.upper) preview3DState.groups.upper.visible = false;
  });
  rowLower.deleteBtn.addEventListener("click", () => {
    rowLower.toggle.checked = false;
    if (preview3DState.groups.lower) preview3DState.groups.lower.visible = false;
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

async function populateJawPreview(jawFiles) {
  const loader = new STLLoader();
  const upperGroup = new THREE.Group();
  const lowerGroup = new THREE.Group();
  const materialUpper = new THREE.MeshStandardMaterial({ color: 0xd7b794, metalness: 0.05, roughness: 0.6 });
  const materialLower = new THREE.MeshStandardMaterial({ color: 0xc8a882, metalness: 0.05, roughness: 0.62 });

  for (const file of jawFiles) {
    const geometry = loader.parse(base64ToArrayBuffer(file.data));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, isUpper(file) ? materialUpper : materialLower);
    if (isUpper(file)) {
      upperGroup.add(mesh);
    } else {
      lowerGroup.add(mesh);
    }
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
  return { row, toggle, deleteBtn, surveyBtn };
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

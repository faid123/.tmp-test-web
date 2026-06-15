// Import the THREE.js library
import * as THREE from "three";
// To allow for the camera to move around the scene
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import { STLMeshLoader } from "./STLMeshLoader.js";

// Import the OFFLoader class
import { OFFLoader } from "./OFFLoader.js";
// Import the ApiClient class
import { ApiClient } from "./ApiClient.js";

import { addResetButton } from "./resetButton.js";
import { lol } from "./crypt.js";
import {
  addVisibilityAndTransparencyControls,
  removeVisibilityAndTransparencyControls,
} from "./newControls.js";
import { createArtificialTeethRenderer } from "./artificialTeeth.js";

const LOG_VIEWER_LOAD_TIMINGS_TO_CONSOLE = false;
const LOG_VIEWER_OBJECT_COUNTS_TO_CONSOLE = false;
const LOG_VIEWER_REVISION_TO_CONSOLE = true;
const LOG_POLYLINE_AUTO_AUDITS_TO_CONSOLE = false;
const LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE = false;
const LOG_ARTIFICIAL_TEETH_STATUS_TO_CONSOLE = false;

function startViewerLoadTimer(label) {
  if (LOG_VIEWER_LOAD_TIMINGS_TO_CONSOLE) {
    console.time(label);
  }
}

function endViewerLoadTimer(label) {
  if (LOG_VIEWER_LOAD_TIMINGS_TO_CONSOLE) {
    console.timeEnd(label);
  }
}

if (LOG_VIEWER_REVISION_TO_CONSOLE) {
  console.log(THREE.REVISION);
}

//initialise everything

let all_mesh_mat = {};
window.finished = false;
const viewerContainer = document.getElementById("container3D");

// Get the current URL
const url = new URL(window.location.href);

// Get the value of a specific query parameter, e.g., "param"
let paramValue = url.searchParams.get("id");
const close = url.searchParams.get("close");

//decrypts the paramvalue
//if doing testing with test cases jus comment it out
//paramValue = lol(paramValue);

if (!paramValue) {
  console.error("Missing case id in URL");
  // either stop here or handle fallback
} else {
  paramValue = lol(paramValue);
}

// Create a Three.JS Scene
const scene = new THREE.Scene();
// Create a new camera with positions and angles
let camera;
camera = new THREE.OrthographicCamera(
  window.innerWidth / -2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  window.innerHeight / -2,
  -500,
  1000
);

let undercut_type = {};
// Keep the 3D object on a global variable so we can access it later

// OrbitControls allow the camera to move around the scene
let controls;
let orb_controls;

function getViewerStageSize() {
  const rect = viewerContainer?.getBoundingClientRect?.();
  return {
    width: Math.max(1, Math.round(rect?.width || window.innerWidth)),
    height: Math.max(1, Math.round(rect?.height || window.innerHeight)),
  };
}

function resizeViewerStage(renderer) {
  if (!renderer || !camera) return;
  const { width, height } = getViewerStageSize();
  camera.left = width / -2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = height / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

// Set which object to render
let objToRender = "dino";
let mesh_geo;

// Create a material
const material = new THREE.MeshPhongMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1,
  depthTest: true,
  depthWrite: true,
});
const materialsurface = new THREE.MeshStandardMaterial({
  color: 0xa0a0a0, // Base color
  metalness: 0.75, // Fully metallic
  roughness: 0.2, // Smooth surface
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1,
  depthTest: true,
  depthWrite: true,
});
const materialsurface_non_metal = new THREE.MeshStandardMaterial({
  color: 0xa0a0a0, // Base color
  metalness: 0, // Fully metallic
  roughness: 0.2, // Smooth surface
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1,
  depthTest: true,
  depthWrite: true,
});

// Create an instance of the ApiClient with the base URL
const apiClient = new ApiClient("https://live.api.smartrpdai.com/api/smartrpd");
const parentObject = new THREE.Object3D();
scene.add(parentObject);
const artificialTeethRenderer = createArtificialTeethRenderer({
  scene,
  parentObject,
  camera,
  apiClient,
  onPerformance: (stage, durationMs, details = {}) => {
    addViewerLoadTiming(stage, durationMs, details);
  },
  onStatus: (label, progress = 0, autoHide = false) => {
    window.lastArtificialTeethStatus = { label, progress, autoHide };
    window.updateViewerLoading?.(label);
    if (LOG_ARTIFICIAL_TEETH_STATUS_TO_CONSOLE) {
      console.log("[artificial teeth]", label, progress);
    }
  },
});
const polylineOverlayGroup = new THREE.Group();
polylineOverlayGroup.name = "polyline-overlay-group";
scene.add(polylineOverlayGroup);
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 5;
const pointer = new THREE.Vector2();
const POLYLINE_ENDPOINT = "/polylines/getall";
const polylineDragPlane = new THREE.Plane();
const polylineDragPoint = new THREE.Vector3();
const polylineCameraDirection = new THREE.Vector3();
const polylineHandleGeometry = new THREE.SphereGeometry(1.05, 24, 16);
const polylineHandleMaterial = new THREE.MeshStandardMaterial({
  color: 0xff8a00,
  opacity: 1,
  roughness: 0.3,
  metalness: 0,
  transparent: false,
  depthTest: true,
  depthWrite: false,
});
const POLYLINE_TUBE_RADIUS = 0.75;
const POLYLINE_TUBE_RADIAL_SEGMENTS = 8;
let isPolylineOverlayVisible = true;
let activePolylineDrag = null;
let polylineMenuButton = null;
let polylineMenuList = null;
let polylineDepthTestEnabled = true;
const polylineUndoStack = [];
const polylineRedoStack = [];
let polylinePreDragSnapshot = null;
let polylineUndoBtn = null;
let polylineRedoBtn = null;
const polylineComponentVisibility = new Map();
const polylineJawVisibility = new Map([
  ["upper", true],
  ["lower", true],
]);
const polylineJawOpacity = new Map([
  ["upper", 1],
  ["lower", 1],
]);
const polylineDiagnostics = {
  base64DecodeMs: 0,
  base64DecodeCount: 0,
  textParseMs: 0,
  textParseCount: 0,
};
const viewerLoadTimings = [];
const viewerMeshTimings = [];
let hasLoggedFirstSceneRender = false;
const viewerRotationOrigin = new THREE.Vector3(0, 0, 0);
let viewerRotationBoundsRadius = 40;
let hasViewerRotationOrigin = false;
const VIEWER_TARGET_MIN_DRIFT_LIMIT = 45;
let isViewerLeftButtonRotating = false;
const viewerRotationTargetAnchor = new THREE.Vector3();

const POLYLINE_COMPONENT_COLORS = [
  0x6f35ff,
  0x00a6ff,
  0xff8a00,
  0x1fc16b,
  0xff4f81,
  0xffd400,
];
const POLYLINE_APP_COMPONENTS = [
  "Retainer",
  "Lingual Clasp",
  "MajorConnector",
  "Proximal Plate",
  "Rest",
  "Minor Conn",
  "Mesh",
  "Reversal Line",
  "Gingival Points",
];
const POLYLINE_TEXT_COMPONENTS = [
  "retentionPins",
  "retainer",
  "tissueStop",
  "mesh",
  "reversalLine",
  "proximalPlate",
  "proximalPlates",
  "endingProximalPlate",
  "startingProximalPlate",
  "majorConnector",
  "GingivalPoints",
  "reciprocatingArm",
  "rests",
  "rest",
  "minorConnectorTooth",
];
const POLYLINE_TEXT_COMPONENT_PATTERN = new RegExp(
  `^(${POLYLINE_TEXT_COMPONENTS.join("|")})\\b`,
  "i"
);
const POLYLINE_TEXT_DETECTION_PATTERN = new RegExp(
  `nodeCount|${POLYLINE_TEXT_COMPONENTS.join("|")}`,
  "i"
);

function resetPolylineDiagnostics() {
  polylineDiagnostics.base64DecodeMs = 0;
  polylineDiagnostics.base64DecodeCount = 0;
  polylineDiagnostics.textParseMs = 0;
  polylineDiagnostics.textParseCount = 0;
}

function logPolylineDiagnostics() {
  if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) {
    console.log("[viewer: polyline diagnostics]", {
      base64Decodes: polylineDiagnostics.base64DecodeCount,
      base64DecodeMs: Number(polylineDiagnostics.base64DecodeMs.toFixed(2)),
      textParses: polylineDiagnostics.textParseCount,
      textParseMs: Number(polylineDiagnostics.textParseMs.toFixed(2)),
    });
    console.log(
      `viewer: decode polylines: ${polylineDiagnostics.base64DecodeMs.toFixed(2)} ms`
    );
    console.log(
      `viewer: parse polylines: ${polylineDiagnostics.textParseMs.toFixed(2)} ms`
    );
  }
  addViewerLoadTiming(
    "decode polylines",
    polylineDiagnostics.base64DecodeMs,
    { count: polylineDiagnostics.base64DecodeCount }
  );
  addViewerLoadTiming(
    "parse polylines",
    polylineDiagnostics.textParseMs,
    { count: polylineDiagnostics.textParseCount }
  );
}

function addViewerLoadTiming(stage, durationMs, details = {}) {
  const entry = {
    stage,
    durationMs: Number(durationMs.toFixed(2)),
    ...details,
  };
  viewerLoadTimings.push(entry);
  window.viewerLoadTimings = viewerLoadTimings;
  return entry;
}

function addViewerMeshTiming(entry) {
  viewerMeshTimings.push({
    ...entry,
    decodeMs: Number((entry.decodeMs || 0).toFixed(2)),
    parseMs: Number((entry.parseMs || 0).toFixed(2)),
    addMs: Number((entry.addMs || 0).toFixed(2)),
    totalMs: Number((entry.totalMs || 0).toFixed(2)),
  });
  window.viewerMeshTimings = viewerMeshTimings;
}

function logViewerPerformanceSummary() {
  if (!LOG_VIEWER_LOAD_TIMINGS_TO_CONSOLE) return;
  const sortedStages = [...viewerLoadTimings].sort(
    (a, b) => b.durationMs - a.durationMs
  );
  console.groupCollapsed("[viewer: performance summary]");
  console.table(sortedStages);
  if (viewerMeshTimings.length) {
    console.table(
      [...viewerMeshTimings].sort((a, b) => b.totalMs - a.totalMs)
    );
  }
  console.groupEnd();
}

function saveAnnotationBackground(storageKey, dataUrl) {
  try {
    localStorage.setItem(storageKey, dataUrl);
    return true;
  } catch (err) {
    console.warn("Failed to save annotation background in localStorage.", err);
    return false;
  }
}

// ── Hamburger menu ──────────────────────────────────────────────────────────

function createHamburgerButton() {
  if (document.getElementById("sidebar-hamburger-btn")) return;
  const overlayHost = viewerContainer || document.body;

  const btn = document.createElement("button");
  btn.id = "sidebar-hamburger-btn";
  btn.setAttribute("aria-label", "More controls");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="22" height="2.5" rx="1.25" fill="currentColor"/>
    <rect y="7.75" width="22" height="2.5" rx="1.25" fill="currentColor"/>
    <rect y="15.5" width="22" height="2.5" rx="1.25" fill="currentColor"/>
  </svg>`;
  btn.addEventListener("click", toggleHamburgerDrawer);
  overlayHost.appendChild(btn);

  const backdrop = document.createElement("div");
  backdrop.id = "hamburger-backdrop";
  backdrop.addEventListener("click", closeHamburgerDrawer);
  overlayHost.appendChild(backdrop);

  const drawer = document.createElement("div");
  drawer.id = "hamburger-drawer";

  const header = document.createElement("div");
  header.id = "hamburger-drawer-header";
  const title = document.createElement("span");
  title.textContent = "Controls";
  const closeBtn = document.createElement("button");
  closeBtn.id = "hamburger-drawer-close";
  closeBtn.setAttribute("aria-label", "Close menu");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", closeHamburgerDrawer);
  header.appendChild(title);
  header.appendChild(closeBtn);
  drawer.appendChild(header);

  const content = document.createElement("div");
  content.id = "hamburger-drawer-content";
  drawer.appendChild(content);

  overlayHost.appendChild(drawer);
}

function populateHamburgerDrawer() {
  const content = document.getElementById("hamburger-drawer-content");
  const nav = getViewerRightNav();
  if (!content || !nav) return;

  [
    nav.querySelector("#component-panel-toggle"),
    nav.querySelector("#polyline-visibility-menu"),
    nav.querySelector(".smart-btn-container-3d"),
    nav.querySelector("#viewer-meta-dates"),
  ]
    .filter(Boolean)
    .forEach((el) => content.appendChild(el));
}

function toggleHamburgerDrawer() {
  const drawer = document.getElementById("hamburger-drawer");
  const btn = document.getElementById("sidebar-hamburger-btn");
  if (!drawer) return;
  populateHamburgerDrawer();
  const isOpen = drawer.classList.toggle("open");
  document.getElementById("hamburger-backdrop")?.classList.toggle("open", isOpen);
  btn?.setAttribute("aria-expanded", String(isOpen));
}

function closeHamburgerDrawer() {
  document.getElementById("hamburger-drawer")?.classList.remove("open");
  document.getElementById("hamburger-backdrop")?.classList.remove("open");
  document.getElementById("sidebar-hamburger-btn")?.setAttribute("aria-expanded", "false");
}

// ────────────────────────────────────────────────────────────────────────────

function getViewerRightNav() {
  let nav = document.getElementById("viewer-right-nav");
  if (nav) return nav;

  nav = document.createElement("nav");
  nav.id = "viewer-right-nav";
  nav.setAttribute("aria-label", "Viewer controls");
  (viewerContainer || document.body).appendChild(nav);
  return nav;
}

window.getViewerRightNav = getViewerRightNav;

window.viewerPanelManager = (() => {
  const _panels = {};
  function _dimAll() {
    for (const p of Object.values(_panels)) {
      p.btn.classList.remove("vpm-active");
      p.btn.classList.add("vpm-dimmed");
    }
  }
  function _clearAll() {
    for (const p of Object.values(_panels)) {
      p.btn.classList.remove("vpm-active", "vpm-dimmed");
    }
  }
  return {
    register(id, btn, openFn, closeFn) {
      _panels[id] = { btn, openFn, closeFn, isOpen: false };
    },
    open(id) {
      for (const [pid, p] of Object.entries(_panels)) {
        if (pid !== id && p.isOpen) { p.closeFn(); p.isOpen = false; }
      }
      const p = _panels[id];
      if (!p) return;
      p.openFn();
      p.isOpen = true;
      _dimAll();
      p.btn.classList.remove("vpm-dimmed");
      p.btn.classList.add("vpm-active");
    },
    close(id) {
      const p = _panels[id];
      if (!p) return;
      p.closeFn();
      p.isOpen = false;
      if (!Object.values(_panels).some(x => x.isOpen)) _clearAll();
    },
    toggle(id) {
      const p = _panels[id];
      if (!p) return;
      if (p.isOpen) this.close(id);
      else this.open(id);
    },
  };
})();

function getViewerMetaBar() {
  let metaBar = document.getElementById("viewer-meta-bar");
  if (metaBar) return metaBar;

  metaBar = document.createElement("div");
  metaBar.id = "viewer-meta-bar";
  metaBar.setAttribute("aria-label", "Case information and chat");
  (viewerContainer || document.body).appendChild(metaBar);
  return metaBar;
}

function getViewerObjectCounts() {
  let jawMeshes = 0;
  let polylineGroups = 0;
  let polylineSegments = 0;
  let draggablePointObjects = 0;
  let artificialTeeth = 0;

  parentObject.traverse((child) => {
    if (child.isMesh && child.userData?.jaw_type) {
      jawMeshes += 1;
    }
  });

  polylineOverlayGroup.children.forEach((group) => {
    if (group.userData?.overlayType !== "polyline") return;
    polylineGroups += 1;
    group.traverse((child) => {
      if (child.userData?.overlayType === "polyline-tube") {
        polylineSegments += 1;
      } else if (child.userData?.overlayType === "polyline-edit-point") {
        draggablePointObjects += 1;
      }
    });
  });

  scene.traverse((child) => {
    if (child.userData?.overlayType === "artificial-tooth") {
      artificialTeeth += 1;
    }
  });

  return {
    jawMeshes,
    polylineGroups,
    polylineSegments,
    draggablePointObjects,
    artificialTeeth,
    sceneChildren: scene.children.length,
  };
}

function logViewerObjectCounts(stage = "rendered") {
  if (!LOG_VIEWER_OBJECT_COUNTS_TO_CONSOLE) return;
  console.log(`[viewer: object counts] ${stage}`, getViewerObjectCounts());
}

function getJawMeshBoundingBox() {
  const box = new THREE.Box3();
  let hasJawMesh = false;
  parentObject.updateMatrixWorld(true);
  parentObject.traverse((child) => {
    if (!child.isMesh || !child.userData?.jaw_type) return;
    child.updateMatrixWorld(true);
    box.expandByObject(child);
    hasJawMesh = true;
  });
  return hasJawMesh && !box.isEmpty() ? box : null;
}

function updateViewerRotationOrigin() {
  const box = getJawMeshBoundingBox();
  if (!box) return viewerRotationOrigin;

  box.getCenter(viewerRotationOrigin);
  viewerRotationBoundsRadius = Math.max(
    VIEWER_TARGET_MIN_DRIFT_LIMIT,
    box.getSize(new THREE.Vector3()).length() * 0.5
  );
  hasViewerRotationOrigin = true;
  window.viewerRotationOrigin = {
    x: Number(viewerRotationOrigin.x.toFixed(3)),
    y: Number(viewerRotationOrigin.y.toFixed(3)),
    z: Number(viewerRotationOrigin.z.toFixed(3)),
  };
  window.viewerRotationGuard = {
    origin: window.viewerRotationOrigin,
    boundsRadius: Number(viewerRotationBoundsRadius.toFixed(3)),
  };
  if (LOG_VIEWER_OBJECT_COUNTS_TO_CONSOLE) {
    console.log("[viewer] rotation origin", window.viewerRotationGuard);
  }
  return viewerRotationOrigin;
}

function applyViewerRotationOrigin() {
  const target = hasViewerRotationOrigin
    ? viewerRotationOrigin
    : updateViewerRotationOrigin();
  if (!target) return;

  if (controls?.target) {
    controls.target.copy(target);
    controls.update();
  }
  if (orb_controls?.target) {
    orb_controls.target.copy(target);
    orb_controls.update();
  }
}

function clampViewerControlTarget(control = controls) {
  if (!control?.target || !hasViewerRotationOrigin) return false;
  const targetOffset = control.target.clone().sub(viewerRotationOrigin);
  const cameraRight = new THREE.Vector3();
  const cameraUp = camera.up.clone().normalize();
  camera.getWorldDirection(cameraRight);
  cameraRight.cross(cameraUp).normalize();

  const zoom = Math.max(camera.zoom || 1, 0.0001);
  const visibleHalfWidth = Math.abs(camera.right - camera.left) / (2 * zoom);
  const visibleHalfHeight = Math.abs(camera.top - camera.bottom) / (2 * zoom);
  const modelMargin = viewerRotationBoundsRadius * 0.55;
  const horizontalLimit = Math.max(
    VIEWER_TARGET_MIN_DRIFT_LIMIT * 0.35,
    visibleHalfWidth - modelMargin
  );
  const verticalLimit = Math.max(
    VIEWER_TARGET_MIN_DRIFT_LIMIT * 0.35,
    visibleHalfHeight - modelMargin
  );
  const horizontalOffset = THREE.MathUtils.clamp(
    targetOffset.dot(cameraRight),
    -horizontalLimit,
    horizontalLimit
  );
  const verticalOffset = THREE.MathUtils.clamp(
    targetOffset.dot(cameraUp),
    -verticalLimit,
    verticalLimit
  );
  const clampedTarget = viewerRotationOrigin
    .clone()
    .addScaledVector(cameraRight, horizontalOffset)
    .addScaledVector(cameraUp, verticalOffset);
  const driftDistance = control.target.distanceTo(clampedTarget);
  if (!Number.isFinite(driftDistance) || driftDistance < 0.0001) return false;

  const correction = clampedTarget.clone().sub(control.target);
  control.target.copy(clampedTarget);
  camera.position.add(correction);
  if (orb_controls?.target) {
    orb_controls.target.copy(clampedTarget);
  }
  camera.updateProjectionMatrix();

  window.viewerRotationGuard = {
    ...(window.viewerRotationGuard || {}),
    lastClamp: {
      driftDistance: Number(driftDistance.toFixed(3)),
      horizontalLimit: Number(horizontalLimit.toFixed(3)),
      verticalLimit: Number(verticalLimit.toFixed(3)),
      correction: {
        x: Number(correction.x.toFixed(3)),
        y: Number(correction.y.toFixed(3)),
        z: Number(correction.z.toFixed(3)),
      },
    },
  };
  return true;
}

function anchorViewerRotationTarget(control = controls) {
  if (!control?.target || !isViewerLeftButtonRotating) return false;
  const drift = control.target.distanceTo(viewerRotationTargetAnchor);
  if (!Number.isFinite(drift) || drift < 0.0001) return false;

  const correction = viewerRotationTargetAnchor.clone().sub(control.target);
  control.target.copy(viewerRotationTargetAnchor);
  camera.position.add(correction);
  if (orb_controls?.target) {
    orb_controls.target.copy(viewerRotationTargetAnchor);
  }
  camera.updateProjectionMatrix();
  return true;
}

function setViewerRotationAnchorToCurrentTarget(control = controls) {
  if (!control?.target) return false;
  viewerRotationTargetAnchor.copy(control.target);
  return true;
}

function bindViewerRotationTargetAnchor(domElement) {
  if (!domElement) return;
  const activeTouchPointers = new Set();
  const touchPointerPositions = new Map();
  const manualPanState = {
    active: false,
    lastX: 0,
    lastY: 0,
    pointerId: null,
  };
  const touchGestureState = {
    active: false,
    lastCenterX: 0,
    lastCenterY: 0,
    lastDistance: 0,
  };
  const minTouchZoom = 2;
  const maxTouchZoom = 20;

  const releaseRotationAnchor = () => {
    isViewerLeftButtonRotating = false;
  };

  const releaseManualPan = () => {
    if (manualPanState.pointerId != null) {
      domElement.releasePointerCapture?.(manualPanState.pointerId);
    }
    manualPanState.active = false;
    manualPanState.pointerId = null;
  };

  const getTouchGestureMetrics = () => {
    const points = Array.from(touchPointerPositions.values());
    if (points.length < 2) return null;
    const [first, second] = points;
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    return {
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      distance: Math.hypot(deltaX, deltaY),
    };
  };

  const releaseTouchGesture = () => {
    touchGestureState.active = false;
    touchGestureState.lastCenterX = 0;
    touchGestureState.lastCenterY = 0;
    touchGestureState.lastDistance = 0;
    if (controls) {
      controls.enabled = true;
    }
  };

  const panViewerTargetByScreenDelta = (deltaX, deltaY) => {
    if (!camera || !controls?.target) return;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.getWorldDirection(right);
    right.cross(camera.up).normalize();
    up.copy(camera.up).normalize();

    const panSpeed = Math.max(1, controls.panSpeed || 1) / 8;
    const scale = panSpeed / Math.max(camera.zoom || 1, 0.0001);
    const panOffset = right
      .multiplyScalar(-deltaX * scale)
      .add(up.multiplyScalar(deltaY * scale));

    camera.position.add(panOffset);
    controls.target.add(panOffset);
    viewerRotationTargetAnchor.copy(controls.target);
    if (orb_controls?.target) {
      orb_controls.target.copy(controls.target);
    }
    clampViewerControlTarget(controls);
    viewerRotationTargetAnchor.copy(controls.target);
    camera.updateProjectionMatrix();
  };

  const zoomViewerByScale = (scaleFactor) => {
    if (!camera || !Number.isFinite(scaleFactor) || scaleFactor <= 0) return;
    const nextZoom = THREE.MathUtils.clamp(
      (camera.zoom || 1) * scaleFactor,
      minTouchZoom,
      maxTouchZoom
    );
    if (!Number.isFinite(nextZoom)) return;
    camera.zoom = nextZoom;
    camera.updateProjectionMatrix();
    clampViewerControlTarget(controls);
    viewerRotationTargetAnchor.copy(controls.target);
    if (orb_controls?.target) {
      orb_controls.target.copy(controls.target);
    }
  };

  const startTouchGesture = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation?.();
    releaseRotationAnchor();
    releaseManualPan();
    const metrics = getTouchGestureMetrics();
    if (!metrics) return;
    touchGestureState.active = true;
    touchGestureState.lastCenterX = metrics.centerX;
    touchGestureState.lastCenterY = metrics.centerY;
    touchGestureState.lastDistance = Math.max(metrics.distance, 1);
    if (controls) {
      controls.enabled = false;
    }
  };

  const startManualPan = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    releaseRotationAnchor();
    manualPanState.active = true;
    manualPanState.pointerId = event.pointerId ?? null;
    manualPanState.lastX = event.clientX;
    manualPanState.lastY = event.clientY;
    if (manualPanState.pointerId != null) {
      domElement.setPointerCapture?.(manualPanState.pointerId);
    }
  };

  const moveManualPan = (event) => {
    if (!manualPanState.active) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    const deltaX = event.clientX - manualPanState.lastX;
    const deltaY = event.clientY - manualPanState.lastY;
    manualPanState.lastX = event.clientX;
    manualPanState.lastY = event.clientY;
    panViewerTargetByScreenDelta(deltaX, deltaY);
  };

  domElement.addEventListener("mousedown", (event) => {
    if (event.button !== 2) return;
    event.preventDefault();
  }, true);

  domElement.addEventListener("pointerdown", (event) => {
    if (!controls?.target) return;

    if (event.pointerType === "touch") {
      activeTouchPointers.add(event.pointerId);
      touchPointerPositions.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (activeTouchPointers.size > 1) {
        startTouchGesture(event);
        return;
      }
    } else if (event.button === 2) {
      startManualPan(event);
      return;
    } else if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      startManualPan(event);
      return;
    } else if (event.button !== 0 || event.shiftKey) {
      return;
    }

    isViewerLeftButtonRotating = true;
    setViewerRotationAnchorToCurrentTarget(controls);
  }, true);

  const releasePointer = (event) => {
    if (event.pointerType === "touch") {
      activeTouchPointers.delete(event.pointerId);
      touchPointerPositions.delete(event.pointerId);
      if (activeTouchPointers.size < 2) {
        releaseTouchGesture();
      }
    }
    releaseRotationAnchor();
    if (event.type !== "pointerleave") {
      releaseManualPan();
    }
  };

  domElement.addEventListener("pointerup", releasePointer);
  domElement.addEventListener("pointercancel", releasePointer);
  domElement.addEventListener("pointerleave", releasePointer);
  domElement.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
      touchPointerPositions.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touchGestureState.active) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        const metrics = getTouchGestureMetrics();
        if (!metrics) return;
        const deltaX = metrics.centerX - touchGestureState.lastCenterX;
        const deltaY = metrics.centerY - touchGestureState.lastCenterY;
        touchGestureState.lastCenterX = metrics.centerX;
        touchGestureState.lastCenterY = metrics.centerY;
        panViewerTargetByScreenDelta(deltaX, deltaY);
        if (touchGestureState.lastDistance > 0 && metrics.distance > 0) {
          zoomViewerByScale(metrics.distance / touchGestureState.lastDistance);
        }
        touchGestureState.lastDistance = Math.max(metrics.distance, 1);
        return;
      }
    }
    moveManualPan(event);
  }, true);
  domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  window.addEventListener("blur", () => {
    activeTouchPointers.clear();
    touchPointerPositions.clear();
    releaseRotationAnchor();
    releaseManualPan();
    releaseTouchGesture();
  });
}

function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((materialEntry) => materialEntry?.dispose?.());
    } else if (child.material) {
      child.material.dispose();
    }
  });
}

const PRESET_CAMERA_VIEWS = [
  {
    key: "top",
    label: "Top",
    direction: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 0, -1),
  },
  {
    key: "bottom",
    label: "Bottom",
    direction: new THREE.Vector3(0, -1, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
  {
    key: "left",
    label: "Left",
    direction: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  },
  {
    key: "right",
    label: "Right",
    direction: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  },
  {
    key: "front",
    label: "Front",
    direction: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
  },
  {
    key: "rear",
    label: "Rear",
    direction: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
  },
];
let currentPresetToolbarView = "front";

function getPresetArrowGlyph(viewKey) {
  switch (viewKey) {
    case "front":
      return "↗";
    case "rear":
      return "↙";
    case "top":
      return "↑";
    case "bottom":
      return "↓";
    case "left":
      return "←";
    case "right":
      return "→";
    default:
      return "↑";
  }
}

function syncPresetViewToolbarSelection(viewKey) {
  if (!["front", "rear", "top", "bottom", "left", "right"].includes(viewKey)) {
    return;
  }
  currentPresetToolbarView = viewKey;
  const currentButton = document.getElementById("preset-view-current");
  if (currentButton) {
    currentButton.dataset.viewKey = viewKey;
    currentButton.dataset.mobileArrow = viewKey;
    currentButton.setAttribute("aria-label", `${viewKey} view`);
    currentButton.title = `${viewKey} view`;
    currentButton.textContent = getPresetArrowGlyph(viewKey);
  }
  document.querySelectorAll(".preset-view-dropdown-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewKey === viewKey);
  });
}

function getPresetViewBounds() {
  const jawBox = getJawMeshBoundingBox();
  if (jawBox) return jawBox;

  const box = new THREE.Box3();
  let hasMesh = false;
  parentObject.updateMatrixWorld(true);
  parentObject.traverse((child) => {
    if (!child.isMesh) return;
    child.updateMatrixWorld(true);
    box.expandByObject(child);
    hasMesh = true;
  });

  return hasMesh && !box.isEmpty() ? box : null;
}

function setPresetCameraView(viewKey) {
  if (viewKey === "center") {
    setCenterCameraView();
    return;
  }

  const view = PRESET_CAMERA_VIEWS.find((item) => item.key === viewKey);
  if (!view || !camera) return;

  const box = getPresetViewBounds();
  const target = box
    ? box.getCenter(new THREE.Vector3())
    : hasViewerRotationOrigin
      ? viewerRotationOrigin.clone()
      : new THREE.Vector3(0, 0, 0);
  const size = box ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(120, 120, 120);
  const radius = Math.max(size.length() * 0.5, VIEWER_TARGET_MIN_DRIFT_LIMIT);
  const distance = Math.max(radius * 4, 500);
  const direction = view.direction.clone().normalize();

  viewerRotationOrigin.copy(target);
  viewerRotationBoundsRadius = radius;
  hasViewerRotationOrigin = true;
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.up.copy(view.up);
  camera.lookAt(target);
  camera.zoom = 7;
  camera.updateProjectionMatrix();

  if (controls?.target) {
    controls.target.copy(target);
    controls.update();
  }
  if (orb_controls?.target) {
    orb_controls.target.copy(target);
    orb_controls.update();
  }

  document.querySelectorAll(".preset-view-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewKey === viewKey);
  });
  syncPresetViewToolbarSelection(viewKey);
}

function setCenterCameraView() {
  if (!camera) return;

  const box = getPresetViewBounds();
  const target = box
    ? box.getCenter(new THREE.Vector3())
    : hasViewerRotationOrigin
      ? viewerRotationOrigin.clone()
      : new THREE.Vector3(0, 0, 0);
  const size = box ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(120, 120, 120);
  const radius = Math.max(size.length() * 0.5, VIEWER_TARGET_MIN_DRIFT_LIMIT);
  const currentTarget = controls?.target || viewerRotationOrigin;
  const direction = camera.position.clone().sub(currentTarget).normalize();
  if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 0.000001) {
    direction.set(0, 0, 1);
  }
  const distance = Math.max(radius * 4, 500);

  viewerRotationOrigin.copy(target);
  viewerRotationBoundsRadius = radius;
  hasViewerRotationOrigin = true;
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.zoom = 7;
  camera.updateProjectionMatrix();

  if (controls?.target) {
    controls.target.copy(target);
    controls.update();
  }
  if (orb_controls?.target) {
    orb_controls.target.copy(target);
    orb_controls.update();
  }

  document.querySelectorAll(".preset-view-button").forEach((button) => {
    button.classList.remove("active");
  });
}

function createPresetViewControls() {
  if (document.querySelector(".preset-view-panel")) return;

  const panel = document.createElement("div");
  panel.className = "preset-view-panel";
  const sceneHost = viewerContainer || document.getElementById("container3D") || document.body;

  const viewPad = document.createElement("div");
  viewPad.className = "preset-view-pad";

  const mobileWrap = document.createElement("div");
  mobileWrap.className = "preset-view-current-wrap";

  const mobileCurrent = document.createElement("button");
  mobileCurrent.type = "button";
  mobileCurrent.id = "preset-view-current";
  mobileCurrent.className = "preset-view-current";
  mobileCurrent.dataset.viewKey = currentPresetToolbarView;
  mobileCurrent.dataset.mobileArrow = currentPresetToolbarView;
  mobileCurrent.setAttribute("aria-label", "Current positional view");
  mobileCurrent.title = "Choose positional view";
  mobileCurrent.textContent = getPresetArrowGlyph(currentPresetToolbarView);

  const mobileDropdown = document.createElement("div");
  mobileDropdown.className = "preset-view-dropdown";
  sceneHost.appendChild(mobileDropdown);

  const closeMobileDropdown = () => {
    mobileWrap.classList.remove("open");
    mobileDropdown.classList.remove("open");
  };

  const positionMobileDropdown = () => {
    if (!mobileDropdown.classList.contains("open")) return;
    const buttonRect = mobileCurrent.getBoundingClientRect();
    const hostRect = sceneHost.getBoundingClientRect();
    const dropdownRect = mobileDropdown.getBoundingClientRect();
    const gap = window.innerWidth <= 768 ? 18 : 14;
    const maxLeft = Math.max(8, hostRect.width - dropdownRect.width - 8);
    const desiredLeft = buttonRect.right - hostRect.left - dropdownRect.width;
    const desiredTop = buttonRect.top - hostRect.top - dropdownRect.height - gap;
    const left = Math.min(Math.max(8, desiredLeft), maxLeft);
    const top = Math.max(8, desiredTop);
    mobileDropdown.style.left = `${left}px`;
    mobileDropdown.style.top = `${top}px`;
    mobileDropdown.style.right = "auto";
    mobileDropdown.style.bottom = "auto";
  };

  const mobileViews = [
    { key: "front", label: "Front" },
    { key: "rear", label: "Rear" },
    { key: "top", label: "Top" },
    { key: "bottom", label: "Bottom" },
    { key: "left", label: "Left" },
    { key: "right", label: "Right" },
  ];

  mobileViews.forEach((view) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "preset-view-dropdown-button";
    item.dataset.viewKey = view.key;
    item.dataset.mobileArrow = view.key;
    item.title = `${view.label} view`;
    item.setAttribute("aria-label", `${view.label} view`);
    item.textContent = getPresetArrowGlyph(view.key);
    item.addEventListener("click", () => {
      closeMobileDropdown();
      setPresetCameraView(view.key);
    });
    mobileDropdown.appendChild(item);
  });

  mobileCurrent.addEventListener("click", () => {
    const willOpen = !mobileDropdown.classList.contains("open");
    closeMobileDropdown();
    if (willOpen) {
      mobileWrap.classList.add("open");
      mobileDropdown.classList.add("open");
      requestAnimationFrame(positionMobileDropdown);
    }
  });

  document.addEventListener("click", (event) => {
    if (!mobileWrap.contains(event.target) && !mobileDropdown.contains(event.target)) {
      closeMobileDropdown();
    }
  });

  window.addEventListener("resize", () => {
    if (mobileDropdown.classList.contains("open")) {
      requestAnimationFrame(positionMobileDropdown);
    }
  });

  mobileWrap.appendChild(mobileCurrent);

  const visualViews = [
    { key: "bottom", label: "Top", slot: "top" },
    { key: "top", label: "Bottom", slot: "bottom" },
    { key: "right", label: "Left", slot: "left" },
    { key: "left", label: "Right", slot: "right" },
    { key: "rear", label: "Rear", slot: "rear" },
    { key: "front", label: "Front", slot: "front" },
    { key: "center", label: "Center", slot: "center" },
  ];

  visualViews.forEach((view) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preset-view-button preset-view-${view.slot}`;
    button.dataset.viewKey = view.key;
    const mobileArrowByView = {
      front: "right",
      rear: "left",
      top: "up",
      bottom: "down",
      left: "left",
      right: "right",
      center: "center",
    };
    button.dataset.mobileArrow = mobileArrowByView[view.key] || "";
    const ariaLabel =
      view.key === "center" ? "Center model view" : `${view.label} view`;
    button.title = ariaLabel;
    button.setAttribute("aria-label", ariaLabel);

    const face = document.createElement("span");
    face.className = "preset-view-face";
    button.appendChild(face);

    button.addEventListener("click", () => {
      setPresetCameraView(view.key);
    });
    viewPad.appendChild(button);
  });

  panel.appendChild(viewPad);
  panel.appendChild(mobileWrap);
  panel.style.order = "10";
  getViewerRightNav().appendChild(panel);
  syncPresetViewToolbarSelection(currentPresetToolbarView);
}

function clearPolylineOverlay() {
  while (polylineOverlayGroup.children.length > 0) {
    const child = polylineOverlayGroup.children[0];
    polylineOverlayGroup.remove(child);
    disposeObject3D(child);
  }
  updatePolylineComponentMenu();
}

function enforceOpaqueJawMesh(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.forEach((materialEntry) => {
      if (!materialEntry) return;
      materialEntry.transparent = false;
      materialEntry.opacity = 1;
      materialEntry.depthTest = true;
      materialEntry.depthWrite = true;
      materialEntry.side = THREE.DoubleSide;
      materialEntry.needsUpdate = true;
    });
  });
}

function syncPolylineFocusMode() {
  parentObject.children.forEach((child) => {
    if (!child.isMesh) return;
    enforceOpaqueJawMesh(child);
  });
}

function normalizeJawKey(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("upper_jaw") || text.includes("upper") || text === "2") {
    return "upper";
  }
  if (text.includes("lower_jaw") || text.includes("lower") || text === "1") {
    return "lower";
  }
  return null;
}

function isValidPoint(point) {
  return (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

function getPolylineComponentName(candidate, fallback = "polyline") {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return fallback;
  }

  return String(
    candidate.component ??
      candidate.component_name ??
      candidate.componentName ??
      candidate.name ??
      candidate.label ??
      candidate.type ??
      candidate.line_type ??
      candidate.polyline_type ??
      fallback
  );
}

function normalizePolylineComponentName(component) {
  const text = String(component || "polyline");
  if (/retention\s*pins?|^retainer$/i.test(text)) return "Retainer";
  if (/gingival/i.test(text)) return "Gingival Points";
  if (/reciprocating\s*arm/i.test(text)) return "Lingual Clasp";
  if (/^mesh$/i.test(text)) return "Mesh";
  if (/tissue\s*stop|^rests?$|rest/i.test(text)) return "Rest";
  if (/ending\s*proximal\s*plate/i.test(text)) {
    return "Proximal Plate";
  }
  if (/starting\s*proximal\s*plate/i.test(text)) {
    return "Proximal Plate";
  }
  if (/proximal\s*plates?/i.test(text)) return "Proximal Plate";
  if (/minor\s*connector\s*tooth/i.test(text)) return "Minor Conn";
  if (/major\s*connector/i.test(text)) return "MajorConnector";
  if (/reversal/i.test(text)) return "Reversal Line";
  return text;
}

function getPolylinePointSignature(point) {
  return [point.x, point.y, point.z]
    .map((value) => Number(value).toFixed(3))
    .join(",");
}

function createPolylineSegment(points, component = "polyline") {
  const normalizedComponent = normalizePolylineComponentName(component);
  return {
    component: normalizedComponent,
    sourceComponent: component,
    points,
  };
}

function getSegmentPoints(segment) {
  return Array.isArray(segment) ? segment : segment?.points || [];
}

function getSegmentComponent(segment) {
  return normalizePolylineComponentName(
    Array.isArray(segment) ? "polyline" : segment?.component || "polyline"
  );
}

function getSegmentRenderableEdges(segment, points, component) {
  return segment?.renderEdges ||
    getPolylineRenderableEdges(points, segment?.sourceComponent || component);
}

function getPolylineComponentKey(arch, component) {
  return component;
}

function isPolylineJawVisible(arch) {
  return polylineJawVisibility.get(arch) ?? true;
}

function setPolylineJawVisibility(arch, isVisible) {
  if (arch !== "upper" && arch !== "lower") return;
  polylineJawVisibility.set(arch, Boolean(isVisible));
  syncPolylineOverlayVisibility();
}

function getPolylineJawVisibility(arch) {
  return isPolylineJawVisible(arch);
}

function hasPolylineJawComponents(arch) {
  return polylineOverlayGroup.children.some(
    (group) =>
      group.userData?.overlayType === "polyline" &&
      group.userData?.arch === arch
  );
}

function applyPolylineJawOpacity(arch) {
  const opacity = polylineJawOpacity.get(arch) ?? 1;
  polylineOverlayGroup.children.forEach((group) => {
    if (group.userData?.arch !== arch) return;
    group.traverse((child) => {
      if (!child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((materialEntry) => {
        if (!materialEntry) return;
        materialEntry.opacity = opacity;
        materialEntry.transparent = opacity < 1;
        materialEntry.depthWrite = false;
        materialEntry.needsUpdate = true;
      });
    });
  });
}

function setPolylineJawOpacity(arch, opacity) {
  if (arch !== "upper" && arch !== "lower") return;
  const normalizedOpacity = Math.max(0, Math.min(1, Number(opacity)));
  polylineJawOpacity.set(arch, Number.isFinite(normalizedOpacity) ? normalizedOpacity : 1);
  applyPolylineJawOpacity(arch);
}

function getPolylineJawOpacity(arch) {
  return polylineJawOpacity.get(arch) ?? 1;
}

window.setPolylineJawVisibility = setPolylineJawVisibility;
window.getPolylineJawVisibility = getPolylineJawVisibility;
window.hasPolylineJawComponents = hasPolylineJawComponents;
window.setPolylineJawOpacity = setPolylineJawOpacity;
window.getPolylineJawOpacity = getPolylineJawOpacity;

function formatPolylineComponentLabel(key) {
  return key || "polyline";
}

function isPolylineComponentVisibleByDefault(key) {
  return !/gingival\s*points/i.test(key || "");
}

function getPolylineComponentSortRank(key) {
  const componentIndex = POLYLINE_APP_COMPONENTS.indexOf(key);
  return componentIndex >= 0
    ? componentIndex
    : POLYLINE_APP_COMPONENTS.length;
}

function toPointObject(value) {
  if (typeof value === "string") {
    try {
      return toPointObject(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value.map(Number);
    return { x, y, z };
  }

  if (value && typeof value === "object") {
    const x = Number(
      value.x ??
        value.X ??
        value.pos_x ??
        value.point_x ??
        value.position_x ??
        value.coord_x ??
        value[0]
    );
    const y = Number(
      value.y ??
        value.Y ??
        value.pos_y ??
        value.point_y ??
        value.position_y ??
        value.coord_y ??
        value[1]
    );
    const z = Number(
      value.z ??
        value.Z ??
        value.pos_z ??
        value.point_z ??
        value.position_z ??
        value.coord_z ??
        value[2]
    );

    if ([x, y, z].every(Number.isFinite)) {
      return { x, y, z };
    }
  }

  return null;
}

function extractPointArray(candidate) {
  if (!candidate) return [];

  if (typeof candidate === "string") {
    try {
      return extractPointArray(JSON.parse(candidate));
    } catch {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    return candidate.map(toPointObject).filter(isValidPoint);
  }

  const nestedArrayKeys = [
    "points",
    "polyline",
    "polylines",
    "vertices",
    "coordinates",
    "coords",
    "data",
    "json",
  ];
  for (const key of nestedArrayKeys) {
    if (candidate[key]) {
      const points = extractPointArray(candidate[key]);
      if (points.length) return points;
    }
  }

  return [];
}

function decodePolylineText(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  const decodeStartedAt = performance.now();
  try {
    const decoded = atob(value.trim());
    polylineDiagnostics.base64DecodeMs += performance.now() - decodeStartedAt;
    polylineDiagnostics.base64DecodeCount += 1;
    if (POLYLINE_TEXT_DETECTION_PATTERN.test(decoded)) {
      return decoded;
    }
  } catch {
    polylineDiagnostics.base64DecodeMs += performance.now() - decodeStartedAt;
    // Keep going: the value may already be plain text.
  }

  return POLYLINE_TEXT_DETECTION_PATTERN.test(value) ? value : "";
}

function parsePolylineTextSegments(value) {
  const text = decodePolylineText(value);
  if (!text) {
    return [];
  }
  const textParseStartedAt = performance.now();

  const lines = text.split(/\r?\n/);
  const segments = [];
  const numberPattern = /[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  const ignoredPointValue = -9e91;
  let currentComponent = "polyline";

  const getComponentName = (line) => {
    return line.trim().match(POLYLINE_TEXT_COMPONENT_PATTERN)?.[1] || "";
  };

  const isComponentHeader = (line) => Boolean(getComponentName(line));

  const parseCoordinateLine = (line) => {
    if (!/^[\s+\-.0-9eE]+$/.test(line)) return null;

    const numbers = line.match(numberPattern)?.map(Number) || [];
    if (numbers.length < 3) return null;

    const coords = numbers.slice(-3);
    if (
      coords.some(
        (coord) =>
          !Number.isFinite(coord) || Math.abs(coord - ignoredPointValue) < 1e80
      )
    ) {
      return null;
    }

    return { x: coords[0], y: coords[1], z: coords[2] };
  };

  const collectPoints = (startIndex, nodeCount = 0) => {
    const points = [];
    let nextIndex = startIndex;

    while (nextIndex < lines.length) {
      const candidateLine = lines[nextIndex];
      if (nextIndex !== startIndex && isComponentHeader(candidateLine)) break;

      const point = parseCoordinateLine(candidateLine);
      if (point) points.push(point);
      nextIndex += 1;
    }

    return { points, nextIndex };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const componentMatch = line.match(POLYLINE_TEXT_COMPONENT_PATTERN);
    if (componentMatch) {
      currentComponent = componentMatch[1].trim();
    }

    const nodeMatch = line.match(/nodeCount\s*=\s*(\d+)/i);
    const gingivalMatch = line.match(/^GingivalPoints\s+(\d+)/i);
    const nodeCount = Number(nodeMatch?.[1] ?? gingivalMatch?.[1] ?? 0);

    if (!componentMatch && !nodeCount) continue;
    if ((nodeMatch || gingivalMatch) && nodeCount === 0) continue;

    const startIndex = i + 1;
    const { points, nextIndex } = collectPoints(startIndex, nodeCount);
    if (points.length >= 2) {
      segments.push(createPolylineSegment(points, currentComponent));
    }

    i = Math.max(i, nextIndex - 1);
  }

  polylineDiagnostics.textParseMs += performance.now() - textParseStartedAt;
  polylineDiagnostics.textParseCount += 1;
  return segments;
}

function extractPolylineSegments(candidate) {
  if (!candidate) return [];

  if (typeof candidate === "string") {
    const textSegments = parsePolylineTextSegments(candidate);
    if (textSegments.length) return textSegments;

    try {
      return extractPolylineSegments(JSON.parse(candidate));
    } catch {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    const points = candidate.map(toPointObject).filter(isValidPoint);
    if (points.length === candidate.length && points.length) {
      return [createPolylineSegment(points)];
    }

    return candidate.flatMap((entry) => extractPolylineSegments(entry));
  }

  if (typeof candidate === "object") {
    const dataSegments = parsePolylineTextSegments(candidate.data);
    if (dataSegments.length) return dataSegments;

    const directPoints = extractPointArray(candidate);
    if (directPoints.length) {
      return [
        createPolylineSegment(
          directPoints,
          getPolylineComponentName(candidate)
        ),
      ];
    }

    const nestedKeys = [
      "points",
      "polyline",
      "polylines",
      "vertices",
      "coordinates",
      "coords",
      "data",
      "json",
      "upper",
      "lower",
      "upper_jaw",
      "lower_jaw",
      "upperJaw",
      "lowerJaw",
      "maxillary",
      "mandibular",
    ];

    return nestedKeys.flatMap((key) => extractPolylineSegments(candidate[key]));
  }

  return [];
}

function getLoadedPolylineJawKeys() {
  const keys = new Set();
  parentObject.children.forEach((child) => {
    const jawKey = normalizeJawKey(child.userData?.jaw_type ?? child.name);
    if (jawKey) keys.add(jawKey);
  });
  return Array.from(keys);
}

function isPolylineJawLoaded(jawKey, loadedJawKeys) {
  return !loadedJawKeys.length || loadedJawKeys.includes(jawKey);
}

function getPolylineSegmentSignature(segment) {
  const component = getSegmentComponent(segment);
  const points = getSegmentPoints(segment);
  const pointSignature = points.map(getPolylinePointSignature).join("|");
  return `${component}:${points.length}:${pointSignature}`;
}

function inferPolylineArrayJawKey(entry, index, total, loadedJawKeys) {
  const explicitJawKey = normalizeJawKey(
    entry?.jaw_type ??
      entry?.jawType ??
      entry?.arch ??
      entry?.type ??
      entry?.jaws
  );
  if (explicitJawKey) return explicitJawKey;

  if (loadedJawKeys.length === 1) return loadedJawKeys[0];

  if (total >= 2) {
    const positionalJawKey = index === 0 ? "upper" : index === 1 ? "lower" : null;
    if (positionalJawKey && isPolylineJawLoaded(positionalJawKey, loadedJawKeys)) {
      return positionalJawKey;
    }
  }

  return null;
}

function normalizePolylineResponse(rawResponse) {
  const normalized = {
    upper: [],
    lower: [],
  };
  const loadedJawKeys = getLoadedPolylineJawKeys();
  const seenSegmentSignatures = {
    upper: new Set(),
    lower: new Set(),
  };

  const assignSegments = (jawKey, candidate) => {
    const segments = extractPolylineSegments(candidate);
    if (!jawKey || !segments.length || !isPolylineJawLoaded(jawKey, loadedJawKeys)) {
      return;
    }
    segments.forEach((segment) => {
      const signature = getPolylineSegmentSignature(segment);
      if (seenSegmentSignatures[jawKey].has(signature)) return;
      seenSegmentSignatures[jawKey].add(signature);
      normalized[jawKey].push(segment);
    });
  };

  if (!rawResponse) {
    return normalized;
  }

  if (Array.isArray(rawResponse)) {
    rawResponse.forEach((entry, index) => {
      const jawKey = inferPolylineArrayJawKey(
        entry,
        index,
        rawResponse.length,
        loadedJawKeys
      );
      assignSegments(jawKey, entry);
    });
    return normalized;
  }

  if (typeof rawResponse === "object") {
    const upperCandidate =
      rawResponse.upper ??
      rawResponse.upper_jaw ??
      rawResponse.upperJaw ??
      rawResponse.maxillary;
    const lowerCandidate =
      rawResponse.lower ??
      rawResponse.lower_jaw ??
      rawResponse.lowerJaw ??
      rawResponse.mandibular;

    assignSegments("upper", upperCandidate);
    assignSegments("lower", lowerCandidate);

    const fallbackJawKey = normalizeJawKey(
      rawResponse.jaw_type ??
        rawResponse.jawType ??
        rawResponse.arch ??
        rawResponse.type ??
        rawResponse.jaws
    );

    if (upperCandidate === undefined && lowerCandidate === undefined) {
      assignSegments(fallbackJawKey, rawResponse);
    }
  }

  return normalized;
}

function getPolylineSegmentColor(component, segmentIndex) {
  if (/omit\s*reference/i.test(component || "")) {
    return 0x9ca3af;
  }

  if (/gingival.*relevant/i.test(component || "")) {
    return 0xff8a00;
  }

  if (/major\s*(connector|conn)/i.test(component || "")) {
    return 0x8b5cf6;
  }

  if (/reversal/i.test(component || "")) {
    return 0xff1f1f;
  }

  if (/retainer/i.test(component || "")) {
    return 0xff4f81;
  }

  if (/tissue\s*stop/i.test(component || "")) {
    return 0x2dd4bf;
  }

  if (/proximal\s*plate/i.test(component || "")) {
    return 0x38bdf8;
  }

  if (/lingual\s*clasp/i.test(component || "")) {
    return 0xf97316;
  }

  if (/minor\s*(connector|conn)/i.test(component || "")) {
    return 0x22c55e;
  }

  if (/^mesh$/i.test(component || "")) {
    return 0x0891b2;
  }

  if (/rest/i.test(component || "")) {
    return 0xffd400;
  }

  const text = String(component || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return POLYLINE_COMPONENT_COLORS[hash % POLYLINE_COMPONENT_COLORS.length];
}

function isGingivalPolylineComponent(component) {
  return /gingival/i.test(component || "");
}

function isMeshPolylineComponent(component) {
  return /^mesh$/i.test(component || "");
}

function shouldSeatPolylineComponentOnJaw(component) {
  return /minor\s*(connector|conn)/i.test(component || "");
}

function getJawMeshForPolyline(jawType) {
  const jawText = jawType.toLowerCase();
  return parentObject.children.find((child) => {
    const type = String(child.userData?.jaw_type || child.name || "").toLowerCase();
    return type.includes(jawText);
  });
}

function applyJawTransformToPolylineGroup(group, jawType, coordinateSpace = "jaw-local") {
  if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE && coordinateSpace === "scene-world") {
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    return;
  }

  const jawMesh = getJawMeshForPolyline(jawType);
  if (!jawMesh) return;

  group.position.copy(jawMesh.position);
  group.rotation.copy(jawMesh.rotation);
  group.scale.copy(jawMesh.scale);
}

function getDistanceBetweenPoints(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function getPolylineDistanceStats(points) {
  const distances = [];
  for (let index = 1; index < points.length; index += 1) {
    const distance = getDistanceBetweenPoints(points[index - 1], points[index]);
    if (Number.isFinite(distance) && distance > 0) distances.push(distance);
  }

  if (!distances.length) {
    return {
      length: 0,
      median: 0,
      p90: 0,
      max: 0,
      maxIndex: null,
    };
  }

  const sorted = [...distances].sort((a, b) => a - b);
  let max = -Infinity;
  let maxIndex = null;
  distances.forEach((distance, index) => {
    if (distance > max) {
      max = distance;
      maxIndex = index + 1;
    }
  });

  return {
    length: distances.reduce((sum, distance) => sum + distance, 0),
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max,
    maxIndex,
  };
}

function getMissingConsecutivePolylineEdges(pointCount, edges) {
  const renderedEdgeKeys = new Set(
    (edges || []).map(([startIndex, endIndex]) => `${startIndex}:${endIndex}`)
  );
  const missing = [];
  for (let index = 1; index < pointCount; index += 1) {
    if (!renderedEdgeKeys.has(`${index - 1}:${index}`)) {
      missing.push(index);
    }
  }
  return missing;
}

function getPolylineCourseSummary(points, edges = null) {
  const stats = getPolylineDistanceStats(points);
  const missingEdges = edges ? getMissingConsecutivePolylineEdges(points.length, edges) : [];
  const jumpRatio = stats.median > 0 ? stats.max / stats.median : 0;

  return {
    pointCount: points.length,
    renderedEdgeCount: edges?.length ?? null,
    missingEdgeCount: missingEdges.length,
    missingEdgeIndices: missingEdges.slice(0, 8),
    length: Number(stats.length.toFixed(3)),
    medianSegment: Number(stats.median.toFixed(3)),
    p90Segment: Number(stats.p90.toFixed(3)),
    maxSegment: Number(stats.max.toFixed(3)),
    maxSegmentIndex: stats.maxIndex,
    maxToMedianRatio: Number(jumpRatio.toFixed(2)),
  };
}

function getClosestJawPolylineSurfacePoint(jawType, point, coordinateSpace = "jaw-local") {
  const jawMesh = getJawMeshForPolyline(jawType);
  const position = jawMesh?.geometry?.attributes?.position;
  if (!position || !isValidPoint(point)) return null;

  jawMesh.updateMatrixWorld(true);
  let bestPoint = null;
  let bestDistanceSq = Infinity;
  const stride = Math.max(1, Math.floor(position.count / 30000));
  const candidateVector = new THREE.Vector3();

  for (let index = 0; index < position.count; index += stride) {
    candidateVector.set(
      position.getX(index),
      position.getY(index),
      position.getZ(index)
    );
    if (coordinateSpace === "scene-world") {
      jawMesh.localToWorld(candidateVector);
    }
    const candidate = { x: candidateVector.x, y: candidateVector.y, z: candidateVector.z };
    const dx = point.x - candidate.x;
    const dy = point.y - candidate.y;
    const dz = point.z - candidate.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestPoint = candidate;
    }
  }

  return bestPoint ? { point: bestPoint, distance: Math.sqrt(bestDistanceSq) } : null;
}

function getPolylineSamplePoints(points, limit = 24) {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

function getMedianDistanceToJaw(points, jawType, coordinateSpace) {
  const distances = getPolylineSamplePoints(points)
    .map((point) => getClosestJawPolylineSurfacePoint(jawType, point, coordinateSpace)?.distance)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!distances.length) return Infinity;
  return distances[Math.floor(distances.length / 2)];
}

function detectPolylineCoordinateSpace(points, jawType, component) {
  if (points.length < 2 || !getJawMeshForPolyline(jawType)) {
    return {
      coordinateSpace: "jaw-local",
      localMedianDistance: null,
      worldMedianDistance: null,
    };
  }

  const localMedianDistance = getMedianDistanceToJaw(points, jawType, "jaw-local");
  const worldMedianDistance = getMedianDistanceToJaw(points, jawType, "scene-world");
  const coordinateSpace =
    worldMedianDistance + 0.35 < localMedianDistance * 0.72
      ? "scene-world"
      : "jaw-local";

  if (coordinateSpace === "scene-world") {
    console.log("[polyline] detected scene-world coordinates", {
      arch: jawType,
      component,
      localMedianDistance: Number(localMedianDistance.toFixed(3)),
      worldMedianDistance: Number(worldMedianDistance.toFixed(3)),
    });
  }

  return { coordinateSpace, localMedianDistance, worldMedianDistance };
}

function seatPolylinePointsOnJaw(points, jawType, component, coordinateSpace = "jaw-local") {
  if (!shouldSeatPolylineComponentOnJaw(component) || points.length < 2) {
    return { points, snappedCount: 0, maxDistance: 0 };
  }

  let snappedCount = 0;
  let maxDistance = 0;
  const seatedPoints = points.map((point) => {
    const closest = getClosestJawPolylineSurfacePoint(jawType, point, coordinateSpace);
    if (!closest) return point;

    maxDistance = Math.max(maxDistance, closest.distance);
    if (closest.distance <= 0.65) return point;

    snappedCount += 1;
    const surfacePoint = closest.point;
    const direction = {
      x: point.x - surfacePoint.x,
      y: point.y - surfacePoint.y,
      z: point.z - surfacePoint.z,
    };
    const length = Math.max(
      0.0001,
      Math.hypot(direction.x, direction.y, direction.z)
    );
    const offset = Math.min(Math.max(POLYLINE_TUBE_RADIUS * 0.45, 0.22), 0.45);
    return {
      x: surfacePoint.x + (direction.x / length) * offset,
      y: surfacePoint.y + (direction.y / length) * offset,
      z: surfacePoint.z + (direction.z / length) * offset,
    };
  });

  return { points: seatedPoints, snappedCount, maxDistance };
}

function getPolylineTurnCosine(previous, current, next) {
  const ax = current.x - previous.x;
  const ay = current.y - previous.y;
  const az = current.z - previous.z;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const bz = next.z - current.z;
  const aLength = Math.hypot(ax, ay, az);
  const bLength = Math.hypot(bx, by, bz);

  if (!aLength || !bLength) return 1;
  return (ax * bx + ay * by + az * bz) / (aLength * bLength);
}

function getPolylineRenderableEdges(points, component) {
  if (points.length < 2) return [];
  if (points.length < 3) return [[0, 1]];

  const isGingival = isGingivalPolylineComponent(component);
  const isMesh = isMeshPolylineComponent(component);
  const distances = [];
  for (let i = 1; i < points.length; i += 1) {
    const distance = getDistanceBetweenPoints(points[i - 1], points[i]);
    if (Number.isFinite(distance) && distance > 0) {
      distances.push(distance);
    }
  }

  if (!distances.length) {
    return points.slice(1).map((_, index) => [index, index + 1]);
  }

  const sortedDistances = [...distances].sort((a, b) => a - b);
  const medianDistance = sortedDistances[Math.floor(sortedDistances.length / 2)];
  const highDistance = sortedDistances[Math.floor(sortedDistances.length * 0.9)];
  const jumpThreshold = isGingival
    ? Math.max(medianDistance * 3.5, highDistance * 0.65, 5)
    : isMesh
      ? Math.max(medianDistance * 2.8, highDistance * 0.7, 3)
      : Math.max(medianDistance * 8, 12);
  const turnThreshold = Math.max(medianDistance * (isMesh ? 1.8 : 2.2), 4);
  const edges = [];

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const distance = getDistanceBetweenPoints(previous, current);
    const previousTurnCosine =
      (isGingival || isMesh) && i > 1
        ? getPolylineTurnCosine(points[i - 2], previous, current)
        : 1;
    const nextTurnCosine =
      (isGingival || isMesh) && i < points.length - 1
        ? getPolylineTurnCosine(previous, current, points[i + 1])
        : 1;
    const isSuspiciousGingivalTurn =
      isGingival &&
      distance > turnThreshold &&
      (previousTurnCosine < -0.5 || nextTurnCosine < -0.5);
    const isSuspiciousMeshTurn =
      isMesh &&
      distance > turnThreshold &&
      (previousTurnCosine < -0.25 || nextTurnCosine < -0.25);

    if (
      distance <= jumpThreshold &&
      !isSuspiciousGingivalTurn &&
      !isSuspiciousMeshTurn
    ) {
      edges.push([i - 1, i]);
    }
  }

  return edges;
}

function getPositionAttributePoint(positionAttribute, index) {
  return new THREE.Vector3(
    positionAttribute.getX(index),
    positionAttribute.getY(index),
    positionAttribute.getZ(index)
  );
}

function createPolylineTubeGeometryBetweenPoints(start, end) {
  const curve = new THREE.LineCurve3(start, end);
  return new THREE.TubeGeometry(
    curve,
    1,
    POLYLINE_TUBE_RADIUS,
    POLYLINE_TUBE_RADIAL_SEGMENTS,
    false
  );
}

function createPolylineTubeGeometry(positionAttribute, startIndex, endIndex) {
  return createPolylineTubeGeometryBetweenPoints(
    getPositionAttributePoint(positionAttribute, startIndex),
    getPositionAttributePoint(positionAttribute, endIndex)
  );
}

function addPolylineTube(
  tubeGroup,
  geometry,
  material,
  jawType,
  component,
  componentKey,
  segmentIndex,
  edgeIndex
) {
  const tube = new THREE.Mesh(geometry, material.clone());
  tube.material.depthTest = polylineDepthTestEnabled;
  tube.material.needsUpdate = true;
  tube.name = `${jawType}-${component}-polyline-segment-${segmentIndex}-tube-${edgeIndex}`;
  tube.renderOrder = 20;
  tube.userData = {
    overlayType: "polyline-tube",
    arch: jawType,
    component,
    componentKey,
    segmentIndex,
    edgeIndex,
  };
  tubeGroup.add(tube);
}

function syncPolylineTubeGeometries(tubeGroup) {
  const positionAttribute = tubeGroup.userData.sourcePositionAttribute;
  const edges = tubeGroup.userData.edges || [];
  if (!positionAttribute) return;

  tubeGroup.children.forEach((tube, index) => {
    const edge = edges[index];
    if (!edge) return;

    const nextGeometry = createPolylineTubeGeometry(
      positionAttribute,
      edge[0],
      edge[1]
    );
    tube.geometry?.dispose?.();
    tube.geometry = nextGeometry;
    tube.geometry.computeBoundingSphere();
  });
}

function createPolylineObjects(jawType, segment, segmentIndex) {
  const component = getSegmentComponent(segment);
  const rawPoints = getSegmentPoints(segment);
  const coordinateDetection = detectPolylineCoordinateSpace(rawPoints, jawType, component);
  const seating = seatPolylinePointsOnJaw(
    rawPoints,
    jawType,
    component,
    coordinateDetection.coordinateSpace
  );
  const points = seating.points;
  const componentKey = getPolylineComponentKey(jawType, component);
  const edges = getSegmentRenderableEdges(segment, points, component);
  const apiCourseSummary = getPolylineCourseSummary(rawPoints);
  const renderedCourseSummary = getPolylineCourseSummary(points, edges);
  const positionArray = new Float32Array(points.length * 3);
  const apiPositionArray = new Float32Array(rawPoints.length * 3);
  rawPoints.forEach((point, index) => {
    apiPositionArray[index * 3] = point.x;
    apiPositionArray[index * 3 + 1] = point.y;
    apiPositionArray[index * 3 + 2] = point.z;
  });
  points.forEach((point, index) => {
    positionArray[index * 3] = point.x;
    positionArray[index * 3 + 1] = point.y;
    positionArray[index * 3 + 2] = point.z;
  });
  const positionAttribute = new THREE.BufferAttribute(positionArray, 3);
  const group = new THREE.Group();
  group.name = `${jawType}-${component}-polyline-segment-${segmentIndex}`;
  group.visible = isPolylineOverlayVisible &&
    isPolylineJawVisible(jawType) &&
    (polylineComponentVisibility.get(componentKey) ?? true);
  group.userData = {
    overlayType: "polyline",
    arch: jawType,
    component,
    componentKey,
    segmentIndex,
    coordinateSpace: coordinateDetection.coordinateSpace,
    localMedianSurfaceDistance: coordinateDetection.localMedianDistance,
    worldMedianSurfaceDistance: coordinateDetection.worldMedianDistance,
    surfaceSeated: seating.snappedCount > 0,
    surfaceSeatedPointCount: seating.snappedCount,
    maxSurfaceDistance: seating.maxDistance,
    apiCourseSummary,
    renderedCourseSummary,
    apiPositionArray,
    originalPositionArray: positionArray.slice(),
    positionAttribute,
  };

  if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE && seating.snappedCount > 0) {
    console.log("[polyline] seated component on jaw surface", {
      arch: jawType,
      component,
      segmentIndex,
      coordinateSpace: coordinateDetection.coordinateSpace,
      snappedPoints: seating.snappedCount,
      maxDistance: Number(seating.maxDistance.toFixed(3)),
    });
  }

  if (points.length >= 2) {
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: getPolylineSegmentColor(component, segmentIndex),
      transparent: false,
      opacity: 1,
      roughness: 0.28,
      metalness: 0,
      depthTest: polylineDepthTestEnabled,
      depthWrite: false,
    });
    const tubeGroup = new THREE.Group();
    tubeGroup.name = `${jawType}-${component}-polyline-segment-${segmentIndex}-tubes`;
    tubeGroup.renderOrder = 20;
    tubeGroup.userData = {
      overlayType: "polyline-line",
      arch: jawType,
      component,
      componentKey,
      segmentIndex,
      edges,
      tubeMaterial,
      sourcePositionAttribute: positionAttribute,
    };
    edges.forEach(([startIndex, endIndex], edgeIndex) => {
      addPolylineTube(
        tubeGroup,
        createPolylineTubeGeometry(positionAttribute, startIndex, endIndex),
        tubeMaterial,
        jawType,
        component,
        componentKey,
        segmentIndex,
        edgeIndex
      );
    });
    group.add(tubeGroup);
  }

  if (points.length >= 1) {
    const handles = new THREE.Group();
    handles.name = `${jawType}-${component}-polyline-segment-${segmentIndex}-handles`;
    handles.renderOrder = 21;
    handles.userData = {
      overlayType: "polyline-edit-points",
      arch: jawType,
      component,
      componentKey,
      segmentIndex,
      positionAttribute,
    };

    points.forEach((point, index) => {
      const handleMaterial = polylineHandleMaterial.clone();
      handleMaterial.color.setHex(getPolylineSegmentColor(component, segmentIndex));
      handleMaterial.depthTest = polylineDepthTestEnabled;
      handleMaterial.needsUpdate = true;
      const handle = new THREE.Mesh(
        polylineHandleGeometry,
        handleMaterial
      );
      handle.name = `${jawType}-${component}-polyline-segment-${segmentIndex}-point-${index}`;
      handle.position.set(point.x, point.y, point.z);
      handle.renderOrder = 21;
      handle.userData = {
        overlayType: "polyline-edit-point",
        arch: jawType,
        component,
        componentKey,
        segmentIndex,
        index,
        handleGroup: handles,
        positionAttribute,
      };
      handles.add(handle);
    });

    group.add(handles);
  }

  applyJawTransformToPolylineGroup(group, jawType, coordinateDetection.coordinateSpace);

  return group;
}

function renderPolylineData(polylineByJaw) {
  clearPolylineOverlay();

  ["upper", "lower"].forEach((jawType) => {
    const segments = polylineByJaw[jawType] || [];
    segments.forEach((segment, segmentIndex) => {
      const points = getSegmentPoints(segment);
      if (points.length < 2) return;
      const polylineGroup = createPolylineObjects(jawType, segment, segmentIndex);
      polylineOverlayGroup.add(polylineGroup);
    });
  });
  updatePolylineComponentMenu();
  auditRenderedPolylines({ logToConsole: LOG_POLYLINE_AUTO_AUDITS_TO_CONSOLE });
}

function resetPolylineGroup(polylineGroup) {
  const originalPositionArray = polylineGroup.userData?.originalPositionArray;
  const positionAttribute = polylineGroup.userData?.positionAttribute;
  if (!originalPositionArray || !positionAttribute) return;

  for (let index = 0; index < positionAttribute.count; index += 1) {
    positionAttribute.setXYZ(
      index,
      originalPositionArray[index * 3],
      originalPositionArray[index * 3 + 1],
      originalPositionArray[index * 3 + 2]
    );
  }
  positionAttribute.needsUpdate = true;

  polylineGroup.traverse((child) => {
    if (child.userData?.overlayType === "polyline-edit-point") {
      const pointIndex = child.userData.index;
      child.position.set(
        positionAttribute.getX(pointIndex),
        positionAttribute.getY(pointIndex),
        positionAttribute.getZ(pointIndex)
      );
    } else if (child.userData?.overlayType === "polyline-line") {
      syncPolylineTubeGeometries(child);
    } else {
      child.geometry?.computeBoundingSphere?.();
    }
  });
}

function capturePolylineSnapshot() {
  return polylineOverlayGroup.children
    .filter((g) => g.userData?.overlayType === "polyline")
    .map((group) => ({
      group,
      data: group.userData.positionAttribute?.array.slice(),
    }))
    .filter((s) => s.data);
}

function applyPolylineSnapshot(snapshot) {
  snapshot.forEach(({ group, data }) => {
    const posAttr = group.userData?.positionAttribute;
    if (!posAttr || posAttr.array.length !== data.length) return;
    posAttr.array.set(data);
    posAttr.needsUpdate = true;
    group.traverse((child) => {
      if (child.userData?.overlayType === "polyline-edit-point") {
        const idx = child.userData.index;
        child.position.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      } else if (child.userData?.overlayType === "polyline-line") {
        syncPolylineTubeGeometries(child);
      } else {
        child.geometry?.computeBoundingSphere?.();
      }
    });
  });
}

function updatePolylineUndoRedoButtons() {
  if (polylineUndoBtn) polylineUndoBtn.disabled = polylineUndoStack.length === 0;
  if (polylineRedoBtn) polylineRedoBtn.disabled = polylineRedoStack.length === 0;
}

function resetPolylineEdits() {
  polylineUndoStack.length = 0;
  polylineRedoStack.length = 0;
  updatePolylineUndoRedoButtons();
  polylineOverlayGroup.children.forEach(resetPolylineGroup);
  auditRenderedPolylines({ logToConsole: LOG_POLYLINE_AUTO_AUDITS_TO_CONSOLE });
}

function countPolylinePoints(segments) {
  return segments.reduce(
    (total, segment) => total + getSegmentPoints(segment).length,
    0
  );
}

function getPointsFromPackedPositionArray(positionArray) {
  const points = [];
  if (!positionArray?.length) return points;
  for (let index = 0; index + 2 < positionArray.length; index += 3) {
    const point = {
      x: positionArray[index],
      y: positionArray[index + 1],
      z: positionArray[index + 2],
    };
    if (isValidPoint(point)) points.push(point);
  }
  return points;
}

function getPointsFromPositionAttribute(positionAttribute) {
  const points = [];
  if (!positionAttribute?.count) return points;
  for (let index = 0; index < positionAttribute.count; index += 1) {
    const point = {
      x: positionAttribute.getX(index),
      y: positionAttribute.getY(index),
      z: positionAttribute.getZ(index),
    };
    if (isValidPoint(point)) points.push(point);
  }
  return points;
}

function getPolylineAuditIssues(group, apiSummary, renderedSummary) {
  const issues = [];
  const localDistance = group.userData?.localMedianSurfaceDistance;
  const worldDistance = group.userData?.worldMedianSurfaceDistance;
  const maxSurfaceDistance = group.userData?.maxSurfaceDistance;
  const coordinateSpace = group.userData?.coordinateSpace;

  if (renderedSummary.missingEdgeCount > 0) {
    issues.push(`dropped ${renderedSummary.missingEdgeCount} rendered edge(s)`);
  }
  if (apiSummary.maxToMedianRatio >= 6 && apiSummary.maxSegment > 8) {
    issues.push(`API jump at point ${apiSummary.maxSegmentIndex}`);
  }
  if (renderedSummary.maxToMedianRatio >= 6 && renderedSummary.maxSegment > 8) {
    issues.push(`rendered jump at point ${renderedSummary.maxSegmentIndex}`);
  }
  if (
    Number.isFinite(localDistance) &&
    Number.isFinite(worldDistance) &&
    Math.abs(localDistance - worldDistance) < 0.75
  ) {
    issues.push("coordinate space is close/ambiguous");
  }
  if (
    coordinateSpace === "jaw-local" &&
    Number.isFinite(localDistance) &&
    localDistance > 6
  ) {
    issues.push(`far from jaw in jaw-local (${localDistance.toFixed(2)})`);
  }
  if (
    coordinateSpace === "scene-world" &&
    Number.isFinite(worldDistance) &&
    worldDistance > 6
  ) {
    issues.push(`far from jaw in scene-world (${worldDistance.toFixed(2)})`);
  }
  if (Number.isFinite(maxSurfaceDistance) && maxSurfaceDistance > 8) {
    issues.push(`large surface seating distance (${maxSurfaceDistance.toFixed(2)})`);
  }

  return issues;
}

function auditRenderedPolylines({ logToConsole = true } = {}) {
  const rows = [];
  polylineOverlayGroup.children.forEach((group) => {
    if (group.userData?.overlayType !== "polyline") return;

    const tubeGroup = group.children.find(
      (child) => child.userData?.overlayType === "polyline-line"
    );
    const edges = tubeGroup?.userData?.edges || [];
    const apiPoints = getPointsFromPackedPositionArray(group.userData?.apiPositionArray);
    const renderedPoints = getPointsFromPositionAttribute(group.userData?.positionAttribute);
    const apiSummary = getPolylineCourseSummary(apiPoints);
    const renderedSummary = getPolylineCourseSummary(renderedPoints, edges);
    const issues = getPolylineAuditIssues(group, apiSummary, renderedSummary);

    rows.push({
      arch: group.userData.arch,
      component: group.userData.component,
      segment: group.userData.segmentIndex,
      coordinateSpace: group.userData.coordinateSpace,
      apiPoints: apiSummary.pointCount,
      renderedEdges: renderedSummary.renderedEdgeCount,
      missingEdges: renderedSummary.missingEdgeCount,
      apiMaxSegment: apiSummary.maxSegment,
      renderedMaxSegment: renderedSummary.maxSegment,
      localMedianSurfaceDistance: Number.isFinite(group.userData.localMedianSurfaceDistance)
        ? Number(group.userData.localMedianSurfaceDistance.toFixed(3))
        : null,
      worldMedianSurfaceDistance: Number.isFinite(group.userData.worldMedianSurfaceDistance)
        ? Number(group.userData.worldMedianSurfaceDistance.toFixed(3))
        : null,
      surfaceSeatedPoints: group.userData.surfaceSeatedPointCount || 0,
      issueCount: issues.length,
      issues: issues.join("; "),
      apiSummary,
      renderedSummary,
    });
  });

  rows.sort((a, b) => b.issueCount - a.issueCount || a.arch.localeCompare(b.arch));
  window.lastPolylineAudit = rows;
  if (!logToConsole) return rows;
  if (rows.length) {
    console.table(
      rows.map(({ apiSummary, renderedSummary, ...row }) => row)
    );
  } else {
    console.log("[polyline] audit found no rendered polylines.");
  }
  return rows;
}

function syncPolylineOverlayVisibility() {
  polylineOverlayGroup.visible = true;
  polylineOverlayGroup.children.forEach((group) => {
    const key = group.userData?.componentKey;
    const arch = group.userData?.arch;
    group.visible =
      isPolylineOverlayVisible &&
      isPolylineJawVisible(arch) &&
      (polylineComponentVisibility.get(key) ?? true);
    applyPolylineJawOpacity(arch);
  });

  if (polylineMenuButton) {
    const componentCount = getPolylineComponentSummary().filter(({ points }) => points > 0).length;
    const _polylineLabel = isPolylineOverlayVisible
      ? `Polylines (${componentCount})`
      : `Polylines hidden (${componentCount})`;
    polylineMenuButton.setAttribute("aria-label", _polylineLabel);
    polylineMenuButton.title = _polylineLabel;
  }
  syncPolylineFocusMode();
}

function syncPolylineDepthTest() {
  polylineOverlayGroup.traverse((child) => {
    const overlayType = child.userData?.overlayType;
    if (
      overlayType !== "polyline-tube" &&
      overlayType !== "polyline-edit-point"
    ) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((materialEntry) => {
      if (!materialEntry) return;
      materialEntry.depthTest = polylineDepthTestEnabled;
      materialEntry.depthWrite = false;
      materialEntry.needsUpdate = true;
    });
  });
}

window.auditPolylines = auditRenderedPolylines;

function getPolylineComponentSummary() {
  const summary = new Map();
  polylineOverlayGroup.children.forEach((group) => {
    const key = group.userData?.componentKey;
    if (!key) return;

    const current = summary.get(key) || {
      key,
      color: getPolylineSegmentColor(group.userData.component, 0),
      segments: 0,
      points: 0,
    };
    current.segments += 1;
    current.points += group.userData.positionAttribute?.count || 0;
    summary.set(key, current);
  });

  const loadedArches = new Set();
  polylineOverlayGroup.children.forEach((group) => {
    const arch = group.userData?.arch;
    if (arch) loadedArches.add(arch);
  });
  if (!loadedArches.size) {
    getLoadedPolylineJawKeys().forEach((arch) => loadedArches.add(arch));
  }
  if (!loadedArches.size) {
    loadedArches.add("upper");
    loadedArches.add("lower");
  }

  loadedArches.forEach((arch) => {
    POLYLINE_APP_COMPONENTS.forEach((component) => {
      const key = getPolylineComponentKey(arch, component);
      if (summary.has(key)) return;
      summary.set(key, {
        key,
        color: getPolylineSegmentColor(component, 0),
        segments: 0,
        points: 0,
      });
    });
  });

  return Array.from(summary.values()).sort((a, b) => {
    const rankDelta =
      getPolylineComponentSortRank(a.key) - getPolylineComponentSortRank(b.key);
    if (rankDelta) return rankDelta;
    return formatPolylineComponentLabel(a.key).localeCompare(
      formatPolylineComponentLabel(b.key)
    );
  });
}

function updatePolylineComponentMenu() {
  const summary = getPolylineComponentSummary().filter(({ points }) => points > 0);
  summary.forEach(({ key }) => {
    if (!polylineComponentVisibility.has(key)) {
      polylineComponentVisibility.set(
        key,
        isPolylineComponentVisibleByDefault(key)
      );
    }
  });

  if (!polylineMenuList || !polylineMenuButton) return;

  polylineMenuList.replaceChildren();
  if (!summary.length) {
    isPolylineOverlayVisible = false;
    const empty = document.createElement("div");
    empty.textContent = "No polyline components";
    empty.style.padding = "8px 0";
    empty.style.color = "#6b7280";
    polylineMenuList.appendChild(empty);
    syncPolylineOverlayVisibility();
    window.syncComponentPanelRows?.();
    return;
  }

  isPolylineOverlayVisible = Array.from(
    polylineComponentVisibility.values()
  ).some(Boolean);

  summary.forEach(({ key, color, segments, points }) => {
    const row = document.createElement("label");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "18px 14px 1fr";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "6px 0";
    row.style.cursor = "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = polylineComponentVisibility.get(key) ?? true;
    checkbox.addEventListener("change", () => {
      polylineComponentVisibility.set(key, checkbox.checked);
      isPolylineOverlayVisible = Array.from(
        polylineComponentVisibility.values()
      ).some(Boolean);
      syncPolylineOverlayVisibility();
    });

    const swatch = document.createElement("span");
    swatch.style.width = "14px";
    swatch.style.height = "14px";
    swatch.style.borderRadius = "50%";
    swatch.style.background = `#${color.toString(16).padStart(6, "0")}`;
    swatch.style.display = "inline-block";

    const text = document.createElement("span");
    text.textContent = `${formatPolylineComponentLabel(key)} (${segments} seg, ${points} pts)`;
    text.style.fontSize = "15px";
    text.style.lineHeight = "1.3";

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    polylineMenuList.appendChild(row);
  });

  syncPolylineOverlayVisibility();
  window.syncComponentPanelRows?.();
}

function setPolylineMenuVisibility(filterSummaryItem, isVisible) {
  getPolylineComponentSummary().forEach((summaryItem) => {
    if (filterSummaryItem(summaryItem)) {
      polylineComponentVisibility.set(summaryItem.key, isVisible);
    }
  });
  isPolylineOverlayVisible = Array.from(polylineComponentVisibility.values()).some(
    Boolean
  );
  updatePolylineComponentMenu();
}

function createPolylineVisibilityToggle(container, domElement) {
  if (document.getElementById("polyline-visibility-menu")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "polyline-visibility-menu";
  wrapper.style.position = "static";
  wrapper.style.zIndex = "1000";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "stretch";
  wrapper.style.gap = "8px";
  wrapper.style.pointerEvents = "none";
  wrapper.style.order = "60";

  const button = document.createElement("button");
  button.id = "polyline-visibility-toggle";
  button.type = "button";
  button.setAttribute("aria-label", "Polylines (0)");
  button.title = "Polylines (0)";
  const _polylineBp = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";
  button.innerHTML = `<img src="${_polylineBp}/assets/Icon_Hide_SkeletalPrev.png" alt="Polylines">`;
  button.style.padding = "10px 14px";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.background = "#6f35ff";
  button.style.color = "white";
  button.style.fontWeight = "bold";
  button.style.cursor = "pointer";
  button.style.width = "100%";
  button.style.height = "40px";
  button.style.pointerEvents = "auto";

  const panel = document.createElement("div");
  panel.id = "polyline-visibility-panel";
  panel.style.display = "none";
  panel.style.position = "absolute";
  panel.style.right = "20px";
  panel.style.top = "50%";
  panel.style.transform = "translateY(-50%)";
  panel.style.zIndex = "1002";
  panel.style.width = "min(360px, calc(100vw - 40px))";
  panel.style.maxHeight = "calc(100% - 40px)";
  panel.style.overflow = "auto";
  panel.style.background = "rgba(20, 20, 26, 0.97)";
  panel.style.color = "#f0eff4";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.14)";
  panel.style.borderRadius = "10px";
  panel.style.boxShadow = "0 8px 28px rgba(0, 0, 0, 0.45)";
  panel.style.padding = "14px";
  panel.style.pointerEvents = "auto";
  panel.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  panel.addEventListener("wheel", (event) => {
    event.stopPropagation();
  });

  const updatePolylineMenuLayout = () => {
    const phone = window.innerWidth <= 768;
    const tablet = window.innerWidth <= 1024;
    const compact = window.innerWidth <= 640 || window.innerHeight <= 720;
    button.style.width = phone ? "128px" : tablet ? "140px" : "100%";
    button.style.height = phone ? "60px" : tablet ? "64px" : "56px";
    if (phone) {
      panel.style.left = "12px";
      panel.style.right = "auto";
      panel.style.top = "auto";
      panel.style.bottom = "calc(86px + env(safe-area-inset-bottom, 0px))";
      panel.style.transform = "none";
      panel.style.width = "min(300px, calc(100vw - 24px))";
      panel.style.maxHeight = "calc(100% - 112px)";
    } else if (tablet) {
      panel.style.left = "16px";
      panel.style.right = "auto";
      panel.style.top = "auto";
      panel.style.bottom = "calc(130px + env(safe-area-inset-bottom, 0px))";
      panel.style.transform = "none";
      panel.style.width = "min(320px, calc(100vw - 32px))";
      panel.style.maxHeight = "calc(100% - 154px)";
    } else {
      panel.style.left = "16px";
      panel.style.right = "auto";
      panel.style.top = "50%";
      panel.style.bottom = "auto";
      panel.style.transform = "translateY(-50%)";
      panel.style.width = "min(400px, calc(100vw - 240px))";
      panel.style.maxHeight = compact
        ? "calc(100% - 24px)"
        : "calc(100% - 40px)";
    }
  };

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.flexWrap = "wrap";
  actions.style.gap = "6px";
  actions.style.marginBottom = "8px";
  actions.style.position = "sticky";
  actions.style.top = "0";
  actions.style.zIndex = "1";
  actions.style.paddingBottom = "6px";
  actions.style.background = "rgba(20, 20, 26, 0.97)";

  const makeActionButton = (label, onClick) => {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.textContent = label;
    actionButton.style.flex = "1";
    actionButton.style.padding = "8px 10px";
    actionButton.style.border = "1px solid rgba(255, 255, 255, 0.18)";
    actionButton.style.borderRadius = "6px";
    actionButton.style.background = "rgba(255, 255, 255, 0.08)";
    actionButton.style.color = "#f0eff4";
    actionButton.style.cursor = "pointer";
    actionButton.style.fontSize = "14px";
    actionButton.addEventListener("click", onClick);
    return actionButton;
  };

  const closePolylineButton = makeActionButton("\u00d7", () => {
    panel.style.display = "none";
  });
  closePolylineButton.title = "Close polylines";
  closePolylineButton.setAttribute("aria-label", "Close polylines");
  closePolylineButton.style.flex = "0 0 44px";
  closePolylineButton.style.background = "#b91c1c";
  closePolylineButton.style.borderColor = "#ef4444";
  closePolylineButton.style.color = "#ffffff";
  closePolylineButton.style.fontSize = "20px";
  closePolylineButton.style.fontWeight = "800";
  actions.appendChild(closePolylineButton);
  let _polylineAllVisible = true;
  const _eyeToggleBtn = makeActionButton("", () => {
    _polylineAllVisible = !_polylineAllVisible;
    setPolylineMenuVisibility(() => true, _polylineAllVisible);
    _eyeToggleBtn.innerHTML = _polylineAllVisible
      ? '<i class="fa fa-eye" aria-hidden="true"></i>'
      : '<i class="fa fa-eye-slash" aria-hidden="true"></i>';
    const _lbl = _polylineAllVisible ? "Hide all" : "Show all";
    _eyeToggleBtn.title = _lbl;
    _eyeToggleBtn.setAttribute("aria-label", _lbl);
  });
  _eyeToggleBtn.innerHTML = '<i class="fa fa-eye" aria-hidden="true"></i>';
  _eyeToggleBtn.title = "Hide all";
  _eyeToggleBtn.setAttribute("aria-label", "Hide all");
  actions.appendChild(_eyeToggleBtn);
  const _resetBtn = makeActionButton("", resetPolylineEdits);
  _resetBtn.innerHTML = `<img src="${_polylineBp}/assets/reset.png" alt="Reset" style="width:22px;height:22px;object-fit:contain;display:block;margin:auto;pointer-events:none;">`;
  _resetBtn.title = "Reset polylines";
  _resetBtn.setAttribute("aria-label", "Reset polylines");
  _resetBtn.style.background = "#ffffff";
  _resetBtn.style.borderColor = "rgba(0, 0, 0, 0.18)";
  _resetBtn.style.color = "#222222";
  actions.appendChild(_resetBtn);

  const _undoBtn = makeActionButton("", () => {
    if (!polylineUndoStack.length) return;
    const snapshot = polylineUndoStack.pop();
    polylineRedoStack.push(capturePolylineSnapshot());
    applyPolylineSnapshot(snapshot);
    updatePolylineUndoRedoButtons();
  });
  _undoBtn.innerHTML = `<img src="${_polylineBp}/assets/Icon_undo2.png" alt="Undo" style="width:22px;height:22px;object-fit:contain;display:block;margin:auto;pointer-events:none;">`;
  _undoBtn.title = "Undo";
  _undoBtn.setAttribute("aria-label", "Undo");
  _undoBtn.disabled = true;
  actions.appendChild(_undoBtn);

  const _redoBtn = makeActionButton("", () => {
    if (!polylineRedoStack.length) return;
    const snapshot = polylineRedoStack.pop();
    polylineUndoStack.push(capturePolylineSnapshot());
    applyPolylineSnapshot(snapshot);
    updatePolylineUndoRedoButtons();
  });
  _redoBtn.innerHTML = `<img src="${_polylineBp}/assets/Icon_redo2.png" alt="Redo" style="width:22px;height:22px;object-fit:contain;display:block;margin:auto;pointer-events:none;">`;
  _redoBtn.title = "Redo";
  _redoBtn.setAttribute("aria-label", "Redo");
  _redoBtn.disabled = true;
  actions.appendChild(_redoBtn);

  polylineUndoBtn = _undoBtn;
  polylineRedoBtn = _redoBtn;

  const list = document.createElement("div");
  panel.appendChild(actions);
  panel.appendChild(list);

  button.addEventListener("click", () => {
    if (window.viewerPanelManager) {
      window.viewerPanelManager.toggle("polylines-panel");
      return;
    }
    const willOpen = panel.style.display === "none";
    panel.style.display = willOpen ? "block" : "none";
    if (willOpen) updatePolylineMenuLayout();
  });
  window.addEventListener("resize", updatePolylineMenuLayout);

  wrapper.appendChild(button);
  getViewerRightNav().appendChild(wrapper);
  (container || document.getElementById("container3D") || document.body).appendChild(panel);
  window.viewerPanelManager?.register(
    "polylines-panel",
    button,
    () => { panel.style.display = "block"; updatePolylineMenuLayout(); },
    () => { panel.style.display = "none"; }
  );
  updatePolylineMenuLayout();

  polylineMenuButton = button;
  polylineMenuList = list;
  updatePolylineComponentMenu();
  attachPolylineDragHandlers(domElement);
}

async function fetchAndRenderPolylines(caseIntID) {
  const totalStartedAt = performance.now();
  if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.time("viewer: total polyline load");
  const fetchStartedAt = performance.now();
  if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.time("viewer: fetch polylines");
  let isPolylineFetchTimerActive = true;
  let isPolylineNormalizeTimerActive = false;
  let isPolylineRenderTimerActive = false;
  let isPolylineTotalTimerActive = true;
  clearPolylineOverlay();

  const polylinePayload = [
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      // Fallback UUID keeps direct/shared viewer URLs able to load case assets.
      // Prefer loggedInUser.uuid if this viewer is later wired to authenticated sessions.
      uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
      caseIntID,
    },
    {
      case_id: caseIntID,
    },
  ];

  try {
    const response = await apiClient.post(
      POLYLINE_ENDPOINT,
      polylinePayload,
      false,
      "Polyline"
    );
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: fetch polylines");
    addViewerLoadTiming("fetch polylines", performance.now() - fetchStartedAt);
    isPolylineFetchTimerActive = false;
    resetPolylineDiagnostics();
    const normalizeStartedAt = performance.now();
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.time("viewer: normalize polyline response");
    isPolylineNormalizeTimerActive = true;
    const normalized = normalizePolylineResponse(response);
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: normalize polyline response");
    addViewerLoadTiming(
      "normalize polyline response",
      performance.now() - normalizeStartedAt
    );
    isPolylineNormalizeTimerActive = false;
    logPolylineDiagnostics();
    const upperPointCount = countPolylinePoints(normalized.upper);
    const lowerPointCount = countPolylinePoints(normalized.lower);
    const hasAnyPoints = upperPointCount || lowerPointCount;
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) {
      console.log("[polyline] points", {
        upper: upperPointCount,
        lower: lowerPointCount,
      });
    }

    if (!hasAnyPoints) {
      if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) {
        console.log("[polyline] No polyline data returned.");
        console.timeEnd("viewer: total polyline load");
      }
      addViewerLoadTiming("total polyline load", performance.now() - totalStartedAt);
      isPolylineTotalTimerActive = false;
      return;
    }

    const renderStartedAt = performance.now();
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.time("viewer: render polylines");
    isPolylineRenderTimerActive = true;
    renderPolylineData(normalized);
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: render polylines");
    addViewerLoadTiming("render polylines", performance.now() - renderStartedAt, {
      upperPoints: upperPointCount,
      lowerPoints: lowerPointCount,
    });
    isPolylineRenderTimerActive = false;
    logViewerObjectCounts("after polyline render");
    if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: total polyline load");
    addViewerLoadTiming("total polyline load", performance.now() - totalStartedAt);
    isPolylineTotalTimerActive = false;
  } catch (error) {
    if (isPolylineFetchTimerActive) {
      if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: fetch polylines");
      addViewerLoadTiming("fetch polylines", performance.now() - fetchStartedAt, {
        status: "failed",
      });
    }
    if (isPolylineNormalizeTimerActive) {
      if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: normalize polyline response");
    }
    if (isPolylineRenderTimerActive) {
      if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: render polylines");
    }
    if (isPolylineTotalTimerActive) {
      if (LOG_POLYLINE_LOAD_DETAILS_TO_CONSOLE) console.timeEnd("viewer: total polyline load");
      addViewerLoadTiming("total polyline load", performance.now() - totalStartedAt, {
        status: "failed",
      });
    }
    console.warn("[polyline] Unable to fetch polyline data.", error);
  }
}

async function fetchAndRenderCaseOverlays(caseIntID) {
  const overlaysStartedAt = performance.now();
  startViewerLoadTimer("viewer: case overlays");
  await Promise.all([
    fetchAndRenderPolylines(caseIntID),
    artificialTeethRenderer.fetchAndRender(caseIntID),
  ]);
  endViewerLoadTimer("viewer: case overlays");
  addViewerLoadTiming("case overlays", performance.now() - overlaysStartedAt);
  logViewerObjectCounts("after case overlays");
}

function updatePointerPosition(event, domElement) {
  const bounds = domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
}

function getPolylinePointHandles() {
  const handles = [];
  polylineOverlayGroup.traverse((child) => {
    if (
      child.userData?.overlayType === "polyline-edit-point" &&
      child.visible &&
      child.parent?.parent?.visible !== false
    ) {
      handles.push(child);
    }
  });
  return handles;
}

function isSolidPolylineOccluder(child) {
  if (!child.isMesh || !child.visible) return false;

  const materials = Array.isArray(child.material) ? child.material : [child.material];
  return materials.some((materialEntry) => {
    if (!materialEntry) return false;
    const opacity = materialEntry.opacity ?? 1;
    return materialEntry.depthWrite !== false && opacity > 0.95;
  });
}

function getPolylineOccluderMeshes() {
  return parentObject.children.filter(isSolidPolylineOccluder);
}

function isPolylineHandleOccluded(hit) {
  const occluders = getPolylineOccluderMeshes();
  if (!occluders.length) return false;

  const occluderHits = raycaster.intersectObjects(occluders, true);
  const nearestOccluder = occluderHits.find((item) => item.object.visible);
  return Boolean(nearestOccluder && nearestOccluder.distance < hit.distance - 0.05);
}

function pickPolylinePoint(event, domElement) {
  updatePointerPosition(event, domElement);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(getPolylinePointHandles(), false);
  const hit = intersections.find((item) =>
    Number.isInteger(item.object?.userData?.index)
  );
  if (!hit || isPolylineHandleOccluded(hit)) return null;
  return {
    handle: hit.object,
    index: hit.object.userData.index,
    point: hit.point,
  };
}

function refreshPolylineGeometryForHandle(handle) {
  const handleGroup = handle.userData.handleGroup;
  const polylineGroup = handleGroup?.parent;
  polylineGroup?.children.forEach((child) => {
    if (child.userData?.overlayType === "polyline-line") {
      syncPolylineTubeGeometries(child);
    } else {
      child.geometry?.computeBoundingSphere?.();
    }
  });
}

function updatePolylinePointFromLocal(handle, index, localPoint, options = {}) {
  const handleGroup = handle.userData.handleGroup;
  const positionAttribute = handle.userData.positionAttribute;
  if (!positionAttribute) return;

  positionAttribute.setXYZ(index, localPoint.x, localPoint.y, localPoint.z);
  positionAttribute.needsUpdate = true;
  handle.position.copy(localPoint);

  refreshPolylineGeometryForHandle(handle);
}

function updatePolylinePoint(handle, index, worldPoint, options = {}) {
  const handleGroup = handle.userData.handleGroup;
  const localPoint = handleGroup.worldToLocal(worldPoint.clone());
  updatePolylinePointFromLocal(handle, index, localPoint, options);
}

function setPolylineDragging(enabled) {
  if (controls) controls.enabled = !enabled;
  if (orb_controls) orb_controls.enabled = !enabled;
}

function attachPolylineDragHandlers(domElement) {
  if (!domElement || domElement.dataset.polylineDragBound === "true") return;
  domElement.dataset.polylineDragBound = "true";

  domElement.addEventListener("pointerdown", (event) => {
    const hit = pickPolylinePoint(event, domElement);
    if (!hit) return;

    polylinePreDragSnapshot = capturePolylineSnapshot();
    event.preventDefault();
    domElement.setPointerCapture?.(event.pointerId);
    camera.getWorldDirection(polylineCameraDirection);
    polylineDragPlane.setFromNormalAndCoplanarPoint(
      polylineCameraDirection,
      hit.point
    );
    activePolylineDrag = {
      handle: hit.handle,
      index: hit.index,
      pointerId: event.pointerId,
    };
    setPolylineDragging(true);
  });

  domElement.addEventListener("pointermove", (event) => {
    if (!activePolylineDrag) {
      domElement.style.cursor = pickPolylinePoint(event, domElement)
        ? "grab"
        : "";
      return;
    }

    updatePointerPosition(event, domElement);
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.ray.intersectPlane(polylineDragPlane, polylineDragPoint)) {
      updatePolylinePoint(
        activePolylineDrag.handle,
        activePolylineDrag.index,
        polylineDragPoint
      );
    }
    domElement.style.cursor = "grabbing";
  });

  const stopDragging = (event) => {
    if (!activePolylineDrag) return;
    domElement.releasePointerCapture?.(activePolylineDrag.pointerId);
    activePolylineDrag = null;
    setPolylineDragging(false);
    domElement.style.cursor = pickPolylinePoint(event, domElement) ? "grab" : "";
    if (polylinePreDragSnapshot) {
      polylineUndoStack.push(polylinePreDragSnapshot);
      if (polylineUndoStack.length > 50) polylineUndoStack.shift();
      polylineRedoStack.length = 0;
      polylinePreDragSnapshot = null;
      updatePolylineUndoRedoButtons();
    }
  };

  domElement.addEventListener("pointerup", stopDragging);
  domElement.addEventListener("pointercancel", stopDragging);
  domElement.addEventListener("pointerleave", (event) => {
    if (activePolylineDrag) stopDragging(event);
  });
}

function setupChatToggle() {
  const chatWidget = document.getElementById("chat-widget");
  const chatIcon = document.getElementById("chat-icon");
  if (!chatWidget || !chatIcon || chatIcon.dataset.viewerChatBound === "true") {
    return;
  }

  chatIcon.dataset.viewerChatBound = "true";
  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  let hideChatButton = document.getElementById("hide-chat-button");
  if (!hideChatButton) {
    hideChatButton = document.createElement("button");
    hideChatButton.id = "hide-chat-button";
    hideChatButton.type = "button";
    hideChatButton.textContent = "Hide Chat";
    hideChatButton.style.alignSelf = "flex-end";
    hideChatButton.style.marginBottom = "8px";
    hideChatButton.style.border = "none";
    hideChatButton.style.borderRadius = "6px";
    hideChatButton.style.background = "#1d4ed8";
    hideChatButton.style.color = "white";
    hideChatButton.style.padding = "6px 10px";
    hideChatButton.style.fontSize = "12px";
    hideChatButton.style.cursor = "pointer";
    chatWidget.prepend(hideChatButton);
  }

  chatIcon.style.display = "block";
  chatIcon.style.position = "static";
  chatIcon.style.width = "56px";
  chatIcon.style.height = "56px";
  chatIcon.style.zIndex = "1003";
  chatIcon.style.alignSelf = "center";
  getViewerMetaBar().appendChild(chatIcon);

  chatWidget.classList.remove("active");
  chatWidget.style.display = "none";
  chatWidget.style.zIndex = "1003";
  chatIcon.style.display = "block";

  chatIcon.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = chatWidget.style.display === "flex";
    chatWidget.classList.toggle("active", !isOpen);
    chatWidget.style.display = isOpen ? "none" : "flex";
    chatIcon.style.display = isOpen ? "block" : "none";
  });

  hideChatButton.addEventListener("click", (event) => {
    event.stopPropagation();
    chatWidget.classList.remove("active");
    chatWidget.style.display = "none";
    chatIcon.style.display = "block";
  });
}

function createViewerLoadingScreen() {
  if (document.getElementById("viewer-loading-screen")) return;
  const style = document.createElement("style");
  style.id = "viewer-loading-screen-style";
  style.textContent = `
    #viewer-loading-screen {
      position: absolute;
      inset: 0;
      z-index: 9500;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8f5fb;
      transition: opacity 0.35s ease;
    }
    #viewer-loading-screen.vls-fade {
      opacity: 0;
      pointer-events: none;
    }
    .vls-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 36px 48px;
      background: rgba(255,255,255,0.22);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 28px rgba(0,0,0,0.14);
      width: min(480px, 88vw);
    }
    .vls-logo {
      width: 80px;
      height: 80px;
      object-fit: contain;
      display: block;
    }
    .vls-bar-track {
      width: 100%;
      height: 6px;
      background: rgba(0,0,0,0.14);
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }
    .vls-bar-fill {
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #1a6bbf, #4fa3e8);
      border-radius: 3px;
      animation: loading 1.4s ease-in-out infinite;
    }
    #vls-progress {
      width: 100%;
      height: 14px;
      border: none;
      border-radius: 7px;
      overflow: hidden;
      display: none;
    }
    #vls-progress::-webkit-progress-bar {
      background: rgba(0,0,0,0.12);
      border-radius: 7px;
    }
    #vls-progress::-webkit-progress-value {
      background: linear-gradient(90deg, #d97706, #fbbf24);
      border-radius: 7px;
    }
    #vls-progress::-moz-progress-bar {
      background: linear-gradient(90deg, #d97706, #fbbf24);
      border-radius: 7px;
    }
    .vls-info-row {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    #vls-percent {
      font-family: "Montserrat", sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: #1a3a5c;
      min-width: 46px;
    }
    #vls-display {
      font-family: "Montserrat", sans-serif;
      font-size: 14px;
      color: rgba(26,58,92,0.75);
      text-align: right;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vls-status {
      font-family: "Montserrat", sans-serif;
      font-size: 14px;
      color: #1a3a5c;
      font-weight: 500;
      text-align: center;
      min-height: 16px;
      opacity: 0.85;
      width: 100%;
    }
  `;
  document.head.appendChild(style);
  const screen = document.createElement("div");
  screen.id = "viewer-loading-screen";
  screen.innerHTML = `
    <div class="vls-card">
      <img class="vls-logo" src="../../assets/profile.png" alt="SmartRPD">
      <div class="vls-bar-track"><div class="vls-bar-fill"></div></div>
      <div class="vls-status" id="vls-status">Initialising…</div>
      <progress id="vls-progress" value="0" max="100"></progress>
      <div class="vls-info-row">
        <span id="vls-percent"></span>
        <span id="vls-display"></span>
      </div>
    </div>`;
  (viewerContainer || document.body).appendChild(screen);
  window.viewerLoadingEls = {
    progressBar: screen.querySelector("#vls-progress"),
    percentage:  screen.querySelector("#vls-percent"),
    displayBox:  screen.querySelector("#vls-display"),
  };
  window.updateViewerLoading = (label) => {
    const el = document.getElementById("vls-status");
    if (el) el.textContent = label || "Loading…";
  };
}

function removeViewerLoadingScreen() {
  const screen = document.getElementById("viewer-loading-screen");
  if (!screen) return;
  screen.classList.add("vls-fade");
  setTimeout(() => {
    screen.remove();
    document.getElementById("viewer-loading-screen-style")?.remove();
  }, 380);
  delete window.updateViewerLoading;
  delete window.viewerLoadingEls;
}

//The async prevents processing of data before the stuff is loaded in
(async () => {
  if (!viewerContainer) {
    return;
  }
  const basePath = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";
  createViewerLoadingScreen();
  const viewerTotalStartedAt = performance.now();
  const pageInitializationStartedAt = performance.now();
  startViewerLoadTimer("viewer: page/viewer initialization");

  //datas :)
  // this for the undercut upper and the main json data use to retrieve stuff
  const data = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    // Fallback UUID keeps direct/shared viewer URLs able to load case assets.
    // Prefer loggedInUser.uuid if this viewer is later wired to authenticated sessions.
    uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid
    case_int_id: paramValue,
    jaw_type: 2,
    caseIntID: paramValue,
  };
  // this for the undercut lower
  const data2 = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    // Fallback UUID keeps direct/shared viewer URLs able to load case assets.
    // Prefer loggedInUser.uuid if this viewer is later wired to authenticated sessions.
    uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid
    case_int_id: paramValue,
    jaw_type: 1,
    caseIntID: paramValue,
  };
  const caseInfoEndpoint = "/case/get/" + paramValue;
  const thumbnailEndpoint = "/thumbnails/get";
  const heatmapEndpoint = "/undercutheatmap/get";
  let positionData;
  const caseInfoPromise = apiClient.post(
    caseInfoEndpoint,
    [data],
    false,
    "Case Info"
  );
  const thumbnailPromise = apiClient.post(
    thumbnailEndpoint,
    [data],
    false,
    "2D image"
  );

  //This section is for the processing of creation date, case id and last updated
  try {
    positionData = await caseInfoPromise;
    window.caseID = positionData.case_id;
    window.lastEdited = unixToHumanReadable(positionData.last_updated);
    window.username = positionData.username;
  } catch (error) {
    console.error("Error fetching case info:", error);
  }

  const metaDatesSection = document.createElement("div");
  metaDatesSection.id = "viewer-meta-dates";
  metaDatesSection.style.order = "85";
  getViewerRightNav().appendChild(metaDatesSection);

  //for all the text info — added to sidebar
  if (positionData) {
    const time = unixToHumanReadable(positionData.creation_date);
    const update_time = unixToHumanReadable(positionData.last_updated);
    createTextbox("Creation Date: " + time, "bottom-left");
    createTextbox(
      "Last Updated: " +
        update_time +
        " — " +
        positionData.username,
      "bottom-left2"
    );
  }

  try {
    const thumbnailData = await thumbnailPromise;
      //console.log('Success thumb:', thumbnailData)
      for (const thumb in thumbnailData) {
        if (thumbnailData[thumb].slot == 0) {
          const test = thumbnailData[thumb].data;
          window.thumbnailBase64 = test;
          const isMobile =
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
              navigator.userAgent
            );
          // Container for thumbnail + 2D buttons
          const thumbWrapper = document.createElement("div");
          thumbWrapper.dataset.twodViewerBlock = "true";
          thumbWrapper.className = "twod-viewer-nav-block";
          thumbWrapper.style.order = "1";
          thumbWrapper.style.overflow = "hidden";
          thumbWrapper.style.maxHeight = "270px";

          // Create thumbnail button
          const button = document.createElement("button");
          button.dataset.twodViewerButton = "true";
          button.style.padding = "0";
          button.style.border = "none";
          button.style.background = "none";
          button.style.cursor = "pointer";
          button.style.width = "100%";
          button.style.height = "auto";
          button.style.position = "relative";

          // Create thumbnail image
          const img = new Image();
          img.src = "data:image/png;base64," + test;
          img.style.width = "100%";
          img.style.height = "auto";
          img.style.maxHeight = "270px";
          img.style.objectFit = "cover";
          img.style.display = "block";
          img.style.transform = "none";
          button.appendChild(img);

          // Create "Click me" watermark overlay
          const watermark = document.createElement("div");
          watermark.textContent = "Click me";
          watermark.style.position = "absolute";
          watermark.style.top = "50%";
          watermark.style.left = "50%";
          watermark.style.transform = "translate(-50%, -50%)";
          watermark.style.color = "#0078d4";
          watermark.style.fontWeight = "bold";
          watermark.style.fontSize = "18px";
          watermark.style.textShadow = "1px 1px 3px rgba(255, 255, 255, 0.9)";
          watermark.style.pointerEvents = "none";
          button.appendChild(watermark);

          // Append to wrapper
          thumbWrapper.appendChild(button);

          // Static 2D buttons below the image
          const btnContainer = document.createElement("div");
          btnContainer.style.display = "flex";
          btnContainer.style.flexDirection = "column";
          btnContainer.style.gap = "6px";

          /* const approve2DStatic = document.createElement('button');
approve2DStatic.className = 'smart-btn approve';
approve2DStatic.textContent = 'Approve 2D';
approve2DStatic.onclick = () => sendEmail("Your 2D Design has been APPROVED.");
btnContainer.appendChild(approve2DStatic);

const edit2DStatic = document.createElement('button');
edit2DStatic.className = 'smart-btn edit';
edit2DStatic.textContent = 'Edit 2D';
edit2DStatic.onclick = () => sendEmail("Please do some modifications on 2D Design. See Notebox.");
btnContainer.appendChild(edit2DStatic); */

          // Append buttons to wrapper
          thumbWrapper.appendChild(btnContainer);

          // Append into the right nav sidebar
          getViewerRightNav().appendChild(thumbWrapper);

          function openTwodOverlay() {
            // Fullscreen overlay
            const overlay = document.createElement("div");
            overlay.className = "twod-overlay";

            // Group container (card)
            const twodGroup = document.createElement("div");
            twodGroup.className = "twod-group";
            twodGroup.style.position = "relative"; // Required to position watermark relative to image

            // Enlarged image
            const enlargedImg = new Image();
            enlargedImg.src = img.src;
            enlargedImg.className = "twod-fullscreen-image";
            twodGroup.appendChild(enlargedImg);

            // Watermark centered on image
            const watermark = document.createElement("div");
            watermark.textContent = `🦷 Case: ${window.caseID || "N/A"}`;
            watermark.className = "case-title-watermark";
            watermark.style.position = "absolute";
            watermark.style.top = "50%";
            watermark.style.left = "50%";
            watermark.style.transform = "translate(-50%, -50%)"; // true center
            watermark.style.color = "white";
            watermark.style.fontSize = "32px";
            watermark.style.fontWeight = "bold";
            watermark.style.textShadow = "0px 0px 10px rgba(0, 0, 0, 0.8)";
            watermark.style.pointerEvents = "none";
            watermark.style.zIndex = "1";

            twodGroup.appendChild(watermark);

            // // 1️⃣ 创建 canvas
            // const canvas = document.createElement('canvas');
            // canvas.width = enlargedImg.naturalWidth;
            // canvas.height = enlargedImg.naturalHeight;

            // const ctx = canvas.getContext('2d');

            // // 2️⃣ 绘制底图
            // const baseImage = new Image();
            // baseImage.onload = () => {
            //   ctx.drawImage(baseImage, 0, 0);

            //   // 3️⃣ 画水印文字
            //   const caseID = window.caseID || "N/A";
            //   const text = `🦷 Case: ${caseID}`;
            //   ctx.font = 'bold 32px sans-serif';
            //   ctx.fillStyle = 'white';
            //   ctx.textAlign = 'center';
            //   ctx.textBaseline = 'middle';
            //   ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            //   ctx.shadowBlur = 10;
            //   ctx.fillText(text, canvas.width / 2, canvas.height / 2);

            //   // 4️⃣ 转为 base64 并存入 localStorage，Key 包含加密 ID
            //   const composedDataURL = canvas.toDataURL();
            //   localStorage.setItem(`annotateBackground_${caseID}`, composedDataURL);
            //   console.log(`✅ 保存图像到 localStorage: annotateBackground_${caseID}`);
            // };

            // baseImage.src = enlargedImg.src;

            // Buttons container
            const btnContainer2D = document.createElement("div");
            btnContainer2D.className = "smart-btn-container-2d";

            const approve2D = document.createElement("button");
            approve2D.className = "smart-btn approve";
            approve2D.setAttribute("aria-label", "Approve 2D");
            approve2D.title = "Approve 2D";
            approve2D.innerHTML = `<img src="${basePath}/assets/Icon_approve.png" alt="Approve 2D">`;
            approve2D.onclick = () =>
              sendEmail("Your 2D Design has been APPROVED.");
            btnContainer2D.appendChild(approve2D);

            const edit2D = document.createElement("button");
            edit2D.className = "smart-btn edit";
            edit2D.setAttribute("aria-label", "Edit 2D");
            edit2D.title = "Edit 2D";
            edit2D.innerHTML = `<img src="${basePath}/assets/Icon_edit.png" alt="Edit 2D">`;
            edit2D.onclick = () =>
              sendEmail(
                "Please do some modifications on 2D Design. See Notebox."
              );
            btnContainer2D.appendChild(edit2D);

            // 🟣 创建 Annotate 按钮（跳转到 2DAnnotate.html）
            const annotateBtn = document.createElement("button");
            annotateBtn.className = "smart-btn annotate";
            annotateBtn.setAttribute("aria-label", "Annotate");
            annotateBtn.title = "Annotate";
            annotateBtn.innerHTML = `<img src="${basePath}/assets/Icon_annotate.png" alt="Annotate">`;

            annotateBtn.addEventListener("click", (e) => {
              e.stopPropagation();

              const params = new URLSearchParams(window.location.search);
              const encryptedId = params.get("id");
              const caseID = window.caseID || encryptedId;

              if (!encryptedId) {
                alert("❌ 缺少参数，无法跳转 Annotate 页面");
                return;
              }

              // ✅ 重新生成图像并保存
              const enlargedImg = document.querySelector(
                ".twod-fullscreen-image"
              );
              if (!enlargedImg) {
                alert("❌ 未找到图像，无法生成截图");
                return;
              }

              const canvas = document.createElement("canvas");
              canvas.width = enlargedImg.naturalWidth;
              canvas.height = enlargedImg.naturalHeight;
              const ctx = canvas.getContext("2d");

              const baseImage = new Image();
              baseImage.onload = () => {
                ctx.drawImage(baseImage, 0, 0);

                const text = `🦷 Case: ${caseID}`;
                const fontSize = canvas.width * 0.034; // 相当于 3% 宽度
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = "white";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                ctx.shadowBlur = 10;
                ctx.fillText(text, canvas.width / 2, canvas.height / 2);

                const storageKey = `annotateBackground_${encryptedId}`;
                const composedDataURL = canvas.toDataURL("image/jpeg", 0.82);
                if (!saveAnnotationBackground(storageKey, composedDataURL)) {
                  alert("Could not prepare the annotation image. Please try again.");
                  return;
                }
                console.log(`✅ 已保存 annotateBackground_${encryptedId}`);

                // 🟢 跳转
                // 🟢 跳转（确保使用 URL 中的加密 ID）
                const isGitHubPages =
                  window.location.hostname.includes("github.io");
                //const isLocal = window.location.hostname === "localhost";
                const queryConnector = "?";
                const basePath = isGitHubPages ? "/.tmp-test-web" : "";

                const targetURL = `${window.location.origin}${basePath}/src/pages/2DAnnotation.html${queryConnector}id=${encryptedId}`;
                console.log("🔁 正在跳转到 Annotate 页:", targetURL);
                window.open(targetURL, "_blank");
              };

              baseImage.src = enlargedImg.src;
            });

            // 插入按钮
            btnContainer2D.appendChild(annotateBtn);

            // const historyBtn = document.createElement('button');
            // historyBtn.className = 'smart-btn history';
            // historyBtn.textContent = 'History';
            // historyBtn.addEventListener('click', (e) => e.stopPropagation()); // 防止冒泡
            // // 逻辑在别的文件里绑定
            // btnContainer2D.appendChild(historyBtn);
            const historyBtn = document.createElement("button");
            historyBtn.className = "smart-btn history";
            historyBtn.setAttribute("aria-label", "History");
            historyBtn.title = "History";
            historyBtn.innerHTML = `<img src="${basePath}/assets/Icon_history.png" alt="History">`;

            historyBtn.addEventListener("click", (e) => {
              e.stopPropagation();

              const params = new URLSearchParams(window.location.search);
              const encryptedId = params.get("id");

              if (!encryptedId) {
                alert("❌ 缺少参数，无法跳转 History 页面");
                return;
              }

              const isGitHubPages =
                window.location.hostname.includes("github.io");
              // const isLocal = window.location.hostname === "localhost";
              const queryConnector = "?";
              const basePath = isGitHubPages ? "/.tmp-test-web" : "";

              const targetURL = `${window.location.origin}${basePath}/src/pages/AnnotationHistory.html${queryConnector}id=${encryptedId}`;
              console.log("🔁 正在跳转到 History 页:", targetURL);
              window.open(targetURL, "_blank");
            });

            btnContainer2D.appendChild(historyBtn);

            twodGroup.appendChild(btnContainer2D);
            overlay.appendChild(twodGroup);
            document.body.appendChild(overlay);

            // Close on overlay click
            overlay.addEventListener("click", () => overlay.remove());
          }
          button.addEventListener("click", openTwodOverlay);

          // Mobile/tablet 2D trigger button (hidden on desktop, shown on tablet/mobile)
          const mobileTwodBtn = document.createElement("button");
          mobileTwodBtn.type = "button";
          mobileTwodBtn.className = "twod-mobile-trigger";
          mobileTwodBtn.setAttribute("aria-label", "View 2D design");
          mobileTwodBtn.title = "View 2D design";
          mobileTwodBtn.innerHTML = '<i class="fa-solid fa-tooth" aria-hidden="true" style="font-size:20px;display:block;margin-bottom:2px"></i><span style="font-size:10px;font-weight:700;letter-spacing:0.5px">2D</span>';
          mobileTwodBtn.style.order = "2";
          mobileTwodBtn.addEventListener("click", openTwodOverlay);
          getViewerRightNav().appendChild(mobileTwodBtn);

          /* 			button.addEventListener('click', function () {
				
			  // Fullscreen overlay
			  const overlay = document.createElement('div');
			  overlay.className = 'twod-overlay';

			  // Group container (card)
			  const twodGroup = document.createElement('div');
			  twodGroup.className = 'twod-group';

			  // Enlarged image
			  const enlargedImg = new Image();
			  enlargedImg.src = img.src;
			  enlargedImg.className = 'twod-fullscreen-image';
			  twodGroup.appendChild(enlargedImg);

			  // Buttons container
			  const btnContainer2D = document.createElement('div');
			  btnContainer2D.className = 'smart-btn-container-2d';

			  const approve2D = document.createElement('button');
			  approve2D.className = 'smart-btn approve';
			  approve2D.textContent = 'Approve 2D';
			  approve2D.onclick = () => sendEmail("Your 2D Design has been APPROVED.");
			  btnContainer2D.appendChild(approve2D);

			  const edit2D = document.createElement('button');
			  edit2D.className = 'smart-btn edit';
			  edit2D.textContent = 'Edit 2D';
			  edit2D.onclick = () => sendEmail("Please do some modifications on 2D Design. See Notebox.");
			  btnContainer2D.appendChild(edit2D);

			  twodGroup.appendChild(btnContainer2D);
			  overlay.appendChild(twodGroup);
			  document.body.appendChild(overlay);

			  // Close on overlay click
			  overlay.addEventListener('click', () => overlay.remove());
			}); */
        }
      }
  } catch (error) {
    console.error("Error:", error);
  }
  // to get the undercut and occulsion values
  let undercut_values = [];

  try {
    // Call the post method and wait for the response

    const [undercut_value, undercut_value1] = await Promise.all([
      apiClient.post(heatmapEndpoint, data, false, "Heatmap upper"),
      apiClient.post(heatmapEndpoint, data2, false, "Heatmap lower"),
    ]);
    undercut_values = [undercut_value1, undercut_value];

    [undercut_value, undercut_value1].forEach((heatmap) => {
      undercut_type[heatmap.jaw_type] = [
        Boolean(heatmap.surveying_values),
        Boolean(heatmap.occlusion_values),
      ];
    });
  } catch (error) {
    console.error("Error:", error);
  }

  //Processing mesh

  // stl will be true is fail to process parameterisation
  const meshDataStartedAt = performance.now();
  let stl = false;
  const urls = ["/parameterisation/mesh/getall", "/surface/getall"];
  let responseDatas = [];
  let responseData;

  // Pre-start both mesh downloads in parallel so denture downloads while jaw is being
  // fetched and processed. The promises are consumed inside the loop below.
  const meshPromises = !close ? {
    "/parameterisation/mesh/getall": apiClient.post("/parameterisation/mesh/getall", [data], false, "Jaw mesh"),
    "/surface/getall":               apiClient.post("/surface/getall",               [data], false, "Denture mesh"),
  } : {};

  try {
    // Call the post method and wait for the response
    for (const url of urls) {
      //console.log('raw: ' + close);

      // this is for the generation of button to change to closed mesh if it exist
      let name_of_mesh;
      if (!close) {
        if (url == "/parameterisation/mesh/getall") {
          name_of_mesh = "Jaw mesh";
        } else if (url == "/surface/getall") {
          name_of_mesh = "Denture mesh";
        }
        // Await the pre-started promise instead of issuing a new request
        responseData = await meshPromises[url];
        //console.log(responseData);
        if (isObject(responseData)) {
          responseDatas = responseDatas.concat(responseData);
        }
        if (url == "/parameterisation/mesh/getall") {
          //check for closed.off
          const test = await apiClient.post(
            "/stl/get",
            [data],
            "test",
            "Closed Jaw Mesh Check"
          );

          if (test != "stl") {
            /* // Create a button element
          const button = document.createElement('button');
          button.textContent = 'Parameterized Jaw'; // Set the text content of the button. initially was called Close.off check for bool close

          // Style the button
          button.style.position = 'fixed';
          button.style.bottom = '10px';  // Adjust the bottom position as needed
          button.style.right = '20px';   // Adjust the right position as needed
          button.style.padding = '10px';
          button.style.backgroundColor = 'blue';
          button.style.color = 'white';
          button.style.border = 'none';
          button.style.cursor = 'pointer';
          button.style.borderRadius = '5px';
          button.style.zIndex = '1000';  // Ensure it's above other elements

          // Function to handle button click
          function redirectToUrl() {
            // Change this URL to the desired destination

            window.location.href = window.location.href + '&close=true';  // Redirect to the specified URL
          }

          // Add click event listener to button
          button.addEventListener('click', redirectToUrl);

          // Append the button to the body or another container
          document.body.appendChild(button); */
          }

          // Create a container for the buttons
          const btnContainer = document.createElement("div");
          btnContainer.className = "smart-btn-container";

          /* 		// === NEW: Container for 2D Buttons on the Left ===
		const btnContainer2D = document.createElement('div');
		btnContainer2D.className = 'smart-btn-container-2d';
		*/

          // === NEW: Container for 3D Buttons under Chat ===
          const btnContainer3D = document.createElement("div");
          btnContainer3D.className = "smart-btn-container-3d";

          // Create "Nudge" button
          /* 		const nudgeButton = document.createElement('button');
		nudgeButton.textContent = 'Nudge';
		nudgeButton.className = 'smart-btn nudge';
		nudgeButton.addEventListener('click', function () {
			sendEmail("You have received a NUDGE. Please check your case.");
		});
		btnContainer.appendChild(nudgeButton); */

          /* 		// Create "Approve" button
		const approveButton = document.createElement('button');
		approveButton.textContent = 'Approve 2D';
		approveButton.className = 'smart-btn approve';
		approveButton.addEventListener('click', function () {
			sendEmail("Your 2D Design has been APPROVED.");
		});
		btnContainer2D.appendChild(approveButton);

		// Create "Edit" button
		const editButton = document.createElement('button');
		editButton.textContent = 'Edit 2D';
		editButton.className = 'smart-btn edit';
		editButton.addEventListener('click', function () {
			sendEmail("Please do some modifications on 2D Design. See Notebox.");
		});
		btnContainer2D.appendChild(editButton); */

          // Create "Approve 3D" button
          const approveButton3D = document.createElement("button");
          approveButton3D.className = "smart-btn approve";
          approveButton3D.setAttribute("aria-label", "Approve 3D");
          approveButton3D.title = "Approve 3D";
          approveButton3D.innerHTML = `<img src="${basePath}/assets/Icon_approve.png" alt="Approve 3D">`;
          approveButton3D.addEventListener("click", function () {
            sendEmail("Your 3D Design has been APPROVED.");
          });
          btnContainer3D.appendChild(approveButton3D);

          // Create "Edit 3D" button
          const editButton3D = document.createElement("button");
          editButton3D.className = "smart-btn edit";
          editButton3D.setAttribute("aria-label", "Edit 3D");
          editButton3D.title = "Edit 3D";
          editButton3D.innerHTML = `<img src="${basePath}/assets/Icon_edit.png" alt="Edit 3D">`;
          editButton3D.addEventListener("click", function () {
            sendEmail(
              "Please do some modifications on 3D Design. See Notebox."
            );
          });
          btnContainer3D.appendChild(editButton3D);

          const emailWrapperContainer = document.createElement("div");
          emailWrapperContainer.className = "mail-popup hidden";

          const emailPopupHeader = document.createElement("div");
          emailPopupHeader.className = "mail-popup-header";
          emailPopupHeader.textContent = "Add email to mailing list";

          const emailInputWrapper = document.createElement("div");
          emailInputWrapper.className = "mail-popup-fields";

          // Create the Email Input Field
          const emailInput = document.createElement("input");
          emailInput.type = "email";
          emailInput.placeholder = "Enter email address";

          const submitEmailBtn = document.createElement("button");
          submitEmailBtn.textContent = "Add";
          submitEmailBtn.className = "smart-btn mail-submit";

          const closeEmailPopupBtn = document.createElement("button");
          closeEmailPopupBtn.textContent = "Cancel";
          closeEmailPopupBtn.className = "smart-btn mail-cancel";

          const addEmailBtn = document.createElement("button");
          addEmailBtn.className = "smart-btn mail-open";
          addEmailBtn.setAttribute("aria-label", "Add to Mail");
          addEmailBtn.title = "Add to Mail";
          addEmailBtn.innerHTML = `<img src="${basePath}/assets/Icon_addtomail2.png" alt="Add to Mail">`;
          addEmailBtn.addEventListener("click", () => {
            emailWrapperContainer.classList.remove("hidden");
            emailInput.focus();
          });

          closeEmailPopupBtn.addEventListener("click", () => {
            emailWrapperContainer.classList.add("hidden");
          });

          submitEmailBtn.addEventListener("click", async () => {
            const email = emailInput.value.trim();
            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
              alert("Please enter a valid email address.");
              return;
            }

            try {
              const payload = {
                case_int_id: paramValue, // assuming you have paramValue as the current caseIntID
                email: email,
              };

              const response = await fetch(
                "https://live.api.smartrpdai.com/api/smartrpd/mailinglist/add",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                }
              );

              const result = await response.json();
              if (response.ok) {
                alert("✅ Email added to mailing list.");
                emailInput.value = "";
                emailWrapperContainer.classList.add("hidden");
              } else {
                console.error(result);
                alert(
                  "❌ Failed to add email: " +
                    (result.message || "Unknown error")
                );
              }
            } catch (err) {
              console.error(err);
              alert("❌ Server error while adding email.");
            }
          });

          emailWrapperContainer.appendChild(emailPopupHeader);
          emailInputWrapper.appendChild(emailInput);
          emailInputWrapper.appendChild(submitEmailBtn);
          emailInputWrapper.appendChild(closeEmailPopupBtn);

          emailWrapperContainer.appendChild(emailInputWrapper);
          document.body.appendChild(emailWrapperContainer);
          btnContainer3D.appendChild(addEmailBtn);

          // Create "Load Other STLs" button
          const loadOtherStlButton = document.createElement("button");
          loadOtherStlButton.id = "center-load-button";
          loadOtherStlButton.className = "smart-btn other-stl";
          loadOtherStlButton.setAttribute("aria-label", "Show me 3D RPD design");
          loadOtherStlButton.title = "Show me 3D RPD design";
          loadOtherStlButton.innerHTML = `<img src="${basePath}/assets/Icon_showdesign2.png" alt="Show me 3D RPD design">`;
          loadOtherStlButton.addEventListener("click", () => {
            loadAllSTLSlots(); // You can change slot number accordingly

            // After loading, change the button to become a "Back" button
            loadOtherStlButton.textContent = "🔙 Back to Original Jaw";
            loadOtherStlButton.onclick = () => {
              // Remove ?slots=true from URL and reload
              //const cleanURL = window.location.origin + window.location.pathname;
              //window.location.href = cleanURL;
              window.location.reload();
            };
          });
          btnContainer3D.appendChild(loadOtherStlButton);

          const legendToggleBtn = document.createElement("button");
          legendToggleBtn.className = "smart-btn legend-toggle-btn";
          legendToggleBtn.setAttribute("aria-label", "Heatmap");
          legendToggleBtn.title = "Heatmap";
          legendToggleBtn.innerHTML = `<img src="${basePath}/assets/Icon_heatmap2.png" alt="Heatmap">`;
          legendToggleBtn.addEventListener("click", () => {
            window.toggleMeasurementLegend?.();
          });
          btnContainer3D.appendChild(legendToggleBtn);

          // Append the container to the body
          if (btnContainer.children.length > 0) {
            document.body.appendChild(btnContainer);
          }
          //document.body.appendChild(btnContainer2D);
          btnContainer3D.style.order = "70";
          getViewerRightNav().appendChild(btnContainer3D);
        }
      }

      if (
        responseData == "stl" &&
        url == "/parameterisation/mesh/getall" &&
        !close
      ) {
        responseData = "stl";
        const rawStlStartedAt = performance.now();
        responseData = await apiClient.post(
          "/stl/raw/get",
          [data],
          false,
          "Jaw mesh"
        );
        addViewerLoadTiming("mesh API /stl/raw/get", performance.now() - rawStlStartedAt);
        stl = true;
      } else if (close && url == "/parameterisation/mesh/getall") {
        responseData = "stl";
        responseData = await apiClient.post(
          "/stl/get",
          [data],
          false,
          "Jaw mesh"
        );
        //console.log(responseData);
        stl = false;
        const button = document.createElement("button");
        button.textContent = "Back to original"; // Set the text content of the button

        // Style the button
        button.style.position = "fixed";
        button.style.bottom = "45px"; // Adjust the bottom position as needed
        button.style.right = "10px"; // Adjust the right position as needed
        button.style.padding = "10px";
        button.style.backgroundColor = "blue";
        button.style.color = "white";
        button.style.border = "none";
        button.style.cursor = "pointer";
        button.style.borderRadius = "5px";
        button.style.zIndex = "1000"; // Ensure it's above other elements

        // Function to handle button click
        function redirectToUrl() {
          // Change this URL to the desired destination

          window.location.href = window.location.href.slice(0, -11); // Redirect to the specified URL
        }

        // Add click event listener to button
        button.addEventListener("click", redirectToUrl);

        // Append the button to the body or another container
        document.body.appendChild(button);
      } else {
        responseData = "stl";
      }
      //console.log('e')

      //console.log('Success:', responseData);
      if (isObject(responseData)) {
        responseDatas = responseDatas.concat(responseData);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
  endViewerLoadTimer("viewer: jaw mesh data loading");
  addViewerLoadTiming("mesh API data loading", performance.now() - meshDataStartedAt, {
    files: responseDatas.length,
  });

  const style = document.createElement("style");
  style.textContent = `
  .smart-btn-container {
      position: absolute;
      bottom: 100px;
      right: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      z-index: 1000;
      pointer-events: none;
  }

  .smart-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      color: white;
      cursor: pointer;
      font-weight: bold;
      transition: background-color 0.3s, transform 0.2s;
      min-width: 140px;
      text-align: center;
      pointer-events: auto;
  }

  .smart-btn:hover {
      transform: scale(1.05);
      filter: brightness(1.1);
  }

  .smart-btn img {
      width: 36px;
      height: 36px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
      pointer-events: none;
  }

  #polyline-visibility-toggle img {
      width: 36px;
      height: 36px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
      pointer-events: none;
  }

  .smart-btn.nudge {
      background-color: #007bff;
  }

  .smart-btn.approve {
      background-color: #28a745;
  }

  .smart-btn.edit {
      background-color: #fd7e14;
  }

  .smart-btn.annotate {
      background-color: #6f42c1; /* 例如紫色，你可改成你想要的颜色 */
  }
  
  .smart-btn.history {
      background-color: #17a2b8; /* 蓝绿色, 你可以自由换颜色 */
  }

  .smart-btn.other-stl {
      background-color: #007bff;
  }

  .smart-btn.legend-toggle-btn {
      background-color: #4a5568;
  }

  .smart-btn.legend-toggle-btn:hover {
      background-color: #5a6478;
  }

  #viewer-right-nav {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    width: 238px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    overflow-y: auto;
    overflow-x: visible;
    padding: 12px 10px;
    border-left: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(18, 18, 18, 0.74);
    box-shadow: -10px 0 26px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(6px);
    pointer-events: auto;
    box-sizing: border-box;
  }

  #viewer-right-nav > * {
    flex: 0 0 auto;
    pointer-events: auto;
  }

  /* ── Hamburger button (all screen sizes) ── */
  #sidebar-hamburger-btn {
    display: flex;
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 1060;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    background: rgba(48, 48, 48, 0.92);
    color: #ffffff;
    cursor: pointer;
  }

  #sidebar-hamburger-btn:hover {
    background: rgba(68, 68, 68, 0.98);
  }

  /* ── Always hide hamburger items from the nav (all sizes) ── */
  #viewer-right-nav > #component-panel-toggle,
  #viewer-right-nav > #polyline-visibility-menu,
  #viewer-right-nav > .smart-btn-container-3d,
  #viewer-right-nav > #viewer-meta-dates {
    display: none !important;
  }

  /* ── Hamburger backdrop ── */
  #hamburger-backdrop {
    display: none;
    position: absolute;
    inset: 0;
    z-index: 1040;
    background: rgba(0, 0, 0, 0.45);
  }

  #hamburger-backdrop.open { display: block; }

  /* ── Drawer: desktop — panel sliding in from the right, left of the sidebar ── */
  #hamburger-drawer {
    display: none;
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: auto;
    width: 210px;
    max-height: 100dvh;
    z-index: 1045;
    flex-direction: column;
    background: rgba(18, 18, 18, 0.98);
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    border-right: none;
    border-radius: 0;
    box-shadow: -4px 0 18px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(8px);
    overflow: hidden;
  }

  #hamburger-drawer.open { display: flex; }

  #hamburger-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font: 700 14px Arial, sans-serif;
    color: #ffffff;
    flex: 0 0 auto;
    background: rgba(28, 28, 28, 0.98);
  }

  #hamburger-drawer-close {
    width: 30px;
    height: 30px;
    border: 1px solid #ef4444;
    border-radius: 5px;
    background: #b91c1c;
    color: #ffffff;
    font-size: 20px;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  #hamburger-drawer-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    overflow-y: auto;
    flex: 1;
  }

  /* Items inside the drawer fill the full width */
  #hamburger-drawer-content > * {
    width: 100% !important;
    flex: 0 0 auto;
    pointer-events: auto;
    box-sizing: border-box;
  }

  #hamburger-drawer-content .smart-btn-container-3d {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #hamburger-drawer-content .smart-btn,
  #hamburger-drawer-content .component-panel-toggle {
    width: 100% !important;
    min-width: 0;
  }

  /* ── Tablet: slide-up from above bottom bar ── */
  @media (min-width: 769px) and (max-width: 1024px) {
    #hamburger-drawer {
      top: 16px;
      left: auto;
      right: 0;
      bottom: auto;
      width: 176px;
      height: auto;
      max-height: calc(100dvh - 136px - env(safe-area-inset-bottom, 0px));
      border-left: 1px solid rgba(255, 255, 255, 0.18);
      border-top: none;
      border-radius: 16px 0 0 16px;
      box-shadow: -10px 0 36px rgba(0, 0, 0, 0.5);
    }
  }

  /* ── Mobile: slide-up from above bottom bar ── */
  @media (max-width: 768px) {
    #hamburger-drawer {
      top: 12px;
      left: auto;
      right: 0;
      bottom: calc(92px + env(safe-area-inset-bottom, 0px));
      width: 164px;
      max-height: none;
      border-left: 1px solid rgba(255, 255, 255, 0.18);
      border-top: none;
      border-radius: 16px 0 0 16px;
      box-shadow: -10px 0 36px rgba(0, 0, 0, 0.5);
    }
  }

  #viewer-right-nav-top-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    position: absolute;
    right: 88px;
    bottom: 16px;
    z-index: 1060;
  }

  #reset-button,
  #lock-rotation-button {
    width: 64px;
    min-width: 64px;
    height: 64px;
    padding: 8px;
  }

  #reset-icon {
    width: 42px;
    height: 42px;
  }

  #viewer-meta-dates {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  #viewer-meta-dates .viewer-meta-bubble {
    max-width: none;
    width: 100%;
    box-sizing: border-box;
  }

/*   .smart-btn-container-2d {
	position: fixed;
	left: 10px;
	top: 160px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	z-index: 1000;
	} */

	.smart-btn-container-3d {
		position: static;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 1000;
        pointer-events: none;
	}

  .smart-btn.mail-open {
    background-color: #6c757d;
  }

  .mail-popup {
    position: absolute;
    left: 16px;
    right: auto;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1002;
    width: min(360px, calc(100vw - 240px));
    max-height: calc(100% - 40px);
    overflow: auto;
    padding: 14px;
    background: rgba(20, 20, 26, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .mail-popup.hidden {
    display: none;
  }

  .mail-popup-header {
    color: #f0eff4;
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .mail-popup-fields {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    align-items: center;
  }

  .mail-popup input {
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.08);
    color: #f0eff4;
  }

  .smart-btn.mail-submit,
  .smart-btn.mail-cancel {
    min-width: auto;
    padding: 9px 12px;
  }

  .smart-btn.mail-submit {
    background-color: #28a745;
  }

  .smart-btn.mail-cancel {
    background-color: #6c757d;
  }

  .preset-view-panel {
    position: absolute;
    z-index: 1000;
    width: 224px;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 2px;
    box-shadow: none;
    color: #f5f5f5;
    font-family: Arial, sans-serif;
    text-align: center;
    pointer-events: none;
    right: 16px;
    bottom: 92px;
  }

  .preset-view-pad {
    position: relative;
    width: 196px;
    height: 214px;
    margin: 0 0 0 auto;
  }

  .preset-view-current-wrap {
    display: none;
  }

  .preset-view-dropdown {
    display: none;
  }

  .twod-viewer-nav-block {
    width: 100%;
    flex: 0 0 auto;
    border-radius: 6px;
    overflow: hidden;
    max-height: 270px;
  }

  .twod-viewer-nav-block [data-twod-viewer-button="true"] {
    display: block;
    width: 100% !important;
  }

  .twod-viewer-nav-block [data-twod-viewer-button="true"] img {
    width: 100%;
    height: auto;
    max-height: 270px;
    object-fit: cover;
    display: block;
  }

  .twod-mobile-trigger {
    display: none;
  }

  .preset-view-button {
    position: absolute;
    width: 58px;
    height: 48px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25));
    pointer-events: auto;
  }

  .preset-view-face {
    display: block;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #bcbcbc, #8f8f8f);
    border: 2px solid rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
  }

  .preset-view-button:hover,
  .preset-view-button.active {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.65));
  }

  .preset-view-button:hover .preset-view-face,
  .preset-view-button.active .preset-view-face {
    background: linear-gradient(135deg, #ffffff, #d6d6d6);
  }

  .preset-view-center {
    left: 69px;
    top: 74px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    overflow: hidden;
  }

  .preset-view-center .preset-view-face {
    clip-path: none;
    background: url(${basePath}/assets/Icon_CenterTeethButton.png) center / contain no-repeat;
    border: 0;
    border-radius: 50%;
  }

  .preset-view-front {
    left: 22px;
    top: 138px;
    width: 58px;
    height: 36px;
    transform: rotate(-45deg);
  }

  .preset-view-front .preset-view-face {
    clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);
  }

  .preset-view-top {
    left: 83px;
    top: 0;
    width: 36px;
    height: 62px;
  }

  .preset-view-top .preset-view-face {
    clip-path: polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%);
  }

  .preset-view-bottom {
    left: 83px;
    top: 132px;
    width: 36px;
    height: 58px;
  }

  .preset-view-bottom .preset-view-face {
    clip-path: polygon(50% 0, 100% 32%, 100% 100%, 0 100%, 0 32%);
  }

  .preset-view-left {
    left: 0;
    top: 82px;
    width: 58px;
    height: 36px;
  }

  .preset-view-left .preset-view-face {
    clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);
  }

  .preset-view-right {
    right: 0;
    top: 82px;
    width: 58px;
    height: 36px;
  }

  .preset-view-right .preset-view-face {
    clip-path: polygon(22% 0, 100% 0, 100% 100%, 22% 100%, 0 50%);
  }

  .preset-view-rear {
    right: 22px;
    top: 38px;
    width: 58px;
    height: 36px;
    transform: rotate(-45deg);
  }

  .preset-view-rear .preset-view-face {
    clip-path: polygon(22% 0, 100% 0, 100% 100%, 22% 100%, 0 50%);
  }

  @media (max-width: 640px), (max-height: 720px) {
    .smart-btn {
      min-width: 132px;
      padding: 9px 12px;
      font-size: 12px;
    }

    .smart-btn-container-3d {
      gap: 8px;
    }

    .mail-popup {
      left: 8px;
      right: auto;
      width: min(300px, 58vw);
      max-height: 60dvh;
      overflow-y: auto;
      padding: 10px;
    }

    .mail-popup-fields {
      grid-template-columns: 1fr;
    }

    .preset-view-panel {
      transform: scale(0.82);
      transform-origin: bottom right;
    }
  }

  /* Tablet toolbar: compact cluster at bottom-left above footer. */
  @media (min-width: 769px) and (max-width: 1024px) {
    #sidebar-hamburger-btn {
      right: 16px;
      bottom: calc(14px + env(safe-area-inset-bottom, 0px));
      width: 64px;
      height: 64px;
    }

    #viewer-right-nav {
      top: auto;
      left: 0;
      right: auto;
      bottom: 0;
      width: auto;
      height: auto;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      overflow: visible;
      padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)) 14px;
      border-left: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      border-right: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0 10px 0 0;
      background: rgba(18, 18, 18, 0.92);
      box-shadow: 2px -4px 20px rgba(0, 0, 0, 0.28);
    }

    .twod-viewer-nav-block {
      display: none;
    }

    .twod-mobile-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 2px;
      width: 58px;
      height: 58px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 12px;
      background: rgba(48, 48, 48, 0.92);
      color: #ffffff;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .twod-mobile-trigger:active {
      background: rgba(68, 68, 68, 0.98);
    }

    #viewer-right-nav-top-row {
      flex-direction: row;
    }

    #viewer-right-nav > * {
      flex: 0 0 auto;
      position: static;
    }

    .preset-view-panel {
      position: static;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      width: auto;
      height: auto;
      padding: 0;
      overflow: visible;
      transform: none;
      background: transparent;
      border: 0;
      box-shadow: none;
      z-index: auto;
    }

    .preset-view-pad { display: none; }

    .preset-view-current-wrap {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      width: 64px;
      pointer-events: auto;
    }

    .preset-view-current,
    .preset-view-dropdown-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 58px;
      border: 0;
      border-radius: 50%;
      background: rgba(42, 42, 42, 0.96);
      color: #ffffff;
      font-size: 46px;
      font-weight: 800;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
      -webkit-text-stroke: 1px currentColor;
      text-rendering: geometricPrecision;
    }

    .preset-view-dropdown {
      display: none;
      position: absolute;
      left: 0;
      top: 0;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      max-height: min(360px, calc(100dvh - 220px));
      overflow-y: auto;
      overscroll-behavior: contain;
      border-radius: 12px;
      background: rgba(30, 30, 30, 0.96);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.38);
      pointer-events: auto;
    }

    .preset-view-dropdown.open {
      display: flex;
    }

    .preset-view-dropdown-button.active,
    .preset-view-current:hover,
    .preset-view-dropdown-button:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #ffd166;
    }

    .preset-view-center {
      display: none;
    }

    .preset-view-top,
    .preset-view-front,
    .preset-view-rear {
      position: static;
      width: 58px;
      height: 58px;
      transform: none;
    }

    .preset-view-left,
    .preset-view-right {
      position: static;
      width: 58px;
      height: 58px;
      transform: none;
    }

    .preset-view-bottom {
      position: static;
      width: 58px;
      height: 58px;
      transform: none;
    }

    .preset-view-front {
      left: auto;
      top: auto;
    }

    .preset-view-top .preset-view-face,
    .preset-view-front .preset-view-face,
    .preset-view-rear .preset-view-face {
      clip-path: none;
    }

    .preset-view-rear {
      left: auto;
      top: auto;
    }

    .preset-view-top {
      left: auto;
      top: auto;
    }

    .preset-view-bottom {
      left: auto;
      top: auto;
    }

    .preset-view-bottom .preset-view-face {
      clip-path: none;
    }

    .preset-view-left {
      left: auto;
      top: auto;
    }

    .preset-view-left .preset-view-face {
      clip-path: none;
    }

    .preset-view-right {
      left: auto;
      top: auto;
    }

    .preset-view-right .preset-view-face {
      clip-path: none;
    }

    .preset-view-button {
      filter: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.04);
    }

    .preset-view-button .preset-view-face {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: transparent;
      border: 0;
    }

    .preset-view-front .preset-view-face::after,
    .preset-view-rear .preset-view-face::after,
    .preset-view-top .preset-view-face::after,
    .preset-view-bottom .preset-view-face::after,
    .preset-view-left .preset-view-face::after,
    .preset-view-right .preset-view-face::after {
      position: absolute;
      left: 50%;
      top: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1em;
      height: 1em;
      color: #ffffff;
      font-size: 60px;
      font-weight: 800;
      line-height: 1;
      transform: translate(-50%, -50%);
      -webkit-text-stroke: 1px currentColor;
      text-rendering: geometricPrecision;
    }

    .preset-view-button:hover,
    .preset-view-button.active {
      background: rgba(255, 255, 255, 0.12);
      filter: none;
    }

    .preset-view-button:hover .preset-view-face,
    .preset-view-button.active .preset-view-face {
      background: transparent;
    }

    .preset-view-button.active .preset-view-face::after {
      color: #ffd166;
    }

    .preset-view-front .preset-view-face::after {
      content: "\\2197";
    }

    .preset-view-rear .preset-view-face::after {
      content: "\\2199";
    }

    .preset-view-top .preset-view-face::after {
      content: "\\2191";
    }

    .preset-view-bottom .preset-view-face::after {
      content: "\\2193";
    }

    .preset-view-left .preset-view-face::after {
      content: "\\2190";
    }

    .preset-view-right .preset-view-face::after {
      content: "\\2192";
    }

    #viewer-right-nav-top-row {
      position: static;
      flex: 0 0 auto;
      display: flex;
      flex-direction: row;
      gap: 8px;
      z-index: auto;
      order: 15;
    }

    #reset-button,
    #lock-rotation-button {
      display: flex !important;
      flex: 0 0 auto;
      width: 64px;
      min-width: 64px;
      height: 64px;
      padding: 8px;
    }

    #reset-icon {
      width: 42px;
      height: 42px;
    }

    .smart-btn-container-3d {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .smart-btn-container-3d .smart-btn {
      min-width: 140px;
      height: 64px;
      white-space: nowrap;
      margin: 0 auto;
    }

    #hamburger-drawer-content {
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 10px;
    }

    #hamburger-drawer-content .smart-btn,
    #hamburger-drawer-content .component-panel-toggle,
    #hamburger-drawer-content #polyline-visibility-toggle {
      width: 140px !important;
      min-width: 140px !important;
      height: 64px !important;
      margin: 0 auto;
      white-space: normal !important;
      text-align: center;
      line-height: 1.2;
      padding: 8px 10px !important;
    }

    .mail-popup,
    #polyline-visibility-panel {
      left: 16px !important;
      right: auto !important;
      top: auto !important;
      bottom: calc(130px + env(safe-area-inset-bottom, 0px)) !important;
      transform: none !important;
      width: min(360px, calc(100vw - 32px)) !important;
      max-height: calc(100% - 154px) !important;
    }
  }

  /* Phone toolbar: compact cluster at bottom-left above footer. */
  @media (max-width: 768px) {
    #sidebar-hamburger-btn {
      right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      width: 60px;
      height: 60px;
    }

    #viewer-right-nav {
      top: auto;
      left: 0;
      right: auto;
      bottom: 0;
      width: auto;
      height: auto;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      overflow: visible;
      padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px)) 12px;
      border-left: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      border-right: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0 10px 0 0;
      background: rgba(18, 18, 18, 0.94);
      box-shadow: 2px -4px 16px rgba(0, 0, 0, 0.28);
    }

    .twod-viewer-nav-block {
      display: none;
    }

    .twod-mobile-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 2px;
      width: 56px;
      height: 56px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 12px;
      background: rgba(48, 48, 48, 0.92);
      color: #ffffff;
      cursor: pointer;
      flex: 0 0 auto;
    }

    #viewer-right-nav-top-row {
      flex-direction: row;
    }

    #viewer-right-nav > * {
      flex: 0 0 auto;
      position: static;
    }

    .preset-view-panel {
      position: static;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      width: auto;
      max-width: none;
      height: auto;
      padding: 0;
      overflow: visible;
      transform: none;
      background: transparent;
      border: 0;
      box-shadow: none;
      z-index: auto;
    }

    .preset-view-pad { display: none; }

    .preset-view-current-wrap {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      width: 60px;
      pointer-events: auto;
    }

    .preset-view-current,
    .preset-view-dropdown-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border: 0;
      border-radius: 50%;
      background: rgba(42, 42, 42, 0.96);
      color: #ffffff;
      font-size: 44px;
      font-weight: 800;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
      -webkit-text-stroke: 1px currentColor;
      text-rendering: geometricPrecision;
    }

    .preset-view-dropdown {
      display: none;
      position: absolute;
      left: 0;
      top: 0;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      max-height: min(320px, calc(100dvh - 180px));
      overflow-y: auto;
      overscroll-behavior: contain;
      border-radius: 12px;
      background: rgba(30, 30, 30, 0.96);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.38);
      pointer-events: auto;
    }

    .preset-view-dropdown.open {
      display: flex;
    }

    .preset-view-dropdown-button.active,
    .preset-view-current:hover,
    .preset-view-dropdown-button:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #ffd166;
    }

    .preset-view-center {
      display: none;
    }

    .preset-view-top,
    .preset-view-front,
    .preset-view-rear {
      position: static;
      width: 56px;
      height: 56px;
      transform: none;
    }

    .preset-view-left,
    .preset-view-right {
      position: static;
      width: 56px;
      height: 56px;
      transform: none;
    }

    .preset-view-bottom {
      position: static;
      width: 56px;
      height: 56px;
      transform: none;
    }

    .preset-view-front {
      left: auto;
      top: auto;
    }

    .preset-view-top .preset-view-face,
    .preset-view-front .preset-view-face,
    .preset-view-rear .preset-view-face {
      clip-path: none;
    }

    .preset-view-rear {
      left: auto;
      top: auto;
    }

    .preset-view-top {
      left: auto;
      top: auto;
    }

    .preset-view-bottom {
      left: auto;
      top: auto;
    }

    .preset-view-bottom .preset-view-face {
      clip-path: none;
    }

    .preset-view-left {
      left: auto;
      top: auto;
    }

    .preset-view-left .preset-view-face {
      clip-path: none;
    }

    .preset-view-right {
      left: auto;
      top: auto;
    }

    .preset-view-right .preset-view-face {
      clip-path: none;
    }

    .preset-view-button {
      filter: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.04);
    }

    .preset-view-button .preset-view-face {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: transparent;
      border: 0;
    }

    .preset-view-button[data-mobile-arrow="right"] .preset-view-face::after,
    .preset-view-button[data-mobile-arrow="left"] .preset-view-face::after,
    .preset-view-button[data-mobile-arrow="up"] .preset-view-face::after,
    .preset-view-button[data-mobile-arrow="down"] .preset-view-face::after {
      position: absolute;
      left: 50%;
      top: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1em;
      height: 1em;
      color: #ffffff;
      font-size: 60px;
      font-weight: 800;
      line-height: 1;
      transform: translate(-50%, -50%);
      -webkit-text-stroke: 1px currentColor;
      text-rendering: geometricPrecision;
    }

    .preset-view-button:hover,
    .preset-view-button.active {
      background: rgba(255, 255, 255, 0.12);
      filter: none;
    }

    .preset-view-button:hover .preset-view-face,
    .preset-view-button.active .preset-view-face {
      background: transparent;
    }

    .preset-view-button.active .preset-view-face::after {
      color: #ffd166;
    }

    .preset-view-front .preset-view-face::after {
      content: "\\2197";
    }

    .preset-view-rear .preset-view-face::after {
      content: "\\2199";
    }

    .preset-view-top .preset-view-face::after {
      content: "\\2191";
    }

    .preset-view-bottom .preset-view-face::after {
      content: "\\2193";
    }

    .preset-view-left .preset-view-face::after {
      content: "\\2190";
    }

    .preset-view-right .preset-view-face::after {
      content: "\\2192";
    }

    #viewer-right-nav-top-row {
      position: static;
      flex: 0 0 auto;
      display: flex;
      flex-direction: row;
      gap: 8px;
      z-index: auto;
      order: 15;
    }

    #reset-button,
    #lock-rotation-button {
      display: flex !important;
      flex: 0 0 auto;
      width: 60px;
      min-width: 60px;
      height: 60px;
      padding: 6px;
    }

    #reset-icon {
      width: 40px;
      height: 40px;
      margin-right: 0;
    }

    .smart-btn-container-3d {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .smart-btn-container-3d .smart-btn {
      min-width: 128px;
      height: 60px;
      padding: 10px 14px;
      white-space: nowrap;
      margin: 0 auto;
    }

    #hamburger-drawer-content {
      align-items: center;
      gap: 8px;
      padding: 10px 8px;
    }

    #hamburger-drawer-content .smart-btn,
    #hamburger-drawer-content .component-panel-toggle,
    #hamburger-drawer-content #polyline-visibility-toggle {
      width: 128px !important;
      min-width: 128px !important;
      height: 60px !important;
      margin: 0 auto;
      white-space: normal !important;
      text-align: center;
      line-height: 1.2;
      padding: 8px 10px !important;
    }

    .mail-popup,
    #polyline-visibility-panel {
      left: 12px !important;
      right: auto !important;
      top: auto !important;
      bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;
      transform: none !important;
      width: min(340px, calc(100vw - 24px)) !important;
      max-height: calc(100% - 112px) !important;
    }
  }

  @media (max-width: 430px) {
    .preset-view-current,
    .preset-view-dropdown-button {
      width: 50px;
      height: 50px;
      font-size: 40px;
    }
  }
	
	.twod-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.6);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.twod-group {
  background: #fff;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 0 15px rgba(0,0,0,0.3);
  text-align: center;
}

.twod-fullscreen-image {
  max-width: 90vw;
  max-height: 70vh;
  margin-bottom: 15px;
}

@media (max-width: 1024px) {
  .twod-group {
    padding: 12px;
    max-width: min(520px, 88vw);
    max-height: 78dvh;
    overflow-y: auto;
  }
  .twod-fullscreen-image {
    max-width: 100%;
    max-height: 48dvh;
    margin-bottom: 8px;
  }
}

.smart-btn-container-2d {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.smart-btn-container-2d .smart-btn {
  min-width: 0;
  width: 52px;
  height: 52px;
  padding: 8px;
  border-radius: 10px;
  flex: 0 0 auto;
}

.smart-btn-container-2d .smart-btn img {
  width: 30px;
  height: 30px;
}


  
  #center-load-button {
    position: static;
    transform: none;
  }

  #container3D {
      position: relative;
  }

  .case-title {
      position: absolute;
      top: 60%;
      left: 50%;
      font-size: 22px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.8);
      text-shadow: 0px 0px 8px rgba(0, 0, 0, 0.7);
      z-index: 10;
      pointer-events: none;
  }
  
  @media (max-height: 950px) {
	  #center-load-button {
		transform: none;
	  }
	}

	@media (max-height: 700px) {
	  #center-load-button {
		transform: none;
	  }
	}

  
  @media (max-width: 1024px) {
    #center-load-button {
		transform: none;
		}
	}

  @media (max-width: 768px) {
      .smart-btn-container {
          grid-template-columns: 1fr !important;
      }
  }

  .vpm-active {
    box-shadow: 0 0 0 2px #38bdf8, 0 0 10px rgba(56, 189, 248, 0.35) !important;
    background: #0c4a6e !important;
    transition: box-shadow 0.15s, background 0.15s, opacity 0.15s, filter 0.15s;
  }

  .vpm-dimmed {
    opacity: 0.35;
    filter: grayscale(0.55);
    transition: opacity 0.15s, filter 0.15s;
  }
`;
  document.head.appendChild(style);

  // Extract encrypted case ID from address bar
  const urlParams = new URLSearchParams(window.location.search);
  const encryptedID = urlParams.get("id");

  // Use the full viewer URL in the email
  const viewerURL = `https://faid123.github.io/webrpdviewer/?id=${encodeURIComponent(
    encryptedID
  )}`;

  // Function to send email for Approve or Edit action
  function sendEmail(actionType) {
    const apiUrl = "https://live.api.smartrpdai.com/api/smartrpd/sendEmail";

    const emailData = {
      //userEmail: "faid_akatsuki@live.com",  // replace as needed
      action: actionType,
      case_id: window.caseID,
      case_int_id: paramValue, // for database queries (e.g., 1199)
      last_edited: window.lastEdited,
      username: window.username,
      viewer_url: viewerURL, // include this as a new field
      thumbnail: window.thumbnailBase64
        ? `data:image/png;base64,${window.thumbnailBase64}`
        : null,
    };

    fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    })
      .then(async (response) => {
        const contentType = response.headers.get("content-type");
        const isJson =
          contentType && contentType.indexOf("application/json") !== -1;

        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
          throw new Error(data.message || data || "Unknown error");
        }

        console.log("Email sent successfully:", data);
        alert("✅ Email sent successfully to associated users.");
      })
      .catch((error) => {
        console.error("Error sending email:", error);
        alert("❌ Failed to send email. Please try again.");
      });
  }

  // Function to send email to a custom email address
  function sendCustomEmail(email) {
    if (!email) {
      alert("Please enter a valid email address.");
      return;
    }

    let apiUrl = "https://live.api.smartrpdai.com/api/smartrpd/sendCustomEmail";

    let emailData = {
      customEmail: email,
      subject: "SmartRPD Custom Notification",
      message: "This is a custom email message for your SmartRPD case.",
    };

    fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    })
      .then((response) => response.json())
      .then((data) => console.log("Custom email sent successfully:", data))
      .catch((error) => console.error("Error sending custom email:", error));
  }

  /* async function loadAllSTLSlots() {
    const apiUrl = "/stl/slot/get"; // only the endpoint, since apiClient handles base URL

    const authPayload = {
        machine_id: '3a0df9c37b50873c63cebecd7bed73152a5ef616',
        uuid: 'AC4gRQXZJoNz9EhhW36Q8jMJXBsf',
        caseIntID: paramValue // This is your numeric case ID from decrypted param
    };

    let anyLoaded = false;

    for (let slot = 1; slot <= 4; slot++) {
        const payload = [authPayload, { slotNumber: slot }];

        try {
            const result = await apiClient.post(apiUrl, payload, false, `Slot ${slot}`);

            if (!result || !result.data) {
                console.log(`❌ Slot ${slot}: No STL data found.`);
                continue;
            }

            const binarySTL = atob(result.data);
            const stlLoader = new STLMeshLoader(material);
            const [mesh] = stlLoader.load(binarySTL, null);

            mesh.name = result.filename || `Slot ${slot}`;
            enforceOpaqueJawMesh(mesh);
            parentObject.add(mesh);

            console.log(`✅ Loaded STL from slot ${slot}`);
            anyLoaded = true;
        } catch (error) {
            console.warn(`⚠️ Slot ${slot} failed:`, error.message || error);
        }
    }

    if (!anyLoaded) {
        alert("❌ No STL files found in slots 1 to 4.");
    } else {
        alert("✅ STL loading completed.");
    }
} */

  async function loadAllSTLSlots() {
    const slotLoadStartedAt = performance.now();
    startViewerLoadTimer("viewer: framework/denture mesh loading");
    const apiUrl = "/stl/slot/get";

    const authPayload = {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
      caseIntID: paramValue,
    };

    // 🧹 Clear previous meshes
    while (parentObject.children.length > 0) {
      const child = parentObject.children[0];
      parentObject.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    clearPolylineOverlay();

    // Remove previous GUI controls if any
    const oldGui = document.querySelector(".dg.ac");
    if (oldGui) oldGui.remove();

    const oldGuiContainer = document.querySelector(".guiContainer");
    if (oldGuiContainer) oldGuiContainer.remove();

    const oldToggleBtn = [...document.querySelectorAll("button")].find((btn) =>
      btn.innerText.includes("controls")
    );
    if (oldToggleBtn) oldToggleBtn.remove();

    const guiBlackBox = [...document.querySelectorAll("div")].find(
      (div) =>
        div.style.backgroundColor === "black" && div.style.zIndex === "999"
    );
    if (guiBlackBox) guiBlackBox.remove();

    let anyLoaded = false;

    for (let slot = 1; slot <= 4; slot++) {
      //for (let slot = 4; slot>0; slot--){
      const slotStartedAt = performance.now();
      const payload = [authPayload, { slotNumber: slot }];

      try {
        const result = await apiClient.post(
          apiUrl,
          payload,
          false,
          `Slot ${slot}`
        );

        if (!result || !result.data) {
          console.log(`❌ Slot ${slot}: No STL data found.`);
          continue;
        }

        const binarySTL = atob(result.data);
        // Assign a unique color per slot
        const slotColors = {
          1: {
            color: new THREE.Color(197 / 255, 173 / 255, 137 / 255),
            opacity: 255 / 255,
          },
          2: {
            color: new THREE.Color(71 / 255, 86 / 255, 105 / 255),
            opacity: 255 / 255,
          },
          3: {
            color: new THREE.Color(197 / 255, 173 / 255, 137 / 255),
            opacity: 255 / 255,
          },
          4: {
            color: new THREE.Color(71 / 255, 86 / 255, 105 / 255),
            opacity: 255 / 255,
          },
        };

        const slotColorInfo = slotColors[slot] || {
          color: new THREE.Color(1, 1, 1),
          opacity: 1,
        };

        const slotMaterial = new THREE.MeshStandardMaterial({
          color: slotColorInfo.color,
          opacity: slotColorInfo.opacity,
          transparent: false,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
          metalness: 0.0,
          roughness: 0.7,
        });

        /* const slotColors = {
				1: 0xffb3ba, // soft pink
				2: 0xbaffc9, // mint green
				3: 0xbae1ff, // baby blue
				4: 0xffffba  // pale yellow
			}; */

        /* 			const slotMaterial = new THREE.MeshStandardMaterial({
				color: slotColors[slot] || 0xaaaaaa,
				metalness: 0.0,
				roughness: 0.7
			}); */

        const stlLoader = new STLMeshLoader(slotMaterial);
        const [mesh] = stlLoader.load(binarySTL, null);

        mesh.name = result.filename || `Slot ${slot}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          jaw_type: mesh.name.toLowerCase().includes("lower") ? "lower" : "upper",
          archLabel: mesh.name.toLowerCase().includes("lower")
            ? "Lower Arch"
            : "Upper Arch",
        };

        // 👇 Match logic like close.off for centering and rotation
        /*  mesh.geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            mesh.geometry.boundingBox.getCenter(center);
            mesh.geometry.translate(-center.x, -center.y, -center.z); */

        // 🟢 Default origin and slight shift like upper jaw logic
        //mesh.position.set(0, 5, 0);
        //mesh.rotation.set(THREE.MathUtils.degToRad(1), THREE.MathUtils.degToRad(1), THREE.MathUtils.degToRad(180));
        /* 			mesh.position.set(0, 0, 0);      // Reset position
			mesh.rotation.set(0, 0, 0);      // Reset rotation
			mesh.scale.set(1, 1, 1);         // Reset scale */

        enforceOpaqueJawMesh(mesh);
        parentObject.add(mesh);
        updateViewerRotationOrigin();
        syncPolylineFocusMode();

        controls.update();
        //render();

        console.log(`✅ Loaded STL from slot ${slot}`);
        anyLoaded = true;
      } catch (error) {
        console.warn(`⚠️ Slot ${slot} failed:`, error.message || error);
      }
    }
    endViewerLoadTimer("viewer: framework/denture mesh loading");
    addViewerLoadTiming(
      "framework/denture mesh loading",
      performance.now() - slotLoadStartedAt
    );

    if (!anyLoaded) {
      alert("❌ No STL files found in slots 1 to 4.");
    } else {
      alert("✅ STL loading completed.");
      removeVisibilityAndTransparencyControls();
      // 🧩 Re-enable visibility/transparency controls after loading
      addVisibilityAndTransparencyControls(
        parentObject,
        name,
        all_mesh_mat,
        undercut_type
      );
    }
  }

  //console.log(responseDatas);
  const meshCpuStartedAt = performance.now();
  let jawMeshCpuMs = 0;
  let frameworkMeshCpuMs = 0;
  startViewerLoadTimer("viewer: mesh decode/parse/render");
  const jawFirstResponseDatas = [...responseDatas].sort((left, right) => {
    const leftIsSurface = left.filename.includes("surface");
    const rightIsSurface = right.filename.includes("surface");
    return Number(leftIsSurface) - Number(rightIsSurface);
  });
  for (const offFile of jawFirstResponseDatas) {
    const meshFileStartedAt = performance.now();
    let meshDecodeMs = 0;
    let meshParseMs = 0;
    let meshAddMs = 0;
    const meshCategory = offFile.filename.includes("surface")
      ? "framework/denture"
      : "jaw";
    let loader;
    //console.log(offFile)
    if (offFile.filename.includes("surface")) {
      loader = new OFFLoader(
        materialsurface.clone(),
        materialsurface_non_metal.clone()
      );
    } else {
      loader = new OFFLoader(material.clone());
    }

    // Fetch the OFF file data
    //const offData = await apiClient.get(offFile); // Assuming the ApiClient has a get method for fetching data
    const meshDecodeStartedAt = performance.now();
    const offdata = atob(offFile.data);
    meshDecodeMs = performance.now() - meshDecodeStartedAt;
    let x;
    if (
      offFile.filename.includes("ParameterisationMesh") ||
      offFile.filename.includes("closed")
    ) {
      x = true;
    }
    // Load the OFF file
    //console.log('check stl:' + stl)
    const meshParseStartedAt = performance.now();
    if (stl) {
      const stlMeshLoader = new STLMeshLoader(material);
      if (offFile.type.includes("upper")) {
        mesh_geo = stlMeshLoader.load(offdata, undercut_values[1]);
      } else if (offFile.type.includes("lower")) {
        mesh_geo = stlMeshLoader.load(offdata, undercut_values[0]);
      }
    } else if (offFile.type.includes("upper")) {
      mesh_geo = loader.parse(offdata, undercut_values[1], x);
    } else if (offFile.type.includes("lower")) {
      mesh_geo = loader.parse(offdata, undercut_values[0], x);
    }
    meshParseMs = performance.now() - meshParseStartedAt;

    const meshAddStartedAt = performance.now();
    const mesh = mesh_geo[0];
    mesh.name = offFile.filename;

    mesh.userData = {
      jaw_type: offFile.type,
      archLabel: offFile.type.includes("upper") ? "Upper Arch" : "Lower Arch",
    };
    if (all_mesh_mat != null) {
      all_mesh_mat[offFile.filename] = mesh_geo[1].slice();
    }

    //addVisibilityControl(mesh, 'BoxMesh');
    //addTransparencyControl(material, 'BoxMesh');
    /*
    if(offFile.filename.includes('surface')[])
      {
        if(offFile.filename.includes('upper'))
          {
            changeMeshRotation(mesh,pos['upper'][0],pos['upper'][1],pos['upper'][2]);
          }
          else{
            changeMeshRotation(mesh,pos['lower'][0],pos['lower'][1],pos['lower'][2]);
          }
      }
          */
    // Add the mesh to the parent object

    if (offFile.type.includes("upper") && !stl && !close) {
      //console.log('check');
      changeMeshRotation(mesh, 1, 1, 180);
      mesh.position.y += 5;
    }

    //console.log(mesh)
    /*
    if(stl)
      {
        changeMeshRotation(mesh,0,105,0);
      }
        */
    enforceOpaqueJawMesh(mesh);
    parentObject.add(mesh);
    syncPolylineFocusMode();
    meshAddMs = performance.now() - meshAddStartedAt;

    const meshTotalMs = performance.now() - meshFileStartedAt;
    if (meshCategory === "jaw") {
      jawMeshCpuMs += meshTotalMs;
    } else {
      frameworkMeshCpuMs += meshTotalMs;
    }
    addViewerMeshTiming({
      file: offFile.filename,
      type: offFile.type,
      category: meshCategory,
      decodeMs: meshDecodeMs,
      parseMs: meshParseMs,
      addMs: meshAddMs,
      totalMs: meshTotalMs,
      vertices: mesh.geometry?.attributes?.position?.count ?? null,
      children: mesh.children?.length ?? 0,
    });
  }
  endViewerLoadTimer("viewer: mesh decode/parse/render");
  addViewerLoadTiming(
    "mesh decode/parse/render",
    performance.now() - meshCpuStartedAt,
    { files: responseDatas.length }
  );
  if (LOG_VIEWER_LOAD_TIMINGS_TO_CONSOLE) {
    console.log(`viewer: load jaw mesh: ${jawMeshCpuMs.toFixed(2)} ms`);
    console.log(
      `viewer: load framework/denture mesh: ${frameworkMeshCpuMs.toFixed(2)} ms`
    );
  }
  addViewerLoadTiming("load jaw mesh", jawMeshCpuMs);
  addViewerLoadTiming("load framework/denture mesh", frameworkMeshCpuMs);
  logViewerObjectCounts("after jaw/framework mesh load");
  updateViewerRotationOrigin();
  //console.log(all_mesh_mat);

  function changeMeshRotation(mesh, x, y, z) {
    mesh.rotation.set(
      THREE.MathUtils.degToRad(x),
      THREE.MathUtils.degToRad(y),
      THREE.MathUtils.degToRad(z)
    );
  }

  // Example usage

  function createTextbox(text, position) {
    const textbox = document.createElement("div");
    textbox.textContent = text;
    textbox.className = "viewer-meta-bubble";
    textbox.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
    textbox.style.padding = "7px 10px";
    textbox.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    textbox.style.borderRadius = "5px";
    textbox.style.fontFamily = "Arial, sans-serif";
    textbox.style.fontSize = "14px";
    textbox.style.color = "rgba(255, 255, 255, 0.75)";
    textbox.style.lineHeight = "1.4";
    textbox.style.wordBreak = "break-word";

    textbox.dataset.position = position;
    const datesSection = document.getElementById("viewer-meta-dates");
    if (datesSection) {
      datesSection.appendChild(textbox);
    } else {
      getViewerMetaBar().appendChild(textbox);
    }
  }

  function unixToHumanReadable(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000); // Multiply by 1000 to convert seconds to milliseconds
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Months are zero-indexed
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Instantiate the OFFLoader
  // Load the OFF file

  finished = true;
  // Instantiate a new renderer and set its size
  const renderer = new THREE.WebGLRenderer({ alpha: true }); // Alpha: true allows for the transparent background
  renderer.setClearColor(0xf8f5fb, 1);
  resizeViewerStage(renderer);

  // Add the renderer to the DOM
  const container = document.getElementById("container3D");
  container.style.position = "relative"; // <- Add this line
  if (container) {
    container.appendChild(renderer.domElement);
    createPolylineVisibilityToggle(container, renderer.domElement);

    // After container3D and renderer are set up
    const caseTitle = document.createElement("div");
    caseTitle.textContent = `🦷 Case: ${window.caseID}`; // Display the case name
    caseTitle.className = "case-title"; // CSS class for styling

    const isMobile =
      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    caseTitle.style.transform = isMobile
      ? "translate(-50%, 2500%)"
      : "translate(-50%, 1000%)";

    // Insert it into container3D
    container.appendChild(caseTitle);
  } else {
    console.error("No container element found");
  }

  // Set how far the camera will be from the 3D model

  camera.position.z = objToRender === "dino" ? 100 : 500;

  // Add lights to the scene, so we can actually see the 3D model
  const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
  scene.add(ambientLight);

  // Add directional lights from different directions for even lighting
  const lights = [
    new THREE.DirectionalLight(0xffffff, 1), // Front light
    new THREE.DirectionalLight(0xffffff, 1), // Back light
    new THREE.DirectionalLight(0xffffff, 1), // Left light
    new THREE.DirectionalLight(0xffffff, 1), // Right light
  ];

  lights[0].position.set(0, 0, 1);
  lights[1].position.set(0, 0, -1);
  lights[2].position.set(-1, 0, 0);
  lights[3].position.set(1, 0, 0);

  lights.forEach((light) => {
    scene.add(light);
  });

  // This adds controls to the camera, so we can rotate / zoom it with the mouse
  if (objToRender === "dino") {
    controls = new TrackballControls(camera, renderer.domElement);
    orb_controls = new OrbitControls(camera, renderer.domElement);

    controls.rotateSpeed = 4.0;
    controls.zoomSpeed = 1.4;
    controls.panSpeed = 30;
    // Panning is handled manually so the rotation target can stay anchored
    // after the jaw has been moved around the screen.
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: -1,
      RIGHT: 1,
    };
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    orb_controls.enabled = false;
    orb_controls.enableRotate = false;
    orb_controls.enablePan = false;
    orb_controls.enableZoom = false;

    applyViewerRotationOrigin();
    bindViewerRotationTargetAnchor(renderer.domElement);

    //console.log('changed2');
  }

  // Render the scene
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    anchorViewerRotationTarget(controls);
    if (!isViewerLeftButtonRotating) {
      clampViewerControlTarget(controls);
    }
    artificialTeethRenderer.syncToJawMeshes();

    renderer.render(scene, camera);
    if (!hasLoggedFirstSceneRender) {
      hasLoggedFirstSceneRender = true;
      endViewerLoadTimer("viewer: final scene render/update");
      addViewerLoadTiming(
        "final scene render/update",
        performance.now() - finalSceneRenderStartedAt
      );
      logViewerObjectCounts("after first scene render");
    }
  }

  // Add a listener to the window, so we can resize the window and the camera
  window.addEventListener("resize", function () {
    resizeViewerStage(renderer);
    clampViewerControlTarget(controls);
  });
  new ResizeObserver(() => resizeViewerStage(renderer)).observe(container);

  camera.zoom = 7;
  camera.updateProjectionMatrix();
  const clonedCamera = camera.clone();
  addResetButton(camera, clonedCamera, controls, () => {
    const target = hasViewerRotationOrigin
      ? viewerRotationOrigin
      : updateViewerRotationOrigin();
    return target?.clone?.() || null;
  });
  createPresetViewControls();
  createHamburgerButton();
  setupChatToggle();
  //console.log(camera)

  // Start the 3D rendering
  const finalSceneRenderStartedAt = performance.now();
  startViewerLoadTimer("viewer: final scene render/update");
  animate();
  removeViewerLoadingScreen();
  endViewerLoadTimer("viewer: page/viewer initialization");
  addViewerLoadTiming(
    "page/viewer initialization",
    performance.now() - pageInitializationStartedAt
  );
  //console.log(parentObject);
  //console.log(undercut_type);
  const controlsStartedAt = performance.now();
  startViewerLoadTimer("viewer: controls setup");
  removeVisibilityAndTransparencyControls();
  addVisibilityAndTransparencyControls(
    parentObject,
    name,
    all_mesh_mat,
    undercut_type
  );
  endViewerLoadTimer("viewer: controls setup");
  addViewerLoadTiming("controls setup", performance.now() - controlsStartedAt);
  addViewerLoadTiming(
    "initial viewer usable",
    performance.now() - viewerTotalStartedAt
  );
  logViewerObjectCounts("initial viewer usable");
  logViewerPerformanceSummary();

  const overlayLoadPromise = fetchAndRenderCaseOverlays(paramValue).catch(
    (error) => {
      console.warn("Case overlays failed to load:", error);
    }
  );

  const logoutAfterBackgroundLoad = async () => {
    const urlLogout = ["/user/logout"];
    try {
      // Call the post method and wait for the response
      for (const urldata of urlLogout) {
        const check = await apiClient.post(urldata, [data]);
        //console.log('Success logout:', check)
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  addViewerLoadTiming(
    "total viewer load",
    performance.now() - viewerTotalStartedAt
  );
  logViewerPerformanceSummary();
  overlayLoadPromise.finally(logoutAfterBackgroundLoad);
})();

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function displayFullScreenImage(img) {
  // Create a fullscreen container
  const fullscreenContainer = document.createElement("div");
  fullscreenContainer.style.position = "fixed";
  fullscreenContainer.style.top = "0";
  fullscreenContainer.style.left = "0";
  fullscreenContainer.style.width = "100%";
  fullscreenContainer.style.height = "100%";
  fullscreenContainer.style.backgroundColor = "rgba(0, 0, 0, 0.9)"; // Semi-transparent black background
  fullscreenContainer.style.zIndex = "1000"; // Ensure it's above other content
  fullscreenContainer.style.display = "flex";
  fullscreenContainer.style.justifyContent = "center";
  fullscreenContainer.style.alignItems = "center";
  fullscreenContainer.style.flexDirection = "column"; // stack vertically

  // 🦷 Create and append the case title watermark
  const watermark = document.createElement("div");
  watermark.textContent = `🦷 Case: ${window.caseID || "N/A"}`;
  watermark.style.position = "absolute";
  watermark.style.left = "50%";
  watermark.style.transform = "translateX(-50%)"; // only X-axis initially
  watermark.style.color = "white";
  watermark.style.fontSize = "32px";
  watermark.style.fontWeight = "bold";
  watermark.style.textShadow = "0px 0px 10px rgba(0, 0, 0, 0.8)";
  watermark.style.pointerEvents = "none";
  watermark.classList.add("case-title-watermark");

  fullscreenContainer.appendChild(watermark);

  // Dynamically position vertically based on image
  const centerWatermark = () => {
    const img = fullscreenContainer.querySelector("img");
    if (!img) return;

    const imgRect = img.getBoundingClientRect();
    const containerRect = fullscreenContainer.getBoundingClientRect();
    const verticalCenter = imgRect.top + imgRect.height / 2 - containerRect.top;

    watermark.style.top = `${verticalCenter}px`;
  };

  // Run after image is loaded and on resize
  const imgElement = fullscreenContainer.querySelector("img");
  if (imgElement && !imgElement.complete) {
    imgElement.onload = centerWatermark;
  } else {
    centerWatermark();
  }

  window.addEventListener("resize", centerWatermark);

  // Calculate maximum dimensions for the fullscreen image
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  let maxImageWidth;
  let maxImageHeight;
  //if is mobile then expand image
  if (isMobileDevice()) {
    maxImageWidth = screenWidth * 0.9; // Adjust as needed, e.g., 90% of screen width
    maxImageHeight = screenHeight * 0.9; // Adjust as needed, e.g., 90% of screen height
  } else {
    maxImageWidth = img.width;
    maxImageHeight = img.height;
  }

  // Create an image element inside the fullscreen container
  const fullscreenImg = new Image();
  fullscreenImg.src = img.src; // Set the source of the fullscreen image

  // Calculate image dimensions to maintain aspect ratio
  const aspectRatio = img.width / img.height;
  let displayWidth = maxImageWidth;
  let displayHeight = maxImageWidth / aspectRatio;

  // Adjust based on height if necessary
  if (displayHeight > maxImageHeight) {
    displayHeight = maxImageHeight;
    displayWidth = maxImageHeight * aspectRatio;
  }

  // Apply calculated dimensions and styles to the image
  fullscreenImg.style.width = `${displayWidth}px`;
  fullscreenImg.style.height = `${displayHeight}px`;
  fullscreenImg.style.objectFit = "contain"; // Maintain aspect ratio
  const touchMoveHandler = function (event) {
    if (event.scale !== 1) {
      event.preventDefault();
    }
  };

  const wheelHandler = function (event) {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };
  document.addEventListener("touchmove", touchMoveHandler, { passive: false });
  document.addEventListener("wheel", wheelHandler, { passive: false });
  // Append the fullscreen image to the container
  fullscreenContainer.appendChild(fullscreenImg);
  // Close fullscreen on click outside the image
  fullscreenContainer.addEventListener("click", function () {
    document.removeEventListener("touchmove", touchMoveHandler, {
      passive: false,
    });
    document.removeEventListener("wheel", wheelHandler, { passive: false });
    document.body.removeChild(fullscreenContainer); // Remove fullscreen container
  });
  // Append the fullscreen container to the body
  document.body.appendChild(fullscreenContainer);
}

function isObject(variable) {
  return variable !== null && typeof variable === "object";
}

window.addEventListener("load", () => {
  const fixToothMapPosition = () => {
    const allButtons = document.getElementsByTagName("button");
    for (let btn of allButtons) {
      if (btn.dataset.twodViewerButton === "true") continue;
      const img = btn.querySelector("img");

      if (img && img.src.startsWith("data:image/png;base64")) {
        // ✅ 分别控制按钮位置 & 图片宽度
        const topValue = isMobileDevice() ? "200px" : "150px";
        const imgWidth = isMobileDevice() ? "200px" : "140px";

        btn.style.position = "fixed";
        btn.style.top = topValue;
        btn.style.left = "15px";
        btn.style.width = imgWidth; // ← 设置按钮宽度
        btn.style.height = "auto";
        btn.style.padding = "0";
        btn.style.border = "none";
        btn.style.background = "none";
        btn.style.cursor = "pointer";
        btn.style.zIndex = "1000";

        img.style.width = "100%"; // ← 图片宽度始终相对于按钮宽度
        img.style.height = "auto";
        img.style.transform = "none";
        img.style.display = "block";

        return true;
      }
    }
    return false;
  };

  const interval = setInterval(() => {
    if (fixToothMapPosition()) {
      clearInterval(interval);
    }
  }, 200);
});

window.addEventListener("load", () => {
  const interval = setInterval(() => {
    const allButtons = document.getElementsByTagName("button");

    for (let btn of allButtons) {
      if (btn.dataset.twodViewerButton === "true") continue;
      const img = btn.querySelector("img");

      if (img && img.src.startsWith("data:image/png")) {
        if (!btn.hasAttribute("data-zoom-bound")) {
          btn.setAttribute("data-zoom-bound", "true");

          btn.addEventListener("click", () => {
            const overlayDivs = document.querySelectorAll(
              "div[style*='position: fixed']"
            );
            for (let div of overlayDivs) {
              if (div.dataset.twodViewerBlock === "true") continue;
              const popupImg = div.querySelector("img");
              if (popupImg && popupImg.src.startsWith("data:image/png")) {
                // ✅ 放大样式
                popupImg.style.maxWidth = "80vw";
                popupImg.style.maxHeight = "80vh";
                popupImg.style.width = "auto";
                popupImg.style.height = "auto";

                // ✅ 隐藏 chatbox 和 icon
                const chatWidget = document.getElementById("chat-widget");
                const chatIcon = document.getElementById("chat-icon");
                if (chatWidget) chatWidget.style.display = "none";
                if (chatIcon) chatIcon.style.display = "none";

                // ✅ 点击浮层退出，并根据设备恢复
                div.addEventListener(
                  "click",
                  () => {
                    div.remove();

                    const isMobile =
                      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                        navigator.userAgent
                      );

                    if (chatWidget && chatIcon) {
                      if (isMobile) {
                        chatWidget.classList.remove("active");
                        chatWidget.style.display = "none";
                        chatIcon.style.display = "block";
                      } else {
                        chatWidget.style.display = "flex";
                        chatIcon.style.display = "none";
                      }
                    }
                  },
                  { once: true }
                );

                break;
              }
            }
          });
        }

        clearInterval(interval);
        break;
      }
    }
  }, 300);
});

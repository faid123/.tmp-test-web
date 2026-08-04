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
import { lol } from "../js/shared/crypt.js";
import "../js/pages/createCase.js";
import { logApi } from "../js/shared/apiLog.js";
import { toast } from "../js/shared/toast.js";
import {
  addVisibilityAndTransparencyControls,
  removeVisibilityAndTransparencyControls,
} from "./newControls.js";
import { createArtificialTeethRenderer } from "./artificialTeeth.js";
import { API_BASE, MACHINE_ID } from "../js/shared/api.js";

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

// Jaw material. Standard (not Phong) with the same shading as the 2D-annotation
// jaw preview, so the same scan looks identical in both viewers.
const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  metalness: 0,
  roughness: 0.5,
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
const apiClient = new ApiClient(API_BASE);
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

// Gate shown when a non-logged-in viewer clicks "Annotate" in the 3D viewer.
// Login -> caller-defined destination; Continue as guest -> caller-defined
// fallback (hidden unless onGuest is passed in). Styled inline since the 3D
// viewer doesn't load noticeboard.css.
function openAnnotateGate({
  onLogin,
  onGuest,
  title = "Sign in to continue",
  message = "Log in to open the 2D annotation noticeboard.",
}) {
  const gate = document.createElement("div");
  gate.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.78);";
  gate.innerHTML = `
    <div style="width:min(92vw,420px);background:#fff;border-radius:14px;padding:28px 26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;font-family:system-ui,-apple-system,sans-serif;">
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h2>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#475569;">${message}</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button type="button" data-gate-login style="width:100%;padding:12px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:1px solid transparent;background:#3BAE95;color:#fff;">Login</button>
        <!-- TEMP: "Continue as guest" hidden for now — remove display:none to restore. -->
        <button type="button" data-gate-guest style="${onGuest ? "" : "display:none;"}width:100%;padding:12px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;">Continue as guest</button>
      </div>
    </div>`;
  document.body.appendChild(gate);
  const close = () => gate.remove();
  gate.addEventListener("click", (ev) => {
    if (ev.target === gate) close();
  });
  gate.querySelector("[data-gate-login]").addEventListener("click", () => {
    close();
    onLogin?.();
  });
  gate.querySelector("[data-gate-guest]").addEventListener("click", () => {
    close();
    onGuest?.();
  });
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

// One row holding the design/upload pair and the reset/lock pair. Both are
// built by different modules at different times, so they share this host and
// contribute their buttons to it via display: contents.
function getViewerNavToolbar() {
  let toolbar = document.getElementById("viewer-nav-toolbar");
  if (toolbar) return toolbar;

  toolbar = document.createElement("div");
  toolbar.id = "viewer-nav-toolbar";
  toolbar.style.order = "4";
  getViewerRightNav().appendChild(toolbar);
  return toolbar;
}

window.getViewerNavToolbar = getViewerNavToolbar;

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
  const maxTouchZoom = 50;

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

  // Jaw is locked at the centre: panning is disabled so the right mouse button
  // (and middle / shift-drag / two-finger touch pan) can't drag the model
  // off-centre. Rotation (left-drag) and zoom (wheel / pinch) stay active.
  const VIEWER_PAN_LOCKED = true;
  const panViewerTargetByScreenDelta = (deltaX, deltaY) => {
    if (VIEWER_PAN_LOCKED) return;
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

function computeFitZoom() {
  const box = getPresetViewBounds();
  if (!box) return 7;
  const size = box.getSize(new THREE.Vector3());
  const { width, height } = getViewerStageSize();
  const padding = 1.5;
  const zoomX = width / Math.max(size.x * padding, 1);
  const zoomY = height / Math.max(size.y * padding, 1);
  return Math.min(zoomX, zoomY);
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
    // Which of the CASE's jaws are loaded — an uploaded slot STL is not one.
    if (child.userData?.isDesignSlot) return;
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
    // Slot STLs sit in this list too, carry a jaw_type, and are added first
    // (they are the landing view), so an unfiltered search returns one of them
    // and the polylines inherit ITS transform instead of the case jaw's.
    if (child.userData?.isDesignSlot) return false;
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

  if (!polylineMenuList) return;

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

// The panel has no toggle of its own — it is opened from the polyline rows of
// the objects panel (see window.polylinePanelController).
function createPolylineVisibilityToggle(container, domElement) {
  if (document.getElementById("polyline-visibility-panel")) return;

  const _polylineBp = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";

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

  window.addEventListener("resize", updatePolylineMenuLayout);

  (container || document.getElementById("container3D") || document.body).appendChild(panel);
  // The objects panel is rebuilt on every case/design view switch, so it
  // registers its own polyline button against these handlers each time.
  window.polylinePanelController = {
    open: () => { panel.style.display = "block"; updatePolylineMenuLayout(); },
    close: () => { panel.style.display = "none"; },
    isOpen: () => panel.style.display === "block",
  };
  updatePolylineMenuLayout();

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
      machine_id: MACHINE_ID,
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

function createViewerLoadingScreen() {
  const existing = document.getElementById("viewer-loading-screen");
  if (existing) {
    // Returning early on a fading screen would leave the caller with no bar to
    // drive: a screen mid-fade still answers getElementById but has already
    // given up window.viewerLoadingEls.
    if (!existing.classList.contains("vls-fade")) return;
    existing.remove();
    document.getElementById("viewer-loading-screen-style")?.remove();
  }
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
    #vls-display {
      font-family: "Montserrat", sans-serif;
      font-size: 14px;
      color: rgba(26,58,92,0.75);
      text-align: left;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #vls-percent {
      font-family: "Montserrat", sans-serif;
      font-size: 15px;
      font-weight: 700;
      color: #1a3a5c;
      min-width: 46px;
      text-align: right;
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
      <div class="vls-status" id="vls-status">Initialising…</div>
      <progress id="vls-progress" value="0" max="100"></progress>
      <div class="vls-info-row">
        <span id="vls-display"></span>
        <span id="vls-percent"></span>
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
    machine_id: MACHINE_ID,
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
    machine_id: MACHINE_ID,
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
            watermark.style.top = "8px";
            watermark.style.left = "50%";
            watermark.style.transform = "translateX(-50%)";
            watermark.style.color = "black";
            watermark.style.fontSize = "16px";
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

              const isGitHubPages =
                window.location.hostname.includes("github.io");
              const basePath = isGitHubPages ? "/.tmp-test-web" : "";

              // Pathway 1 (logged in): compose the annotation background, then
              // open the full 2D annotation noticeboard. `then` lets the login
              // flow reuse the same compose+save before redirecting to login.
              const composeBackgroundThen = (then) => {
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
                  const fontSize = canvas.width * 0.034;
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
                  then();
                };
                baseImage.src = enlargedImg.src;
              };

              const noticeboardURL = `${window.location.origin}${basePath}/src/pages/2DAnnotation.html?id=${encryptedId}&view=noticeboard`;
              const openNoticeboard = () =>
                composeBackgroundThen(() => window.open(noticeboardURL, "_blank"));
              const openHistory = () =>
                window.open(
                  `${window.location.origin}${basePath}/src/pages/AnnotationHistory.html?id=${encryptedId}`,
                  "_blank"
                );

              let loggedIn = false;
              try {
                loggedIn = !!JSON.parse(
                  localStorage.getItem("loggedInUser") || "null"
                )?.uuid;
              } catch (_) {}

              // Logged-in users skip the gate (pathway 1).
              if (loggedIn) {
                openNoticeboard();
                return;
              }

              // Guests get the gate: Login -> 2D noticeboard (pathway 1, after
              // signing in), or Continue as guest -> Annotation History
              // (pathway 2, no login).
              openAnnotateGate({
                onLogin: () =>
                  composeBackgroundThen(() => {
                    // Return to the 2D noticeboard after a successful login.
                    try {
                      localStorage.setItem("postLoginRedirect", noticeboardURL);
                    } catch (_) {}
                    window.location.href = `${window.location.origin}${basePath}/index.html`;
                  }),
                onGuest: openHistory,
              });
            });

            // 插入按钮
            btnContainer2D.appendChild(annotateBtn);

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

  // Heatmaps are per-vertex RGBA arrays for the case's own jaws — megabytes on a
  // real case, and only the case view can display them. Fetched as part of the
  // on-demand bundle (loadCaseAssets), never on entry. The design view doesn't
  // want them either: uploads carry no surveying data, so slot meshes fall back
  // to the loaders' "stl" (no-heatmap) sentinel.
  async function fetchUndercutHeatmaps() {
  try {
    // Call the post method and wait for the response

    const [undercut_value, undercut_value1] = await Promise.all([
      apiClient.post(heatmapEndpoint, data, false, "Heatmap lower"),
      apiClient.post(heatmapEndpoint, data2, false, "Heatmap upper"),
    ]);

    // Pair each heatmap with its jaw by the RESPONSE's own jaw_type, never by
    // request order (preview3D.fetchUndercutForCase does the same). Verified
    // against case 2437: requesting jaw_type=1 returns jaw_type:"upper_jaw"
    // (point_size exactly matches the upper jaw mesh's vertex count) and
    // jaw_type=2 returns "lower_jaw" — the opposite of what data/data2's
    // comments assumed, which swapped the undercut colours between the jaws.
    // Downstream convention: undercut_values[0]=lower jaw, [1]=upper jaw.
    let upperHeat = null;
    let lowerHeat = null;
    [undercut_value, undercut_value1].forEach((heatmap) => {
      const label = String(heatmap?.jaw_type ?? "").toLowerCase();
      if (label.includes("upper")) upperHeat = heatmap;
      else if (label.includes("lower")) lowerHeat = heatmap;
    });
    // Fallback if a response ever omits jaw_type: the jaw_type=2 request
    // (data) serves the lower heatmap, jaw_type=1 (data2) the upper one.
    undercut_values = [
      lowerHeat ?? undercut_value,
      upperHeat ?? undercut_value1,
    ];

    [undercut_value, undercut_value1].forEach((heatmap) => {
      undercut_type[heatmap.jaw_type] = [
        Boolean(heatmap.surveying_values),
        Boolean(heatmap.occlusion_values),
      ];
    });
  } catch (error) {
    console.error("Error:", error);
  }
  }

  //Processing mesh

  // stl will be true is fail to process parameterisation
  const meshDataStartedAt = performance.now();
  let stl = false;
  const urls = ["/parameterisation/mesh/getall", "/surface/getall"];
  let responseDatas = [];
  let responseData;

  // The viewer opens on the design (the uploaded slot STLs) and does not fetch
  // the case's own assets at all until the 3D button asks for them — the case
  // mesh is ~50 MB that the landing view never shows. This flag makes the
  // fetch below a no-op on entry; loadCaseAssets() flips it and reruns the same
  // path, so there is exactly one implementation of the fetch.
  let caseMeshRequested = false;

  // Pre-start both mesh downloads in parallel so denture downloads while jaw is being
  // fetched and processed. The promises are consumed inside the loop below.
  const startMeshDownloads = () =>
    !close && caseMeshRequested
      ? {
          "/parameterisation/mesh/getall": apiClient.post("/parameterisation/mesh/getall", [data], false, "Jaw mesh"),
          "/surface/getall":               apiClient.post("/surface/getall",               [data], false, "Denture mesh"),
        }
      : {};
  let meshPromises = startMeshDownloads();

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
        // Await the pre-started promise instead of issuing a new request.
        // Skipped entirely on the landing pass — the UI below still gets built,
        // it just has no case mesh to work with yet.
        responseData = caseMeshRequested ? await meshPromises[url] : "stl";
        //console.log(responseData);
        if (isObject(responseData)) {
          responseDatas = responseDatas.concat(responseData);
        }
        if (url == "/parameterisation/mesh/getall") {
          //check for closed.off
          const test = caseMeshRequested
            ? await apiClient.post(
                "/stl/get",
                [data],
                "test",
                "Closed Jaw Mesh Check"
              )
            : "stl";

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

          // Switches between the uploaded design (the landing view) and the
          // case's own scan + polylines + artificial teeth. Both stay loaded, so
          // this is a visibility flip, not a reload.
          const loadOtherStlButton = document.createElement("button");
          loadOtherStlButton.id = "center-load-button";
          loadOtherStlButton.className = "smart-btn other-stl";
          loadOtherStlButton.innerHTML = `<img src="${basePath}/assets/Icon_showdesign2.svg" alt="Switch between design and case view">`;
          let viewSwitchBusy = false;
          const setDesignButtonState = (isDesignShown) => {
            const label = isDesignShown
              ? "Show original 3D scan"
              : "Show me 3D RPD design";
            loadOtherStlButton.setAttribute("aria-label", label);
            loadOtherStlButton.setAttribute("aria-pressed", String(isDesignShown));
            loadOtherStlButton.title = label;
            loadOtherStlButton.classList.toggle("active", isDesignShown);
          };
          window.syncDesignViewButton = setDesignButtonState;
          setDesignButtonState(false);
          loadOtherStlButton.addEventListener("click", async () => {
            if (viewSwitchBusy) return;
            viewSwitchBusy = true;
            loadOtherStlButton.disabled = true;
            try {
              if (isDesignViewActive()) await showCaseView();
              else await showDesignView();
              setDesignButtonState(isDesignViewActive());
            } finally {
              viewSwitchBusy = false;
              loadOtherStlButton.disabled = false;
            }
          });
          btnContainer3D.appendChild(loadOtherStlButton);

          // Opens the slot manager at any time, not just on a case that has no
          // uploads — otherwise the four slots are only ever fillable before the
          // first file lands.
          const uploadSlotsButton = document.createElement("button");
          uploadSlotsButton.id = "upload-slots-button";
          uploadSlotsButton.className = "smart-btn upload-slots";
          uploadSlotsButton.title = "Upload 3D files";
          uploadSlotsButton.setAttribute("aria-label", "Upload 3D files");
          uploadSlotsButton.innerHTML = `<img src="${basePath}/assets/cloud_upload.png" alt="Upload 3D files">`;
          uploadSlotsButton.addEventListener("click", () => {
            if (document.getElementById("design-upload-prompt")) {
              window.removeDesignUploadPrompt?.();
              return;
            }
            window.showDesignUploadPrompt?.();
          });
          btnContainer3D.appendChild(uploadSlotsButton);

          // Append the container to the body
          if (btnContainer.children.length > 0) {
            document.body.appendChild(btnContainer);
          }
          //document.body.appendChild(btnContainer2D);
          getViewerNavToolbar().prepend(btnContainer3D);
        }
      }

      if (
        caseMeshRequested &&
        responseData == "stl" &&
        url == "/parameterisation/mesh/getall" &&
        !close
      ) {
        responseData = "stl";
        console.log("[viewer3D] STL source selected: /stl/get (parameterisation fallback)");
        const rawStlStartedAt = performance.now();
        responseData = await apiClient.post(
          "/stl/get",
          [data],
          false,
          "Jaw mesh"
        );
        addViewerLoadTiming("mesh API /stl/raw/get", performance.now() - rawStlStartedAt);
        stl = true;
      } else if (close && url == "/parameterisation/mesh/getall") {
        responseData = "stl";
        console.log("[viewer3D] STL source selected: /stl/get (close view)");
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
      background-color: transparent;
  }

  /* Design overlay is currently on top of the jaw. */
  /* Shown when a case has no uploaded 3D files — the "+" slots mirror the
     3D preview panel's empty rows. */
  #design-upload-prompt {
      position: absolute;
      inset: 0;
      z-index: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      pointer-events: auto;
  }

  /* Frosted glass over the model, same recipe as the objects panel. The tint
     stays fairly opaque because the scene behind renders near-white, and white
     card text has to stay readable against it. */
  #design-upload-prompt .dup-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      max-width: min(560px, 92vw);
      padding: 26px 30px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.55);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      backdrop-filter: blur(18px) saturate(140%);
      box-shadow:
        0 18px 48px rgba(0, 0, 0, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.14);
      text-align: center;
      font-family: "Montserrat", Arial, sans-serif;
      color: #f1f5f9;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  #design-upload-prompt .dup-heading {
      font-size: 18px;
      font-weight: 700;
  }

  #design-upload-prompt .dup-sub {
      font-size: 13px;
      opacity: 0.75;
  }

  #design-upload-prompt .dup-slots {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 6px;
  }

  #design-upload-prompt .dup-slot-wrap {
      position: relative;
  }

  #design-upload-prompt .dup-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 132px;
      height: 96px;
      padding: 8px;
      border: 1px dashed rgba(255, 255, 255, 0.42);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.10);
      color: inherit;
      font: inherit;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
  }

  #design-upload-prompt .dup-slot:hover:not(:disabled) {
      border-color: #4fa3e8;
      background: rgba(79, 163, 232, 0.16);
  }

  /* Per-slot progress: each file reports itself in its own tile, replacing the
     single pooled bar that could not say which of the four was slow. */
  #design-upload-prompt .dup-slot-bar,
  #design-upload-prompt .dup-slot-note {
      display: none;
  }

  #design-upload-prompt .dup-slot-wrap.is-busy .dup-slot-bar {
      display: block;
      width: 88px;
      height: 5px;
  }

  #design-upload-prompt .dup-slot-wrap.is-busy .dup-slot-note {
      display: block;
      font-size: 11px;
      opacity: 0.75;
  }

  /* The tick/plus and the filename give way to the bar while a slot is working,
     so a 96px tile does not have to hold both. */
  #design-upload-prompt .dup-slot-wrap.is-busy .dup-plus,
  #design-upload-prompt .dup-slot-wrap.is-busy .dup-slot-file {
      display: none;
  }

  #design-upload-prompt .dup-slot-delete {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 50%;
      background: #2b3242;
      color: #f8fafc;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
  }

  #design-upload-prompt .dup-slot-delete:hover {
      border-color: #f87171;
      background: #b91c1c;
  }

  #design-upload-prompt .dup-slot-delete:disabled {
      opacity: 0.4;
      cursor: default;
  }

  #design-upload-prompt .dup-slot-wrap.is-busy .dup-slot-delete {
      display: none;
  }

  #design-upload-prompt .dup-plus {
      font-size: 28px;
      font-weight: 300;
      line-height: 1;
  }

  #design-upload-prompt .dup-slot-label {
      font-size: 12px;
      opacity: 0.85;
  }

  /* A slot that already holds a file: solid border, tick instead of "+", and the
     filename underneath. Not clickable — use its × to free the slot first. */
  #design-upload-prompt .dup-slot-wrap.is-filled .dup-slot {
      border-style: solid;
      border-color: rgba(74, 222, 128, 0.55);
      background: rgba(74, 222, 128, 0.12);
      cursor: default;
  }

  #design-upload-prompt .dup-slot-wrap.is-filled .dup-plus {
      font-size: 20px;
      color: #4ade80;
  }

  #design-upload-prompt .dup-slot-file {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      opacity: 0.7;
  }

  /* A filled tile is disabled by design, so only an empty one that is disabled
     is actually waiting on something. */
  #design-upload-prompt .dup-slot-wrap:not(.is-filled) .dup-slot:disabled {
      opacity: 0.45;
      cursor: progress;
  }

  #design-upload-prompt .dup-slot-wrap.is-busy .dup-slot:disabled {
      opacity: 1;
  }

  #design-upload-prompt .dup-status {
      min-height: 18px;
      font-size: 12.5px;
      opacity: 0.9;
  }

  #design-upload-prompt .dup-open-scan {
      margin-top: 4px;
      padding: 8px 16px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
  }

  #design-upload-prompt .dup-open-scan:hover {
      background: rgba(255, 255, 255, 0.12);
  }

  #design-upload-prompt .dup-open-scan:disabled {
      opacity: 0.5;
      cursor: progress;
  }

  @media (max-width: 640px) {
    #design-upload-prompt .dup-slot {
        width: 108px;
        height: 84px;
    }
  }

  .smart-btn.other-stl.active {
      background-color: transparent;
      box-shadow: 0 0 0 2px #38bdf8;
  }

  .smart-btn.upload-slots img {
      filter: brightness(0) invert(1);
  }

  .smart-btn:disabled {
      opacity: 0.6;
      cursor: progress;
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

  #viewer-nav-toolbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  #viewer-right-nav-top-row {
    display: contents;
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
		display: contents;
	}

  /* Nav toolbar buttons are bare icons — no plate behind them. */
  #viewer-nav-toolbar .smart-btn {
    flex: 0 0 auto;
    width: 46px;
    min-width: 0;
    height: 46px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    pointer-events: auto;
  }

  #viewer-nav-toolbar .smart-btn img {
    width: 30px;
    height: 30px;
  }

  .preset-view-panel {
    position: static;
    order: 10;
    margin-top: auto;
    z-index: 1000;
    width: 100%;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 2px;
    box-shadow: none;
    color: #f5f5f5;
    font-family: Arial, sans-serif;
    text-align: center;
    pointer-events: none;
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

    #viewer-nav-toolbar {
      gap: 4px;
    }

    .preset-view-panel {
      transform: scale(0.82);
      transform-origin: bottom right;
    }
  }

  /* Tablet toolbar: compact cluster at bottom-left above footer. */
  @media (min-width: 769px) and (max-width: 1024px) {

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

    #viewer-right-nav > * {
      flex: 0 0 auto;
      position: static;
    }

    .preset-view-panel {
      position: static;
      margin-top: 0;
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

    #viewer-right-nav-top-row,
    .smart-btn-container-3d {
      display: contents;
    }

    #viewer-nav-toolbar {
      position: static;
      flex: 0 0 auto;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      z-index: auto;
      order: 4;
    }

    #reset-button,
    #lock-rotation-button,
    #viewer-nav-toolbar .smart-btn {
      display: flex !important;
      flex: 0 0 auto;
      width: 52px;
      min-width: 52px;
      height: 52px;
      padding: 0;
    }

    #reset-icon {
      width: 32px;
      height: 32px;
    }

    #viewer-nav-toolbar .smart-btn img {
      width: 32px;
      height: 32px;
    }

  }

  /* Phone toolbar: compact cluster at bottom-left above footer. */
  @media (max-width: 768px) {

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

    #viewer-right-nav > * {
      flex: 0 0 auto;
      position: static;
    }

    .preset-view-panel {
      position: static;
      margin-top: 0;
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

    #viewer-right-nav-top-row,
    .smart-btn-container-3d {
      display: contents;
    }

    #viewer-nav-toolbar {
      position: static;
      flex: 0 0 auto;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      z-index: auto;
      order: 4;
    }

    #reset-button,
    #lock-rotation-button,
    #viewer-nav-toolbar .smart-btn {
      display: flex !important;
      flex: 0 0 auto;
      width: 48px;
      min-width: 48px;
      height: 48px;
      padding: 0;
    }

    #reset-icon {
      width: 30px;
      height: 30px;
      margin-right: 0;
    }

    #viewer-nav-toolbar .smart-btn img {
      width: 30px;
      height: 30px;
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
      top: 8px;
      left: 50%;
      font-size: 22px;
      font-weight: bold;
      color: black;
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
  const viewerURL = `https://faid123.github.io/.tmp-test-web/src/pages/ThreeDViewer.html?id=${encodeURIComponent(
    encryptedID
  )}`;

  // Function to send email for Approve or Edit action
  function sendEmail(actionType) {
    const apiUrl = `${API_BASE}/sendEmail`;

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
        logApi(response, 'POST /sendEmail');
        const contentType = response.headers.get("content-type");
        const isJson =
          contentType && contentType.indexOf("application/json") !== -1;

        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
          throw new Error(data.message || data || "Unknown error");
        }

        console.log("Email sent successfully:", data);
        toast.success("Email sent successfully to associated users.");
      })
      .catch((error) => {
        console.error("Error sending email:", error);
        toast.error("Failed to send email. Please try again.");
      });
  }

  // Function to send email to a custom email address
  function sendCustomEmail(email) {
    if (!email) {
      alert("Please enter a valid email address.");
      return;
    }

    let apiUrl = `${API_BASE}/sendCustomEmail`;

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
      .then((response) => { logApi(response, 'POST /sendCustomEmail'); return response.json(); })
      .then((data) => console.log("Custom email sent successfully:", data))
      .catch((error) => console.error("Error sending custom email:", error));
  }

  /* async function loadAllSTLSlots() {
    const apiUrl = "/stl/slot/get"; // only the endpoint, since apiClient handles base URL

    const authPayload = {
        machine_id: MACHINE_ID,
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

  // The viewer LANDS on the design (the uploaded slot STLs); the case's own
  // mesh, polylines and artificial teeth are loaded but hidden until the 3D
  // button asks for them. Both sets stay in memory, so switching is instant.
  const designSlotMeshes = [];
  let designViewActive = false;

  // Fixed slot layout, mirroring EXTRA_STL_SLOT_NAMES in 2D/preview3D.js:
  // 1 upper jaw, 2 upper metal RPD, 3 lower jaw, 4 lower metal RPD.
  const EXTRA_STL_SLOT_JAW = { 1: "upper", 2: "upper", 3: "lower", 4: "lower" };
  const METAL_RPD_SLOTS = new Set([2, 4]);
  // Row label + icon per slot, same as the 3D preview panel's "Other 3D files".
  const EXTRA_STL_SLOT_NAMES = {
    1: "Upper jaw",
    2: "Upper metal RPD",
    3: "Lower jaw",
    4: "Lower metal RPD",
  };
  const EXTRA_STL_SLOT_ICONS = {
    1: "Icon_UpperJaw_Occlusal.png",
    2: "upper.svg",
    3: "Icon_LowerJaw_Occlusal.png",
    4: "lower.svg",
  };
  // Slot colours are kept identical to the 3D preview panel so the same upload
  // reads the same in both places (EXTRA_STL_COLOR / METAL_RPD_COLOR there).
  const EXTRA_STL_COLOR = 0xb0875a; // jaw tan
  const METAL_RPD_COLOR = 0xd6dadf; // brushed cobalt-chrome / stainless

  function disposeDesignSlotMesh(mesh) {
    parentObject.remove(mesh);
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((entry) => entry?.dispose?.());
    // STLMeshLoader returns geometry variants (normal/occlusion/undercut) in
    // this map, not materials — dispose them too.
    all_mesh_mat[mesh.name]?.forEach?.((entry) => entry?.dispose?.());
    delete all_mesh_mat[mesh.name];
  }

  // Build one slot's mesh and put it in the scene. Shared by the initial load
  // and by an upload, which renders the bytes it just sent instead of asking
  // for them back — same as the 3D preview panel's renderExtraStl.
  function addDesignSlotMesh(slot, filename, binarySTL) {
    // Re-uploading a slot replaces what was there.
    const previous = designSlotMeshes.findIndex(
      (mesh) => mesh.userData?.designSlot === slot
    );
    if (previous !== -1) {
      disposeDesignSlotMesh(designSlotMeshes[previous]);
      designSlotMeshes.splice(previous, 1);
    }

    // Same finish the 3D preview panel gives these files: jaw uploads in the jaw
    // tan, metal-RPD slots in brushed cobalt-chrome.
    const isMetalRpd = METAL_RPD_SLOTS.has(slot);
    const slotMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isMetalRpd ? METAL_RPD_COLOR : EXTRA_STL_COLOR),
      opacity: 1,
      transparent: false,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      metalness: isMetalRpd ? 0.85 : 0.05,
      roughness: isMetalRpd ? 0.32 : 0.6,
    });

    // Jaw side comes from the slot number, not the filename: the slots are fixed
    // (1 upper jaw, 2 upper metal RPD, 3 lower jaw, 4 lower metal RPD) and
    // uploads are named freely, so "jawSTLSlot3.stl" and "ATC-C-05L.stl" (both
    // lower) were being treated as upper and given the upper jaw's transform.
    const isLower = EXTRA_STL_SLOT_JAW[slot] === "lower";
    const undercutForSlot =
      (isLower ? undercut_values[0] : undercut_values[1]) ?? "stl";
    // Names key all_mesh_mat, so keep them unique even if two slots hold files
    // with the same name.
    const slotFilename = `Slot ${slot}: ${filename || "3D file"}`;

    const stlLoader = new STLMeshLoader(slotMaterial);
    const [mesh, meshMaterials] = stlLoader.load(binarySTL, undercutForSlot);
    all_mesh_mat[slotFilename] = meshMaterials.slice();

    mesh.name = slotFilename;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      jaw_type: isLower ? "lower" : "upper",
      archLabel: isLower ? "Lower Arch" : "Upper Arch",
      // Marks this as a design-slot mesh and carries which slot it came from, so
      // the objects panel can give each slot its own row.
      isDesignSlot: true,
      designSlot: slot,
      // Raw upload name, for the slot manager's row label.
      sourceFilename: filename || "3D file",
    };

    // No transform: slot STLs are rendered exactly as uploaded, so what the
    // viewer shows is what is in the files. The 180° Z flip the OFF upper jaw
    // needs turns the upper arch upside down and drops it through the lower
    // one, so it must not be applied here. Same as the 3D preview panel, which
    // renders extras untransformed.
    //
    // Uploads are not guaranteed to share a coordinate frame — on case 2967
    // both casts were exported teeth-up over the same Z band (~20mm of
    // interpenetration) with the denture in a third frame. Nothing here
    // compensates for that; an articulated export is what fixes it.

    enforceOpaqueJawMesh(mesh);
    parentObject.add(mesh);
    designSlotMeshes.push(mesh);
    return mesh;
  }

  function isDesignViewActive() {
    return designViewActive;
  }

  // While the design view is up the objects panel lists the four slots instead
  // of the case's jaw/mesh rows. Empty slots still get a row (disabled) so the
  // panel always reads as the fixed 4-slot set, like the preview panel.
  // Returns [] in case view, which restores the normal rows.
  function getDesignSlotRoster() {
    if (!designViewActive || !designSlotMeshes.length) return [];
    return [1, 2, 3, 4].map((slot) => ({
      slot,
      label: `Slot ${slot}: ${EXTRA_STL_SLOT_NAMES[slot]}`,
      iconPath: `${basePath}/assets/${EXTRA_STL_SLOT_ICONS[slot]}`,
      mesh: designSlotMeshes.find((m) => m.userData?.designSlot === slot) || null,
    }));
  }

  // What was hidden to show the design, with the visibility each item had
  // beforehand, so switching back restores exactly what was on screen.
  const hiddenCaseMeshes = [];
  const hiddenCaseOverlays = [];
  const hiddenDesignMeshes = [];

  const JAW_KEYS = ["upper", "lower"];

  // Hide the case's meshes plus its polyline and artificial-teeth overlays —
  // all three belong to the scanned case, not to the uploads. Safe to call
  // again: the overlays finish loading in the background well after the design
  // is already on screen, and this picks them up without double-recording.
  function hideCaseAssetsForDesign() {
    parentObject.children.forEach((child) => {
      if (!child.isMesh || child.userData?.isDesignSlot) return;
      if (hiddenCaseMeshes.some((entry) => entry.mesh === child)) return;
      hiddenCaseMeshes.push({ mesh: child, visible: child.visible });
      child.visible = false;
    });

    JAW_KEYS.forEach((jaw) => {
      if (hiddenCaseOverlays.some((entry) => entry.jaw === jaw)) return;
      hiddenCaseOverlays.push({
        jaw,
        polyline: window.getPolylineJawVisibility?.(jaw) ?? true,
        teeth: artificialTeethRenderer.getJawVisibility?.(jaw) ?? true,
      });
      window.setPolylineJawVisibility?.(jaw, false);
      artificialTeethRenderer.setJawVisibility?.(jaw, false);
    });
  }

  function restoreCaseAssets() {
    hiddenCaseMeshes.splice(0).forEach(({ mesh, visible }) => {
      mesh.visible = visible;
    });
    hiddenCaseOverlays.splice(0).forEach(({ jaw, polyline, teeth }) => {
      window.setPolylineJawVisibility?.(jaw, polyline);
      artificialTeethRenderer.setJawVisibility?.(jaw, teeth);
    });
    window.syncArtificialTeethToJaw?.();
  }

  // Slot meshes are kept in memory when the case view is showing, so coming
  // back to the design costs nothing.
  function hideDesignMeshes() {
    designSlotMeshes.forEach((mesh) => {
      hiddenDesignMeshes.push({ mesh, visible: mesh.visible });
      mesh.visible = false;
    });
  }

  function showDesignMeshes() {
    if (!hiddenDesignMeshes.length) return;
    hiddenDesignMeshes.splice(0).forEach(({ mesh, visible }) => {
      mesh.visible = visible;
    });
  }

  function rebuildObjectsPanel() {
    removeVisibilityAndTransparencyControls();
    addVisibilityAndTransparencyControls(
      parentObject,
      name,
      all_mesh_mat,
      getDesignSlotRoster()
    );
  }

  // Show the uploaded 3D files. Fetches them on first use; afterwards it is
  // just a visibility flip. Returns false when the case has no uploads — the
  // caller then offers the upload affordance instead.
  async function showDesignView({ silent = false } = {}) {
    if (!designSlotMeshes.length) {
      const loaded = await loadAllSTLSlots({ silent });
      if (!loaded) return false;
    } else {
      showDesignMeshes();
    }
    removeDesignUploadPrompt();
    activateDesignView();
    return true;
  }

  // Put the scene into design view with whatever slot meshes are loaded. Split
  // out of showDesignView so an upload can switch to what it just added without
  // going back to the network for all four slots.
  function activateDesignView() {
    designViewActive = true;
    hideCaseAssetsForDesign();
    updateViewerRotationOrigin();
    syncPolylineFocusMode();
    controls.update();
    rebuildObjectsPanel();
    window.syncDesignViewButton?.(true);
  }

  // ── Upload affordance for a case with no uploads ────────────────────────
  // Mirrors the 3D preview panel's empty slot rows: a "+" per slot that opens a
  // file picker and POSTs to /stl/slot/, then reloads the design view.
  function removeDesignUploadPrompt() {
    document.getElementById("design-upload-prompt")?.remove();
  }

  function uploadSlotStl(payload, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/stl/slot/`);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(xhr.responseText)
          : reject(new Error(`HTTP ${xhr.status}`));
      xhr.onerror = () => reject(new Error("network error"));
      xhr.send(payload);
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop());
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function pickAndUploadSlot(slot, statusEl) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".stl";
    input.hidden = true;
    document.body.appendChild(input);
    const file = await new Promise((resolve) => {
      input.addEventListener("change", () => resolve(input.files?.[0] || null));
      input.click();
    });
    input.remove();
    if (!file) return;
    if (!/\.stl$/i.test(file.name)) {
      statusEl.textContent = "Only .stl files are supported.";
      return;
    }

    statusEl.textContent = `Uploading ${file.name}…`;
    setUploadPromptBusy(true);
    setSlotTileBusy(slot, "Reading file");
    try {
      const base64 = await fileToBase64(file);
      await uploadSlotStl(
        JSON.stringify([
          {
            machine_id: MACHINE_ID,
            uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
            caseIntID: paramValue,
          },
          // case_id belongs in THIS object, not the auth one: the writer reads
          // it from here (same as POST /stl) and without it the insert runs
          // `case_id = NULL` and 500s. The 500 carries no CORS header, so the
          // browser only ever saw "Failed to fetch".
          {
            case_id: paramValue,
            slotNumber: slot,
            filename: file.name,
            data: base64,
          },
        ]),
        (fraction) => setSlotTileBusy(slot, "Uploading", fraction)
      );

      // Render the bytes we just sent instead of reloading the design: the old
      // path called showDesignView(), which re-downloaded every slot AND tore
      // the panel down, so the first upload ended the session — there was no way
      // to add the other three files. Same approach as the 3D preview panel.
      statusEl.textContent = `${file.name} uploaded. Preparing…`;
      setSlotTileBusy(slot, "Preparing");
      // Parsing blocks the main thread, so let the tile paint "Preparing…" first.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      addDesignSlotMesh(slot, file.name, atob(base64));
      activateDesignView();
      statusEl.textContent = `${file.name} uploaded.`;
    } catch (error) {
      console.error("[viewer3D] slot upload failed", error);
      statusEl.textContent = "Upload failed. Please try again.";
    } finally {
      clearSlotTileBusy(slot);
      setUploadPromptBusy(false);
    }
  }

  // Which slot numbers already hold a file, from the meshes themselves — a slot
  // is occupied exactly when something is rendered for it.
  function getUploadedSlotName(slot) {
    return designSlotMeshes.find((mesh) => mesh.userData?.designSlot === slot)
      ?.userData?.sourceFilename;
  }

  function getSlotWrap(slot) {
    return document.querySelector(
      `#design-upload-prompt .dup-slot-wrap[data-slot="${slot}"]`
    );
  }

  // Put one slot's tile into its working state: a bar of its own, per slot, so
  // each file reports itself instead of four downloads sharing one number.
  // fraction null draws an indeterminate bar (parsing, deleting — no byte count).
  function setSlotTileBusy(slot, note, fraction = null) {
    const wrap = getSlotWrap(slot);
    if (!wrap) return;
    wrap.classList.add("is-busy");
    const bar = wrap.querySelector(".dup-slot-bar");
    const noteEl = wrap.querySelector(".dup-slot-note");
    if (bar) {
      if (fraction == null) {
        bar.removeAttribute("value");
      } else {
        bar.value = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
      }
    }
    if (noteEl) {
      noteEl.textContent =
        fraction == null ? `${note}…` : `${note} ${Math.round(fraction * 100)}%`;
    }
  }

  function clearSlotTileBusy(slot) {
    const wrap = getSlotWrap(slot);
    if (!wrap) return;
    wrap.classList.remove("is-busy");
    const bar = wrap.querySelector(".dup-slot-bar");
    if (bar) bar.value = 0;
    const noteEl = wrap.querySelector(".dup-slot-note");
    if (noteEl) noteEl.textContent = "";
  }

  // Hands ApiClient a per-slot stand-in for the loading screen's progress
  // elements, so a slot's download bytes land in that slot's own tile. Restore()
  // must run before the next slot starts.
  function routeSlotDownloadProgress(slot) {
    const previous = window.viewerLoadingEls;
    let fileMax = 1;
    let fileValue = 0;
    const progressStandIn = {
      style: {},
      get max() {
        return fileMax;
      },
      set max(bytes) {
        fileMax = Number(bytes) || 1;
      },
      get value() {
        return fileValue;
      },
      set value(bytes) {
        fileValue = Number(bytes) || 0;
        setSlotTileBusy(slot, "Downloading", Math.min(fileValue / fileMax, 1));
      },
    };
    window.viewerLoadingEls = {
      progressBar: progressStandIn,
      // ApiClient writes a percentage and a speed readout; the tile shows its own.
      percentage: { textContent: "" },
      displayBox: { textContent: "" },
    };
    return {
      restore() {
        if (previous) window.viewerLoadingEls = previous;
        else delete window.viewerLoadingEls;
      },
    };
  }

  // Paint every tile from current slot state: filled slots show their filename
  // and a delete button, empty ones keep the "+". Called after each upload so
  // the panel stays open for the next file, the way the 3D preview panel's
  // "Other 3D files" list does.
  function refreshUploadPromptSlots() {
    const prompt = document.getElementById("design-upload-prompt");
    if (!prompt) return;

    prompt.querySelectorAll(".dup-slot-wrap").forEach((wrap) => {
      const slot = Number(wrap.dataset.slot);
      const filename = getUploadedSlotName(slot);
      const label = EXTRA_STL_SLOT_NAMES[slot];
      const tile = wrap.querySelector(".dup-slot");
      const deleteBtn = wrap.querySelector(".dup-slot-delete");

      wrap.classList.toggle("is-filled", Boolean(filename));
      tile.disabled = Boolean(filename);
      tile.title = filename ? `${label}: ${filename}` : `Upload ${label}`;
      tile.setAttribute(
        "aria-label",
        filename ? `${label}: ${filename}` : `Upload ${label}`
      );
      tile.querySelector(".dup-plus").textContent = filename ? "✓" : "+";
      tile.querySelector(".dup-slot-label").textContent = label;
      tile.querySelector(".dup-slot-file").textContent = filename || "";

      deleteBtn.hidden = !filename;
      deleteBtn.title = filename ? `Delete ${filename}` : "";
      deleteBtn.setAttribute(
        "aria-label",
        filename ? `Delete ${filename} from ${label}` : "Delete"
      );
    });

    const anyUploaded = designSlotMeshes.length > 0;
    const heading = prompt.querySelector(".dup-heading");
    if (heading) {
      heading.textContent = anyUploaded
        ? "3D RPD design files"
        : "No 3D RPD design uploaded yet";
    }
    const sub = prompt.querySelector(".dup-sub");
    if (sub) {
      sub.textContent = anyUploaded
        ? "Add another file to an empty slot, or close this to view the design."
        : "Add an STL to a slot, or open the 3D scan.";
    }
    const closeBtn = prompt.querySelector(".dup-open-scan");
    if (closeBtn) {
      closeBtn.textContent = anyUploaded
        ? "Done — view the design"
        : "Open the 3D scan instead";
    }
  }

  // An upload or delete holds the whole panel: two at once would race the slot
  // list, and the file being parsed already blocks the main thread.
  function setUploadPromptBusy(isBusy) {
    const prompt = document.getElementById("design-upload-prompt");
    if (!prompt) return;
    prompt.classList.toggle("is-busy", isBusy);
    prompt
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = isBusy));
    // Re-disables the filled tiles, which are never clickable.
    if (!isBusy) refreshUploadPromptSlots();
  }

  // Free the slot on the backend, then drop its mesh. Confirmed first: the file
  // is gone for every viewer of the case and re-uploading means finding the
  // original STL again.
  async function deleteSlotFile(slot, statusEl) {
    const filename = getUploadedSlotName(slot);
    if (!filename) return;
    const label = EXTRA_STL_SLOT_NAMES[slot];
    if (!window.confirm(`Delete "${filename}" from ${label}?`)) return;

    setUploadPromptBusy(true);
    setSlotTileBusy(slot, "Deleting");
    if (statusEl) statusEl.textContent = `Deleting ${filename}…`;
    try {
      const response = await fetch(`${API_BASE}/stl/slot/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same contract as the upload: case_id rides in the second object.
        body: JSON.stringify([
          {
            machine_id: MACHINE_ID,
            uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
            caseIntID: paramValue,
          },
          { case_id: paramValue, slotNumber: slot },
        ]),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const index = designSlotMeshes.findIndex(
        (mesh) => mesh.userData?.designSlot === slot
      );
      if (index !== -1) {
        disposeDesignSlotMesh(designSlotMeshes[index]);
        designSlotMeshes.splice(index, 1);
      }
      rebuildObjectsPanel();
      if (statusEl) statusEl.textContent = `${filename} deleted.`;
    } catch (error) {
      console.error(`[viewer3D] slot ${slot} delete failed`, error);
      if (statusEl) statusEl.textContent = "Delete failed. Please try again.";
    } finally {
      clearSlotTileBusy(slot);
      setUploadPromptBusy(false);
    }
  }

  // The slot manager: four tiles, one per slot, mirroring the 3D preview panel's
  // "Other 3D files" list. Opens automatically when a case has no uploads at
  // all, and on demand from the toolbar button.
  function showDesignUploadPrompt() {
    if (document.getElementById("design-upload-prompt")) {
      refreshUploadPromptSlots();
      return;
    }

    const prompt = document.createElement("div");
    prompt.id = "design-upload-prompt";
    // Own card + background: the viewer stage can be light or dark depending on
    // the case, and the text has to stay readable either way.
    const card = document.createElement("div");
    card.className = "dup-card";

    const heading = document.createElement("div");
    heading.className = "dup-heading";

    const sub = document.createElement("div");
    sub.className = "dup-sub";

    const slotsRow = document.createElement("div");
    slotsRow.className = "dup-slots";

    const status = document.createElement("div");
    status.className = "dup-status";

    [1, 2, 3, 4].forEach((slot) => {
      // The delete button can't live inside the tile (a button in a button), so
      // each slot is a wrapper holding the tile, its own progress bar and the ×.
      const wrap = document.createElement("div");
      wrap.className = "dup-slot-wrap";
      wrap.dataset.slot = String(slot);

      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "dup-slot";
      tile.innerHTML =
        `<span class="dup-plus" aria-hidden="true"></span>` +
        `<span class="dup-slot-label"></span>` +
        `<span class="dup-slot-file"></span>` +
        `<progress class="dup-slot-bar" max="100" value="0"></progress>` +
        `<span class="dup-slot-note"></span>`;
      tile.addEventListener("click", () => pickAndUploadSlot(slot, status));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "dup-slot-delete";
      deleteBtn.textContent = "×";
      deleteBtn.hidden = true;
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteSlotFile(slot, status);
      });

      wrap.append(tile, deleteBtn);
      slotsRow.appendChild(wrap);
    });

    // Doubles as "done" once something is uploaded: with files in the scene
    // there is a design to go back to, so closing the panel is the useful
    // action rather than switching to the case scan.
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "dup-open-scan";
    closeBtn.addEventListener("click", async () => {
      closeBtn.disabled = true;
      if (designSlotMeshes.length) {
        removeDesignUploadPrompt();
        return;
      }
      await showCaseView();
      window.syncDesignViewButton?.(false);
    });

    card.append(heading, sub, slotsRow, status, closeBtn);
    prompt.appendChild(card);
    (viewerContainer || document.body).appendChild(prompt);
    refreshUploadPromptSlots();
  }

  // The toolbar is built in another scope (same as syncDesignViewButton), so the
  // slot manager is reached through the window.
  window.showDesignUploadPrompt = showDesignUploadPrompt;
  window.removeDesignUploadPrompt = removeDesignUploadPrompt;

  // ── Case assets, loaded on demand ───────────────────────────────────────
  // Nothing here is fetched on entry. The 3D button is what pulls the case's
  // mesh, polylines and artificial teeth down, once; afterwards switching views
  // is just a visibility flip.
  let caseAssetsPromise = null;

  // Same endpoints and fallback the eager path used: parameterisation meshes
  // first, /stl/get when that is unavailable (which also sets `stl`, the flag
  // that decides the upper jaw's orientation).
  async function fetchCaseMeshData() {
    const fetched = [];
    const jawMesh = await apiClient.post(
      "/parameterisation/mesh/getall",
      [data],
      false,
      "Jaw mesh"
    );
    if (isObject(jawMesh)) {
      fetched.push(...[].concat(jawMesh));
    } else {
      console.log("[viewer3D] STL source selected: /stl/get (parameterisation fallback)");
      const rawStl = await apiClient.post("/stl/get", [data], false, "Jaw mesh");
      if (isObject(rawStl)) {
        fetched.push(...[].concat(rawStl));
        stl = true;
      }
    }

    const dentureMesh = await apiClient.post(
      "/surface/getall",
      [data],
      false,
      "Denture mesh"
    );
    if (isObject(dentureMesh)) fetched.push(...[].concat(dentureMesh));

    return fetched;
  }

  async function loadCaseAssets() {
    const startedAt = performance.now();
    caseMeshRequested = true;
    const ownsLoadingScreen = !document.getElementById("viewer-loading-screen");
    if (ownsLoadingScreen) createViewerLoadingScreen();
    window.updateViewerLoading?.("Loading 3D scan…");

    try {
      // Heatmaps first: renderCaseMeshes colours the jaws from undercut_values.
      await fetchUndercutHeatmaps();
      const fetched = await fetchCaseMeshData();
      window.updateViewerLoading?.("Preparing 3D scan…");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      renderCaseMeshes(fetched);
      // The design is still on screen at this point, so these land hidden (see
      // renderCaseMeshes) and are revealed by showCaseView below.
      window.updateViewerLoading?.("Loading design lines…");
      await fetchAndRenderCaseOverlays(paramValue).catch((error) => {
        console.warn("Case overlays failed to load:", error);
      });
      if (isDesignViewActive()) hideCaseAssetsForDesign();
      addViewerLoadTiming("case assets (on demand)", performance.now() - startedAt);
    } finally {
      if (ownsLoadingScreen) removeViewerLoadingScreen();
    }
  }

  function ensureCaseAssets() {
    if (!caseAssetsPromise) {
      caseAssetsPromise = loadCaseAssets().catch((error) => {
        // Let a failed load be retried by the next click rather than wedging
        // the button on a rejected promise forever.
        caseAssetsPromise = null;
        throw error;
      });
    }
    return caseAssetsPromise;
  }

  // Show the case's own mesh, polylines and artificial teeth (the 3D button).
  async function showCaseView() {
    await ensureCaseAssets();
    removeDesignUploadPrompt();
    designViewActive = false;
    hideDesignMeshes();
    restoreCaseAssets();
    updateViewerRotationOrigin();
    syncPolylineFocusMode();
    controls.update();
    rebuildObjectsPanel();
  }

  // Fetches the four upload slots and adds them to the scene. Visibility and
  // the objects panel are the caller's job (showDesignView). `silent` skips the
  // alerts, for the automatic load on entry. Returns true if anything loaded.
  async function loadAllSTLSlots({ silent = false } = {}) {
    const slotLoadStartedAt = performance.now();
    startViewerLoadTimer("viewer: framework/denture mesh loading");
    const apiUrl = "/stl/slot/get";

    const authPayload = {
      machine_id: MACHINE_ID,
      uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
      caseIntID: paramValue,
    };

    // Drop any previous slot meshes so a re-load can't stack copies.
    designSlotMeshes.splice(0).forEach(disposeDesignSlotMesh);
    hiddenDesignMeshes.splice(0);

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

    // The slot manager is the progress UI: each of the four tiles reports its
    // own file. That replaced a single bar on the loading screen that pooled all
    // four downloads into one number — you could not tell which file was slow,
    // or which slots the case even had until the whole thing finished.
    showDesignUploadPrompt();
    const prompt = document.getElementById("design-upload-prompt");
    prompt?.classList.add("is-loading");
    setUploadPromptBusy(true);
    [1, 2, 3, 4].forEach((slot) => setSlotTileBusy(slot, "Waiting"));

    let anyLoaded = false;

    // The backend throttles bursts of requests and the rejection comes back
    // without CORS headers, so the browser reports it as a CORS failure rather
    // than a status. Loading on entry puts slot 1 right behind the case-mesh
    // downloads, which was enough to lose it — pause and retry before dropping
    // a slot. Same reason the case list loads its rows lazily.
    const fetchSlot = async (payload, slot) => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await apiClient.post(apiUrl, payload, false, `Slot ${slot}`);
        } catch (error) {
          if (attempt >= 3) throw error;
          console.warn(
            `[viewer3D] Slot ${slot} attempt ${attempt} failed (${error.message || error}) — retrying`
          );
          await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        }
      }
    };

    try {
      for (let slot = 1; slot <= 4; slot++) {
        //for (let slot = 4; slot>0; slot--){
        const slotStartedAt = performance.now();
        const payload = [authPayload, { slotNumber: slot }];

        // Bytes for this slot go to this slot's bar.
        const slotProgress = routeSlotDownloadProgress(slot);
        try {
          setSlotTileBusy(slot, "Downloading", 0);
          const result = await fetchSlot(payload, slot);

          // Match the 3D preview panel (preview3D.fetchExtraStlsForCase): the
          // /stl/slot/get endpoint may return a single object OR a one-element
          // array ([{ filename, data, ... }]). Newly created slot STLs come back
          // array-wrapped, so read result[0] when it's an array — otherwise the
          // viewer silently skipped them.
          const slotItem = Array.isArray(result) ? result[0] : result;

          if (!slotItem || !slotItem.data) {
            console.log(`❌ Slot ${slot}: No STL data found.`);
            continue;
          }

          // Parsing a 15–20 MB STL blocks the main thread, so hand the browser a
          // frame to paint this status before it freezes — otherwise the bar sits
          // at 100% with no explanation for several seconds per file.
          setSlotTileBusy(slot, "Preparing");
          await new Promise((resolve) => requestAnimationFrame(resolve));

          addDesignSlotMesh(slot, slotItem.filename, atob(slotItem.data));

          console.log(`✅ Loaded STL from slot ${slot}`);
          anyLoaded = true;
        } catch (error) {
          console.warn(`⚠️ Slot ${slot} failed:`, error.message || error);
        } finally {
          slotProgress.restore();
          clearSlotTileBusy(slot);
          refreshUploadPromptSlots();
        }
      }

    } finally {
      // A thrown slot must not leave the panel stuck in its loading state.
      const loadedPrompt = document.getElementById("design-upload-prompt");
      loadedPrompt?.classList.remove("is-loading");
      setUploadPromptBusy(false);
      // Files arrived, so the design itself is what the user wants to see. A
      // case with none keeps the panel up — it is the upload affordance.
      if (anyLoaded) removeDesignUploadPrompt();
    }

    endViewerLoadTimer("viewer: framework/denture mesh loading");
    addViewerLoadTiming(
      "framework/denture mesh loading",
      performance.now() - slotLoadStartedAt
    );

    // On entry this runs unattended, so a case with no uploads must fall back
    // to the case view quietly rather than opening with an alert.
    if (!silent) {
      alert(
        anyLoaded
          ? "✅ STL loading completed."
          : "❌ No STL files found in slots 1 to 4."
      );
    } else if (!anyLoaded) {
      console.log("[viewer3D] No slot STLs for this case — showing case mesh.");
    }

    return anyLoaded;
  }

  //console.log(responseDatas);
  // Decode/parse/add the case's own meshes. Extracted so the 3D button can
  // run it later: on entry `responseDatas` is empty (nothing was fetched) and
  // this is a no-op.
  function renderCaseMeshes(responseDatas) {
    const meshCpuStartedAt = performance.now();
    let jawMeshCpuMs = 0;
    let frameworkMeshCpuMs = 0;
    startViewerLoadTimer("viewer: mesh decode/parse/render");

    // Normalize each mesh entry so the `.includes()` checks below never throw and
    // jaw-side detection matches the 3D preview panel (getJawKeyFromFile). The
    // /stl/get fallback can return a NUMERIC `type` (1=upper, 2=lower) or omit
    // `filename`; calling `.includes()` on a number threw here, halting the parse
    // loop and leaving the loader stuck at 100%.
    for (const f of responseDatas) {
      if (typeof f.filename !== "string") f.filename = String(f.filename ?? "");
      const t = String(f.type ?? "").toLowerCase();
      if (!t.includes("upper") && !t.includes("lower")) {
        const name = f.filename.toLowerCase();
        if (f.type === 1 || f.type === "1" || name.includes("upper")) f.type = "upper_jaw";
        else if (f.type === 2 || f.type === "2" || name.includes("lower")) f.type = "lower_jaw";
        else f.type = t;
      }
    }

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

      // `stl` only records that /parameterisation/mesh/getall was unavailable and
      // we fell back to /stl/get — it does NOT guarantee the bytes are STL. That
      // fallback route serves OFF meshes for some cases (e.g. upperjawclosed.off),
      // and feeding OFF text into the STL loader throws
      // "RangeError: Offset is outside the bounds of the DataView", which escapes
      // this loop and leaves the loader stuck at 100% (the 3D preview panel avoids
      // this by sniffing each payload — see preview3D.inspectMeshPayload). Detect
      // the real format from the decoded head and route OFF data to the OFF loader
      // regardless of the flag; keep `stl` for orientation (closed OFF jaws, like
      // real STLs, are already world-oriented and must NOT get the +180 flip).
      const isOffData = offdata.trimStart().slice(0, 3).toUpperCase() === "OFF";
      // "stl" is the loaders' no-heatmap sentinel — an undefined surface would
      // throw inside OFFLoader ('surveying_values' in undefined) and re-create
      // the stuck-at-100% hang.
      const undercutForJaw =
        (offFile.type.includes("upper")
          ? undercut_values[1]
          : undercut_values[0]) ?? "stl";
      const jawSideKnown =
        offFile.type.includes("upper") || offFile.type.includes("lower");
      if (jawSideKnown) {
        if (stl && !isOffData) {
          const stlMeshLoader = new STLMeshLoader(material);
          mesh_geo = stlMeshLoader.load(offdata, undercutForJaw);
        } else {
          mesh_geo = loader.parse(offdata, undercutForJaw, x);
        }
      }
      meshParseMs = performance.now() - meshParseStartedAt;

      // If the jaw side couldn't be resolved (unexpected `type`) or the loader
      // rejected the payload (OFFLoader.parse returns the string "stl" on a bad
      // header), mesh_geo isn't a [mesh, materials] pair — skip rather than throw
      // (a throw here halts the loop and leaves the loading screen stuck at 100%).
      if (!mesh_geo || typeof mesh_geo === "string" || !mesh_geo[0]) {
        console.warn(
          `[viewer3D] Skipping mesh with unresolved geometry: ${offFile.filename} (type=${offFile.type})`
        );
        continue;
      }

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
  }

  renderCaseMeshes(responseDatas);
  //console.log(all_mesh_mat);

  // Show "No STL/3D Scan File Found!" when the API returned no jaw mesh data.
  // Only meaningful once the scan has actually been requested — on entry
  // nothing is fetched, and an empty `responseDatas` just means "not asked for".
  const hasJawFiles = responseDatas.some(
    (f) => f.filename && !f.filename.includes("surface")
  );
  if (caseMeshRequested && !hasJawFiles) {
    const noScanOverlay = document.createElement("div");
    noScanOverlay.id = "no-scan-overlay";
    noScanOverlay.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;" +
      "justify-content:center;z-index:100;pointer-events:none;";
    const noScanMsg = document.createElement("div");
    noScanMsg.style.cssText =
      "background:rgba(0,0,0,0.65);color:#fff;font-family:Arial,sans-serif;" +
      "font-size:18px;font-weight:600;padding:24px 36px;border-radius:12px;" +
      "letter-spacing:0.3px;text-align:center;";
    noScanMsg.textContent = "No STL/3D Scan File Found!";
    noScanOverlay.appendChild(noScanMsg);
    (viewerContainer || document.body).appendChild(noScanOverlay);
  }

  function changeMeshRotation(mesh, x, y, z) {
    mesh.rotation.set(
      THREE.MathUtils.degToRad(x),
      THREE.MathUtils.degToRad(y),
      THREE.MathUtils.degToRad(z)
    );
  }

  // Example usage

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

  window.finished = true; // window property (declared at top) — a bare `finished` only resolves through it
  // Instantiate a new renderer and set its size
  // antialias on: fissures are sub-pixel at normal zoom and alias into noise
  // without it. Do NOT add setPixelRatio here — resizeViewerStage() calls
  // setSize(w, h, false), so the canvas carries no CSS size and `#container3D
  // canvas { width/height: auto !important }` lays it out at its INTRINSIC
  // (attribute) size. A pixel ratio of 2 therefore lays the canvas out at twice
  // the stage and pushes the jaw off-screen.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  // White by choice. Note it costs silhouette contrast — tan crowns measure 2.6:1
  // on white versus 5.6:1 on dark slate, so interproximal embrasures read less
  // strongly. Keep #container3D's background-color in step with this.
  renderer.setClearColor(0xffffff, 1);
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
    caseTitle.style.transform = "translateX(-50%)";

    // Insert it into container3D
    container.appendChild(caseTitle);
  } else {
    console.error("No container element found");
  }

  // Set how far the camera will be from the 3D model

  camera.position.z = objToRender === "dino" ? 100 : 500;

  // Lighting is tuned for surface relief, NOT for even illumination — the previous
  // rig (ambient 1.0 plus four opposing directionals "for even lighting") lit every
  // facing equally, which is exactly what erases cusps and fissures.
  //
  // The directional lights are children of the camera, the way dental CAD viewers
  // rig them, so the surface being looked at is always the lit one. World-fixed
  // lights leave the far side dark when the camera orbits (measured 43% brightness
  // swing front-to-back, versus 4% rigged this way). The offsets are deliberately
  // off-axis: a pure headlight lights everything evenly and flattens relief again.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xfff1f5, 0.38));
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  // Aim point parented to the camera too, so the rig is unaffected by where the
  // jaw sits or by panning — direction stays fixed relative to the view.
  const lightAim = new THREE.Object3D();
  lightAim.position.set(0, 0, -100);
  camera.add(lightAim);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
  keyLight.position.set(-60, 80, 100);
  keyLight.target = lightAim;
  camera.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.32);
  fillLight.position.set(80, 20, 60);
  fillLight.target = lightAim;
  camera.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.42);
  rimLight.position.set(0, -70, -90);
  rimLight.target = lightAim;
  camera.add(rimLight);

  // Camera children only get world matrices once the camera is in the scene graph.
  scene.add(camera);

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
    // Hard position lock: snap orbit target back to jaw centre every frame.
    // Rotation and zoom still work; panning is fully suppressed.
    if (hasViewerRotationOrigin && controls?.target) {
      const _snapDelta = viewerRotationOrigin.clone().sub(controls.target);
      if (_snapDelta.lengthSq() > 1e-10) {
        controls.target.copy(viewerRotationOrigin);
        camera.position.add(_snapDelta);
        if (orb_controls?.target) orb_controls.target.copy(viewerRotationOrigin);
        camera.updateProjectionMatrix();
      }
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

  function applyFitZoomIfLoaded() {
    if (!getPresetViewBounds()) return;
    camera.zoom = computeFitZoom();
    camera.updateProjectionMatrix();
  }

  // Add a listener to the window, so we can resize the window and the camera
  window.addEventListener("resize", function () {
    resizeViewerStage(renderer);
    clampViewerControlTarget(controls);
    applyFitZoomIfLoaded();
  });
  new ResizeObserver(() => {
    resizeViewerStage(renderer);
    applyFitZoomIfLoaded();
  }).observe(container);

  camera.zoom = computeFitZoom();
  camera.updateProjectionMatrix();

  const VIEWER_MAX_ZOOM = 50;
  window.setViewerZoom = (zoom) => {
    if (!camera) return;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  };
  window.VIEWER_MAX_ZOOM = VIEWER_MAX_ZOOM;

  const clonedCamera = camera.clone();
  addResetButton(camera, clonedCamera, controls, () => {
    const target = hasViewerRotationOrigin
      ? viewerRotationOrigin
      : updateViewerRotationOrigin();
    return target?.clone?.() || null;
  });
  createPresetViewControls();
  //console.log(camera)

  // Start the 3D rendering
  const finalSceneRenderStartedAt = performance.now();
  startViewerLoadTimer("viewer: final scene render/update");
  animate();
  // Scene is ready — the slot STLs are still arriving, but their progress is
  // reported per file by the slot manager, which this screen would cover.
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
  addVisibilityAndTransparencyControls(parentObject, name, all_mesh_mat);
  endViewerLoadTimer("viewer: controls setup");
  addViewerLoadTiming("controls setup", performance.now() - controlsStartedAt);
  addViewerLoadTiming(
    "initial viewer usable",
    performance.now() - viewerTotalStartedAt
  );
  logViewerObjectCounts("initial viewer usable");
  logViewerPerformanceSummary();

  // Polylines and artificial teeth are case assets: they are fetched by
  // loadCaseAssets() when the 3D button asks for them, not on entry.

  // The viewer lands on the uploaded 3D files. Silent, so a case with no
  // uploads shows the upload affordance instead of opening with an alert.
  const designViewPromise = showDesignView({ silent: true })
    .then((shown) => {
      window.syncDesignViewButton?.(shown);
      // No uploads for this case: offer the "+" slots rather than an empty
      // viewer. The case scan is one tap away via the prompt or the 3D button.
      if (!shown) showDesignUploadPrompt();
    })
    .catch((error) => {
      console.warn("[viewer3D] Design view failed to load:", error);
    });

  // No /user/logout here any more. It used to fire once the entry load
  // finished, which ended the shared server-side session while the page was
  // still open — the 3D button then 401'd on its first request and only
  // recovered through ApiClient's re-login. With the case assets, uploads and
  // status changes all happening after entry, the session has to outlive it.

  addViewerLoadTiming(
    "total viewer load",
    performance.now() - viewerTotalStartedAt
  );
  logViewerPerformanceSummary();
  designViewPromise.finally(() => {
    // Defensive: the screen is dropped as soon as the scene is ready, but a
    // throw before that point must not leave it up.
    removeViewerLoadingScreen();
    logViewerObjectCounts("entry load complete");
  });
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
  watermark.style.top = "8px";
  watermark.style.left = "50%";
  watermark.style.transform = "translateX(-50%)";
  watermark.style.color = "black";
  watermark.style.fontSize = "16px";
  watermark.style.fontWeight = "bold";
  watermark.style.textShadow = "0px 0px 10px rgba(0, 0, 0, 0.8)";
  watermark.style.pointerEvents = "none";
  watermark.classList.add("case-title-watermark");

  fullscreenContainer.appendChild(watermark);

  // watermark stays pinned to top: 8px — no dynamic centering needed

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

                // Close the chat sidebar if it's open during image zoom
                const chatWidget = document.getElementById("chat-widget");
                if (chatWidget && chatWidget.classList.contains("is-open")) {
                  chatWidget.classList.remove("is-open");
                  setTimeout(() => chatWidget.classList.add("is-hidden"), 220);
                }

                div.addEventListener("click", () => div.remove(), { once: true });

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

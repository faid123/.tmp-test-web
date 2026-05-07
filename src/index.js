// Import the THREE.js library
import * as THREE from "three";
// To allow for the camera to move around the scene
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import { STLMeshLoader } from "./STLMeshLoader.js";

console.log(THREE.REVISION);
// Import the OFFLoader class
import { OFFLoader } from "./OFFLoader.js";
// Import the ApiClient class
import { ApiClient } from "./ApiClient.js";

import { addResetButton } from "./resetButton.js";
import { lol } from "./crypt.js";
import "./js/sidebar.js";
import "./js/createCase";
import {
  addVisibilityAndTransparencyControls,
  removeVisibilityAndTransparencyControls,
} from "./newControls.js";

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
const aspect = window.innerWidth / window.innerHeight;
camera = new THREE.OrthographicCamera(
  window.innerWidth / -2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  window.innerHeight / -2,
  -500,
  1000
);

// Keep track of the mouse position, so we can make the eye move
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let undercut_type = {};
// Keep the 3D object on a global variable so we can access it later

// OrbitControls allow the camera to move around the scene
let controls;
let orb_controls;

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
const polylineComponentVisibility = new Map();
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
  "Major Conn",
  "Proximal Plate",
  "Rest",
  "Minor Conn",
  "Mesh",
  "Reversal Line",
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
  if (/major\s*connector/i.test(text)) return "Major Conn";
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
  return `${arch}:${component}`;
}

function formatPolylineComponentLabel(key) {
  const [arch, ...componentParts] = key.split(":");
  const component = componentParts.join(":") || "polyline";
  if (component === "Major Conn") {
    return `${arch.charAt(0).toUpperCase()}${arch.slice(1)} Major Connector`;
  }
  return component;
}

function isPolylineComponentVisibleByDefault(key) {
  return !/gingival\s*points/i.test(key || "");
}

function getPolylineComponentSortRank(key) {
  const [arch, ...componentParts] = key.split(":");
  const component = componentParts.join(":") || "polyline";
  if (component === "Major Conn") {
    return arch === "upper" ? 0 : arch === "lower" ? 1 : 2;
  }

  const appOrder = POLYLINE_APP_COMPONENTS.filter(
    (componentName) => componentName !== "Major Conn"
  );
  const componentIndex = appOrder.indexOf(component);
  return componentIndex >= 0 ? componentIndex + 3 : appOrder.length + 3;
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

  try {
    const decoded = atob(value.trim());
    if (POLYLINE_TEXT_DETECTION_PATTERN.test(decoded)) {
      return decoded;
    }
  } catch {
    // Keep going: the value may already be plain text.
  }

  return POLYLINE_TEXT_DETECTION_PATTERN.test(value) ? value : "";
}

function parsePolylineTextSegments(value) {
  const text = decodePolylineText(value);
  if (!text) return [];

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
    return 0x14b8a6;
  }

  if (/minor\s*(connector|conn)/i.test(component || "")) {
    return 0x22c55e;
  }

  if (/^mesh$/i.test(component || "")) {
    return 0xffd400;
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

function getJawMeshForPolyline(jawType) {
  const jawText = jawType.toLowerCase();
  return parentObject.children.find((child) => {
    const type = String(child.userData?.jaw_type || child.name || "").toLowerCase();
    return type.includes(jawText);
  });
}

function applyJawTransformToPolylineGroup(group, jawType) {
  const jawMesh = getJawMeshForPolyline(jawType);
  if (!jawMesh) return;

  group.position.copy(jawMesh.position);
  group.rotation.copy(jawMesh.rotation);
  group.scale.copy(jawMesh.scale);
}

function getDistanceBetweenPoints(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
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
    : Math.max(medianDistance * 8, 12);
  const turnThreshold = Math.max(medianDistance * 2.2, 4);
  const edges = [];

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const distance = getDistanceBetweenPoints(previous, current);
    const previousTurnCosine =
      isGingival && i > 1
        ? getPolylineTurnCosine(points[i - 2], previous, current)
        : 1;
    const nextTurnCosine =
      isGingival && i < points.length - 1
        ? getPolylineTurnCosine(previous, current, points[i + 1])
        : 1;
    const isSuspiciousGingivalTurn =
      isGingival &&
      distance > turnThreshold &&
      (previousTurnCosine < -0.5 || nextTurnCosine < -0.5);

    if (distance <= jumpThreshold && !isSuspiciousGingivalTurn) {
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
  const points = getSegmentPoints(segment);
  const component = getSegmentComponent(segment);
  const componentKey = getPolylineComponentKey(jawType, component);
  const edges = getSegmentRenderableEdges(segment, points, component);
  const positionArray = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    positionArray[index * 3] = point.x;
    positionArray[index * 3 + 1] = point.y;
    positionArray[index * 3 + 2] = point.z;
  });
  const positionAttribute = new THREE.BufferAttribute(positionArray, 3);
  const group = new THREE.Group();
  group.name = `${jawType}-${component}-polyline-segment-${segmentIndex}`;
  group.visible = isPolylineOverlayVisible &&
    (polylineComponentVisibility.get(componentKey) ?? true);
  group.userData = {
    overlayType: "polyline",
    arch: jawType,
    component,
    componentKey,
    segmentIndex,
    originalPositionArray: positionArray.slice(),
    positionAttribute,
  };

  if (points.length >= 2) {
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: getPolylineSegmentColor(component, segmentIndex),
      transparent: false,
      opacity: 1,
      roughness: 0.28,
      metalness: 0,
      depthTest: true,
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

  applyJawTransformToPolylineGroup(group, jawType);

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

function resetPolylineEdits() {
  polylineOverlayGroup.children.forEach(resetPolylineGroup);
}

function countPolylinePoints(segments) {
  return segments.reduce(
    (total, segment) => total + getSegmentPoints(segment).length,
    0
  );
}

function syncPolylineOverlayVisibility() {
  polylineOverlayGroup.visible = true;
  polylineOverlayGroup.children.forEach((group) => {
    const key = group.userData?.componentKey;
    group.visible =
      isPolylineOverlayVisible && (polylineComponentVisibility.get(key) ?? true);
  });

  if (polylineMenuButton) {
    const componentCount = getPolylineComponentSummary().length;
    polylineMenuButton.textContent = isPolylineOverlayVisible
      ? `Polylines (${componentCount})`
      : `Polylines hidden (${componentCount})`;
  }
  syncPolylineFocusMode();
}

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
  const summary = getPolylineComponentSummary();
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
    const empty = document.createElement("div");
    empty.textContent = "No polyline components";
    empty.style.padding = "8px 0";
    empty.style.color = "#6b7280";
    polylineMenuList.appendChild(empty);
    syncPolylineOverlayVisibility();
    return;
  }

  summary.forEach(({ key, color, segments, points }) => {
    const row = document.createElement("label");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "18px 12px 1fr";
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
    swatch.style.width = "10px";
    swatch.style.height = "10px";
    swatch.style.borderRadius = "50%";
    swatch.style.background = `#${color.toString(16).padStart(6, "0")}`;
    swatch.style.display = "inline-block";

    const text = document.createElement("span");
    text.textContent = `${formatPolylineComponentLabel(key)} (${segments} seg, ${points} pts)`;
    text.style.fontSize = "12px";
    text.style.lineHeight = "1.25";

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    polylineMenuList.appendChild(row);
  });

  syncPolylineOverlayVisibility();
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
  wrapper.style.position = "fixed";
  wrapper.style.right = "20px";
  wrapper.style.bottom = "230px";
  wrapper.style.zIndex = "1000";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "flex-end";
  wrapper.style.gap = "8px";

  const button = document.createElement("button");
  button.id = "polyline-visibility-toggle";
  button.type = "button";
  button.textContent = "Polylines (0)";
  button.style.padding = "10px 14px";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.background = "#6f35ff";
  button.style.color = "white";
  button.style.fontWeight = "bold";
  button.style.cursor = "pointer";
  button.style.minWidth = "150px";

  const panel = document.createElement("div");
  panel.style.display = "none";
  panel.style.width = "290px";
  panel.style.maxHeight = "45vh";
  panel.style.overflow = "auto";
  panel.style.background = "rgba(255, 255, 255, 0.96)";
  panel.style.color = "#111827";
  panel.style.border = "1px solid rgba(17, 24, 39, 0.14)";
  panel.style.borderRadius = "8px";
  panel.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.18)";
  panel.style.padding = "10px";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.flexWrap = "wrap";
  actions.style.gap = "6px";
  actions.style.marginBottom = "8px";

  const makeActionButton = (label, onClick) => {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.textContent = label;
    actionButton.style.flex = "1";
    actionButton.style.padding = "6px 8px";
    actionButton.style.border = "1px solid rgba(17, 24, 39, 0.16)";
    actionButton.style.borderRadius = "5px";
    actionButton.style.background = "#f9fafb";
    actionButton.style.cursor = "pointer";
    actionButton.style.fontSize = "12px";
    actionButton.addEventListener("click", onClick);
    return actionButton;
  };

  actions.appendChild(
    makeActionButton("All", () => {
      setPolylineMenuVisibility(() => true, true);
    })
  );
  actions.appendChild(
    makeActionButton("None", () => {
      setPolylineMenuVisibility(() => true, false);
    })
  );
  actions.appendChild(
    makeActionButton("API On", () => {
      setPolylineMenuVisibility(({ points }) => points > 0, true);
    })
  );
  actions.appendChild(
    makeActionButton("API Off", () => {
      setPolylineMenuVisibility(({ points }) => points > 0, false);
    })
  );
  actions.appendChild(makeActionButton("Reset", resetPolylineEdits));

  const list = document.createElement("div");
  panel.appendChild(actions);
  panel.appendChild(list);

  button.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  wrapper.appendChild(panel);
  wrapper.appendChild(button);
  container.appendChild(wrapper);

  polylineMenuButton = button;
  polylineMenuList = list;
  updatePolylineComponentMenu();
  attachPolylineDragHandlers(domElement);
}

async function fetchAndRenderPolylines(caseIntID) {
  clearPolylineOverlay();

  const polylinePayload = [
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
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
    const normalized = normalizePolylineResponse(response);
    const upperPointCount = countPolylinePoints(normalized.upper);
    const lowerPointCount = countPolylinePoints(normalized.lower);
    const hasAnyPoints = upperPointCount || lowerPointCount;
    console.log("[polyline] points", {
      upper: upperPointCount,
      lower: lowerPointCount,
    });

    if (!hasAnyPoints) {
      console.log("[polyline] No polyline data returned.");
      return;
    }

    renderPolylineData(normalized);
  } catch (error) {
    console.warn("[polyline] Unable to fetch polyline data.", error);
  }
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
  chatIcon.style.display = "block";
  chatIcon.style.position = "fixed";
  chatIcon.style.top = "14px";
  chatIcon.style.right = "150px";
  chatIcon.style.bottom = "auto";
  chatIcon.style.width = "56px";
  chatIcon.style.height = "56px";
  chatIcon.style.zIndex = "1001";

  chatWidget.classList.remove("active");
  chatWidget.style.display = "none";
  chatWidget.style.position = "fixed";
  chatWidget.style.top = "84px";
  chatWidget.style.right = "150px";
  chatWidget.style.bottom = "auto";
  chatWidget.style.left = "auto";
  chatWidget.style.transform = "none";
  chatWidget.style.width = "280px";
  chatWidget.style.height = "280px";
  chatWidget.style.zIndex = "1001";

  chatIcon.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = chatWidget.style.display === "flex";
    chatWidget.classList.toggle("active", !isOpen);
    chatWidget.style.display = isOpen ? "none" : "flex";
  });
}

//The async prevents processing of data before the stuff is loaded in
(async () => {
  if (!viewerContainer) {
    return;
  }

  //datas :)
  // this for the undercut upper and the main json data use to retrieve stuff
  const data = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid
    case_int_id: paramValue,
    jaw_type: 2,
    caseIntID: paramValue,
  };
  // this for the undercut lower
  const data2 = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid
    case_int_id: paramValue,
    jaw_type: 1,
    caseIntID: paramValue,
  };
  let positionDatas = [];
  let positionData;

  //This section is for the processing of creation date, case id and last updated
  const urldatas = ["/case/get/" + paramValue];
  try {
    // Call the post method and wait for the response
    for (const urldata of urldatas) {
      positionData = await apiClient.post(urldata, [data], false, "Case Info");
      //console.log('Success:', positionData)
      positionDatas = positionDatas.concat(positionData);
      window.caseID = positionData.case_id;
      window.lastEdited = unixToHumanReadable(positionData.last_updated);
      window.username = positionData.username;
    }
  } catch (error) {
    console.error("Error:", error);
  }
  //for all the text info
  const time = unixToHumanReadable(positionData.creation_date);
  const update_time = unixToHumanReadable(positionData.last_updated);
  createTextbox("Creation Date: " + time, "bottom-left");
  //createTextbox("Case Name: " + positionData.case_id, 'bottom-right');
  createTextbox(
    "Last Updated: " +
      update_time +
      " Last Edited by: " +
      positionData.username,
    "bottom-left2"
  );

  const thumbnail_url = ["/thumbnails/get"];
  try {
    // Call the post method and wait for the response
    for (const urldata of thumbnail_url) {
      const thumbnailData = await apiClient.post(
        urldata,
        [data],
        false,
        "2D image"
      );
      //console.log('Success thumb:', thumbnailData)
      for (const thumb in thumbnailData) {
        if (thumbnailData[thumb].slot == 0) {
          const test = thumbnailData[thumb].data;
          window.thumbnailBase64 = test;
          // Container for thumbnail + 2D buttons
          const thumbWrapper = document.createElement("div");
          thumbWrapper.style.position = "absolute"; // allows layout inside container3D
          thumbWrapper.style.left = "20px"; // left side of screen
          thumbWrapper.style.top = "20px"; // top offset
          thumbWrapper.style.zIndex = "1000";
          thumbWrapper.style.display = "flex";
          thumbWrapper.style.flexDirection = "column";
          thumbWrapper.style.alignItems = "flex-start";
          thumbWrapper.style.gap = "6px"; // spacing between image and buttons

          // Create thumbnail button
          const button = document.createElement("button");
          button.style.padding = "0";
          button.style.border = "none";
          button.style.background = "none";
          button.style.cursor = "pointer";
          button.style.width = "30px";
          button.style.height = "30px";

          // Create thumbnail image
          const img = new Image();
          img.src = "data:image/png;base64," + test;
          img.style.transform = `scale(0.3)`;
          button.appendChild(img);

          // Create "Click me" watermark overlay
          const watermark = document.createElement("div");
          watermark.textContent = "Click me";
          watermark.style.position = "absolute";
          watermark.style.top = "50%";
          watermark.style.left = "50%";
          watermark.style.transform = "translate(-50%, -50%)";
          watermark.style.color = "white";
          watermark.style.fontWeight = "bold";
          const isMobile =
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
              navigator.userAgent
            );
          watermark.style.fontSize = isMobile ? "34px" : "16px";
          watermark.style.textShadow = "1px 1px 4px rgba(0, 0, 0, 1.0)";
          watermark.style.pointerEvents = "none"; // so clicks go through to the button
          button.style.position = "relative"; // Make sure parent is positioned
          button.appendChild(watermark);

          // Append to wrapper
          thumbWrapper.appendChild(button);

          // Static 2D buttons below the image
          const btnContainer = document.createElement("div");
          btnContainer.style.display = "flex";
          btnContainer.style.flexDirection = "column"; // <- make them vertical
          btnContainer.style.gap = "6px";
          btnContainer.style.position = "absolute"; // ensure absolute for precise positioning

          img.onload = () => {
            const isMobile =
              /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
              );
            const imgRect = img.getBoundingClientRect();
            const offset = isMobile ? -350 : 25; // Slightly more offset on mobile
            // btnContainer.style.top = `380px`;
            // btnContainer.style.left = `0px`;
            btnContainer.style.top = isMobile ? "820px" : "380px";
            btnContainer.style.left = isMobile ? "10px" : "0px";
          };

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

          // Finally, append everything to container3D so it's layout-aware
          const container3D = document.getElementById("container3D");
          container3D.appendChild(thumbWrapper);

          button.addEventListener("click", function () {
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
            approve2D.textContent = "Approve 2D";
            approve2D.onclick = () =>
              sendEmail("Your 2D Design has been APPROVED.");
            btnContainer2D.appendChild(approve2D);

            const edit2D = document.createElement("button");
            edit2D.className = "smart-btn edit";
            edit2D.textContent = "Edit 2D";
            edit2D.onclick = () =>
              sendEmail(
                "Please do some modifications on 2D Design. See Notebox."
              );
            btnContainer2D.appendChild(edit2D);

            // 🟣 创建 Annotate 按钮（跳转到 2DAnnotate.html）
            const annotateBtn = document.createElement("button");
            annotateBtn.className = "smart-btn annotate";
            annotateBtn.textContent = "Annotate";

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

                const composedDataURL = canvas.toDataURL();
                localStorage.setItem(
                  `annotateBackground_${encryptedID}`,
                  composedDataURL
                );
                console.log(`✅ 已保存 annotateBackground_${encryptedID}`);

                // 🟢 跳转
                // 🟢 跳转（确保使用 URL 中的加密 ID）
                const encryptedId = new URLSearchParams(
                  window.location.search
                ).get("id"); // ✅ 确保使用真实的加密 ID

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
            historyBtn.textContent = "History";

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
          });

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
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // to get the undercut and occulsion values
  let undercut_values = [];

  const heatmap_urldatas = ["/undercutheatmap/get"];
  try {
    // Call the post method and wait for the response

    const undercut_value = await apiClient.post(
      heatmap_urldatas,
      data,
      false,
      "Heatmap upper"
    );
    undercut_values = undercut_values.concat(undercut_value);
    //console.log('Success:', undercut_value)

    undercut_type[undercut_value.jaw_type] = [
      Boolean(undercut_value.surveying_values),
      Boolean(undercut_value.occlusion_values),
    ];

    const undercut_value1 = await apiClient.post(
      heatmap_urldatas,
      data2,
      false,
      "Heatmap lower"
    );
    undercut_values = undercut_values.concat(undercut_value1);

    undercut_type[undercut_value1.jaw_type] = [
      Boolean(undercut_value1.surveying_values),
      Boolean(undercut_value1.occlusion_values),
    ];
  } catch (error) {
    console.error("Error:", error);
  }

  //Processing mesh

  // stl will be true is fail to process parameterisation
  let stl = false;
  const urls = ["/parameterisation/mesh/getall", "/surface/getall"];
  let responseDatas = [];
  let responseData;
  let loop = 0;
  try {
    // Call the post method and wait for the response
    for (const url of urls) {
      loop += 1;
      //console.log('raw: ' + close);

      // this is for the generation of button to change to closed mesh if it exist
      let name_of_mesh;
      if (!close) {
        if (url == "/parameterisation/mesh/getall") {
          name_of_mesh = "Jaw mesh";
        } else if (url == "/surface/getall") {
          name_of_mesh = "Denture mesh";
        }
        responseData = await apiClient.post(url, [data], false, name_of_mesh);
        //console.log(responseData);
        if (isObject(responseData)) {
          responseDatas = responseDatas.concat(responseData);
        }
        //loop to prevent repeated check
        if (loop == 1) {
          //check for closed.off
          const test = await apiClient.post(
            "/stl/get",
            [data],
            "test",
            "Jaw mesh"
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
          approveButton3D.textContent = "Approve 3D";
          approveButton3D.className = "smart-btn approve";
          approveButton3D.addEventListener("click", function () {
            sendEmail("Your 3D Design has been APPROVED.");
          });
          btnContainer3D.appendChild(approveButton3D);

          // Create "Edit 3D" button
          const editButton3D = document.createElement("button");
          editButton3D.textContent = "Edit 3D";
          editButton3D.className = "smart-btn edit";
          editButton3D.addEventListener("click", function () {
            sendEmail(
              "Please do some modifications on 3D Design. See Notebox."
            );
          });
          btnContainer3D.appendChild(editButton3D);

          // Create a new wrapper ONLY for the email input and button
          const emailWrapperContainer = document.createElement("div");
          emailWrapperContainer.style.marginTop = "12px"; // spacing from other buttons
          emailWrapperContainer.style.display = "block"; // block-level to avoid affecting other buttons
          emailWrapperContainer.style.position = "fixed";
          emailWrapperContainer.style.bottom = "40px"; // adjust as needed
          emailWrapperContainer.style.right = "20px";
          emailWrapperContainer.style.zIndex = "1000";

          // Create inner wrapper to align input + button side by side
          const emailInputWrapper = document.createElement("div");
          emailInputWrapper.style.display = "flex";
          emailInputWrapper.style.gap = "8px";

          // Create the Email Input Field
          const emailInput = document.createElement("input");
          emailInput.type = "email";
          emailInput.placeholder = "Enter email address";
          emailInput.style.padding = "8px";
          emailInput.style.border = "1px solid #ccc";
          emailInput.style.borderRadius = "4px";
          emailInput.style.width = "200px";

          // Create the Submit Button
          const addEmailBtn = document.createElement("button");
          addEmailBtn.textContent = "Add to Mail";
          addEmailBtn.className = "smart-btn";
          addEmailBtn.style.backgroundColor = "#6c757d"; // grey
          addEmailBtn.addEventListener("click", async () => {
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

          // Append input + button to inner wrapper
          emailInputWrapper.appendChild(emailInput);
          emailInputWrapper.appendChild(addEmailBtn);

          // Add inner wrapper into outer container
          emailWrapperContainer.appendChild(emailInputWrapper);

          // Finally, append the email wrapper
          document.body.appendChild(emailWrapperContainer);

          // Create "Load Other STLs" button
          const loadOtherStlButton = document.createElement("button");
          loadOtherStlButton.id = "center-load-button";
          loadOtherStlButton.textContent = "Show me 3D RPD design";
          loadOtherStlButton.className = "smart-btn other-stl";
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
          btnContainer.appendChild(loadOtherStlButton);

          // Append the container to the body
          document.body.appendChild(btnContainer);
          //document.body.appendChild(btnContainer2D);
          document.body.appendChild(btnContainer3D);
        }
      }

      if (
        responseData == "stl" &&
        url == "/parameterisation/mesh/getall" &&
        !close
      ) {
        responseData = "stl";
        responseData = await apiClient.post(
          "/stl/raw/get",
          [data],
          false,
          "Jaw mesh"
        );
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

  // Function to style buttons
  function styleButton(button, color) {
    button.style.position = "fixed";
    button.style.bottom = "80px"; // Adjust based on order
    button.style.right = "20px";
    button.style.padding = "10px";
    button.style.backgroundColor = color;
    button.style.color = "white";
    button.style.border = "none";
    button.style.cursor = "pointer";
    button.style.borderRadius = "5px";
    button.style.zIndex = "1000";
  }

  const style = document.createElement("style");
  style.textContent = `
  .smart-btn-container {
      position: fixed;
      bottom: 100px;
      right: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      z-index: 1000;
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
  }

  .smart-btn:hover {
      transform: scale(1.05);
      filter: brightness(1.1);
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
		position: fixed;
		right: 20px;
		bottom: 120px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 1000;
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

.smart-btn-container-2d {
  display: flex;
  gap: 10px;
  justify-content: center;
}


  
  #center-load-button {
    position: fixed;
    top: 70%;
    left: 50%;
    transform: translate(-50%, -70%);
    z-index: 1000;
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
		top: 80%; /* shift lower on short screens */
		transform: translate(-50%, -80%);
	  }
	}

	@media (max-height: 700px) {
	  #center-load-button {
		top: 80%; /* even lower for very short screens */
		transform: translate(-50%, -80%);
	  }
	}

  
  @media (max-width: 1024px) {
    #center-load-button {
        top: 80%; /* more spacing on smaller screens */
		transform: translate(-50%, -80%);
		}
	}

  @media (max-width: 768px) {
      .smart-btn-container {
          grid-template-columns: 1fr !important;
      }
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
        syncPolylineFocusMode();

        controls.update();
        //render();

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
      await fetchAndRenderPolylines(paramValue);
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
  for (const offFile of responseDatas) {
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
    const offdata = atob(offFile.data);
    let x;
    if (
      offFile.filename.includes("ParameterisationMesh") ||
      offFile.filename.includes("closed")
    ) {
      x = true;
    }
    // Load the OFF file
    //console.log('check stl:' + stl)
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
  }
  await fetchAndRenderPolylines(paramValue);
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
    textbox.style.position = "fixed";
    textbox.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    textbox.style.padding = "5px";
    textbox.style.border = "1px solid #ccc";
    textbox.style.borderRadius = "5px";
    textbox.style.fontFamily = "Arial, sans-serif";
    textbox.style.fontSize = "15px";
    textbox.style.color = "#333";
    textbox.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";

    textbox.style.height = "15px";

    // Optionally, add a media query to adjust size for very small screens

    if (position === "bottom-left") {
      textbox.style.bottom = "55px";
      textbox.style.left = "10px";
      textbox.style.height = "30px";
      textbox.style.minWidth = "220px";
      textbox.style.width = "20%";
      textbox.style.maxWidth = "250px";
    } else if (position === "bottom-right") {
      textbox.width = "150px";
      textbox.style.bottom = "10px";
      textbox.style.right = "10px";
    } else if (position === "bottom-left2") {
      textbox.style.bottom = "10px";
      textbox.style.padding = "5px";
      textbox.style.left = "10px";
      textbox.style.height = "30px";
      textbox.style.minWidth = "220px";
      textbox.style.width = "20%";
      textbox.style.maxWidth = "250px";
    } else if (position === "name") {
      textbox.style.bottom = "10px";
      textbox.style.right = "10px";
      textbox.style.height = "30px";
      textbox.style.padding = "5px";
    }

    document.body.appendChild(textbox);
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
  renderer.setSize(window.innerWidth, window.innerHeight);

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
    orb_controls.zoomSpeed = 2;
    orb_controls.enableRotate = false;
    orb_controls.enabelePan = true;

    controls.panSpeed = 30;
    controls.noZoom = true;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    //console.log('changed2');
  }

  // Render the scene
  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    renderer.render(scene, camera);
  }

  // Add a listener to the window, so we can resize the window and the camera
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Add mouse position listener, so we can make the eye move
  document.onmousemove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };

  camera.zoom = 7;
  camera.updateProjectionMatrix();
  const clonedCamera = camera.clone();
  addResetButton(camera, clonedCamera, controls);
  setupChatToggle();
  //console.log(camera)

  // Start the 3D rendering
  animate();
  //console.log(parentObject);
  //console.log(undercut_type);
  removeVisibilityAndTransparencyControls();
  addVisibilityAndTransparencyControls(
    parentObject,
    name,
    all_mesh_mat,
    undercut_type
  );

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
      const img = btn.querySelector("img");

      if (img && img.src.startsWith("data:image/png")) {
        if (!btn.hasAttribute("data-zoom-bound")) {
          btn.setAttribute("data-zoom-bound", "true");

          btn.addEventListener("click", () => {
            const overlayDivs = document.querySelectorAll(
              "div[style*='position: fixed']"
            );
            for (let div of overlayDivs) {
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

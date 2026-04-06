import { lol } from "../crypt.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// FDI tooth order for each arch.
const TOOTH_ORDER = {
  upper: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  lower: ["38", "37", "36", "35", "34", "33", "32", "31", "41", "42", "43", "44", "45", "46", "47", "48"]
};

const STATUS_VALUES = ["presence", "abutment", "compromised"];

// Arch placement geometry (ellipse + angle sweep).
const ARCH_CONFIG = {
  upper: {
    svgId: "upperArchSvg",
    cx: 310,
    cy: 230,
    rx: 130,
    ry: 180,
    startDeg: 154,
    endDeg: 386,
    guideStartDeg: 150,
    guideEndDeg: 390,
  },
  lower: {
    svgId: "lowerArchSvg",
    cx: 310,
    cy: 150,
    rx: 130,
    ry: 180,
    startDeg: 206,
    endDeg: -26,
    guideStartDeg: 210,
    guideEndDeg: -30,
  }
};

const TOOTH_TEMPLATES = {
  incisor: {
    outline:
      "M 0 -19 C -9 -18 -14 -11 -14 -2 C -14 9 -9 17 0 19 C 9 17 14 9 14 -2 C 14 -11 9 -18 0 -19 Z",
    highlights: [
      "M -8 -8 C -5 -12 0 -12 4 -10 C 1 -8 -3 -7 -8 -8 Z",
      "M -5 5 C -2 8 2 8 5 5 C 2 4 -2 4 -5 5 Z"
    ],
    shadows: [
      "M 6 -5 C 9 -2 10 3 9 8 C 6 11 3 10 1 7 C 3 3 4 -1 6 -5 Z"
    ],
    fissures: [
      "M 0 -9 C -1 -3 -1 3 0 10",
      "M -4 -1 C -2 2 2 2 4 -1"
    ]
  },
  canine: {
    outline:
      "M 0 -21 C -8 -20 -12 -12 -12 -3 C -12 7 -8 15 -2 18 C -1 19 1 19 2 18 C 8 15 12 7 12 -3 C 12 -12 8 -20 0 -21 Z",
    highlights: ["M -7 -10 C -4 -13 0 -12 3 -10 C 0 -8 -3 -8 -7 -10 Z"],
    shadows: [
      "M 4 -2 C 7 1 8 6 6 11 C 3 13 1 12 -1 9 C 1 5 2 1 4 -2 Z",
      "M -8 4 C -10 8 -10 12 -8 15 C -5 15 -3 13 -3 10 C -5 8 -6 6 -8 4 Z"
    ],
    fissures: [
      "M 0 -12 C -1 -4 -1 5 0 12",
      "M -4 2 C -2 5 2 5 4 2"
    ]
  },
  premolar: {
    outline:
      "M -14 -15 C -18 -9 -18 9 -12 15 C -6 20 6 20 12 15 C 18 9 18 -9 14 -15 C 8 -20 -8 -20 -14 -15 Z",
    highlights: [
      "M -10 -8 C -6 -12 0 -12 5 -9 C 2 -6 -4 -5 -10 -8 Z",
      "M -9 1 C -5 3 -2 3 1 2 C -2 6 -6 6 -9 1 Z"
    ],
    shadows: [
      "M 8 2 C 12 1 14 4 14 9 C 11 13 8 13 5 10 C 6 7 6 4 8 2 Z",
      "M -13 4 C -15 0 -14 -5 -10 -8 C -9 -3 -9 2 -13 4 Z"
    ],
    fissures: [
      "M -7 -2 C -3 1 3 1 7 -2",
      "M -8 5 C -3 8 3 8 8 5",
      "M -2 -8 L -1 10",
      "M 3 -7 L 1 10"
    ]
  },
  molar: {
    outline:
      "M -18 -17 C -22 -9 -22 9 -15 17 C -9 23 9 23 15 17 C 22 9 22 -9 18 -17 C 11 -23 -11 -23 -18 -17 Z",
    highlights: [
      "M -12 -9 C -8 -14 -1 -14 6 -10 C 1 -7 -6 -6 -12 -9 Z",
      "M -13 1 C -8 4 -2 4 2 2 C -1 8 -8 8 -13 1 Z"
    ],
    shadows: [
      "M 10 4 C 14 2 17 5 18 10 C 14 15 9 15 6 11 C 8 8 8 6 10 4 Z",
      "M -17 7 C -19 1 -17 -7 -12 -11 C -10 -4 -10 3 -17 7 Z",
      "M -1 11 C 4 9 8 10 11 13 C 8 16 3 17 -1 15 C -2 13 -2 12 -1 11 Z"
    ],
    fissures: [
      "M -10 -2 C -4 2 4 2 10 -2",
      "M -11 6 C -4 10 4 10 11 6",
      "M -4 -11 L -2 12",
      "M 6 -10 L 3 12",
      "M -12 1 C -8 -1 -3 -1 1 1",
      "M 1 1 C 4 -1 8 -1 12 1"
    ]
  },
  // molarSmall: {
  //   outline:
  //     "M -15 -14 C -18 -8 -18 8 -13 14 C -7 19 7 19 13 14 C 18 8 18 -8 15 -14 C 9 -19 -9 -19 -15 -14 Z",
  //   highlights: ["M -10 -7 C -6 -11 0 -11 5 -8 C 1 -6 -4 -5 -10 -7 Z"],
  //   shadows: [
  //     "M 8 3 C 11 2 13 4 14 8 C 11 12 8 12 5 9 C 6 6 7 4 8 3 Z",
  //     "M -13 6 C -15 2 -14 -4 -10 -7 C -8 -2 -8 3 -13 6 Z"
  //   ],
  //   fissures: [
  //     "M -8 -2 C -3 1 3 1 8 -2",
  //     "M -8 5 C -3 8 3 8 8 5",
  //     "M -3 -8 L -1 10",
  //     "M 4 -8 L 2 10"
  //   ]
  // }
};

// Runtime annotation state.
const state = {
  encryptedCaseId: "",
  caseIntID: null,
  activeStatus: "presence",
  locks: { upper: false, lower: false },
  teeth: {}
};

document.addEventListener("DOMContentLoaded", init);

// Entry point: wire events, restore state, and render.
function init() {
  initializeCaseIds();
  initializeTeethState();
  bindStatusPicker();
  bindJawControls();
  bindActionButtons();
  loadPreviewImage();
  hydrateFromLocalStorage();
  renderJaws();
}

// Read encrypted case id from URL and display a human-readable label.
function initializeCaseIds() {
  const params = new URLSearchParams(window.location.search);
  state.encryptedCaseId = params.get("id") || "";
  let parsedCaseId = null;

  if (state.encryptedCaseId) {
    try {
      const decrypted = Number(lol(state.encryptedCaseId));
      if (Number.isFinite(decrypted)) {
        parsedCaseId = decrypted;
      }
    } catch {
      parsedCaseId = null;
    }
  }

  state.caseIntID = parsedCaseId;
  const label = document.getElementById("caseLabel");
  if (label) {
    label.textContent = `Case: ${state.caseIntID ?? "Unknown"}`;
  }
}

// Initialize all tooth records before any rendering.
function initializeTeethState() {
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    for (const toothId of TOOTH_ORDER[jaw]) {
      state.teeth[toothId] = { tooth_id: toothId, jaw, status: null, center: [0, 0] };
    }
  }
}

// Choose active labeling mode: presence / abutment / compromised.
function bindStatusPicker() {
  const buttons = document.querySelectorAll(".status-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeStatus = button.dataset.status;
      buttons.forEach((btn) => btn.classList.toggle("is-active", btn === button));
      setMessage(`Active status: ${titleCase(state.activeStatus)}.`, false);
    });
  });
}

// Bind jaw lock toggles.
function bindJawControls() {
  const upper = document.getElementById("upperLockBtn");
  const lower = document.getElementById("lowerLockBtn");
  if (upper) upper.addEventListener("click", () => toggleJawLock("upper"));
  if (lower) lower.addEventListener("click", () => toggleJawLock("lower"));
  refreshLockButtons();
}

// Bind global actions (clear, reset, save).
function bindActionButtons() {
  const clearTop = document.getElementById("clearTopBtn");
  const clearBottom = document.getElementById("clearBottomBtn");
  const reset = document.getElementById("drawFromScratchBtn");
  const save = document.getElementById("saveAnnotationBtn");
  if (clearTop) clearTop.addEventListener("click", () => clearJaw("upper"));
  if (clearBottom) clearBottom.addEventListener("click", () => clearJaw("lower"));
  if (reset) reset.addEventListener("click", drawFromScratch);
  if (save) save.addEventListener("click", saveAnnotation);
}

// Toggle lock state for a specific arch.
function toggleJawLock(jaw) {
  state.locks[jaw] = !state.locks[jaw];
  refreshLockButtons();
  renderJaw(jaw);
  setMessage(`${titleCase(jaw)} arch is now ${state.locks[jaw] ? "locked" : "unlocked"}.`, false);
}

// Keep lock button labels in sync with state.
function refreshLockButtons() {
  const upperBtn = document.getElementById("upperLockBtn");
  const lowerBtn = document.getElementById("lowerLockBtn");
  const updateLockButton = (button,isLocked)=>{
    if(!button) return;

    const icon = button.querySelector(".lock-icon");

    if(icon){
      icon.src = isLocked? "../../assets/lock.png" : "../../assets/unlock.png";
    }
  button.classList.toggle("is-locked",isLocked);
  }
  updateLockButton(upperBtn,state.locks.upper);
  updateLockButton(lowerBtn,state.locks.lower);
}

// Clear one arch only when that arch is unlocked.
function clearJaw(jaw) {
  if (state.locks[jaw]) {
    setMessage(`Cannot clear ${jaw}. The arch is locked.`, true);
    return;
  }
  for (const toothId of TOOTH_ORDER[jaw]) {
    state.teeth[toothId].status = null;
  }
  renderJaw(jaw);
}

// Reset whole annotation state back to empty.
function drawFromScratch() {
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    state.locks[jaw] = false;
    for (const toothId of TOOTH_ORDER[jaw]) {
      state.teeth[toothId].status = null;
    }
  }
  refreshLockButtons();
  renderJaws();
  setMessage("All teeth reset. Both arches unlocked.", false);
}

// Render both arches.
function renderJaws() {
  renderJaw("upper");
  renderJaw("lower");
}

// Render one arch (jaw guides + all teeth).
function renderJaw(jaw) {
  const config = ARCH_CONFIG[jaw];
  const svg = document.getElementById(config.svgId);
  if (!svg) return;
  svg.innerHTML = "";

  renderArchBackground(svg, jaw, config);

  const ids = TOOTH_ORDER[jaw];
  const total = ids.length;
  ids.forEach((toothId, index) => {
    const t = total === 1 ? 0 : index / (total - 1);
    const angle = interpolate(config.startDeg, config.endDeg, t);
    const unit = Number(toothId.slice(1));
    const radialOffset = getToothRadialOffset(unit, jaw);
    const point = polarToEllipse(
      config.cx,
      config.cy,
      config.rx + radialOffset,
      config.ry + radialOffset * 0.55,
      angle
    );
    const rotation = jaw === "upper" ? angle + 90 : angle - 90;
    state.teeth[toothId].center = [Math.round(point.x), Math.round(point.y)];

    const group = svgEl("g", { class: "tooth", "data-tooth-id": toothId, "data-jaw": jaw });
    if (state.locks[jaw]) group.classList.add("is-locked");
    const status = normalizeStatus(state.teeth[toothId].status);
    if (status) group.classList.add(`status-${status}`);

    group.setAttribute(
      "transform",
      `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})`
    );

    group.appendChild(createToothVisual(toothId, jaw));
    group.addEventListener("click", () => onToothClick(jaw, toothId));
    svg.appendChild(group);
  });
}

// Click behavior: apply/toggle selected status on a tooth.
function onToothClick(jaw, toothId) {
  if (state.locks[jaw]) {
    setMessage(`Cannot edit ${jaw}. Unlock it first.`, true);
    return;
  }
  const current = normalizeStatus(state.teeth[toothId].status);
  state.teeth[toothId].status = current === state.activeStatus ? null : state.activeStatus;
  renderJaw(jaw);
}

// Save annotation in localStorage and export JSON file.
function saveAnnotation() {
  const payload = buildPayload();
  const storageKey = getStorageKey();
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
    downloadJson(`case_${state.caseIntID ?? "unknown"}_2d_annotation.json`, payload);
    setMessage(`Saved to localStorage key "${storageKey}" and downloaded JSON file.`, false);
  } catch {
    setMessage("Failed to save annotation JSON.", true);
  }
}

// Build JSON payload consumed by downstream workflows.
function buildPayload() {
  const teeth = [...TOOTH_ORDER.upper, ...TOOTH_ORDER.lower].map((toothId) => {
    const record = state.teeth[toothId];
    return {
      tooth_id: record.tooth_id,
      jaw: record.jaw,
      status: normalizeStatus(record.status) || "missing",
      center: record.center
    };
  });

  return {
    schema: "smartrpd.2d-arch.v1",
    caseIntID: state.caseIntID,
    encryptedCaseId: state.encryptedCaseId || null,
    updatedAt: new Date().toISOString(),
    locks: { upper: state.locks.upper, lower: state.locks.lower },
    activeStatus: state.activeStatus,
    teeth,
    arches: {
      upper: TOOTH_ORDER.upper.map((id) => state.teeth[id].center),
      lower: TOOTH_ORDER.lower.map((id) => state.teeth[id].center)
    }
  };
}

// Restore saved annotation for this case id.
function hydrateFromLocalStorage() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (data.locks) {
      state.locks.upper = Boolean(data.locks.upper);
      state.locks.lower = Boolean(data.locks.lower);
      refreshLockButtons();
    }
    if (Array.isArray(data.teeth)) {
      for (const item of data.teeth) {
        if (item && state.teeth[item.tooth_id]) {
          state.teeth[item.tooth_id].status = normalizeStatus(item.status);
        }
      }
    }
    setMessage("Loaded existing annotation from localStorage.", false);
  } catch {
    setMessage("Found saved data, but it is invalid JSON.", true);
  }
}

// Show preview image produced from the 3D viewer (if available).
function loadPreviewImage() {
  const img = document.getElementById("previewImage");
  const fallback = document.getElementById("previewFallback");
  if (!img || !fallback) return;

  if (!state.encryptedCaseId) {
    fallback.style.display = "block";
    img.style.display = "none";
    return;
  }

  const localImage = localStorage.getItem(`annotateBackground_${state.encryptedCaseId}`);
  if (localImage) {
    img.src = localImage;
    img.style.display = "block";
    fallback.style.display = "none";
    return;
  }

  fallback.style.display = "block";
  img.style.display = "none";
}

function getStorageKey() {
  return `dentalAnnotation_${state.encryptedCaseId || "draft"}`;
}

// Draw jaw anatomical guide lines behind teeth.
function renderArchBackground(svg, jaw, config) {
  const outer = buildArcPath(config.cx, config.cy, config.rx + 18, config.ry + 16, config.guideStartDeg, config.guideEndDeg, "jaw-outline");
  const ridge = buildArcPath(config.cx, config.cy, config.rx - 18, config.ry - 22, config.guideStartDeg, config.guideEndDeg, "jaw-ridge");
  svg.appendChild(outer);
  svg.appendChild(ridge);

  if (jaw === "upper") {
    svg.appendChild(svgEl("path", { d: "M 310 106 C 310 126 310 148 310 172", class: "jaw-midline" }));
    svg.appendChild(svgEl("path", { d: "M 301 124 C 292 129 288 137 286 146", class: "jaw-rugae" }));
    svg.appendChild(svgEl("path", { d: "M 319 124 C 328 129 332 137 334 146", class: "jaw-rugae" }));
  } else {
    svg.appendChild(svgEl("path", { d: "M 310 86 C 310 108 310 131 310 154", class: "jaw-midline" }));
    svg.appendChild(svgEl("path", { d: "M 284 135 C 298 146 322 146 336 135", class: "jaw-rugae" }));
  }
}

// Build a polyline-like SVG arc path from sampled ellipse points.
function buildArcPath(cx, cy, rx, ry, startDeg, endDeg, className) {
  const points = sampleArcPoints(cx, cy, rx, ry, startDeg, endDeg, 70);
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  return svgEl("path", { d, class: className });
}

// Sample points along an ellipse segment.
function sampleArcPoints(cx, cy, rx, ry, startDeg, endDeg, count) {
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push(polarToEllipse(cx, cy, rx, ry, interpolate(startDeg, endDeg, t)));
  }
  return points;
}

// Convert angle on ellipse to cartesian point.
function polarToEllipse(cx, cy, rx, ry, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + rx * Math.cos(radians), y: cy + ry * Math.sin(radians) };
}

function interpolate(a, b, t) {
  return a + (b - a) * t;
}

function normalizeStatus(value) {
  return STATUS_VALUES.includes(value) ? value : null;
}

// Classify tooth id to choose matching anatomical template.
function getToothCategory(toothId) {
  const unit = Number(toothId.slice(1));
  if (unit === 1 || unit === 2) return "incisor";
  if (unit === 3) return "canine";
  if (unit === 4 || unit === 5) return "premolar";
  return "molar";
}

// Radial offsets make the arch look less uniform and more natural.
function getToothRadialOffset(unit, jaw) {
  if (unit <= 2) return jaw === "upper" ? -5 : -5;
  if (unit === 3) return -9;
  if (unit === 4) return -4;
  if (unit === 5) return -1;
  if (unit === 6) return 3;
  if (unit === 7) return 7;
  return 5;
}

// Per-tooth scaling for realistic size progression.
function getToothScale(toothId, jaw) {
  const unit = Number(toothId.slice(1));
  const scaleByUnit = { 1: 0.84, 2: 0.88, 3: 0.9, 4: 0.96, 5: 1.01, 6: 1.07, 7: 1.1, 8: 0.92 };
  let scale = scaleByUnit[unit] || 1;
  if (jaw === "lower" && unit <= 2) scale *= 0.92;
  if (jaw === "lower" && unit >= 6) scale *= 0.96;
  return scale;
}

// Compose one tooth from outline + highlight + shadow + fissures.
function createToothVisual(toothId, jaw) {
  const template = TOOTH_TEMPLATES[getToothCategory(toothId)];
  const visual = svgEl("g", { class: "tooth-visual", transform: `scale(${getToothScale(toothId, jaw).toFixed(3)})` });
  visual.appendChild(svgEl("path", { d: template.outline, class: "tooth-shape" }));
  template.highlights.forEach((path) => visual.appendChild(svgEl("path", { d: path, class: "tooth-highlight" })));
  template.shadows.forEach((path) => visual.appendChild(svgEl("path", { d: path, class: "tooth-shadow" })));
  template.fissures.forEach((path) => visual.appendChild(svgEl("path", { d: path, class: "tooth-fissure" })));
  return visual;
}

function titleCase(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function setMessage(message, isError) {
  const el = document.getElementById("saveMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
}

// Trigger local JSON file download.
function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Helper to create SVG elements with attributes.
function svgEl(tagName, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

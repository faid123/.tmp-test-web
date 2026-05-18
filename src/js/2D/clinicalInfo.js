import { state, setMessage } from "./2DAnnotation.js";
import { loadCaseNote, WORK_CATEGORY_LABELS } from "./caseNote.js";

const ASSET_BASE = "../../assets/clinicalInfo";

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const ALL_TEETH = [...UPPER_TEETH, ...LOWER_TEETH];

const SINGLE_TOGGLES = ["rct", "crown", "implant", "rootStump", "cracked", "extraction", "abutment"];
const MULTI_GROUPS = ["mobility", "restoration", "tilted"];

export function sourceToothFor(toothId) {
  if (toothId >= 21 && toothId <= 28) return { id: toothId - 10, mirrored: true };
  if (toothId >= 31 && toothId <= 38) return { id: toothId + 10, mirrored: true };
  return { id: toothId, mirrored: false };
}

export function statusFor(toothId) {
  const tooth = state.teeth?.[toothId];
  if (!tooth) return "presence";
  if (tooth.status === "missing" || tooth.isPresent === false) return "missing";
  if (tooth.status === "abutment") return "abutment";
  return "presence";
}

/** In-memory store: { [toothId]: { mobility, rct, restoration, crown, implant, rootStump, cracked, tilted, extraction, abutment } } */
let clinicalNotes = {};
/** Currently selected tooth id in the chart, or null. */
let selectedToothId = null;
/** Snapshot of clinicalNotes at modal-open, used to revert when CLOSE is pressed without SAVE. */
let savedSnapshot = "{}";

function storageKey() {
  return `clinicalNotes_${state.caseIntID ?? "draft"}`;
}

function emptyToothNote() {
  return {
    mobility: null,
    rct: false,
    restoration: null,
    crown: false,
    implant: false,
    rootStump: false,
    cracked: false,
    tilted: null,
    extraction: false,
    abutment: false,
  };
}

function noteFor(toothId) {
  if (!clinicalNotes[toothId]) clinicalNotes[toothId] = emptyToothNote();
  return clinicalNotes[toothId];
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(storageKey());
    clinicalNotes = raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Failed to load clinical notes:", err);
    clinicalNotes = {};
  }
  savedSnapshot = JSON.stringify(clinicalNotes);
}

function writeToStorage() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(clinicalNotes));
    savedSnapshot = JSON.stringify(clinicalNotes);
  } catch (err) {
    console.warn("Failed to save clinical notes:", err);
  }
}

function buildToothImg(srcFile, extraClass = "") {
  const img = document.createElement("img");
  img.className = "clinical-info-tooth-img" + (extraClass ? ` ${extraClass}` : "");
  img.src = `${ASSET_BASE}/${srcFile}`;
  img.alt = "";
  return img;
}

function buildToothCell(toothId) {
  const { id, mirrored } = sourceToothFor(toothId);
  const baseStatus = statusFor(toothId);
  const note = clinicalNotes[toothId] || null;
  const isUpper = toothId >= 11 && toothId <= 28;

  // Note-derived status takes precedence over base status for visual rendering.
  // Extraction is no longer treated as "missing" — it has its own crown-arrow marker.
  let effectiveStatus = baseStatus;
  if (note?.abutment) effectiveStatus = "abutment";

  const cell = document.createElement("div");
  cell.className = `clinical-info-tooth is-${effectiveStatus} ${isUpper ? "is-upper" : "is-lower"}`;
  cell.dataset.toothId = String(toothId);
  cell.setAttribute("role", "button");
  cell.setAttribute("tabindex", "0");
  if (toothId === selectedToothId) cell.classList.add("is-selected");

  const number = document.createElement("div");
  number.className = "clinical-info-tooth-number";
  number.textContent = String(toothId);
  cell.appendChild(number);

  const imgWrap = document.createElement("div");
  imgWrap.className = "clinical-info-tooth-img-wrap";

  const mirrorClass = mirrored ? " is-mirrored" : "";
  const hideCrown = note?.rootStump;

  if (effectiveStatus === "abutment") {
    imgWrap.appendChild(
      buildToothImg(`${id}_Abutment.svg`, `clinical-info-tooth-full${mirrorClass}`)
    );
  } else {
    const stack = document.createElement("div");
    stack.className = "clinical-info-tooth-stack";

    // Pick the crown source: Cracked SVG replaces the crown when cracked is set.
    const crownSrc = note?.cracked ? `${id}_Cracked.svg` : `${id}_Crown.svg`;
    // Pick the root source: Implant > RCT > default.
    const rootSrc = note?.implant
      ? `implant.svg`
      : note?.rct
      ? `${id}_RCT.svg`
      : `${id}_Root.svg`;
    // Root tint only when the root image isn't already a replaced (implant/RCT) graphic.
    const rootReplaced = !!(note?.implant || note?.rct);
    const mobilityTint = rootReplaced
      ? ""
      : note?.mobility === "1"
      ? "is-tint-green"
      : note?.mobility === "2"
      ? "is-tint-yellow"
      : note?.mobility === "3"
      ? "is-tint-red"
      : "";

    const crownClasses = [
      "clinical-info-tooth-crown",
      mirrored ? "is-mirrored" : "",
      // Don't tint Cracked.svg yellow even if crown is toggled.
      !note?.cracked && note?.crown ? "is-tint-yellow" : "",
      hideCrown ? "is-hidden" : "",
    ].filter(Boolean).join(" ");
    const rootClasses = [
      "clinical-info-tooth-root",
      mirrored ? "is-mirrored" : "",
      mobilityTint,
      note?.implant ? "is-implant" : "",
    ].filter(Boolean).join(" ");

    const crownImg = buildToothImg(crownSrc, crownClasses);
    const rootImg = buildToothImg(rootSrc, rootClasses);
    if (isUpper) {
      stack.appendChild(rootImg);
      stack.appendChild(crownImg);
    } else {
      stack.appendChild(crownImg);
      stack.appendChild(rootImg);
    }
    imgWrap.appendChild(stack);

    if (effectiveStatus === "missing") {
      const cross = document.createElement("span");
      cross.className = "clinical-info-tooth-cross";
      cross.setAttribute("aria-hidden", "true");
      imgWrap.appendChild(cross);
    }
  }

  // Tilted arrow — mesial/distal direction depends on which side of the arch the tooth is on.
  if (note?.tilted) {
    const tilt = document.createElement("span");
    tilt.className = `clinical-info-tooth-tilt clinical-info-tooth-tilt--${note.tilted}`;
    tilt.textContent = tiltArrowFor(note.tilted, toothId);
    cell.appendChild(tilt);
  }

  // Restoration marker (small shape sitting on the crown portion).
  if (note?.restoration && !note.cracked && !hideCrown) {
    const rest = document.createElement("span");
    rest.className = `clinical-info-tooth-restoration is-${note.restoration.toLowerCase()}`;
    cell.appendChild(rest);
  }

  // Extraction marker: double arrow on the crown portion.
  // Upper teeth → arrows point down toward the crown; lower teeth → arrows point up.
  if (note?.extraction) {
    const ext = document.createElement("span");
    ext.className = "clinical-info-tooth-extraction-arrow";
    ext.textContent = isUpper ? "↓↓" : "↑↑";
    cell.appendChild(ext);
  }

  cell.appendChild(imgWrap);
  return cell;
}

export function getClinicalNotesFromStorage(caseIntID) {
  try {
    const raw = localStorage.getItem(`clinicalNotes_${caseIntID ?? "draft"}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Mesial = toward the midline (between 11/21 upper and 41/31 lower).
// Right-half teeth (11-18, 41-48) sit visually left of the midline, so mesial points →.
// Left-half teeth (21-28, 31-38) sit visually right of the midline, so mesial points ←.
export function tiltArrowFor(direction, toothId) {
  const isRightSide =
    (toothId >= 11 && toothId <= 18) || (toothId >= 41 && toothId <= 48);
  switch (direction) {
    case "M": return isRightSide ? "→" : "←";
    case "D": return isRightSide ? "←" : "→";
    case "B": return "↑";
    case "L": return "↓";
    case "A": return "A";
    case "SE": return "SE";
    default: return direction;
  }
}

function renderRow(containerId, teeth) {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.replaceChildren();
  const frag = document.createDocumentFragment();
  teeth.forEach((id) => frag.appendChild(buildToothCell(id)));
  row.appendChild(frag);
}

function getModal() {
  return document.getElementById("clinicalInfoModal");
}

function getLegendTitleEl() {
  return document.getElementById("clinicalInfoLegendTitle");
}

function syncTitle() {
  const titleEl = getLegendTitleEl();
  if (!titleEl) return;
  if (selectedToothId == null) {
    titleEl.textContent = "LEGEND";
  } else if (statusFor(selectedToothId) === "missing") {
    titleEl.textContent = `TOOTH ${selectedToothId} — MISSING (no markers)`;
  } else {
    titleEl.textContent = `TOOTH ${selectedToothId} INFORMATION`;
  }
}

function setSelected(toothId) {
  selectedToothId = toothId;
  document.querySelectorAll(".clinical-info-tooth.is-selected").forEach((el) => {
    el.classList.remove("is-selected");
  });
  if (toothId != null) {
    const el = document.querySelector(`.clinical-info-tooth[data-tooth-id="${toothId}"]`);
    el?.classList.add("is-selected");
  }
  syncTitle();
  syncLegendForSelection();
}

function syncLegendForSelection() {
  const modal = getModal();
  if (!modal) return;
  const note = selectedToothId == null ? null : noteFor(selectedToothId);
  const legend = modal.querySelector(".clinical-info-legend");
  if (!legend) return;
  const isMissing = selectedToothId != null && statusFor(selectedToothId) === "missing";
  legend.classList.toggle("has-selection", selectedToothId != null && !isMissing);
  legend.classList.toggle("is-locked-missing", isMissing);

  SINGLE_TOGGLES.forEach((key) => {
    const block = legend.querySelector(`[data-ci-toggle="${key}"]`);
    if (!block) return;
    block.classList.toggle("is-active", !!(note && note[key]));
  });

  MULTI_GROUPS.forEach((group) => {
    const block = legend.querySelector(`[data-ci-group="${group}"]`);
    if (!block) return;
    const value = note ? note[group] : null;
    block.querySelectorAll("[data-ci-option]").forEach((opt) => {
      const optValue = opt.dataset.ciOption;
      const isClearOption = group === "mobility" && optValue === "clear";
      const isSelected = isClearOption ? value == null : value === optValue;
      opt.classList.toggle("is-active", isSelected);
    });
  });
}

function bindLegendInteractions() {
  const legend = document.querySelector(".clinical-info-legend");
  if (!legend) return;

  legend.addEventListener("click", (e) => {
    if (selectedToothId == null) return;
    if (statusFor(selectedToothId) === "missing") return;
    const note = noteFor(selectedToothId);

    const optEl = e.target.closest("[data-ci-option]");
    if (optEl) {
      const group = optEl.closest("[data-ci-group]")?.dataset.ciGroup;
      if (!group) return;
      const value = optEl.dataset.ciOption;
      if (group === "mobility") {
        note.mobility = value === "clear" ? null : value;
      } else {
        note[group] = note[group] === value ? null : value;
      }
      syncLegendForSelection();
      rerenderTooth(selectedToothId);
      return;
    }

    const toggleEl = e.target.closest("[data-ci-toggle]");
    if (toggleEl && legend.contains(toggleEl)) {
      const key = toggleEl.dataset.ciToggle;
      note[key] = !note[key];
      syncLegendForSelection();
      rerenderTooth(selectedToothId);
    }
  });
}

function rerenderTooth(toothId) {
  const existing = document.querySelector(`.clinical-info-tooth[data-tooth-id="${toothId}"]`);
  if (!existing) return;
  const fresh = buildToothCell(toothId);
  existing.replaceWith(fresh);
}

function bindChartInteractions() {
  ["clinicalInfoUpperRow", "clinicalInfoLowerRow"].forEach((id) => {
    const row = document.getElementById(id);
    if (!row) return;
    row.addEventListener("click", (e) => {
      const cell = e.target.closest(".clinical-info-tooth");
      if (!cell || !row.contains(cell)) return;
      const toothId = Number(cell.dataset.toothId);
      if (!Number.isFinite(toothId)) return;
      setSelected(selectedToothId === toothId ? null : toothId);
    });
  });
}

function openClinicalInfo() {
  const modal = getModal();
  if (!modal) return;
  loadFromStorage();
  renderRow("clinicalInfoUpperRow", UPPER_TEETH);
  renderRow("clinicalInfoLowerRow", LOWER_TEETH);
  setSelected(null);
  populateNoteFields();
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
}

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

function setNoteField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = value && String(value).trim() ? String(value) : "";
  if (el.tagName === "INPUT") {
    el.value = text;
  } else {
    el.textContent = text || "—";
  }
}

function populateNoteFields() {
  const user = getLoggedInUser();
  const note = loadCaseNote(state.caseIntID);

  setNoteField("clinicalInfoNoteOwner", note.caseOwner || state.caseOwner || user?.username);
  setNoteField("clinicalInfoNoteNumber", state.caseIntID);
  setNoteField("clinicalInfoNoteDate", note.dateRequired);
  setNoteField("clinicalInfoNoteShade", note.toothShade);
  setNoteField(
    "clinicalInfoNoteCategory",
    WORK_CATEGORY_LABELS[note.workCategory] || note.workCategory
  );
}


function closeClinicalInfo() {
  const modal = getModal();
  if (!modal) return;
  // Revert unsaved edits.
  try {
    clinicalNotes = JSON.parse(savedSnapshot);
  } catch {
    clinicalNotes = {};
  }
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

function saveNotes() {
  writeToStorage();
  if (typeof setMessage === "function") {
    setMessage("Clinical info saved.", false);
  }
}

function clearNotes() {
  if (selectedToothId != null) {
    clinicalNotes[selectedToothId] = emptyToothNote();
    rerenderTooth(selectedToothId);
  } else {
    ALL_TEETH.forEach((id) => {
      clinicalNotes[id] = emptyToothNote();
      rerenderTooth(id);
    });
  }
  syncLegendForSelection();
}

export function initClinicalInfo() {
  document.getElementById("openClinicalInfoBtn")?.addEventListener("click", openClinicalInfo);
  document.getElementById("clinicalInfoCloseBtn")?.addEventListener("click", closeClinicalInfo);
  document.getElementById("clinicalInfoSaveBtn")?.addEventListener("click", saveNotes);
  document.getElementById("clinicalInfoClearBtn")?.addEventListener("click", clearNotes);
  document
    .getElementById("clinicalInfoModal")
    ?.querySelector(".clinical-info-backdrop")
    ?.addEventListener("click", closeClinicalInfo);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !getModal()?.classList.contains("is-hidden")) {
      closeClinicalInfo();
    }
  });

  bindChartInteractions();
  bindLegendInteractions();
}

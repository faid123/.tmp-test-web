import {
  COMPONENT_BY_ID,
  ensureMajorConnectorPlacementsOnSupportedTeeth,
  ensureMeshPlacementsOnMissingTeeth,
  ensurePlatePlacementsOnPresentTeeth,
  getDefaultMajorConnectorIdForDesignMode,
  getDefaultMeshIdForDesignMode,
  getDefaultPlateIdForDesignMode,
  isBarComponent,
  isBarPlacementSurface,
  isMajorConnectorComponent,
  isMeshComponent,
  isPlateComponentId,
  meshSelectionContextFromState,
} from "./components.js";
import { forEachTooth, isAutoMeshPlacementExcludedToothId, TOOTH_ORDER } from "./constants.js";
import {
  state,
  DEFAULT_COMPONENT_ID,
  downloadJson,
  getHistoryStateSignature,
  recordHistoryIfChanged,
  titleCase,
  setMessage,
  closePresentToothRadialQuickPick,
  renderJaw,
  renderJaws,
} from "./2DAnnotation.js";
import { renderComponentCatalog } from "./annotationCatalog.js";
import {
  ensureToothPlacementState,
  normalizeSurface,
  resetToothRecord,
  statusJsonForToothRecord,
  syncToothComponentsFromPlacements,
} from "./annotationTeethModel.js";

export function bindStatusPicker() {
  const buttons = document.querySelectorAll(".status-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.designMode) {
        setMessage("Unlock either arch to edit tooth status.", true);
        return;
      }
      state.activeStatus = button.dataset.status;
      buttons.forEach((btn) => btn.classList.toggle("is-active", btn === button));
      setMessage(`Active status: ${titleCase(state.activeStatus)}.`, false);
    });
  });
}

export function bindJawControls() {
  const toggle = document.getElementById("jawLockToggleBtn");
  if (toggle) toggle.addEventListener("click", toggleBothJawsLock);
  const rangeBtn = document.getElementById("teethRangeMissingBtn");
  if (rangeBtn) {
    rangeBtn.addEventListener("click", toggleRangeMissingMode);
  }
  refreshLockButtons();
  refreshRangeMissingButton();
}

function refreshRangeMissingButton() {
  const btn = document.getElementById("teethRangeMissingBtn");
  if (!btn) return;
  const active = Boolean(state.rangeMissingMode);
  btn.classList.toggle("is-active", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

function toggleRangeMissingMode() {
  const historyBefore = getHistoryStateSignature();
  if (state.designMode) {
    setMessage("Switch to selected mode to mark teeth missing by range.", true);
    return;
  }
  state.rangeMissingMode = !state.rangeMissingMode;
  state.rangeMissingStartToothId = null;
  refreshRangeMissingButton();
  if (state.rangeMissingMode) {
    setMessage("Remove multiple teeth: click first tooth, then second tooth to mark the span missing.", false);
    return;
  }
  setMessage("Remove multiple teeth off.", false);
  recordHistoryIfChanged(historyBefore);
}

export function bindActionButtons() {
  const clearTop = document.getElementById("clearTopBtn");
  const clearBottom = document.getElementById("clearBottomBtn");
  const reset = document.getElementById("drawFromScratchBtn");
  const save = document.getElementById("saveAnnotationBtn");
  if (clearTop) clearTop.addEventListener("click", () => clearArchButtonClicked("upper"));
  if (clearBottom) clearBottom.addEventListener("click", () => clearArchButtonClicked("lower"));
  if (reset) reset.addEventListener("click", drawFromScratch);
  if (save) save.addEventListener("click", saveAnnotation);
}

function toggleBothJawsLock() {
  const historyBefore = getHistoryStateSignature();
  const bothLocked = state.locks.upper && state.locks.lower;
  state.locks.upper = !bothLocked;
  state.locks.lower = !bothLocked;
  refreshLockButtons();
  syncDesignModeWithLocks(true);
  recordHistoryIfChanged(historyBefore);
}

function refreshLockButtons() {
  const btn = document.getElementById("jawLockToggleBtn");
  if (!btn) return;

  const bothLocked = state.locks.upper && state.locks.lower;
  const icon = btn.querySelector(".lock-icon");
  const text = btn.querySelector(".lock-text");

  if (icon) {
    icon.src = bothLocked ? "../../assets/lock.png" : "../../assets/unlock.png";
  }

  if (text) {
    text.textContent = bothLocked ? "Select mode" : "Design mode";
  }

  btn.classList.toggle("is-locked", bothLocked);
  btn.setAttribute(
    "aria-label",
    bothLocked
      ? "Design mode — click to switch to selected mode"
      : "Selected mode — click to switch to design mode"
  );
  btn.setAttribute(
    "data-tooltip",
    bothLocked
      ? "Switch to selected mode to edit teeth status"
      : "Switch to design mode to add components"
  );
}

function updateClearArchButtonLabels() {
  const clearTop = document.getElementById("clearTopBtn");
  const clearBottom = document.getElementById("clearBottomBtn");
  if (!clearTop || !clearBottom) return;

  if (state.designMode) {
    clearTop.textContent = "Clear Top";
    clearBottom.textContent = "Clear Bottom";
  } else {
    clearTop.textContent = "Clear upper teeth";
    clearBottom.textContent = "Clear lower teeth";
  }
}

function clearArchButtonClicked(jaw) {
  if (state.designMode) {
    clearDesignModeArch(jaw);
  } else {
    clearJawTeethBaseline(jaw);
  }
}

function clearJawTeethBaseline(jaw) {
  const historyBefore = getHistoryStateSignature();
  for (const toothId of TOOTH_ORDER[jaw]) {
    const tooth = state.teeth[toothId];
    if (!tooth) continue;
    tooth.isPresent = false;
    tooth.status = "missing";
    tooth.components = [];
    tooth.componentPlacements = [];
  }
  if (jaw === "upper") {
    state.archOverlayPalatalHoleActive = false;
  }
  renderJaw(jaw);
  setMessage(`${titleCase(jaw)} arch: all teeth marked missing.`, false);
  recordHistoryIfChanged(historyBefore);
}

function clearDesignModeArch(jaw) {
  const historyBefore = getHistoryStateSignature();
  if (!state.designMode) return;

  const meshId = getDefaultMeshIdForDesignMode(meshSelectionContextFromState(state), COMPONENT_BY_ID);
  const plateId =
    state.selectedComponentId &&
    isPlateComponentId(state.selectedComponentId) &&
    COMPONENT_BY_ID.has(state.selectedComponentId)
      ? state.selectedComponentId
      : getDefaultPlateIdForDesignMode(COMPONENT_BY_ID);

  const meshDef = meshId ? COMPONENT_BY_ID.get(meshId) : null;
  const meshValid = meshDef && isMeshComponent(meshDef);
  const plateValid = plateId && COMPONENT_BY_ID.has(plateId) && isPlateComponentId(plateId);

  for (const toothId of TOOTH_ORDER[jaw]) {
    const tooth = state.teeth[toothId];
    if (!tooth) continue;
    tooth.componentPlacements = [];

    if (!isAutoMeshPlacementExcludedToothId(toothId)) {
      if (!tooth.isPresent && meshValid) {
        tooth.componentPlacements.push({ componentId: meshId, surface: null });
      } else if (tooth.isPresent && plateValid) {
        tooth.componentPlacements.push({ componentId: plateId, surface: null });
      }
    }

    syncToothComponentsFromPlacements(tooth);
  }

  if (jaw === "upper") {
    const majorId =
      state.selectedComponentId &&
      isMajorConnectorComponent(state.selectedComponentId) &&
      COMPONENT_BY_ID.has(state.selectedComponentId)
        ? state.selectedComponentId
        : getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
    ensureMajorConnectorPlacementsOnSupportedTeeth(state.teeth, majorId, COMPONENT_BY_ID);
    state.archOverlayPalatalHoleActive = false;
  }

  renderComponentCatalog();
  renderJaws();
  setMessage(
    `${titleCase(jaw)} arch cleared in design mode; default mesh/plate restored where needed.`,
    false
  );
  recordHistoryIfChanged(historyBefore);
}

function drawFromScratch() {
  const historyBefore = getHistoryStateSignature();
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    state.locks[jaw] = false;
  }
  forEachTooth((toothId) => resetToothRecord(toothId, null));
  state.components = [];
  state.selectedComponentId = DEFAULT_COMPONENT_ID;
  state.archOverlayPalatalHoleActive = false;
  state.restSeatCalibrationAcOnly = false;
  state.removeComponentMode = false;
  state.rangeMissingMode = false;
  state.rangeMissingStartToothId = null;
  const rmBtn = document.getElementById("removeComponentModeBtn");
  if (rmBtn) rmBtn.classList.remove("is-active");
  refreshRangeMissingButton();
  refreshLockButtons();
  syncDesignModeWithLocks(false);
  renderComponentCatalog();
  updateEditModeUI();
  renderJaws();
  setMessage("All teeth reset. Both arches unlocked.", false);
  recordHistoryIfChanged(historyBefore);
}

export function updateEditModeUI() {
  const panel = document.getElementById("editModePanel");
  const active = state.designMode;
  if (panel) {
    panel.classList.toggle("is-hidden", !active);
  }

  const selectPanel = document.getElementById("selectTeethPanel");
  if (selectPanel) {
    selectPanel.classList.toggle("is-hidden", active);
  }

  const eraser = document.getElementById("removeComponentModeBtn");
  const rangeBtn = document.getElementById("teethRangeMissingBtn");

  if (rangeBtn) {
    rangeBtn.classList.toggle("is-hidden", active);
    rangeBtn.disabled = active;
    if (active) {
      rangeBtn.classList.remove("is-active");
      rangeBtn.setAttribute("aria-pressed", "false");
    }
  }

  if (eraser) {
    eraser.classList.toggle("is-hidden", !active);
    eraser.disabled = !active;
    eraser.setAttribute("aria-pressed", state.removeComponentMode ? "true" : "false");
    if (!active) {
      eraser.classList.remove("is-active");
    }
  }
}

export function syncDesignModeWithLocks(notify) {
  const next = state.locks.upper && state.locks.lower;
  const prev = state.designMode;
  if (!next) {
    closePresentToothRadialQuickPick();
    state.removeComponentMode = false;
    refreshRangeMissingButton();
  }
  if (next) {
    state.rangeMissingMode = false;
    state.rangeMissingStartToothId = null;
    refreshRangeMissingButton();
  }
  state.designMode = next;

  if (next && !prev) {
    const meshId = getDefaultMeshIdForDesignMode(meshSelectionContextFromState(state), COMPONENT_BY_ID);
    ensureMeshPlacementsOnMissingTeeth(state.teeth, meshId, COMPONENT_BY_ID);
    const plateId =
      state.selectedComponentId &&
      isPlateComponentId(state.selectedComponentId) &&
      COMPONENT_BY_ID.has(state.selectedComponentId)
        ? state.selectedComponentId
        : getDefaultPlateIdForDesignMode(COMPONENT_BY_ID);
    ensurePlatePlacementsOnPresentTeeth(state.teeth, plateId, COMPONENT_BY_ID);
    const majorId =
      state.selectedComponentId &&
      isMajorConnectorComponent(state.selectedComponentId) &&
      COMPONENT_BY_ID.has(state.selectedComponentId)
        ? state.selectedComponentId
        : getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
    ensureMajorConnectorPlacementsOnSupportedTeeth(state.teeth, majorId, COMPONENT_BY_ID);
    forEachTooth((toothId) => {
      const t = state.teeth[toothId];
      if (t && !t.isPresent) {
        t.status = "missing";
      }
    });
  }

  updateEditModeUI();
  renderComponentCatalog();
  renderJaws();

  if (state.designMode && state.activeStatus !== "presence") {
    state.activeStatus = "presence";
    document.querySelectorAll(".status-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.status === "presence");
    });
  }

  if (notify && prev !== next) {
    if (next) {
      setMessage("Both arches are locked. Entered design mode; tooth selection is disabled.", false);
    } else {
      setMessage("Exited design mode. Unlock state allows tooth editing again.", false);
    }
  }

  updateClearArchButtonLabels();
}

export function bindArchWhitespaceDismiss() {
  const shell = document.querySelector("main.annotation-shell");
  if (!shell) return;

  shell.addEventListener("click", (e) => {
    if (!state.designMode) return;
    const t = e.target;
    if (!(t instanceof Element)) return;

    // Tooth / arch placement targets — keep rest & clasp suggestion dots visible.
    if (t.closest(".tooth")) return;

    // All chrome controls (lock, eraser, catalog, actions, tabs, …).
    if (t.closest("button, a[href], input, select, textarea, label")) return;

    if (t.closest(".tooth-radial-backdrop")) return;

    if (state.removeComponentMode) {
      state.removeComponentMode = false;
      const rmBtn = document.getElementById("removeComponentModeBtn");
      if (rmBtn) {
        rmBtn.classList.remove("is-active");
        rmBtn.setAttribute("aria-pressed", "false");
      }
      setMessage("Remove mode off.", false);
    }

    // Clicking whitespace cancels the current placement workflow (e.g. clasp/rest suggestion mode)
    // and returns the catalog to the default mesh tab.
    state.selectedTab = "mesh";
    state.selectedComponentId = DEFAULT_COMPONENT_ID;
    renderComponentCatalog();

    state.suppressArchPlacementSuggestions = true;
    closePresentToothRadialQuickPick();
    renderJaws();
  });
}

export function bindRemoveComponentModeBtn() {
  const btn = document.getElementById("removeComponentModeBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const historyBefore = getHistoryStateSignature();
    if (!state.designMode) {
      setMessage("Lock both arches to remove components.", true);
      return;
    }
    state.removeComponentMode = !state.removeComponentMode;
    btn.classList.toggle("is-active", state.removeComponentMode);
    btn.setAttribute("aria-pressed", state.removeComponentMode ? "true" : "false");
    setMessage(
      state.removeComponentMode
        ? "Remove mode: click a tooth, then pick a component to remove."
        : "Remove mode off.",
      false
    );
    renderJaws();
    recordHistoryIfChanged(historyBefore);
  });
}

export function saveAnnotation() {
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

export function buildPayload() {
  const teeth = [...TOOTH_ORDER.upper, ...TOOTH_ORDER.lower].map((toothId) => {
    const record = state.teeth[toothId];
    ensureToothPlacementState(record);
    syncToothComponentsFromPlacements(record);

    return {
      tooth_id: record.tooth_id,
      jaw: record.jaw,
      status: statusJsonForToothRecord(record),
      isPresent: record.isPresent,
      componentPlacements: (record.componentPlacements || []).map((entry) => {
        const row = {
          componentId: entry.componentId,
          surface: normalizeSurface(entry.surface),
        };
        if (
          isBarComponent(entry.componentId) &&
          isBarPlacementSurface(normalizeSurface(entry.surface))
        ) {
          const bx = Number(entry.barOffsetX);
          const by = Number(entry.barOffsetY);
          row.barOffsetX = Number.isFinite(bx) ? bx : 0;
          row.barOffsetY = Number.isFinite(by) ? by : 0;
        }
        return row;
      }),
      components: [...record.components],
      center: record.center,
    };
  });

  return {
    schema: "smartrpd.2d-arch.v1",
    caseIntID: state.caseIntID,
    encryptedCaseId: state.encryptedCaseId || null,
    updatedAt: new Date().toISOString(),
    locks: { upper: state.locks.upper, lower: state.locks.lower },
    editMode: state.designMode,
    components: state.components,
    selectedComponentId: state.selectedComponentId,
    archOverlayPalatalHoleActive: state.archOverlayPalatalHoleActive,
    activeStatus: state.activeStatus,
    teeth,
    arches: {
      upper: TOOTH_ORDER.upper.map((id) => state.teeth[id].center),
      lower: TOOTH_ORDER.lower.map((id) => state.teeth[id].center),
    },
  };
}

export function loadPreviewImage() {
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

export function getStorageKey() {
  return `dentalAnnotation_${state.encryptedCaseId || "draft"}`;
}

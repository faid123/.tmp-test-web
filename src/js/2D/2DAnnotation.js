import { lol } from "../../crypt.js";
import {
  ACTION_UPON_FAILURE,
  cancelMeshInteractionDefer,
  COMPONENT_TABS,
  COMPONENT_CATALOG,
  COMPONENT_BY_ID,
  deferMeshInteraction,
  ensureMeshPlacementsOnMissingTeeth,
  ensurePlatePlacementsOnPresentTeeth,
  getCingulumAcSuggestionPointsForTooth,
  getComponentAssetReference,
  getPlatePlacementImageSize,
  getPlatePlacementOffset,
  getPlatePlacementRenderScale,
  getDefaultMeshIdForDesignMode,
  getDefaultPlateIdForDesignMode,
  getMeshPlacementImageSize,
  getMeshPlacementOffset,
  getMeshPlacementRenderScale,
  getRestPlacementAssetReference,
  getRestPlacementImageSize,
  getRestPlacementRenderScale,
  getRestSuggestionSurfaces,
  getRestSuggestionPointsForTooth,
  getRestSuggestionRadius,
  getClaspCircAssetReference,
  getClaspCircPlacementImageSize,
  getClaspCircPlacementOffset,
  getClaspCircPlacementRenderScale,
  getClaspCircSuggestionPointsForTooth,
  getClaspCircSuggestionRadius,
  BAR_PLACEMENT_ANCHOR_SURFACE,
  getBarPlacementAssetReference,
  getBarPlacementImageSize,
  getBarPlacementOffset,
  getBarPlacementRenderScale,
  getBarPlacementSurfaceForTooth,
  getBarSuggestibleToothIdSet,
  getBarUserOffset,
  isBarComponent,
  isBarPlacementSurface,
  handleMeshCatalogDoubleClickApplyAll,
  handleMeshToolDoubleClick,
  isClaspCircComponent,
  isMeshComponent,
  isMajorConnectorComponent,
  getMajorConnectorAssetReference,
  getMajorConnectorPlacementImageSize,
  getMajorConnectorPlacementOffset,
  getMajorConnectorRenderScaleMultiplier,
  isRestComponent,
  meshHoleUniformScaleToothId,
  meshSelectionContextFromState,
  isPlateComponentId,
} from "./components.js";
import { assessPlacementCriteria } from "./criteria.js";
import {
  ANTERIOR_REST_SURFACE_DIALOG_TEETH,
  COMPONENT_GROUPS,
  COMPONENT_IMAGE_HEIGHT,
  COMPONENT_IMAGE_WIDTH,
  COMPONENT_SCALE_BY_JAW,
  COMPONENT_SCALE_BY_TOOTH,
  EMPTY_JAW_CALIBRATION,
  forEachTooth,
  isAutoMeshPlatePlacementExcludedToothId,
  JAW_BACKGROUND_IMAGES,
  JAW_BACKGROUND_OFFSET_BY_JAW,
  JAW_BACKGROUND_SCALE_BY_JAW,
  JAW_CALIBRATION,
  JAW_IMAGE_FLIP_X,
  PLATE_SUGGESTION_TRANSFORM_BY_JAW,
  PRESENCE_TOOTH_ASSET,
  STATUS_VALUES,
  SVG_NS,
  TOOTH_ASSET_BASE,
  TOOTH_IMAGE_HALF_HEIGHT,
  TOOTH_IMAGE_HALF_WIDTH,
  TOOTH_IMAGE_HEIGHT,
  TOOTH_IMAGE_WIDTH,
  TOOTH_ORDER,
  TOOTH_POSITION_MAP,
  TOOTH_SCALE_BY_UNIT,
  TOOTH_SCALE_OVERRIDE,
} from "./constants.js";

const DEFAULT_COMPONENT_ID =
  COMPONENT_BY_ID.has("mesh-hole") ? "mesh-hole" : COMPONENT_CATALOG[0]?.id || null;
const REST_CALIBRATION_COMPONENT_ID = "rest-seat";

// Runtime annotation state.
const state = {
  encryptedCaseId: "",
  caseIntID: null,
  activeStatus: "presence",
  locks: { upper: false, lower: false },
  teeth: {},
  components: [],
  selectedComponentId: DEFAULT_COMPONENT_ID,
  /** When true (rest-seat calibration boot), anterior rest hints are only cingulum ac_mesial / ac_distal. */
  restSeatCalibrationAcOnly: false,
};

let hasInitialized = false;

// Start the annotation app once and guard against duplicate init calls.
function start() {
  if (hasInitialized) return;
  hasInitialized = true;
  init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

// Entry point: wire events, restore state, and render.
function init() {
  initializeCaseIds();
  initializeTeethState();

  try {
    bindStatusPicker();
    bindJawControls();
    bindActionButtons();
    initComponentCatalog();
    loadPreviewImage();
    bootstrapDefaultPlateOnAllPresentTeeth();
    syncDesignModeWithLocks(false);
    renderJaws();
    updateEditModeUI();
  } catch (err) {
    console.error("2D annotation init failed", err);
    setMessage("Loaded jaw view with limited tools. Check console for init error.", true);
  }
}

/**
 * On load: place the default plate component on every present tooth so plates are visible immediately.
 */
function bootstrapDefaultPlateOnAllPresentTeeth() {
  const plateId = getDefaultPlateIdForDesignMode(COMPONENT_BY_ID);
  if (!plateId || !COMPONENT_BY_ID.has(plateId)) {
    setMessage("Default plate not found in catalog.", true);
    return;
  }

  state.components = [plateId];
  state.selectedComponentId = plateId;
  state.selectedTab = "plate";

  forEachTooth((toothId) => {
    const tooth = state.teeth[toothId];
    if (!tooth) return;

    tooth.isPresent = true;
    tooth.status = "presence";
    ensureToothPlacementState(tooth);
    if (isAutoMeshPlatePlacementExcludedToothId(toothId)) {
      tooth.componentPlacements = [];
    } else {
      tooth.componentPlacements = [{ componentId: plateId, surface: null }];
    }
    syncToothComponentsFromPlacements(tooth);
  });

  renderComponentCatalog();
  setMessage("Default plate shown on all teeth.", false);
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
  forEachTooth((toothId, jaw) => {
    state.teeth[toothId] = {
      tooth_id: toothId,
      jaw,
      status: "presence",
      isPresent: true,
      components: [],
      componentPlacements: [],
      center: [0, 0]
    };
  });
}

// Reset one tooth to baseline state while preserving identity and jaw.
function resetToothRecord(toothId, status) {
  const tooth = state.teeth[toothId];
  if (!tooth) return;
  tooth.status = status ?? "presence";
  tooth.components = [];
  tooth.componentPlacements = [];
  tooth.isPresent = true;
}

// Choose active labeling mode: presence / abutment / compromised.
function bindStatusPicker() {
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

// Bind combined jaw lock (both arches lock/unlock together).
function bindJawControls() {
  const toggle = document.getElementById("jawLockToggleBtn");
  if (toggle) toggle.addEventListener("click", toggleBothJawsLock);
  refreshLockButtons();
}

// Bind global actions (clear, reset, save).
function bindActionButtons() {
  const clearTop = document.getElementById("clearTopBtn");
  const clearBottom = document.getElementById("clearBottomBtn");
  const reset = document.getElementById("drawFromScratchBtn");
  const save = document.getElementById("saveAnnotationBtn");
  if (clearTop) clearTop.addEventListener("click", () => clearArchButtonClicked("upper"));
  if (clearBottom) clearBottom.addEventListener("click", () => clearArchButtonClicked("lower"));
  if (reset) reset.addEventListener("click", drawFromScratch);
  if (save) save.addEventListener("click", saveAnnotation);
}

// Toggle both arches locked/unlocked together (design mode when both locked).
function toggleBothJawsLock() {
  const bothLocked = state.locks.upper && state.locks.lower;
  state.locks.upper = !bothLocked;
  state.locks.lower = !bothLocked;
  refreshLockButtons();
  syncDesignModeWithLocks(true);
}

// Keep the combined lock control in sync with state.
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
    bothLocked ? "Design mode — click to switch to selected mode" : "Selected mode — click to switch to design mode"
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

/** Mark every tooth in one arch missing; clear placements (selected mode only). */
function clearJawTeethBaseline(jaw) {
  for (const toothId of TOOTH_ORDER[jaw]) {
    const tooth = state.teeth[toothId];
    if (!tooth) continue;
    tooth.isPresent = false;
    tooth.status = "missing";
    tooth.components = [];
    tooth.componentPlacements = [];
    syncToothComponentsFromPlacements(tooth);
  }
  renderJaw(jaw);
  setMessage(`${titleCase(jaw)} arch: all teeth marked missing.`, false);
}

/** In design mode, strip one arch’s components and re-apply default mesh / plate where applicable. */
function clearDesignModeArch(jaw) {
  if (!state.designMode) return;

  const meshId = getDefaultMeshIdForDesignMode(meshSelectionContextFromState(state), COMPONENT_BY_ID);
  const plateId =
    state.selectedComponentId &&
    isPlateComponentId(state.selectedComponentId) &&
    COMPONENT_BY_ID.has(state.selectedComponentId)
      ? state.selectedComponentId
      : getDefaultPlateIdForDesignMode(COMPONENT_BY_ID);

  for (const toothId of TOOTH_ORDER[jaw]) {
    const tooth = state.teeth[toothId];
    if (!tooth) continue;
    tooth.componentPlacements = [];
    syncToothComponentsFromPlacements(tooth);
  }

  for (const toothId of TOOTH_ORDER[jaw]) {
    const tooth = state.teeth[toothId];
    if (!tooth) continue;
    if (isAutoMeshPlatePlacementExcludedToothId(toothId)) {
      continue;
    }

    if (!tooth.isPresent) {
      if (meshId && COMPONENT_BY_ID.has(meshId)) {
        const def = COMPONENT_BY_ID.get(meshId);
        if (def && isMeshComponent(def)) {
          tooth.componentPlacements.push({ componentId: meshId, surface: null });
          syncToothComponentsFromPlacements(tooth);
        }
      }
    } else if (plateId && COMPONENT_BY_ID.has(plateId) && isPlateComponentId(plateId)) {
      tooth.componentPlacements.push({ componentId: plateId, surface: null });
      syncToothComponentsFromPlacements(tooth);
    }
  }

  renderComponentCatalog();
  renderJaws();
  setMessage(
    `${titleCase(jaw)} arch cleared in design mode; default mesh/plate restored where needed.`,
    false
  );
}

// Reset whole annotation state back to empty.
function drawFromScratch() {
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    state.locks[jaw] = false;
  }
  forEachTooth((toothId) => resetToothRecord(toothId, null));
  state.components = [];
  state.selectedComponentId = DEFAULT_COMPONENT_ID;
  state.restSeatCalibrationAcOnly = false;
  refreshLockButtons();
  syncDesignModeWithLocks(false);
  renderComponentCatalog();
  updateEditModeUI();
  renderJaws();
  setMessage("All teeth reset. Both arches unlocked.", false);
}

// Build component tabs and initialize the first visible catalog view.
function initComponentCatalog() {
  if (!state.selectedTab || !COMPONENT_TABS.some((t) => t.id === state.selectedTab)) {
    state.selectedTab = "bars";
  }
  if (!state.selectedComponentId || !COMPONENT_BY_ID.has(state.selectedComponentId)) {
    state.selectedComponentId = DEFAULT_COMPONENT_ID;
  }
  const tabsEl = document.getElementById("componentTabs");
  if (tabsEl) {
    tabsEl.innerHTML = "";
    for (const tab of COMPONENT_TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `component-tab ${state.selectedTab === tab.id ? "is-active" : ""}`;
      button.textContent = tab.label;
      button.addEventListener("click", () => {
        state.selectedTab = tab.id;
        renderComponentCatalog();
        renderJaws();
      });
      tabsEl.appendChild(button);
    }
  }
  renderComponentCatalog();
}

// Render component options for the selected tab and grouped sections.
function renderComponentCatalog() {
  const tabs = document.querySelectorAll(".component-tab");
  tabs.forEach((tabBtn, index) => {
    tabBtn.classList.toggle("is-active", COMPONENT_TABS[index]?.id === state.selectedTab);
  });

  const itemsEl = document.getElementById("componentItems");
  if (!itemsEl) return;
  itemsEl.innerHTML = "";

  const tabItems = COMPONENT_CATALOG.filter((entry) => entry.tab === state.selectedTab);
  const groups = COMPONENT_GROUPS[state.selectedTab];
  if (groups) {
    const columns = document.createElement("div");
    columns.className = "major-columns";
    groups.forEach((groupMeta) => {
      const groupItems = tabItems.filter((entry) => entry.section === groupMeta.key);
      columns.appendChild(createMajorColumn(groupMeta.title, groupItems));
    });
    itemsEl.appendChild(columns);
    renderSelectedComponents();
    return;
  }

  for (const item of tabItems) {
    itemsEl.appendChild(createComponentItemButton(item));
  }

  if (state.selectedTab === "plate") {
    const clearRow = document.createElement("div");
    clearRow.className = "plate-tab-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "plate-clear-all-btn";
    clearBtn.textContent = "Clear all plates";
    clearBtn.disabled = !state.designMode;
    clearBtn.addEventListener("click", () => {
      if (!state.designMode) {
        setMessage("Lock both arches to clear plates.", true);
        return;
      }
      removeAllPlatePlacementsFromTeeth();
      state.components = state.components.filter((id) => !isPlateComponentId(id));
      state.selectedComponentId =
        state.components.find((id) => COMPONENT_BY_ID.has(id)) || DEFAULT_COMPONENT_ID;
      renderComponentCatalog();
      renderJaws();
      setMessage("All plates removed from the arch.", false);
    });
    clearRow.appendChild(clearBtn);
    itemsEl.appendChild(clearRow);
  }

  renderSelectedComponents();
}

// Create one column block for grouped component sections.
function createMajorColumn(title, items) {
  const column = document.createElement("section");
  column.className = "major-column";

  const heading = document.createElement("h4");
  heading.className = "major-column-title";
  heading.textContent = title;
  column.appendChild(heading);

  const list = document.createElement("div");
  list.className = "major-column-items";
  for (const item of items) {
    list.appendChild(createComponentItemButton(item));
  }
  column.appendChild(list);
  return column;
}

function meshAnnotationEnv() {
  return {
    designMode: state.designMode,
    state,
    componentById: COMPONENT_BY_ID,
    notify: setMessage,
    redrawCatalog: renderComponentCatalog,
    redrawJaws: renderJaws,
    redrawJaw: renderJaw,
    placeSelectedOnTooth: placeSelectedComponentOnTooth,
  };
}

// Create a selectable component button with icon and label tooltip.
function createComponentItemButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `component-item ${state.selectedComponentId === item.id ? "is-active" : ""}`;
  button.title = item.label;

  const icon = document.createElement("span");
  icon.className = "component-icon";
  if (item.icon) {
    const iconImg = document.createElement("img");
    iconImg.className = "component-icon-img";
    iconImg.src = item.icon;
    iconImg.alt = item.label;
    icon.appendChild(iconImg);
  } else {
    icon.textContent = item.shortLabel;
  }

  const label = document.createElement("span");
  label.className = "component-label";
  label.textContent = item.label;

  button.appendChild(icon);
  button.appendChild(label);

  if (isMeshComponent(item.id)) {
    const deferKey = `mesh-catalog:${item.id}`;
    button.addEventListener("click", () => {
      deferMeshInteraction(deferKey, () => handleDesignComponentSelect(item.id));
    });
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      cancelMeshInteractionDefer(deferKey);
      handleMeshCatalogDoubleClickApplyAll(meshAnnotationEnv(), item.id);
    });
  } else {
    button.addEventListener("click", () => handleDesignComponentSelect(item.id));
  }
  return button;
}

// Remove every plate placement from all teeth (design mode).
function removeAllPlatePlacementsFromTeeth() {
  forEachTooth((toothId) => {
    const tooth = state.teeth[toothId];
    if (!tooth) {
      return;
    }
    ensureToothPlacementState(tooth);
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (e) => !isPlateComponentId(e.componentId)
    );
    syncToothComponentsFromPlacements(tooth);
  });
}

// Toggle one component in the active design list with conflict handling.
function handleDesignComponentSelect(componentId) {
  if (!state.designMode) {
    setMessage("Lock both arches to use the component catalog.", true);
    return;
  }

  const selected = COMPONENT_BY_ID.get(componentId);
  if (!selected) return;

  if (isMeshComponent(componentId)) {
    const meshDeselect =
      state.selectedComponentId === componentId && state.components.includes(componentId);
    state.selectedComponentId = componentId;

    if (meshDeselect) {
      state.components = state.components.filter((id) => id !== componentId);
      state.selectedComponentId =
        state.components.find((id) => COMPONENT_BY_ID.has(id)) || DEFAULT_COMPONENT_ID;
      renderComponentCatalog();
      renderJaws();
      setMessage(`${selected.label} removed from design list.`, false);
      return;
    }

    state.components = state.components.filter((id) => !isMeshComponent(id));
    if (!state.components.includes(componentId)) {
      state.components.push(componentId);
    }
    renderComponentCatalog();
    renderJaws();
    setMessage(
      `${selected.label} selected. Single-click a missing tooth to place; double-click to change that tooth’s mesh to this type (different teeth can use different meshes).`,
      false
    );
    return;
  }

  if (isPlateComponentId(componentId)) {
    const plateDeselect =
      state.selectedComponentId === componentId && state.components.includes(componentId);
    state.selectedComponentId = componentId;

    if (plateDeselect) {
      state.components = state.components.filter((id) => id !== componentId);
      removeAllPlatePlacementsFromTeeth();
      state.selectedComponentId =
        state.components.find((id) => COMPONENT_BY_ID.has(id)) || DEFAULT_COMPONENT_ID;
      renderComponentCatalog();
      renderJaws();
      setMessage(`${selected.label} deselected; all plates removed from the arch.`, false);
      return;
    }

    state.components = state.components.filter((id) => !isPlateComponentId(id));
    if (!state.components.includes(componentId)) {
      state.components.push(componentId);
    }
    renderComponentCatalog();
    renderJaws();
    setMessage(
      `${selected.label} selected. Click cyan suggestion markers on present teeth to toggle this plate; click the same plate again to clear all plates.`,
      false
    );
    return;
  }

  state.selectedComponentId = componentId;
  renderJaws();

  if (state.components.includes(componentId)) {
    state.components = state.components.filter((id) => id !== componentId);
    renderComponentCatalog();
    renderJaws();
    setMessage(`${selected.label} removed from design list.`, false);
    return;
  }

  const conflicts = state.components.filter((id) => selected.conflictsWith.includes(id));
  if (conflicts.length > 0 && selected.actionUponFailure === ACTION_UPON_FAILURE.PREVENT_PLACEMENT) {
    setMessage(`Cannot add ${selected.label}. Conflicts with ${conflicts.join(", ")}.`, true);
    return;
  }

  if (conflicts.length > 0 && selected.actionUponFailure === ACTION_UPON_FAILURE.REMOVE_THEN_PLACE) {
    state.components = state.components.filter((id) => !conflicts.includes(id));
  }

  state.components.push(componentId);
  renderComponentCatalog();
  if (isBarComponent(selected)) {
    setMessage(
      `${selected.label} selected. Click a highlighted present tooth within two positions of a missing tooth to place.`,
      false
    );
    return;
  }
  setMessage(`${selected.label} added to design list.`, false);
}

// Render the selected component chips in the summary panel.
function renderSelectedComponents() {
  const selectedEl = document.getElementById("selectedComponents");
  if (!selectedEl) return;

  selectedEl.innerHTML = "";
  for (const componentId of state.components) {
    const chip = document.createElement("span");
    chip.className = "selected-chip";
    chip.textContent = COMPONENT_BY_ID.get(componentId)?.label || componentId;
    selectedEl.appendChild(chip);
  }
}

// Toggle visibility and helper text for design mode panels.
function updateEditModeUI() {
  const panel = document.getElementById("editModePanel");
  const active = state.designMode;
  if (panel) {
    panel.classList.toggle("is-hidden", !active);
  }

  const selectPanel = document.getElementById("selectTeethPanel");
  if (selectPanel) {
    selectPanel.classList.toggle("is-hidden", active);
  }

  const hint = document.getElementById("designHint");
  if (hint) {
    hint.textContent = active
      ? "Design mode: missing teeth get a default mesh; present teeth get a default plate if they had none. Meshes: single-click icon to select; double-click icon applies that mesh arch-wide. On a tooth: single-click places/removes mesh; double-click swaps mesh type. Plates: use cyan suggestion markers on present teeth to toggle the selected plate; click the same plate again to remove all plates. Clasps: use suggestion points to place; click a placed clasp to remove. Bars: select a bar, then click a highlighted tooth within two positions of a missing tooth; click a placed bar to remove it."
      : "Lock both arches to enter design mode.";
  }
}

// Recompute design mode based on jaw locks and update related UI state.
function syncDesignModeWithLocks(notify) {
  const next = state.locks.upper && state.locks.lower;
  const prev = state.designMode;
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

// Apply status classes to a tooth group based on presence and status value.
function applyToothStatusClass(group, tooth) {
  if (!tooth.isPresent) {
    group.classList.add("is-missing");
    return;
  }

  const status = normalizeStatus(tooth.status);
  if (status === "abutment" || status === "compromised") {
    group.classList.add(`status-${status}`);
    return;
  }
  group.classList.add("status-presence");
}

// Draw mesh overlays on missing teeth; plate overlays on present teeth.
function appendToothComponentVisuals(group, tooth, toothId, jaw) {
  if (!tooth.components.length) {
    return;
  }

  if (!tooth.isPresent) {
    for (const componentId of tooth.components) {
      const def = COMPONENT_BY_ID.get(componentId);
      if (!def || !isMeshComponent(def)) {
        continue;
      }
      const under = createMajorConnectorVisual(componentId, toothId, jaw);
      if (under) group.appendChild(under);
      const visual = createComponentVisual(componentId, toothId, jaw);
      if (visual) {
        group.appendChild(visual);
      }
    }
    return;
  }

  for (const componentId of tooth.components) {
    if (!isPlateComponentId(componentId)) {
      continue;
    }
    const under = createMajorConnectorVisual(componentId, toothId, jaw);
    if (under) group.appendChild(under);
    const visual = createComponentVisual(componentId, toothId, jaw);
    if (visual) {
      group.appendChild(visual);
    }
  }
}

function getRestSurfacePointMap(toothId, jaw, componentId = null) {
  const { mirrored } = getToothAssetSpec(toothId);
  const points = getRestSuggestionPointsForTooth(
    toothId,
    jaw,
    mirrored,
    JAW_IMAGE_FLIP_X[jaw] ?? 1,
    componentId
  );

  const map = new Map(points.map((point) => [normalizeSurface(point.surface), point]));
  const cingulumAc = getCingulumAcSuggestionPointsForTooth(toothId);
  if (cingulumAc) {
    for (const p of cingulumAc) {
      const key = normalizeSurface(p.surface);
      if (key) map.set(key, { surface: p.surface, x: p.x, y: p.y });
    }
  }
  return map;
}

function getClaspSurfacePointMap(toothId, jaw) {
  const points = getClaspCircSuggestionPointsForTooth(toothId, jaw);
  return new Map(points.map((point) => [normalizeSurface(point.surface), point]));
}

function restMarkerAnchorSurface(placementSurface, toothId) {
  const s = normalizeSurface(placementSurface);
  if (!s) return null;
  if (isAnteriorRestSurfaceDialogTooth(toothId)) {
    if (s === "lingual_mesial" || s === "lingual_distal") return s;
    if (s === "lingual") return "lingual";
  }
  return s;
}

function appendPlacedRestMarkers(group, tooth, toothId, jaw) {
  ensureToothPlacementState(tooth);
  if (!tooth.componentPlacements.length) return;
  if (!tooth.isPresent) {
    const hasBarPlacement = tooth.componentPlacements.some((placement) =>
      isBarComponent(placement.componentId) && isBarPlacementSurface(normalizeSurface(placement.surface))
    );
    if (!hasBarPlacement) return;
  }

  const radius = getRestSuggestionRadius() + 0.6;
  const { mirrored } = getToothAssetSpec(toothId);

  for (const placement of tooth.componentPlacements) {
    if (!isRestComponent(placement.componentId)) continue;

    const surface = normalizeSurface(placement.surface);
    if (!surface) continue;

    const pointMap = getRestSurfacePointMap(toothId, jaw, placement.componentId);
    const anchorSurface = restMarkerAnchorSurface(placement.surface, toothId);
    const point = anchorSurface ? pointMap.get(anchorSurface) : null;
    if (!point) continue;

    const assetHref = getRestPlacementAssetReference(placement.componentId, toothId, surface);
    const imageSize = getRestPlacementImageSize(placement.componentId, toothId, surface);
    const restScale = getRestPlacementRenderScale(placement.componentId, toothId, surface);

    if (assetHref && imageSize) {
      const width = imageSize.width * restScale;
      const height = imageSize.height * restScale;

      const imageGroup = svgEl("g", {
        transform: `translate(${point.x} ${point.y}) scale(${mirrored ? -1 : 1} 1)`
      });

      imageGroup.appendChild(
        svgEl("image", {
          href: assetHref,
          x: String(-width / 2),
          y: String(-height / 2),
          width: String(width),
          height: String(height),
          preserveAspectRatio: "xMidYMid meet",
          class: `rest-placement-image rest-placement-${surface}${
            placement.componentId === REST_CALIBRATION_COMPONENT_ID ? " is-placed-rest-seat" : ""
          }`,
          "data-surface": surface,
          "data-component-id": placement.componentId,
        })
      );

      imageGroup.addEventListener("click", (event) => {
        event.stopPropagation();
        removePlacement(tooth, placement.componentId, surface);
        const label = COMPONENT_BY_ID.get(placement.componentId)?.label || placement.componentId;
        setMessage(`Removed ${label} (${surface}) from tooth ${toothId}.`, false);
        renderJaw(jaw);
      });

      group.appendChild(imageGroup);
      continue;
    }

    const marker = svgEl("circle", {
        cx: String(point.x),
        cy: String(point.y),
        r: String(radius),
        class: `rest-placement-marker rest-placement-${surface}${
          placement.componentId === REST_CALIBRATION_COMPONENT_ID ? " is-placed-rest-seat" : ""
        }`,
        "data-surface": surface,
        "data-component-id": placement.componentId,
      });

    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      removePlacement(tooth, placement.componentId, surface);
      const label = COMPONENT_BY_ID.get(placement.componentId)?.label || placement.componentId;
      setMessage(`Removed ${label} (${surface}) from tooth ${toothId}.`, false);
      renderJaw(jaw);
    });

    group.appendChild(marker);
  }

  const claspRadius = getClaspCircSuggestionRadius() + 0.6;
  for (const placement of tooth.componentPlacements) {
    if (!isClaspCircComponent(placement.componentId)) continue;

    const surface = normalizeSurface(placement.surface);
    if (!surface) continue;

    const claspPointMap = getClaspSurfacePointMap(toothId, jaw);
    const point = claspPointMap.get(surface);
    if (!point) continue;

    const claspOffset = getClaspCircPlacementOffset(placement.componentId, toothId, surface);
    const outerG = svgEl("g", {
      transform: `translate(${point.x + claspOffset.x} ${point.y + claspOffset.y}) scale(${mirrored ? -1 : 1} 1)`,
      class: `clasp-placement-root clasp-placement-${surface}`,
    });

    const assetHref = getClaspCircAssetReference(toothId, surface);
    const imageSize = getClaspCircPlacementImageSize(placement.componentId, toothId, surface);
    const claspScale = getClaspCircPlacementRenderScale(placement.componentId, toothId, surface);

    if (assetHref && imageSize) {
      const width = imageSize.width * claspScale;
      const height = imageSize.height * claspScale;

      outerG.appendChild(
        svgEl("image", {
          href: assetHref,
          x: String(-width / 2),
          y: String(-height / 2),
          width: String(width),
          height: String(height),
          preserveAspectRatio: "xMidYMid meet",
          class: `clasp-placement-image clasp-placement-${surface}`,
          "data-surface": surface,
          "data-component-id": placement.componentId,
        })
      );
    } else {
      outerG.appendChild(
        svgEl("circle", {
          cx: "0",
          cy: "0",
          r: String(claspRadius),
          class: `clasp-placement-marker clasp-placement-${surface}`,
          "data-surface": surface,
          "data-component-id": placement.componentId,
        })
      );
    }

    outerG.addEventListener("click", (event) => {
      event.stopPropagation();
      removePlacement(tooth, placement.componentId, surface);
      setMessage(`Removed clasp (${surface}) from tooth ${toothId}.`, false);
      renderJaw(jaw);
    });

    group.appendChild(outerG);
  }

  for (const placement of tooth.componentPlacements) {
    if (!isBarComponent(placement.componentId)) continue;
    const barSurface = normalizeSurface(placement.surface);
    if (!barSurface || !isBarPlacementSurface(barSurface)) continue;

    const claspPointMap = getClaspSurfacePointMap(toothId, jaw);
    const anchor = normalizeSurface(BAR_PLACEMENT_ANCHOR_SURFACE);
    const point = anchor ? claspPointMap.get(anchor) : null;
    if (!point) continue;

    const off = getBarPlacementOffset(placement.componentId, toothId, barSurface);
    const href = getBarPlacementAssetReference(placement.componentId, toothId, barSurface);
    const imageSize = getBarPlacementImageSize(placement.componentId, toothId, barSurface);
    const scale = getBarPlacementRenderScale(placement.componentId, toothId, barSurface);
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;

    if (
      placement.barOffsetX == null &&
      placement.barOffsetY == null &&
      (Number.isFinite(Number(placement.barX)) || Number.isFinite(Number(placement.barY)))
    ) {
      placement.barOffsetX = Number.isFinite(Number(placement.barX)) ? Number(placement.barX) : 0;
      placement.barOffsetY = Number.isFinite(Number(placement.barY)) ? Number(placement.barY) : 0;
      delete placement.barX;
      delete placement.barY;
    }

    const uoff = getBarUserOffset(placement);
    const mirroredOffsetX = mirrored ? -off.x : off.x;
    const mirroredUserOffsetX = mirrored ? -uoff.x : uoff.x;

    const outerG = svgEl("g", {
      transform: `translate(${point.x + mirroredOffsetX + mirroredUserOffsetX} ${point.y + off.y + uoff.y}) rotate(${off.rotation}) scale(${mirrored ? -1 : 1} 1)`,
      class: `bar-placement-root bar-placement-${barSurface}`,
    });

    outerG.appendChild(
      svgEl("image", {
        href,
        x: String(-width / 2),
        y: String(-height / 2),
        width: String(width),
        height: String(height),
        preserveAspectRatio: "xMidYMid meet",
        class: `bar-placement-image bar-placement-${barSurface}`,
        "data-surface": barSurface,
        "data-component-id": placement.componentId,
      })
    );

    // Tightly-bounded hit target at the bar's tooth-side anchor so clicks
    // on the surrounding transparent area of the bar's bounding rect fall
    // through to whatever is underneath (e.g. a plate's hit target on a
    // neighboring tooth). Without this, the full image rectangle catches
    // clicks even where the bar SVG renders nothing.
    const barHitTarget = svgEl("circle", {
      cx: "0",
      cy: "0",
      r: "18",
      class: `bar-placement-hit-target bar-placement-${barSurface}`,
      "data-surface": barSurface,
      "data-component-id": placement.componentId,
    });
    barHitTarget.addEventListener("click", (event) => {
      event.stopPropagation();
      removePlacement(tooth, placement.componentId, barSurface);
      setMessage(`Removed bar from tooth ${toothId}.`, false);
      renderJaw(jaw);
    });
    outerG.appendChild(barHitTarget);

    group.appendChild(outerG);
  }
}

function isAnteriorRestSurfaceDialogTooth(toothId) {
  return ANTERIOR_REST_SURFACE_DIALOG_TEETH.has(String(toothId));
}

function positionAnteriorRestPanel(panel, anchor) {
  const margin = 8;
  const gap = 14;
  if (!panel) return;
  if (!anchor || !Number.isFinite(anchor.clientX) || !Number.isFinite(anchor.clientY)) {
    const w = panel.getBoundingClientRect().width || 200;
    const h = panel.getBoundingClientRect().height || 80;
    panel.style.left = `${Math.round(window.innerWidth / 2 - w / 2)}px`;
    panel.style.top = `${Math.round(window.innerHeight / 2 - h / 2)}px`;
    return;
  }
  const rect = panel.getBoundingClientRect();
  let left = anchor.clientX - rect.width / 2;
  let top = anchor.clientY - rect.height - gap;
  if (top < margin) {
    top = anchor.clientY + gap;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

// Popup: mesial / distal / full (lingual) for anterior teeth 13–23 and 33–43; anchored near click.
function showAnteriorRestSurfaceDialog(toothId, anchor, onComplete) {
  const root = document.getElementById("anteriorRestSurfaceDialog");
  const panel = root?.querySelector(".anterior-rest-dialog-panel");
  const backdrop = root?.querySelector(".anterior-rest-dialog-backdrop");
  const surfaceBtns = root ? [...root.querySelectorAll("[data-rest-surface]")] : [];

  if (!root || !panel || !backdrop || surfaceBtns.length === 0) {
    onComplete(null);
    return;
  }

  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (!selectedComponent) {
    onComplete(null);
    return;
  }

  const allowed = state.restSeatCalibrationAcOnly
    ? new Set(["lingual_mesial", "lingual_distal"])
    : new Set(["lingual_mesial", "lingual_distal", "lingual"]);

  panel.setAttribute("aria-label", `Set cingulum rest, tooth ${toothId}`);

  for (const btn of surfaceBtns) {
    const s = normalizeSurface(btn.getAttribute("data-rest-surface"));
    const ok = Boolean(s && allowed.has(s));
    btn.classList.toggle("is-hidden", !ok);
    btn.disabled = !ok;
    btn.setAttribute("aria-hidden", ok ? "false" : "true");
  }

  let closed = false;
  const surfaceHandlers = [];

  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    backdrop.removeEventListener("click", onBackdrop);
    for (const { btn, fn } of surfaceHandlers) {
      btn.removeEventListener("click", fn);
    }
    panel.style.left = "";
    panel.style.top = "";
    panel.style.visibility = "";
    root.classList.add("is-hidden");
    root.setAttribute("aria-hidden", "true");
  };

  const finish = (surface) => {
    cleanup();
    onComplete(surface);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") finish(null);
  };

  const onBackdrop = () => finish(null);

  for (const btn of surfaceBtns) {
    const s = normalizeSurface(btn.getAttribute("data-rest-surface"));
    if (!s || !allowed.has(s)) continue;
    const fn = () => finish(s);
    btn.addEventListener("click", fn);
    surfaceHandlers.push({ btn, fn });
  }

  document.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", onBackdrop);

  panel.style.visibility = "hidden";
  root.classList.remove("is-hidden");
  root.setAttribute("aria-hidden", "false");

  const firstFocus = surfaceBtns.find((b) => {
    const s = normalizeSurface(b.getAttribute("data-rest-surface"));
    return s && allowed.has(s);
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionAnteriorRestPanel(panel, anchor);
      panel.style.visibility = "visible";
      firstFocus?.focus();
    });
  });
}

function handleRestSuggestionPick(jaw, toothId, pointSurface, anchor) {
  const applySurface = (surface) => {
    const normalized = normalizeSurface(surface);
    if (!normalized) return;
    placeSelectedComponentOnTooth(toothId, { surface: normalized });
    renderJaw(jaw);
  };

  const clicked = normalizeSurface(pointSurface);
  const skipCingulumDialog =
    clicked === "mesial" ||
    clicked === "distal" ||
    state.restSeatCalibrationAcOnly;

  if (!isAnteriorRestSurfaceDialogTooth(toothId) || skipCingulumDialog) {
    applySurface(pointSurface);
    return;
  }

  showAnteriorRestSurfaceDialog(toothId, anchor, (chosen) => {
    if (chosen) applySurface(chosen);
  });
}

// Return true when rest guidance points should be shown in design mode.
function shouldShowRestSuggestions() {
  return state.designMode && isRestComponent(state.selectedComponentId);
}

function shouldShowClaspCircSuggestions() {
  if (!state.designMode) return false;
  return isClaspCircComponent(state.selectedComponentId);
}

function shouldShowPlateSuggestions() {
  if (!state.designMode) return false;
  const selected = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  return Boolean(selected && isPlateComponentId(selected.id));
}

function hasSelectedPlatePlacement(tooth) {
  ensureToothPlacementState(tooth);
  const selected = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (!selected || !isPlateComponentId(selected.id)) return false;
  return tooth.componentPlacements.some((entry) => entry.componentId === selected.id);
}

function handlePlateSuggestionPick(jaw, toothId) {
  placeSelectedComponentOnTooth(toothId, null);
  renderJaw(jaw);
}

function appendPlateSuggestionPoints(group, tooth, toothId, jaw) {
  if (!shouldShowPlateSuggestions()) return;
  if (!tooth.isPresent) return;
  const selected = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (!selected || !isPlateComponentId(selected.id)) return;

  const suggestion = createComponentVisual(selected.id, toothId, jaw);
  if (!suggestion) return;
  const transformCfg = PLATE_SUGGESTION_TRANSFORM_BY_JAW[jaw] || {};
  const suggestionScale = Number(transformCfg.scale) || 0.35;
  const suggestionOffset = transformCfg.offset || { x: 0, y: 0 };
  const sx = Number(suggestionOffset.x) || 0;
  const sy = Number(suggestionOffset.y) || 0;

  const wrapper = svgEl("g", {
    class: hasSelectedPlatePlacement(tooth)
      ? "plate-suggestion-visual is-selected"
      : "plate-suggestion-visual",
    transform: `translate(${sx.toFixed(2)} ${sy.toFixed(2)}) scale(${suggestionScale.toFixed(3)} ${suggestionScale.toFixed(3)})`,
    "data-tooth-id": toothId,
  });
  wrapper.appendChild(suggestion);

  // Tightly-bounded hit target centered on the tooth so clicks never bleed
  // into the visually overlapping plate image of an adjacent tooth.
  const hitTarget = svgEl("circle", {
    cx: "0",
    cy: "0",
    r: "20",
    class: "plate-suggestion-hit-target",
    "data-tooth-id": toothId,
  });
  hitTarget.addEventListener("click", (event) => {
    event.stopPropagation();
    handlePlateSuggestionPick(jaw, toothId);
  });
  wrapper.appendChild(hitTarget);

  group.appendChild(wrapper);
}

// Draw clickable rest guidance points when a rest component is selected.
function appendRestSuggestionPoints(group, tooth, toothId, jaw) {
  if (!shouldShowRestSuggestions()) return;
  if (!tooth.isPresent) return;

  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (!selectedComponent || !isRestComponent(selectedComponent)) return;

  ensureToothPlacementState(tooth);

  let points;
  if (
    state.restSeatCalibrationAcOnly &&
    selectedComponent.id === REST_CALIBRATION_COMPONENT_ID &&
    isAnteriorRestSurfaceDialogTooth(toothId)
  ) {
    points = getCingulumAcSuggestionPointsForTooth(toothId) ?? [];
  } else {
    const allowedSurfaces = new Set(getRestSuggestionSurfaces(selectedComponent.id, toothId));
    points = [...getRestSurfacePointMap(toothId, jaw, selectedComponent.id).values()].filter((point) =>
      allowedSurfaces.has(normalizeSurface(point.surface))
    );
  }
  const radius = getRestSuggestionRadius();
  const { mirrored } = getToothAssetSpec(toothId);

  for (const pointData of points) {
    const surface = normalizeSurface(pointData.surface);
    if (!surface) continue;
    const assetHref = getRestPlacementAssetReference(selectedComponent.id, toothId, surface);
    const imageSize = getRestPlacementImageSize(selectedComponent.id, toothId, surface);
    const restScale = getRestPlacementRenderScale(selectedComponent.id, toothId, surface);

    if (assetHref && imageSize) {
      const width = imageSize.width * restScale;
      const height = imageSize.height * restScale;
      const imageGroup = svgEl("g", {
        transform: `translate(${pointData.x} ${pointData.y}) scale(${mirrored ? -1 : 1} 1)`,
        class: `rest-suggestion-group rest-suggestion-${surface}`,
      });

      imageGroup.appendChild(
        svgEl("image", {
          href: assetHref,
          x: String(-width / 2),
          y: String(-height / 2),
          width: String(width),
          height: String(height),
          preserveAspectRatio: "xMidYMid meet",
          class: `rest-suggestion-image rest-suggestion-${surface}`,
          "data-surface": surface,
        })
      );

      imageGroup.addEventListener("click", (event) => {
        event.stopPropagation();
        handleRestSuggestionPick(jaw, toothId, pointData.surface, {
          clientX: event.clientX,
          clientY: event.clientY
        });
      });

      group.appendChild(imageGroup);
      continue;
    }

    const className = ["rest-suggestion-point", `rest-suggestion-${pointData.surface}`].join(" ");

    const point = svgEl("circle", {
      cx: String(pointData.x),
      cy: String(pointData.y),
      r: String(radius),
      class: className,
      "data-surface": pointData.surface
    });
    point.addEventListener("click", (event) => {
      event.stopPropagation();
      handleRestSuggestionPick(jaw, toothId, pointData.surface, {
        clientX: event.clientX,
        clientY: event.clientY
      });
    });
    group.appendChild(point);
  }
}

function handleClaspCircSuggestionPick(jaw, toothId, surface) {
  const normalized = normalizeSurface(surface);
  if (!normalized) return;
  placeSelectedComponentOnTooth(toothId, { surface: normalized });
  renderJaw(jaw);
}

// Clickable circumferential clasp anchors (separate geometry from rest suggestions).
function appendClaspCircSuggestionPoints(group, tooth, toothId, jaw) {
  if (!shouldShowClaspCircSuggestions()) return;
  if (!tooth.isPresent) return;

  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (!selectedComponent || !isClaspCircComponent(selectedComponent)) return;

  ensureToothPlacementState(tooth);

  const points = getClaspCircSuggestionPointsForTooth(toothId, jaw);
  const radius = getClaspCircSuggestionRadius();

  for (const pointData of points) {
    const surface = normalizeSurface(pointData.surface);
    if (!surface) continue;
    if (hasClaspCircPlacementAtSurface(tooth, surface)) continue;

    const className = ["clasp-suggestion-point", `clasp-suggestion-${surface}`].join(" ");

    const point = svgEl("circle", {
      cx: String(pointData.x),
      cy: String(pointData.y),
      r: String(radius),
      class: className,
      "data-surface": surface,
    });
    point.addEventListener("click", (event) => {
      event.stopPropagation();
      handleClaspCircSuggestionPick(jaw, toothId, surface);
    });
    group.appendChild(point);
  }
}

function hasClaspCircPlacementAtSurface(tooth, surface) {
  ensureToothPlacementState(tooth);
  const targetSurface = normalizeSurface(surface);
  if (!targetSurface) return false;

  return tooth.componentPlacements.some((entry) => {
    const sameSurface = normalizeSurface(entry.surface) === targetSurface;
    if (!sameSurface) return false;
    return isClaspCircComponent(entry.componentId);
  });
}

function showBarSuggestions() {
  if (!state.designMode) return false;
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  return Boolean(sel && isBarComponent(sel));
}

function hasBarPlacementAtSurface(tooth, componentId) {
  ensureToothPlacementState(tooth);
  return tooth.componentPlacements.some(
    (entry) => entry.componentId === componentId && isBarPlacementSurface(entry.surface)
  );
}

// Render both arches.
function renderJaws() {
  renderJaw("upper");
  renderJaw("lower");
}

// Render one arch with PNG jaw + positioned PNG teeth.
function renderJaw(jaw) {
  const config = JAW_BACKGROUND_IMAGES[jaw];
  if (!config) return;
  const svg = document.getElementById(config.svgId);
  if (!svg) return;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", config.viewBox);

  renderArchBackground(svg, jaw);

  const ids = TOOTH_ORDER[jaw];
  ids.forEach((toothId) => {
    const placement = getToothPlacement(jaw, toothId);
    if (!placement) return;
    const calibration = JAW_CALIBRATION[jaw] || EMPTY_JAW_CALIBRATION;
    const point = {
      x: placement.x + calibration.x,
      y: placement.y + calibration.y
    };
    const rotation = placement.rotation + calibration.rotation;
    state.teeth[toothId].center = [Math.round(point.x), Math.round(point.y)];

    const group = svgEl("g", { class: "tooth", "data-tooth-id": toothId, "data-jaw": jaw });
    if (state.locks[jaw]) group.classList.add("is-locked");
    const tooth = state.teeth[toothId];
    applyToothStatusClass(group, tooth);

    if (showBarSuggestions() && tooth.isPresent) {
      const barSel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
      if (
        barSel &&
        getBarSuggestibleToothIdSet(state.teeth, jaw).has(toothId) &&
        !hasBarPlacementAtSurface(tooth, barSel.id)
      ) {
        group.classList.add("tooth-bar-suggestible");
        group.classList.add(`tooth-bar-suggestible--${jaw}`);
      }
    }
    group.setAttribute(
      "transform",
      `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})`
    );

    group.appendChild(
      svgEl("circle", {
        cx: "0",
        cy: "0",
        r: "24",
        class: "tooth-hit-target"
      })
    );

    group.appendChild(createToothVisual(toothId, jaw));
    appendToothComponentVisuals(group, tooth, toothId, jaw);
    appendPlateSuggestionPoints(group, tooth, toothId, jaw);
    appendPlacedRestMarkers(group, tooth, toothId, jaw);
    appendRestSuggestionPoints(group, tooth, toothId, jaw);
    appendClaspCircSuggestionPoints(group, tooth, toothId, jaw);

    const toothClickKey = `mesh-tooth:${jaw}:${toothId}`;
    group.addEventListener("click", () => {
      if (!state.designMode) {
        onToothClick(jaw, toothId);
        return;
      }
      const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
      if (catalogPick && isBarComponent(catalogPick)) {
        const set = getBarSuggestibleToothIdSet(state.teeth, jaw);
        if (!set.has(toothId)) {
          setMessage("Choose a highlighted tooth within two positions of a missing tooth on the arch.", true);
          return;
        }
        const barSurface = getBarPlacementSurfaceForTooth(toothId, jaw, state.teeth);
        if (!barSurface) {
          setMessage("Could not resolve bar type for this tooth.", true);
          return;
        }
        placeSelectedComponentOnTooth(toothId, { surface: barSurface });
        renderJaw(jaw);
        return;
      }
      if (catalogPick && isPlateComponentId(catalogPick.id)) {
        // Plates are handled through plate suggestion visuals only.
        return;
      }
      if (catalogPick && isMeshComponent(catalogPick)) {
        deferMeshInteraction(toothClickKey, () => {
          placeSelectedComponentOnTooth(toothId, null);
          renderJaw(jaw);
        });
        return;
      }
      placeSelectedComponentOnTooth(toothId, null);
      renderJaw(jaw);
    });
    group.addEventListener("dblclick", (event) => {
      if (!state.designMode) {
        return;
      }
      const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
      if (!catalogPick || !isMeshComponent(catalogPick)) {
        return;
      }
      event.preventDefault();
      cancelMeshInteractionDefer(toothClickKey);
      handleMeshToolDoubleClick(meshAnnotationEnv(), jaw, toothId);
    });
    svg.appendChild(group);
  });
}

// Toggle a tooth between present and missing in presence mode.
function toggleToothPresence(tooth, toothId) {
  tooth.isPresent = !tooth.isPresent;
  if (!tooth.isPresent) {
    tooth.status = "missing";
    tooth.components = [];
    tooth.componentPlacements = [];
  } else {
    tooth.status = "presence";
  }
  return `Tooth ${toothId} is now ${tooth.isPresent ? "present" : "missing"}.`;
}

// Toggle a tooth status between the selected marker and presence.
function toggleToothStatus(tooth, toothId, status) {
  if (!tooth.isPresent) {
    tooth.isPresent = true;
  }
  tooth.status = tooth.status === status ? "presence" : status;
  return `Tooth ${toothId} set to ${tooth.status}.`;
}

// Click behavior: apply/toggle selected status on a tooth (design mode handles clicks on the tooth group in renderJaw).
function onToothClick(jaw, toothId) {
  if (state.designMode) {
    return;
  }

  const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (catalogPick && isBarComponent(catalogPick)) {
    setMessage(
      "Bars: lock both arches to enter design mode, then click a highlighted tooth to place. Click a placed bar to remove it. Unlock arches to mark teeth missing.",
      true
    );
    return;
  }

  if (state.locks[jaw]) {
    setMessage(`Cannot edit ${jaw}. Unlock it first.`, true);
    return;
  }

  const tooth = state.teeth[toothId];
  if (!tooth) return;

  if (state.activeStatus === "presence") {
    setMessage(toggleToothPresence(tooth, toothId), false);
    renderJaw(jaw);
    return;
  }

  if (state.activeStatus === "abutment" || state.activeStatus === "compromised") {
    setMessage(toggleToothStatus(tooth, toothId, state.activeStatus), false);
    renderJaw(jaw);
    return;
  }

  tooth.status = "presence";
  renderJaw(jaw);
}

function normalizeSurface(surface) {
  if (typeof surface !== "string") {
    return null;
  }
  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

function ensureToothPlacementState(tooth) {
  if (Array.isArray(tooth.componentPlacements)) return;

  const fallback = Array.isArray(tooth.components) ? tooth.components : [];
  tooth.componentPlacements = fallback.map((componentId) => ({
    componentId,
    surface: null,
  }));
}

function syncToothComponentsFromPlacements(tooth) {
  const placements = Array.isArray(tooth.componentPlacements)
    ? tooth.componentPlacements
    : [];
  tooth.components = [
    ...new Set(
      placements.map((entry) => entry.componentId)
        .filter((componentId) => COMPONENT_BY_ID.has(componentId))
    )
  ];
}

function hasPlacement(tooth, componentId, surface) {
  const targetSurface = normalizeSurface(surface);
  return tooth.componentPlacements.some(
    (entry) =>
      entry.componentId === componentId &&
      normalizeSurface(entry.surface) === targetSurface
  );
}

function addPlacement(tooth, componentId, surface) {
  tooth.componentPlacements.push({
    componentId,
    surface: normalizeSurface(surface),
  });
  syncToothComponentsFromPlacements(tooth);
}

function removePlacement(tooth, componentId, surface) {
  const targetSurface = normalizeSurface(surface);
  tooth.componentPlacements = tooth.componentPlacements.filter(
    (entry) =>
      !(
        entry.componentId === componentId &&
        normalizeSurface(entry.surface) === targetSurface
      )
  );
  syncToothComponentsFromPlacements(tooth);
}

function removePlacementsByComponentIds(tooth, componentIds) {
  const removeSet = new Set(componentIds || []);
  tooth.componentPlacements = tooth.componentPlacements.filter(
    (entry) => !removeSet.has(entry.componentId)
  );
  syncToothComponentsFromPlacements(tooth);
}

// Place or remove the active component on a specific tooth.
function placeSelectedComponentOnTooth(toothId, placementContext = null) {
  const tooth = state.teeth[toothId];
  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");

  if (!selectedComponent) {
    setMessage("Select a component from the catalog first.", true);
    return;
  }

  if (isMajorConnectorComponent(selectedComponent)) {
    setMessage(
      "Major connector art is shown on both arches. Individual tooth placement is not used for majors in this view.",
      true
    );
    return;
  }

  ensureToothPlacementState(tooth);
  syncToothComponentsFromPlacements(tooth);

  const requiresSurface =
    isRestComponent(selectedComponent) || isClaspCircComponent(selectedComponent) || isBarComponent(selectedComponent);
  const surface = normalizeSurface(placementContext?.surface);
  const targetSurface = requiresSurface ? surface : null;

  if (requiresSurface && !targetSurface) {
    if (selectedComponent.id === "rest-onlay") {
      placeSelectedComponentOnTooth(toothId, { surface: "mesial" });
      return;
    }
    if (isClaspCircComponent(selectedComponent)) {
      setMessage(
        `For ${selectedComponent.label}, click a clasp suggestion point (mesial or distal, buccal or lingual).`,
        true
      );
      return;
    }
    if (isBarComponent(selectedComponent)) {
      setMessage(`For ${selectedComponent.label}, click a highlighted tooth next to a missing tooth.`, true);
      return;
    }
    setMessage(
      `For ${selectedComponent.label}, click a rest suggestion point (mesial, distal, or lingual).`,
      true
    );
    return;
  }

  if (hasPlacement(tooth, selectedComponent.id, targetSurface)) {
    removePlacement(tooth, selectedComponent.id, targetSurface);
    setMessage(
      `Removed ${selectedComponent.label}${targetSurface ? ` (${targetSurface})` : ""} from tooth ${toothId}.`,
      false
    );
    return;
  }

  const criteriaResult = assessPlacementCriteria(tooth, selectedComponent, COMPONENT_BY_ID);
  if (criteriaResult.pass) {
    addPlacement(tooth, selectedComponent.id, targetSurface);
    setMessage(
      `Placed ${selectedComponent.label}${targetSurface ? ` (${targetSurface})` : ""} on tooth ${toothId}.`,
      false
    );
    return;
  }

  const { failureData } = criteriaResult;
  if (failureData.actionUponFailure === ACTION_UPON_FAILURE.PREVENT_PLACEMENT) {
    setMessage(failureData.reason, true);
    return;
  }

  if (failureData.actionUponFailure === ACTION_UPON_FAILURE.REMOVE_THEN_PLACE) {
    removePlacementsByComponentIds(tooth, failureData.conflictingComponents || []);
    addPlacement(tooth, selectedComponent.id, targetSurface);
    setMessage(
      `Replaced conflict and placed ${selectedComponent.label}${targetSurface ? ` (${targetSurface})` : ""} on tooth ${toothId}.`,
      false
    );
  }
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
    activeStatus: state.activeStatus,
    teeth,
    arches: {
      upper: TOOTH_ORDER.upper.map((id) => state.teeth[id].center),
      lower: TOOTH_ORDER.lower.map((id) => state.teeth[id].center),
    },
  };
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

// Build the localStorage key for the current case scope.
function getStorageKey() {
  return `dentalAnnotation_${state.encryptedCaseId || "draft"}`;
}

// Draw PNG jaw templates as the full background.
function renderArchBackground(svg, jaw) {
  const background = JAW_BACKGROUND_IMAGES[jaw];
  if (!background) return;

  const baseWidth = 620;
  const baseHeight = 380;
  const scale = JAW_BACKGROUND_SCALE_BY_JAW[jaw] ?? 1;
  const offset = JAW_BACKGROUND_OFFSET_BY_JAW[jaw] || { x: 0, y: 0 };
  const width = baseWidth * scale;
  const height = baseHeight * scale;
  const x = (baseWidth - width) / 2 + offset.x;
  const y = (baseHeight - height) / 2 + offset.y;

  svg.appendChild(
    svgEl("image", {
      href: `${TOOTH_ASSET_BASE}/${background.template}`,
      x: x.toFixed(2),
      y: y.toFixed(2),
      width: width.toFixed(2),
      height: height.toFixed(2),
      preserveAspectRatio: "xMidYMid meet",
      class: "jaw-template",
    })
  );

  if (background.details) {
    svg.appendChild(
      svgEl("image", {
        href: `${TOOTH_ASSET_BASE}/${background.details}`,
        x: x.toFixed(2),
        y: y.toFixed(2),
        width: width.toFixed(2),
        height: height.toFixed(2),
        preserveAspectRatio: "xMidYMid meet",
        class: "jaw-details",
      })
    );
  }
}

// Resolve calibrated placement coordinates for one tooth id.
function getToothPlacement(jaw, toothId) {
  return TOOTH_POSITION_MAP[jaw]?.[toothId] || null;
}

// Normalize external status values to the supported status set.
function normalizeStatus(value) {
  return STATUS_VALUES.includes(value) ? value : null;
}

/** JSON export: missing teeth always `missing`; present teeth never export `missing`. */
function statusJsonForToothRecord(record) {
  if (!record.isPresent) {
    return "missing";
  }
  const st = normalizeStatus(record.status);
  if (st === "missing") {
    return "presence";
  }
  return st || "presence";
}

// Per-tooth scaling for realistic size progression.
function getToothScale(toothId, jaw) {
  const unit = Number(toothId.slice(1));
  let scale = TOOTH_SCALE_BY_UNIT[unit] || 1;
  if (jaw === "lower" && unit <= 2) scale *= 0.92;
  if (jaw === "lower" && unit >= 6) scale *= 0.96;
  return scale;
}

// Map mirrored quadrants to shared source tooth SVG assets.
function getToothAssetSpec(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) {
    return { sourceToothId: "11", mirrored: false };
  }

  const unit = numeric % 10;
  const quadrant = Math.floor(numeric / 10);
  if (quadrant === 2) {
    return { sourceToothId: `1${unit}`, mirrored: true };
  }
  if (quadrant === 3) {
    return { sourceToothId: `4${unit}`, mirrored: true };
  }
  return { sourceToothId: toothId, mirrored: false };
}

// Compose one tooth image with jaw-specific scaling and mirroring.
function createToothVisual(toothId, jaw) {
  const placement = getToothPlacement(jaw, toothId) || {};
  const jawFlipX = JAW_IMAGE_FLIP_X[jaw] ?? 1;
  const flipX = (placement.scaleX ?? 1) * jawFlipX;
  const flipY = placement.scaleY ?? 1;

  const { mirrored, sourceToothId } = getToothAssetSpec(toothId);
  const scaleBoost = TOOTH_SCALE_OVERRIDE[toothId] || 1;
  const base = getToothScale(toothId, jaw) * 0.24 * scaleBoost;

  const scaleX = (mirrored ? -base : base) * flipX;
  const scaleY = base * flipY;

  const visual = svgEl("g", {
    class: "tooth-visual",
    transform: `scale(${scaleX.toFixed(3)} ${scaleY.toFixed(3)})`
  });

  visual.appendChild(
    svgEl("image", {
      href: sourceToothId ? `${TOOTH_ASSET_BASE}/${sourceToothId}.svg` : PRESENCE_TOOTH_ASSET,
      x: String(-TOOTH_IMAGE_HALF_WIDTH),
      y: String(-TOOTH_IMAGE_HALF_HEIGHT),
      width: String(TOOTH_IMAGE_WIDTH),
      height: String(TOOTH_IMAGE_HEIGHT),
      preserveAspectRatio: "xMidYMid meet",
      class: "tooth-image"
    })
  );

  return visual;
}

// Major connector template (upper 11–18.svg) under mesh on missing teeth or plate on present teeth.
function createMajorConnectorVisual(referenceComponentId, toothId, jaw) {
  const connectorHref = getMajorConnectorAssetReference(toothId, jaw);
  if (!connectorHref) return null;

  const placement = getToothPlacement(jaw, toothId) || {};
  const jawFlipX = JAW_IMAGE_FLIP_X[jaw] ?? 1;
  const flipX = (placement.scaleX ?? 1) * jawFlipX;
  const flipY = placement.scaleY ?? 1;

  const { mirrored } = getToothAssetSpec(toothId);
  const isMesh = isMeshComponent(referenceComponentId);
  const isPlate = isPlateComponentId(referenceComponentId);
  if (!isMesh && !isPlate) return null;

  const scaleToothId = isMesh ? meshHoleUniformScaleToothId(jaw) : toothId;
  const scaleBoost = TOOTH_SCALE_OVERRIDE[scaleToothId] || 1;
  const toothScale = COMPONENT_SCALE_BY_TOOTH[scaleToothId] ?? 1;
  const jawScaleMul = isMesh
    ? getMeshPlacementRenderScale(referenceComponentId, toothId, jaw)
    : getPlatePlacementRenderScale(referenceComponentId, toothId, jaw);
  const base = getToothScale(scaleToothId, jaw) * 0.24 * scaleBoost * jawScaleMul * toothScale;

  const scaleX = (mirrored ? -base : base) * flipX;
  const scaleY = base * flipY;

  const meshOffset = isMesh ? getMeshPlacementOffset(referenceComponentId, toothId) : { x: 0, y: 0 };
  const plateOffset = isPlate ? getPlatePlacementOffset(referenceComponentId, toothId) : { x: 0, y: 0 };
  const off = isMesh ? meshOffset : plateOffset;
  const extra = getMajorConnectorPlacementOffset(toothId);
  const ox = (Number.isFinite(off.x) ? off.x : 0) + (Number.isFinite(extra.x) ? extra.x : 0);
  const oy = (Number.isFinite(off.y) ? off.y : 0) + (Number.isFinite(extra.y) ? extra.y : 0);

  const meshSize = isMesh ? getMeshPlacementImageSize(referenceComponentId, toothId) : null;
  const plateSize = isPlate ? getPlatePlacementImageSize(referenceComponentId, toothId) : null;
  const connectorSize = getMajorConnectorPlacementImageSize(toothId);
  const imgW = connectorSize?.width ?? meshSize?.width ?? plateSize?.width ?? COMPONENT_IMAGE_WIDTH;
  const imgH = connectorSize?.height ?? meshSize?.height ?? plateSize?.height ?? COMPONENT_IMAGE_HEIGHT;
  const halfW = imgW / 2;
  const halfH = imgH / 2;

  const connMul = getMajorConnectorRenderScaleMultiplier(toothId, jaw);
  const scaleXConn = scaleX * connMul;
  const scaleYConn = scaleY * connMul;

  const visual = svgEl("g", {
    class: `component-visual major-connector-visual component-ref-${referenceComponentId}`,
    transform: `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${scaleXConn.toFixed(3)} ${scaleYConn.toFixed(3)})`,
  });
  visual.appendChild(
    svgEl("image", {
      href: connectorHref,
      x: String(-halfW),
      y: String(-halfH),
      width: String(imgW),
      height: String(imgH),
      preserveAspectRatio: "xMidYMid meet",
      class: "component-image major-connector-image",
    })
  );
  return visual;
}

// Compose one component image overlay aligned with a given tooth transform.
function createComponentVisual(componentId, toothId, jaw) {
  const assetHref = getComponentAssetReference(componentId, toothId);
  if (!assetHref) {
    return null;
  }

  const placement = getToothPlacement(jaw, toothId) || {};
  const jawFlipX = JAW_IMAGE_FLIP_X[jaw] ?? 1;
  const flipX = (placement.scaleX ?? 1) * jawFlipX;
  const flipY = placement.scaleY ?? 1;

  const { mirrored } = getToothAssetSpec(toothId);
  const isMesh = isMeshComponent(componentId);
  const isPlate = isPlateComponentId(componentId);
  const scaleToothId = isMesh ? meshHoleUniformScaleToothId(jaw) : toothId;
  const scaleBoost = TOOTH_SCALE_OVERRIDE[scaleToothId] || 1;
  const toothScale = COMPONENT_SCALE_BY_TOOTH[scaleToothId] ?? 1;
  const jawScaleMul = isMesh
    ? getMeshPlacementRenderScale(componentId, toothId, jaw)
    : isPlate
      ? getPlatePlacementRenderScale(componentId, toothId, jaw)
      : COMPONENT_SCALE_BY_JAW[jaw] ?? 1;
  const base = getToothScale(scaleToothId, jaw) * 0.24 * scaleBoost * jawScaleMul * toothScale;

  const scaleX = (mirrored ? -base : base) * flipX;
  const scaleY = base * flipY;

  const meshOffset = isMesh ? getMeshPlacementOffset(componentId, toothId) : { x: 0, y: 0 };
  const plateOffset = isPlate ? getPlatePlacementOffset(componentId, toothId) : { x: 0, y: 0 };
  const off = isMesh ? meshOffset : plateOffset;
  const ox = Number.isFinite(off.x) ? off.x : 0;
  const oy = Number.isFinite(off.y) ? off.y : 0;

  const meshSize = isMesh ? getMeshPlacementImageSize(componentId, toothId) : null;
  const plateSize = isPlateComponentId(componentId)
    ? getPlatePlacementImageSize(componentId, toothId)
    : null;
  const imgW = meshSize?.width ?? plateSize?.width ?? COMPONENT_IMAGE_WIDTH;
  const imgH = meshSize?.height ?? plateSize?.height ?? COMPONENT_IMAGE_HEIGHT;
  const halfW = imgW / 2;
  const halfH = imgH / 2;

  const visual = svgEl("g", {
    class: `component-visual component-${componentId}`,
    transform: `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${scaleX.toFixed(3)} ${scaleY.toFixed(3)})`
  });

  const imageClass = isMesh
    ? "component-image mesh-image"
    : isPlate
      ? "component-image plate-image"
      : "component-image";

  visual.appendChild(
    svgEl("image", {
      href: assetHref,
      x: String(-halfW),
      y: String(-halfH),
      width: String(imgW),
      height: String(imgH),
      preserveAspectRatio: "xMidYMid meet",
      class: imageClass,
    })
  );

  return visual;
}

// Convert one status key to title case for UI messages.
function titleCase(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

// Show a status or error message in the save message region.
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

// Create an SVG element with a plain object of attributes.
function svgEl(tagName, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

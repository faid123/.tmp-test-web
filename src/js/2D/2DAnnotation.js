import { lol } from "../../crypt.js";
import {
  ACTION_UPON_FAILURE,
  cancelMeshInteractionDefer,
  COMPONENT_TABS,
  COMPONENT_CATALOG,
  COMPONENT_BY_ID,
  deferMeshInteraction,
  ensureMeshPlacementsOnMissingTeeth,
  getCingulumAcSuggestionPointsForTooth,
  getComponentAssetReference,
  getDefaultMeshIdForDesignMode,
  getMeshPlacementImageSize,
  getMeshPlacementOffset,
  getMeshPlacementRenderScale,
  getRestPlacementAssetReference,
  getRestPlacementImageSize,
  getRestPlacementRenderScale,
  getRestSuggestionSurfaces,
  getRestSuggestionPointsForTooth,
  getRestSuggestionRadius,
  handleMeshCatalogDoubleClickApplyAll,
  handleMeshToolDoubleClick,
  isMeshComponent,
  isRestComponent,
  meshHoleUniformScaleToothId,
  meshSelectionContextFromState,
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
  JAW_BACKGROUND_IMAGES,
  JAW_BACKGROUND_OFFSET_BY_JAW,
  JAW_BACKGROUND_SCALE_BY_JAW,
  JAW_CALIBRATION,
  JAW_IMAGE_FLIP_X,
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

const DEFAULT_COMPONENT_ID = COMPONENT_CATALOG[0]?.id || null;
const REST_CALIBRATION_COMPONENT_ID = "rest-seat";
const FORCE_NON_DESIGN_BOOT = false;

// Runtime annotation state.
const state = {
  encryptedCaseId: "",
  caseIntID: null,
  activeStatus: "presence",
  locks: { upper: false, lower: false },
  teeth: {},
  components: [],
  /** When true (rest-seat calibration boot), anterior rest hints are only cingulum ac_mesial / ac_distal. */
  restSeatCalibrationAcOnly: false
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
  renderJaws()

  try {
    bindStatusPicker();
    bindJawControls();
    bindActionButtons();
    initComponentCatalog();
    loadPreviewImage();
    hydrateFromLocalStorage();
    if (FORCE_NON_DESIGN_BOOT) {
      forceNonDesignBootMode();
    }
    syncDesignModeWithLocks(false);
    renderJaws();
    updateEditModeUI();
  } catch (err) {
    console.error("2D annotation init failed", err);
    setMessage("Loaded jaw view with limited tools. Check console for init error.", true);
  }
}

function forceNonDesignBootMode() {
  state.locks.upper = false;
  state.locks.lower = false;
  state.activeStatus = "presence";
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
  tooth.status = status;
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
  syncDesignModeWithLocks(true);
  renderJaw(jaw);
  if (!state.designMode) {
    setMessage(`${titleCase(jaw)} arch is now ${state.locks[jaw] ? "locked" : "unlocked"}.`, false);
  }
}

// Keep lock button labels in sync with state.
function refreshLockButtons() {
  const upperBtn = document.getElementById("upperLockBtn");
  const lowerBtn = document.getElementById("lowerLockBtn");
  const updateLockButton = (button, isLocked, jaw) => {
    if (!button) return;

    const icon = button.querySelector(".lock-icon");
    const text = button.querySelector(".lock-text");

    if (icon) {
      icon.src = isLocked ? "../../assets/lock.png" : "../../assets/unlock.png";
    }

    if (text) {
      text.textContent = isLocked ? "Locked" : "Unlocked";
    }

    button.classList.toggle("is-locked", isLocked);
    button.setAttribute("aria-label", `${isLocked ? "Unlock" : "Lock"} ${jaw} arch`);
  };

  updateLockButton(upperBtn, state.locks.upper, "upper");
  updateLockButton(lowerBtn, state.locks.lower, "lower");
}

// Clear one arch only when that arch is unlocked.
function clearJaw(jaw) {
  if (state.locks[jaw]) {
    setMessage(`Cannot clear ${jaw}. The arch is locked.`, true);
    return;
  }
  for (const toothId of TOOTH_ORDER[jaw]) {
    resetToothRecord(toothId, "presence");
  }
  renderJaw(jaw);
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
  if (!state.selectedTab) {
    state.selectedTab = COMPONENT_TABS[0]?.id || null;
  }
  if (!state.selectedComponentId) {
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

  state.selectedComponentId = componentId;
  renderJaws();

  if (state.components.includes(componentId)) {
    state.components = state.components.filter((id) => id !== componentId);
    renderComponentCatalog();
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
      ? "Design mode: single-click a mesh icon to select; double-click the icon to set every mesh on the arch to that type. On a tooth: single-click places/removes; double-click changes only that tooth’s mesh."
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

// Draw placed component overlays on missing teeth where mesh assets are available.
function appendToothComponentVisuals(group, tooth, toothId, jaw) {
  if (tooth.isPresent || tooth.components.length === 0) {
    return;
  }

  for (const componentId of tooth.components) {
    const visual = createComponentVisual(componentId, toothId, jaw);
    if (!visual) {
      continue;
    }
    group.appendChild(visual);
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

function shouldHideRestSuggestionForSurface(_tooth, _toothId, pointSurfaceRaw) {
  return !normalizeSurface(pointSurfaceRaw);
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
  if (!tooth.isPresent) return;

  ensureToothPlacementState(tooth);
  if (!tooth.componentPlacements.length) return;

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
  if (!state.designMode) return false;
  if (isRestComponent(state.selectedComponentId)) return true;
  return state.components.some((componentId) => isRestComponent(componentId));
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
    if (shouldHideRestSuggestionForSurface(tooth, toothId, pointData.surface)) {
      continue;
    }

    const surface = normalizeSurface(pointData.surface);
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

// Return whether any rest component exists on the requested tooth surface.
function hasRestPlacementAtSurface(tooth, surface) {
  ensureToothPlacementState(tooth);
  const targetSurface = normalizeSurface(surface);
  if (!targetSurface) return false;

  return tooth.componentPlacements.some((entry) => {
    const sameSurface = normalizeSurface(entry.surface) === targetSurface;
    if (!sameSurface) return false;
    return isRestComponent(entry.componentId);
  });
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
    appendPlacedRestMarkers(group, tooth, toothId, jaw);
    appendRestSuggestionPoints(group, tooth, toothId, jaw);

    const toothClickKey = `mesh-tooth:${jaw}:${toothId}`;
    group.addEventListener("click", () => {
      if (!state.designMode) {
        onToothClick(jaw, toothId);
        return;
      }
      const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
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
  tooth.status = "presence";
  if (!tooth.isPresent) {
    tooth.components = [];
    tooth.componentPlacements = [];
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

function normalizeSurface(surface){
  if (typeof surface !== "string") {
    return null;
  }

  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

function ensureToothPlacementState(tooth){
  if (Array.isArray(tooth.componentPlacements)) return;

  const fallback = Array.isArray(tooth.components) ? tooth.components : [];
  tooth.componentPlacements = fallback.map((componentId) => ({
    componentId,
    surface: null
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

function hasPlacement(tooth, componentId, surface){
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
    surface: normalizeSurface(surface)
  });
  syncToothComponentsFromPlacements(tooth);
}

function removePlacement(tooth, componentId, surface) {
  const targetSurface = normalizeSurface(surface);
  tooth.componentPlacements = tooth.componentPlacements.filter(
    (entry) => !(
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

  ensureToothPlacementState(tooth);
  syncToothComponentsFromPlacements(tooth);

  const requiresSurface = isRestComponent(selectedComponent);
  const surface = normalizeSurface(placementContext?.surface);
  const targetSurface = requiresSurface ? surface : null;

  if (requiresSurface && !targetSurface) {
    if (selectedComponent.id === "rest-onlay") {
      placeSelectedComponentOnTooth(toothId, { surface: "mesial" });
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
      status: normalizeStatus(record.status) || "presence",
      isPresent: record.isPresent,
      componentPlacements: (record.componentPlacements || []).map((entry) => ({
        componentId: entry.componentId,
        surface: normalizeSurface(entry.surface),
      })),
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

    if (Array.isArray(data.components)) {
      state.components = data.components.filter((id) => COMPONENT_BY_ID.has(id));
      state.selectedComponentId = state.components[0] || DEFAULT_COMPONENT_ID;
    }

    if (typeof data.selectedComponentId === "string" && COMPONENT_BY_ID.has(data.selectedComponentId)) {
      state.selectedComponentId = data.selectedComponentId;
      const selectedComp = COMPONENT_BY_ID.get(data.selectedComponentId);
      if (selectedComp?.tab) {
        state.selectedTab = selectedComp.tab;
      }
    }

    updateEditModeUI();

    if (Array.isArray(data.teeth)) {
      for (const item of data.teeth) {
        if (item && state.teeth[item.tooth_id]) {
          const tooth = state.teeth[item.tooth_id];
          tooth.status = normalizeStatus(item.status) || "presence";
          tooth.isPresent = item.isPresent !== false;
          tooth.componentPlacements = [];

          if (Array.isArray(item.componentPlacements)) {
            for (const placement of item.componentPlacements) {
              if (!placement || !COMPONENT_BY_ID.has(placement.componentId)) {
                continue;
              }

              tooth.componentPlacements.push({
                componentId: placement.componentId,
                surface: normalizeSurface(placement.surface),
              });
            }
          } else if (Array.isArray(item.components)) {
            for (const componentId of item.components) {
              if (!COMPONENT_BY_ID.has(componentId)) {
                continue;
              }

              tooth.componentPlacements.push({
                componentId,
                surface: null,
              });
            }
          }

          syncToothComponentsFromPlacements(tooth);
        }
      }
    }
    syncDesignModeWithLocks(false);
    renderComponentCatalog();
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
      class: "jaw-template"
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
        class: "jaw-details"
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
  const scaleToothId = isMesh ? meshHoleUniformScaleToothId(jaw) : toothId;
  const scaleBoost = TOOTH_SCALE_OVERRIDE[scaleToothId] || 1;
  const toothScale = COMPONENT_SCALE_BY_TOOTH[scaleToothId] ?? 1;
  const jawScaleMul = isMesh
    ? getMeshPlacementRenderScale(componentId, toothId, jaw)
    : COMPONENT_SCALE_BY_JAW[jaw] ?? 1;
  const base = getToothScale(scaleToothId, jaw) * 0.24 * scaleBoost * jawScaleMul * toothScale;

  const scaleX = (mirrored ? -base : base) * flipX;
  const scaleY = base * flipY;

  const meshOffset = isMesh ? getMeshPlacementOffset(componentId, toothId) : { x: 0, y: 0 };
  const ox = Number.isFinite(meshOffset.x) ? meshOffset.x : 0;
  const oy = Number.isFinite(meshOffset.y) ? meshOffset.y : 0;

  const meshSize = isMesh ? getMeshPlacementImageSize(componentId, toothId) : null;
  const imgW = meshSize?.width ?? COMPONENT_IMAGE_WIDTH;
  const imgH = meshSize?.height ?? COMPONENT_IMAGE_HEIGHT;
  const halfW = imgW / 2;
  const halfH = imgH / 2;

  const visual = svgEl("g", {
    class: `component-visual component-${componentId}`,
    transform: `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${scaleX.toFixed(3)} ${scaleY.toFixed(3)})`
  });

  visual.appendChild(
    svgEl("image", {
      href: assetHref,
      x: String(-halfW),
      y: String(-halfH),
      width: String(imgW),
      height: String(imgH),
      preserveAspectRatio: "xMidYMid meet",
      class: "component-image mesh-image"
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

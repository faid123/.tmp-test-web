/**
 * 2D arch annotation — entry point.
 *
 * Note: This file also hosts shared 2D annotation state + UI helpers to reduce file count.
 * Other modules import from here; to avoid circular-import TDZ issues we load most feature
 * modules via dynamic import during init.
 */

import { lol } from "../../crypt.js";
import { SVG_NS } from "./constants.js";
import {
  COMPONENT_BY_ID,
  COMPONENT_CATALOG,
  isPlateComponentId,
} from "./components.js";

/** Calibrated tooth-image scale (SVG tooth-local units). */
export const TOOTH_SCALE_BASE = 0.24;

export const DEFAULT_COMPONENT_ID =
  COMPONENT_BY_ID.has("mesh-hole") ? "mesh-hole" : COMPONENT_CATALOG[0]?.id || null;

export const REST_CALIBRATION_COMPONENT_ID = "rest-seat";

// Runtime annotation state.
export const state = {
  encryptedCaseId: "",
  caseIntID: null,
  activeStatus: "presence",
  locks: { upper: false, lower: false },
  /** Both arches locked — component catalog placement mode. */
  designMode: false,
  teeth: {},
  components: [],
  selectedTab: "mesh",
  selectedComponentId: DEFAULT_COMPONENT_ID,
  archOverlayPalatalHoleActive: false,
  restSeatCalibrationAcOnly: false,
  removeComponentMode: false,
  hideLowerPlateVisuals: false,
  suppressArchPlacementSuggestions: false,
  rangeMissingMode: false,
  rangeMissingStartToothId: null,
};

/** Attach transient UI refs here so other modules can mutate without import reassignment issues. */
export const ui = {
  /** @type {HTMLElement | null} */
  presentToothRadialHost: null,
  removeComponentDialogCleanup: null,
  hasInitialized: false,
};

const HISTORY_MAX = 120;
const history = {
  past: [],
  future: [],
  restoring: false,
};

function cloneStateForHistory() {
  return {
    activeStatus: state.activeStatus,
    locks: { upper: Boolean(state.locks?.upper), lower: Boolean(state.locks?.lower) },
    designMode: Boolean(state.designMode),
    teeth: JSON.parse(JSON.stringify(state.teeth || {})),
    components: [...(state.components || [])],
    selectedTab: state.selectedTab,
    selectedComponentId: state.selectedComponentId,
    archOverlayPalatalHoleActive: Boolean(state.archOverlayPalatalHoleActive),
    restSeatCalibrationAcOnly: Boolean(state.restSeatCalibrationAcOnly),
    removeComponentMode: Boolean(state.removeComponentMode),
    hideLowerPlateVisuals: Boolean(state.hideLowerPlateVisuals),
    suppressArchPlacementSuggestions: Boolean(state.suppressArchPlacementSuggestions),
    rangeMissingMode: Boolean(state.rangeMissingMode),
    rangeMissingStartToothId: state.rangeMissingStartToothId,
  };
}

function applyHistorySnapshot(snapshot) {
  state.activeStatus = snapshot.activeStatus;
  state.locks = { upper: Boolean(snapshot.locks?.upper), lower: Boolean(snapshot.locks?.lower) };
  state.designMode = Boolean(snapshot.designMode);
  state.teeth = JSON.parse(JSON.stringify(snapshot.teeth || {}));
  state.components = [...(snapshot.components || [])];
  state.selectedTab = snapshot.selectedTab;
  state.selectedComponentId = snapshot.selectedComponentId;
  state.archOverlayPalatalHoleActive = Boolean(snapshot.archOverlayPalatalHoleActive);
  state.restSeatCalibrationAcOnly = Boolean(snapshot.restSeatCalibrationAcOnly);
  state.removeComponentMode = Boolean(snapshot.removeComponentMode);
  state.hideLowerPlateVisuals = Boolean(snapshot.hideLowerPlateVisuals);
  state.suppressArchPlacementSuggestions = Boolean(snapshot.suppressArchPlacementSuggestions);
  state.rangeMissingMode = Boolean(snapshot.rangeMissingMode);
  state.rangeMissingStartToothId = snapshot.rangeMissingStartToothId ?? null;
}

export function getHistoryStateSignature() {
  return JSON.stringify(cloneStateForHistory());
}

let _autosaveHook = null;
export function registerAutosaveHook(fn) {
  _autosaveHook = fn;
}

function pushHistorySnapshot(snapshot) {
  const nextSig = JSON.stringify(snapshot);
  const last = history.past[history.past.length - 1];
  if (last && JSON.stringify(last) === nextSig) {
    return false;
  }
  history.past.push(snapshot);
  if (history.past.length > HISTORY_MAX) {
    history.past.splice(0, history.past.length - HISTORY_MAX);
  }
  history.future = [];
  return true;
}

export function recordHistoryCheckpoint() {
  if (history.restoring) return false;
  const changed = pushHistorySnapshot(cloneStateForHistory());
  updateUndoRedoButtons();
  return changed;
}

export function recordHistoryIfChanged(beforeSignature) {
  if (history.restoring) return false;
  const afterSnapshot = cloneStateForHistory();
  const afterSignature = JSON.stringify(afterSnapshot);
  if (beforeSignature === afterSignature) {
    return false;
  }
  const changed = pushHistorySnapshot(afterSnapshot);
  updateUndoRedoButtons();
  if (changed) _autosaveHook?.();
  return changed;
}

async function refreshUiAfterHistoryRestore() {
  closePresentToothRadialQuickPick();
  try {
    const [catalog, locks] = await Promise.all([
      import("./annotationCatalog.js"),
      import("./annotationLocks.js"),
    ]);
    catalog.renderComponentCatalog();
    locks.updateEditModeUI();
  } catch (_) {}
  renderJaws();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undoWorkflowBtn");
  const redoBtn = document.getElementById("redoWorkflowBtn");
  if (undoBtn) undoBtn.disabled = history.past.length < 2;
  if (redoBtn) redoBtn.disabled = history.future.length === 0;
}

export async function undoWorkflow() {
  if (history.past.length < 2) {
    setMessage("Nothing to undo.", true);
    return;
  }
  const current = history.past.pop();
  history.future.push(current);
  const target = history.past[history.past.length - 1];
  history.restoring = true;
  try {
    applyHistorySnapshot(target);
  } finally {
    history.restoring = false;
  }
  await refreshUiAfterHistoryRestore();
  updateUndoRedoButtons();
  setMessage("Undo applied.", false);
}

export async function redoWorkflow() {
  if (history.future.length === 0) {
    setMessage("Nothing to redo.", true);
    return;
  }
  const target = history.future.pop();
  history.past.push(target);
  history.restoring = true;
  try {
    applyHistorySnapshot(target);
  } finally {
    history.restoring = false;
  }
  await refreshUiAfterHistoryRestore();
  updateUndoRedoButtons();
  setMessage("Redo applied.", false);
}

function bindHistoryControls() {
  const undoBtn = document.getElementById("undoWorkflowBtn");
  const redoBtn = document.getElementById("redoWorkflowBtn");
  if (undoBtn) undoBtn.addEventListener("click", () => undoWorkflow());
  if (redoBtn) redoBtn.addEventListener("click", () => redoWorkflow());
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const key = String(event.key || "").toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === "z") {
      event.preventDefault();
      undoWorkflow();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (key === "y" || (event.shiftKey && key === "z"))) {
      event.preventDefault();
      redoWorkflow();
    }
  });
}

export function titleCase(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

export function setMessage(message, isError) {
  const el = document.getElementById("saveMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
}

export function downloadJson(fileName, data) {
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

export function svgEl(tagName, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

/** Position a floating panel near an anchor point (clamped to viewport). */
export function positionAnteriorRestPanel(panel, anchor) {
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

// Render bridge (registerRender + mesh env) so render module can register implementations.
let renderJawImpl = () => {};
let renderJawsImpl = () => {};

export function registerRender(fns) {
  renderJawImpl = fns.renderJaw;
  renderJawsImpl = fns.renderJaws;
}

export function renderJaw(jaw) {
  return renderJawImpl(jaw);
}

export function renderJaws() {
  return renderJawsImpl();
}

let meshAnnotationEnvImpl = () => ({ });

export function registerMeshAnnotationEnv(fn) {
  meshAnnotationEnvImpl = fn;
}

export function meshAnnotationEnv() {
  return meshAnnotationEnvImpl();
}

// Present-tooth quick pick (square 2x2 layout).
const QUICK_PICK_SIZE = 104;

function onPresentToothRadialKeydown(ev) {
  if (ev.key === "Escape") {
    closePresentToothRadialQuickPick();
  }
}

export function closePresentToothRadialQuickPick() {
  const host = ui.presentToothRadialHost;
  if (!host) {
    return;
  }
  host.remove();
  ui.presentToothRadialHost = null;
  document.removeEventListener("keydown", onPresentToothRadialKeydown);
}

function firstCatalogIdForTab(tabId) {
  const row = COMPONENT_CATALOG.find((e) => e.tab === tabId);
  return row?.id || null;
}

async function applyQuickPickSelection(tabId, componentId, options = {}) {
  const historyBefore = getHistoryStateSignature();
  try {
    const id = componentId && COMPONENT_BY_ID.has(componentId) ? componentId : firstCatalogIdForTab(tabId);
    if (!id || !COMPONENT_BY_ID.has(id)) {
      setMessage(`No component found for tab "${tabId}".`, true);
      return;
    }
    state.selectedTab = tabId;
    state.selectedComponentId = id;
    state.suppressArchPlacementSuggestions = false;
    // Lazy-load catalog renderer to avoid static import cycle.
    import("./annotationCatalog.js")
      .then(({ renderComponentCatalog }) => renderComponentCatalog())
      .catch(() => {});
    renderJaws();

    const placeOnToothId = options?.placeOnToothId ? String(options.placeOnToothId) : null;
    if (placeOnToothId) {
      if (id === "plate-crossmesh" || id === "plate-prox") {
        const tooth = state.teeth[placeOnToothId];
        if (tooth) {
          const teethModel = await import("./annotationTeethModel.js");
          teethModel.ensureToothPlacementState(tooth);
          tooth.componentPlacements = (tooth.componentPlacements || []).filter(
            (entry) =>
              entry.componentId !== "reciprocating-clasp" &&
              entry.componentId !== "plate-prox" &&
              entry.componentId !== "plate-crossmesh"
          );
          teethModel.addPlacement(tooth, id, null);
          teethModel.syncToothComponentsFromPlacements(tooth);
          const label = COMPONENT_BY_ID.get(id)?.label || id;
          setMessage(`Placed ${label} on tooth ${placeOnToothId}.`, false);
          renderJaws();
          return;
        }
      }
      const placement = await import("./annotationPlacement.js");
      placement.placeSelectedComponentOnTooth(placeOnToothId);
      renderJaws();
      return;
    }

    const label = COMPONENT_BY_ID.get(id)?.label || id;
    setMessage(`${label} selected - use suggestion markers on the arch.`, false);
  } catch (error) {
    console.error("applyQuickPickSelection failed", error);
    setMessage("Could not apply quick pick selection.", true);
    renderJaws();
  } finally {
    recordHistoryIfChanged(historyBefore);
  }
}

/**
 * Present-tooth quick picker: Rest / Bar / Recip / Clasp.
 */
export function showPresentToothRadialQuickPick(toothId, clientX, clientY) {
  closePresentToothRadialQuickPick();

  const backdrop = document.createElement("div");
  backdrop.className = "tooth-radial-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const panel = document.createElement("div");
  panel.className = "tooth-radial-panel";
  const center = document.createElement("div");
  center.className = "tooth-radial-tooth-id";
  center.textContent = String(toothId);
  panel.appendChild(center);

  const mainActions = [
    { label: "REST", tab: "rests", componentId: "rest-seat", pos: "top-left" },
    { label: "BAR", tab: "bars", componentId: "bar-i", pos: "top-right" },
    { label: "RECIP", menu: "recip", pos: "bottom-left" },
    { label: "CLASP", tab: "clasps", componentId: "retainer-clasp", pos: "bottom-right" },
  ];

  const recipActions = [
    {
      label: "RECIP CLASP",
      tab: "clasps",
      componentId: "reciprocating-clasp",
      pos: "top-left",
    },
    { label: "RECIP PLATE", tab: "plate", componentId: "plate-prox", pos: "top-right" },
    { label: "RECIP MESH", tab: "plate", componentId: "plate-crossmesh", pos: "bottom-left" },
    { label: "BACK", menu: "main", pos: "bottom-right", icon: "../../back.png" },
  ];

  function renderQuickPickMenu(menu) {
    panel.querySelectorAll(".tooth-radial-option").forEach((node) => node.remove());
    const actions = menu === "recip" ? recipActions : mainActions;
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tooth-radial-option ${action.pos}`;
      button.setAttribute("aria-label", action.label);
      button.setAttribute("data-tooltip", action.label);
      const iconPath = action.icon || (action.componentId ? COMPONENT_BY_ID.get(action.componentId)?.icon : null);
      if (iconPath) {
        const icon = document.createElement("img");
        icon.className = "tooth-radial-option-icon";
        if (action.menu === "main") {
          icon.classList.add("tooth-radial-option-icon-back");
        }
        icon.src = iconPath;
        icon.alt = action.label;
        button.appendChild(icon);
      } else {
        button.textContent = action.label;
      }
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (action.menu === "recip") {
          renderQuickPickMenu("recip");
          return;
        }
        if (action.menu === "main") {
          renderQuickPickMenu("main");
          return;
        }
        const placeOnToothId =
          action.componentId === "plate-crossmesh" || action.componentId === "plate-prox"
            ? toothId
            : null;
        await applyQuickPickSelection(action.tab, action.componentId, { placeOnToothId });
        closePresentToothRadialQuickPick();
      });
      panel.appendChild(button);
    }
  }

  renderQuickPickMenu("main");

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  ui.presentToothRadialHost = backdrop;

  const left = Math.max(
    8,
    Math.min(clientX - QUICK_PICK_SIZE / 2, window.innerWidth - QUICK_PICK_SIZE - 8)
  );
  const top = Math.max(
    8,
    Math.min(clientY - QUICK_PICK_SIZE / 2, window.innerHeight - QUICK_PICK_SIZE - 8)
  );
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closePresentToothRadialQuickPick();
    }
  });
  document.addEventListener("keydown", onPresentToothRadialKeydown);
}

export function closeRemoveComponentDialog() {
  if (typeof ui.removeComponentDialogCleanup === "function") {
    ui.removeComponentDialogCleanup();
    ui.removeComponentDialogCleanup = null;
  }
}

function formatPlacementSurfaceForRemoveUi(surface) {
  if (!surface) return "";
  return String(surface).replace(/_/g, " ");
}

export async function openRemoveComponentPicker(toothId, jaw, anchorEvent) {
  closeRemoveComponentDialog();
  closePresentToothRadialQuickPick();

  const root = document.getElementById("removeComponentDialog");
  const panel = root?.querySelector(".remove-component-dialog-panel");
  const backdrop = root?.querySelector(".remove-component-dialog-backdrop");
  const listEl = document.getElementById("removeComponentList");
  const titleEl = document.getElementById("removeComponentDialogTitle");
  const hintEl = document.getElementById("removeComponentDialogHint");
  const cancelBtn = document.getElementById("removeComponentDialogCancel");

  const tooth = state.teeth[toothId];
  if (!root || !panel || !backdrop || !listEl || !titleEl || !hintEl || !cancelBtn || !tooth) {
    setMessage("Could not open remove list for this tooth.", true);
    return;
  }

  const teethModel = await import("./annotationTeethModel.js");
  teethModel.ensureToothPlacementState(tooth);
  // Source of truth is `componentPlacements`, but some older/partial states may still only
  // have `components`. Ensure the remove list includes those so the user can recover.
  const placements = (tooth.componentPlacements || []).map((entry, idx) => ({
    ...entry,
    _index: idx,
  }));
  const legacy = Array.isArray(tooth.components) ? tooth.components : [];
  for (const componentId of legacy) {
    if (!placements.some((p) => p.componentId === componentId)) {
      placements.push({ componentId, surface: null, _index: null });
    }
  }

  const visiblePlacements =
    state.hideLowerPlateVisuals && jaw === "lower"
      ? placements.filter((entry) => !isPlateComponentId(entry.componentId))
      : placements;

  titleEl.textContent = `Remove component — Tooth ${toothId}`;
  listEl.innerHTML = "";

  if (visiblePlacements.length === 0) {
    hintEl.textContent = "This tooth has no components to remove.";
    hintEl.classList.remove("is-hidden");
  } else {
    hintEl.textContent = "";
    hintEl.classList.add("is-hidden");
  }

  const itemHandlers = [];

  const cleanup = () => {
    document.removeEventListener("keydown", onKeyDown);
    backdrop.removeEventListener("click", onBackdrop);
    cancelBtn.removeEventListener("click", onCancel);
    for (const h of itemHandlers) {
      h.btn.removeEventListener("click", h.fn);
    }
    panel.style.left = "";
    panel.style.top = "";
    panel.style.visibility = "";
    root.classList.add("is-hidden");
    root.setAttribute("aria-hidden", "true");
    ui.removeComponentDialogCleanup = null;
  };

  const finish = () => cleanup();

  const onKeyDown = (e) => {
    if (e.key === "Escape") finish();
  };
  const onBackdrop = () => finish();
  const onCancel = () => finish();

  visiblePlacements.forEach((entry) => {
    const def = COMPONENT_BY_ID.get(entry.componentId);
    const label = def?.label || entry.componentId;
    const surf = formatPlacementSurfaceForRemoveUi(entry.surface);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "remove-component-item-btn";
    btn.textContent = surf ? `${label} (${surf})` : label;
    const fn = async () => {
      const historyBefore = getHistoryStateSignature();
      const t = state.teeth[toothId];
      if (!t) {
        finish();
        return;
      }
      teethModel.ensureToothPlacementState(t);
      const placement = await import("./annotationPlacement.js");
      if (placement.shouldBlockMajorConnectorRemoval(toothId, entry, state.teeth)) {
        setMessage("Cannot remove this major connector part because it is connected on both sides.", true);
        return;
      }
      let removed = null;
      if (Number.isInteger(entry._index) && entry._index >= 0) {
        removed = teethModel.removePlacementAtIndex(t, entry._index);
      } else {
        const idx = (t.componentPlacements || []).findIndex(
          (p) => p.componentId === entry.componentId && p.surface === entry.surface
        );
        if (idx >= 0) {
          removed = teethModel.removePlacementAtIndex(t, idx);
        }
      }
      placement.applyRemovalSideEffectsForTooth(t, removed);
      const defR = removed ? COMPONENT_BY_ID.get(removed.componentId) : null;
      const name = defR?.label || removed?.componentId || "item";
      setMessage(`Removed ${name} from tooth ${toothId}.`, false);
      finish();
      renderJaws();
      recordHistoryIfChanged(historyBefore);
    };
    btn.addEventListener("click", fn);
    itemHandlers.push({ btn, fn });
    listEl.appendChild(btn);
  });

  document.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", onBackdrop);
  cancelBtn.addEventListener("click", onCancel);

  ui.removeComponentDialogCleanup = cleanup;

  panel.style.visibility = "hidden";
  root.classList.remove("is-hidden");
  root.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionAnteriorRestPanel(panel, anchorEvent);
      panel.style.visibility = "";
      cancelBtn.focus();
    });
  });
}

function initializeCaseIds() {
  const params = new URLSearchParams(window.location.search);
  state.encryptedCaseId = params.get("id") || "";
  let parsedCaseId = null;
  if (state.encryptedCaseId) {
    try {
      const decrypted = Number(lol(state.encryptedCaseId));
      if (Number.isFinite(decrypted)) parsedCaseId = decrypted;
    } catch {
      parsedCaseId = null;
    }
  }
  state.caseIntID = parsedCaseId;
  const label = document.getElementById("caseLabel");
  if (label) label.textContent = `Case: ${state.caseIntID ?? "Unknown"}`;
}

function bindPreviewPanelToggle() {
  const shell = document.querySelector(".annotation-shell");
  const btn = document.getElementById("preview3dMaximizeBtn");
  if (!shell || !btn) return;

  const maxIcon = document.getElementById("preview3dMaximizeIcon");
  const restoreIcon = document.getElementById("preview3dRestoreIcon");

  const applyMode = (mode) => {
    shell.classList.remove("preview-maximized");
    if (mode === "max") {
      shell.classList.add("preview-maximized");
      btn.setAttribute("aria-label", "Restore split view");
      if (maxIcon) maxIcon.style.display = "none";
      if (restoreIcon) restoreIcon.style.display = "";
    } else {
      btn.setAttribute("aria-label", "Maximize 3D panel");
      if (maxIcon) maxIcon.style.display = "";
      if (restoreIcon) restoreIcon.style.display = "none";
    }
    shell._previewMode = mode;
    try {
      localStorage.setItem("previewPanelMode", mode);
    } catch {
      // ignore storage failures
    }
    window.dispatchEvent(new Event("resize"));
  };

  let mode = "split";
  try {
    const stored = localStorage.getItem("previewPanelMode");
    if (stored === "max" || stored === "split") mode = stored;
  } catch {
    mode = "split";
  }
  applyMode(mode);

  btn.addEventListener("click", () => {
    applyMode(shell._previewMode === "max" ? "split" : "max");
  });
}

function bindBackNavigationDialog(locks) {
  const backLink = document.getElementById("backToCaseListBtn");
  const modal = document.getElementById("backConfirmModal");
  const cancelBtn = document.getElementById("backConfirmCancel");
  const backBtn = document.getElementById("backConfirmBack");
  const saveBackBtn = document.getElementById("backConfirmSaveBack");
  if (!backLink || !modal || !cancelBtn || !backBtn || !saveBackBtn || !locks) return;

  const targetHref = backLink.getAttribute("href") || "case_list.html";

  const closeModal = () => {
    modal.classList.add("is-hidden");
    modal.setAttribute("aria-hidden", "true");
  };

  const openModal = () => {
    modal.classList.remove("is-hidden");
    modal.setAttribute("aria-hidden", "false");
    cancelBtn.focus();
  };

  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    openModal();
  });

  cancelBtn.addEventListener("click", closeModal);
  backBtn.addEventListener("click", () => {
    window.location.href = targetHref;
  });
  saveBackBtn.addEventListener("click", () => {
    try {
      localStorage.setItem(locks.getStorageKey(), JSON.stringify(locks.buildPayload()));
    } catch {
      setMessage("Could not save locally. Going back anyway.", true);
    }
    window.location.href = targetHref;
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("is-hidden")) {
      closeModal();
    }
  });
}

function start() {
  if (ui.hasInitialized) return;
  ui.hasInitialized = true;
  init();
}

function init() {
  initializeCaseIds();
  bindPreviewPanelToggle();
  // Load render module early so render bridge + mesh env are registered.
  const renderLoad = import("./annotationRender.js");

  Promise.all([
    renderLoad,
    import("./annotationTeethModel.js"),
    import("./annotationLocks.js"),
    import("./annotationCatalog.js"),
    import("./noticeboard.js"),
  ])
    .then(([, teethModel, locks, catalog, noticeboard]) => {
      teethModel.initializeTeethState();
      locks.restoreAnnotationFromStorage();
      bindHistoryControls();
      locks.bindStatusPicker();
      locks.bindJawControls();
      locks.bindArchWhitespaceDismiss();
      locks.bindRemoveComponentModeBtn();
      locks.bindActionButtons();
      catalog.initComponentCatalog();
      locks.loadPreviewImage();
      locks.syncDesignModeWithLocks(false);
      renderJaws();
      locks.updateEditModeUI();
      bindBackNavigationDialog(locks);
      noticeboard.initNoticeboard();
      history.past = [cloneStateForHistory()];
      history.future = [];
      updateUndoRedoButtons();
    })
    .catch((err) => {
      console.error("2D annotation init failed", err);
      setMessage("Loaded jaw view with limited tools. Check console for init error.", true);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

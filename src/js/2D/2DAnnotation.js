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
  COMPONENT_TABS,
  isMeshComponent,
  isPlateComponentId,
} from "./components.js";
import { fetchJawStruct as apiFetchJawStruct, saveJawStructFromState } from "./jawStructApi.js";
import { decodeJawStructResponse, applyJawStructToState } from "./jawStructCodec.js";
import { logApi } from "../apiLog.js";

/**
 * Autosave to /jawstruct_l2 is off until the save endpoint's name + payload
 * shape are confirmed with the backend. Flip to true once verified.
 */
const ENABLE_JAW_STRUCT_AUTOSAVE = false;

/** Calibrated tooth-image scale (SVG tooth-local units). */
export const TOOTH_SCALE_BASE = 0.24;

export const DEFAULT_COMPONENT_ID =
  COMPONENT_BY_ID.has("mesh-hole") ? "mesh-hole" : COMPONENT_CATALOG[0]?.id || null;

export const REST_CALIBRATION_COMPONENT_ID = "rest-seat";

// Runtime annotation state.
export const state = {
  encryptedCaseId: "",
  caseIntID: null,
  caseName: "",
  caseOwner: "",
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

const _autosaveHooks = [];
export function registerAutosaveHook(fn) {
  if (typeof fn === "function" && !_autosaveHooks.includes(fn)) {
    _autosaveHooks.push(fn);
  }
}
function runAutosaveHooks() {
  for (const fn of _autosaveHooks) {
    try { fn(); } catch (err) { console.warn("autosave hook failed:", err); }
  }
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
  if (changed) runAutosaveHooks();
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
  const undoDisabled = history.past.length < 2;
  const redoDisabled = history.future.length === 0;
  ["undoWorkflowBtn", "footerUndoBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = undoDisabled;
  });
  ["redoWorkflowBtn", "footerRedoBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = redoDisabled;
  });
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
  const footerUndo = document.getElementById("footerUndoBtn");
  const footerRedo = document.getElementById("footerRedoBtn");
  if (footerUndo) footerUndo.addEventListener("click", () => undoWorkflow());
  if (footerRedo) footerRedo.addEventListener("click", () => redoWorkflow());
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

let meshAnnotationEnvImpl = () => ({});

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
    state.suppressArchPlacementSuggestions = false;

    const placeOnToothId = options?.placeOnToothId ? String(options.placeOnToothId) : null;

    // Desktop RECIP MESH / RECIP PLATE quick-picks: place plate-crossmesh /
    // plate-prox directly on the tapped tooth. This shortcut bypasses the
    // generic catalog handler because those two components have a one-tooth
    // placement story that doesn't match the catalog's auto-place-on-arch flow.
    if (placeOnToothId && (id === "plate-crossmesh" || id === "plate-prox")) {
      state.selectedComponentId = id;
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
        import("./annotationCatalog.js")
          .then(({ renderComponentCatalog }) => renderComponentCatalog())
          .catch(() => {});
        renderJaws();
        return;
      }
    }

    // Everything else (majors, meshes, plates picked from the category list,
    // rests, clasps, bars) defers to the catalog's own click handler so each
    // type gets its proper treatment — majors get parts placed on supported
    // teeth via ensureMajorConnectorPlacementsOnSupportedTeethInJaws, meshes
    // join state.components, plates set up the plate-toggle suggestions, etc.
    // Without this, picking a major from the mobile popup only set
    // state.selectedComponentId — the overlay rendered as a preview, and a
    // subsequent whitespace click cleared the selection and made the
    // "appeared" connector vanish because nothing was actually placed.
    const { handleDesignComponentSelect } = await import("./annotationCatalog.js");
    handleDesignComponentSelect(id);
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
 *
 * Touch devices (phones, tablets) get a centered popup sheet with full-size
 * tap targets — the 50%-corner radial wheel has 8.5px labels and tiny hit
 * areas that are unusable with a finger. Mouse-driven desktops keep the
 * compact radial wheel anchored at the click point.
 */
export function showPresentToothRadialQuickPick(toothId, clientX, clientY) {
  closePresentToothRadialQuickPick();

  // Desktop radial: the original 4 hand-curated quick-picks with a RECIP
  // submenu. Tight footprint anchored at the click point.
  const radialMain = [
    { label: "REST", tab: "rests", componentId: "rest-seat", pos: "top-left" },
    { label: "BAR", tab: "bars", componentId: "bar-i", pos: "top-right" },
    { label: "RECIP", menu: "recip", pos: "bottom-left" },
    { label: "CLASP", tab: "clasps", componentId: "retainer-clasp", pos: "bottom-right" },
  ];
  const radialRecip = [
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

  // Mobile sheet: every component category from COMPONENT_TABS (excluding the
  // CASE NOTE form). Tapping a category opens a second view showing every
  // catalog item in that category — tapping an item commits it. The bottom
  // #componentTabs strip is hidden on touch devices since this sheet replaces
  // it (see 2Dannotation.css `@media (pointer: coarse)`).
  const sheetCategories = COMPONENT_TABS
    .filter((tab) => tab.kind !== "form")
    .map((tab) => ({
      label: tab.label,
      tabId: tab.id,
      icon: COMPONENT_BY_ID.get(firstCatalogIdForTab(tab.id))?.icon || null,
    }));

  // `(pointer: coarse)` matches touch/stylus primary input — phones, tablets,
  // and any desktop with a touchscreen as its main pointer. Anything with a
  // mouse keeps the radial wheel.
  const useMobileSheet =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  // Commit a picked component: select it (and place it directly if it's one
  // of the plate-on-tooth variants the catalog handles specially) then close.
  const commit = async (action) => {
    const placeOnToothId =
      action.componentId === "plate-crossmesh" || action.componentId === "plate-prox"
        ? toothId
        : null;
    await applyQuickPickSelection(action.tab, action.componentId, { placeOnToothId });
    closePresentToothRadialQuickPick();
  };

  // Desktop radial uses its own submenu pattern (RECIP → reciprocating items
  // → BACK). The mobile sheet has its own internal two-view nav, so it
  // doesn't need this wrapper.
  const runActionOrNavigate = async (action, renderMenu) => {
    if (action.menu === "recip") return renderMenu("recip");
    if (action.menu === "main") return renderMenu("main");
    await commit(action);
  };

  const backdrop = document.createElement("div");
  backdrop.className = useMobileSheet
    ? "tooth-quickpick-backdrop"
    : "tooth-radial-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const panel = useMobileSheet
    ? buildToothQuickPickSheet(toothId, sheetCategories, commit)
    : buildToothRadialPanel(toothId, radialMain, radialRecip, runActionOrNavigate);

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  ui.presentToothRadialHost = backdrop;

  if (!useMobileSheet) {
    // Anchor the radial wheel at the click point so it appears under the
    // user's cursor; the mobile sheet is centered via CSS instead.
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
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closePresentToothRadialQuickPick();
    }
  });
  document.addEventListener("keydown", onPresentToothRadialKeydown);
}

function buildToothRadialPanel(toothId, mainActions, recipActions, runActionOrNavigate) {
  const panel = document.createElement("div");
  panel.className = "tooth-radial-panel";
  const center = document.createElement("div");
  center.className = "tooth-radial-tooth-id";
  center.textContent = String(toothId);
  panel.appendChild(center);

  const renderMenu = (menu) => {
    panel.querySelectorAll(".tooth-radial-option").forEach((node) => node.remove());
    const actions = menu === "recip" ? recipActions : mainActions;
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tooth-radial-option ${action.pos}`;
      button.setAttribute("aria-label", action.label);
      button.setAttribute("data-tooltip", action.label);
      const iconPath =
        action.icon || (action.componentId ? COMPONENT_BY_ID.get(action.componentId)?.icon : null);
      if (iconPath) {
        const icon = document.createElement("img");
        icon.className = "tooth-radial-option-icon";
        if (action.menu === "main") icon.classList.add("tooth-radial-option-icon-back");
        icon.src = iconPath;
        icon.alt = action.label;
        button.appendChild(icon);
      } else {
        button.textContent = action.label;
      }
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await runActionOrNavigate(action, renderMenu);
      });
      panel.appendChild(button);
    }
  };
  renderMenu("main");
  return panel;
}

function buildToothQuickPickSheet(toothId, categories, commit) {
  const sheet = document.createElement("div");
  sheet.className = "tooth-quickpick-sheet";

  // Header: [back] [title] [close]. Back is hidden in the categories view and
  // appears when the user drills into a category's items.
  const header = document.createElement("div");
  header.className = "tooth-quickpick-header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "tooth-quickpick-back is-hidden";
  backBtn.setAttribute("aria-label", "Back to categories");
  backBtn.innerHTML = "&larr;";

  const heading = document.createElement("span");
  heading.className = "tooth-quickpick-id";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "tooth-quickpick-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = "&times;";
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePresentToothRadialQuickPick();
  });

  header.appendChild(backBtn);
  header.appendChild(heading);
  header.appendChild(closeBtn);
  sheet.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "tooth-quickpick-grid";
  sheet.appendChild(grid);

  // Build one tile (button with icon + label). The click handler is supplied
  // by the caller so the same tile shape works for both category and item
  // rendering. `options.iconAsMask` renders the icon as a CSS mask so mesh
  // SVGs can be recolored (the bundled assets are black-on-transparent, and
  // we want them in the mesh tint).
  const buildTile = (label, iconPath, onClick, options = {}) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tooth-quickpick-tile";
    if (options.tileClass) tile.classList.add(options.tileClass);
    tile.setAttribute("aria-label", label);
    if (iconPath) {
      if (options.iconAsMask) {
        const maskEl = document.createElement("span");
        maskEl.className = "tooth-quickpick-tile-icon tooth-quickpick-tile-icon--mask";
        const maskUrl = `url("${iconPath}")`;
        maskEl.style.setProperty("--tile-icon-mask", maskUrl);
        // iOS Safari needs the prefixed property and is unreliable resolving a
        // var() inside -webkit-mask-image, so set the mask URL directly too.
        maskEl.style.webkitMaskImage = maskUrl;
        maskEl.style.maskImage = maskUrl;
        tile.appendChild(maskEl);
      } else {
        const img = document.createElement("img");
        img.className = "tooth-quickpick-tile-icon";
        img.src = iconPath;
        img.alt = "";
        tile.appendChild(img);
      }
    }
    const text = document.createElement("span");
    text.className = "tooth-quickpick-tile-label";
    text.textContent = label;
    tile.appendChild(text);
    tile.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await onClick();
    });
    return tile;
  };

  const renderCategories = () => {
    heading.textContent = `Tooth ${toothId}`;
    backBtn.classList.add("is-hidden");
    grid.classList.remove("is-items-view");
    grid.innerHTML = "";
    for (const cat of categories) {
      // The mesh category icon is a black/transparent PNG; render it as a mask
      // so it picks up the violet mesh tint (matches the drill-in mesh items).
      const opts =
        cat.tabId === "mesh"
          ? { iconAsMask: true, tileClass: "tooth-quickpick-tile--mesh" }
          : undefined;
      grid.appendChild(buildTile(cat.label, cat.icon, () => renderItems(cat), opts));
    }
  };

  const renderItems = (cat) => {
    heading.textContent = cat.label;
    backBtn.classList.remove("is-hidden");
    grid.classList.add("is-items-view");
    grid.innerHTML = "";
    const items = COMPONENT_CATALOG.filter(
      (entry) => entry.tab === cat.tabId && entry.hidden !== true
    );
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "tooth-quickpick-empty";
      empty.textContent = "No components in this category.";
      grid.appendChild(empty);
      return;
    }
    for (const item of items) {
      const isMesh = isMeshComponent(item.id);
      grid.appendChild(
        buildTile(
          item.label,
          item.icon,
          () => commit({ tab: item.tab, componentId: item.id, label: item.label }),
          isMesh ? { iconAsMask: true, tileClass: "tooth-quickpick-tile--mesh" } : undefined
        )
      );
    }
  };

  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    renderCategories();
  });

  renderCategories();
  return sheet;
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

async function fetchCaseOwner() {
  if (!state.caseIntID) return;
  let loggedInUser = null;
  try {
    const raw = localStorage.getItem("loggedInUser");
    loggedInUser = raw ? JSON.parse(raw) : null;
  } catch {
    loggedInUser = null;
  }
  if (!loggedInUser?.uuid) return;
  try {
    const response = await fetch(
      `https://live.api.smartrpdai.com/api/smartrpd/case/get/${state.caseIntID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
            uuid: loggedInUser.uuid,
            caseIntID: state.caseIntID,
          },
        ]),
      }
    );
    logApi(response, 'POST /case/get/:id');
    if (!response.ok) return;
    const detail = await response.json();
    if (detail?.username) state.caseOwner = detail.username;
    if (detail?.case_id) {
      state.caseName = detail.case_id;
      const label = document.getElementById("caseLabel");
      const caseIntId = detail.id ?? state.caseIntID;
      if (label) {
        label.textContent =
          caseIntId != null
            ?  `UID ${caseIntId} : ${detail.case_id}`
            : `Case: ${detail.case_id}`;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch case owner:", err);
  }
}

// Fetch the jaw struct (L2) for this case and apply it to state.
// Parsing / state-merging / encoding live in ./jawStructCodec.js;
// HTTP transport lives in ./jawStructApi.js. window.__jawStruct is preserved
// for inspection in the browser console.
async function fetchJawStruct() {
  if (!state.caseIntID) return;
  let loggedInUser = null;
  try {
    const raw = localStorage.getItem("loggedInUser");
    loggedInUser = raw ? JSON.parse(raw) : null;
  } catch {
    loggedInUser = null;
  }
  if (!loggedInUser?.uuid) return;

  try {
    const records = await apiFetchJawStruct(state.caseIntID, loggedInUser.uuid);
    if (!Array.isArray(records) || !records.length) return;
    const decoded = decodeJawStructResponse(records);
    window.__jawStruct = decoded.raw;
    if (decoded.upper) applyJawStructToState(decoded.upper, state);
    if (decoded.lower) applyJawStructToState(decoded.lower, state);
    renderJaws();
  } catch (err) {
    console.warn("Failed to fetch jawstruct:", err);
  }
}

// Save current state back to the backend. Off by default — see
// ENABLE_JAW_STRUCT_AUTOSAVE at the top of this file.
async function saveJawStructAutosave() {
  if (!ENABLE_JAW_STRUCT_AUTOSAVE) return;
  if (!state.caseIntID) return;
  let loggedInUser = null;
  try {
    const raw = localStorage.getItem("loggedInUser");
    loggedInUser = raw ? JSON.parse(raw) : null;
  } catch {
    loggedInUser = null;
  }
  if (!loggedInUser?.uuid) return;
  try {
    await saveJawStructFromState(state.caseIntID, loggedInUser.uuid, state);
  } catch (err) {
    console.warn("Failed to save jawstruct:", err);
  }
}
registerAutosaveHook(saveJawStructAutosave);

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

function bindPanelSplitter() {
  const shell = document.querySelector(".annotation-shell");
  const splitter = document.getElementById("panelSplitter");
  if (!shell || !splitter) return;

  const STORAGE_KEY = "previewPanelWidthPct";
  const MIN_PCT = 25;
  const MAX_PCT = 80;

  const applyWidth = (pct) => {
    const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
    shell.style.setProperty("--preview-width", `${clamped}%`);
    return clamped;
  };

  try {
    const stored = parseFloat(localStorage.getItem(STORAGE_KEY) || "");
    if (Number.isFinite(stored)) applyWidth(stored);
  } catch {
    // ignore storage failures
  }

  let dragging = false;

  const onMove = (clientX) => {
    const rect = shell.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(shell).paddingLeft) || 0;
    const usable = rect.width - padding * 2;
    if (usable <= 0) return;
    const offset = clientX - rect.left - padding;
    const pct = (offset / usable) * 100;
    applyWidth(pct);
    window.dispatchEvent(new Event("resize"));
  };

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("is-dragging");
    document.body.classList.remove("is-panel-resizing");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    try {
      const current = shell.style.getPropertyValue("--preview-width").trim();
      const pct = parseFloat(current);
      if (Number.isFinite(pct)) localStorage.setItem(STORAGE_KEY, String(pct));
    } catch {
      // ignore
    }
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    event.preventDefault();
    onMove(event.clientX);
  };

  const onPointerUp = () => stop();

  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (shell.classList.contains("preview-maximized")) return;
    dragging = true;
    splitter.classList.add("is-dragging");
    document.body.classList.add("is-panel-resizing");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    event.preventDefault();
  });

  splitter.addEventListener("keydown", (event) => {
    if (shell.classList.contains("preview-maximized")) return;
    const step = event.shiftKey ? 5 : 2;
    const current = parseFloat(
      shell.style.getPropertyValue("--preview-width") || "38"
    );
    if (event.key === "ArrowLeft") {
      applyWidth(current - step);
      try { localStorage.setItem(STORAGE_KEY, String(current - step)); } catch {}
      window.dispatchEvent(new Event("resize"));
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      applyWidth(current + step);
      try { localStorage.setItem(STORAGE_KEY, String(current + step)); } catch {}
      window.dispatchEvent(new Event("resize"));
      event.preventDefault();
    }
  });

  splitter.addEventListener("dblclick", () => {
    if (shell.classList.contains("preview-maximized")) return;
    applyWidth(38);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.dispatchEvent(new Event("resize"));
  });
}

function bindBackNavigationDialog(locks) {
  const modal = document.getElementById("backConfirmModal");
  const cancelBtn = document.getElementById("backConfirmCancel");
  const backBtn = document.getElementById("backConfirmBack");
  const saveBackBtn = document.getElementById("backConfirmSaveBack");
  if (!modal || !cancelBtn || !backBtn || !saveBackBtn || !locks) return;

  // The original topbar Back link was removed; the Return menu item in the
  // sidebar now triggers this confirm dialog.
  const sidebarReturnBtn = document.getElementById("sidebarReturnBtn");
  const backLink = document.getElementById("backToCaseListBtn");
  const targetHref = backLink?.getAttribute("href") || "case_list.html";

  const closeModal = () => {
    modal.classList.add("is-hidden");
    modal.setAttribute("aria-hidden", "true");
  };

  const openModal = () => {
    modal.classList.remove("is-hidden");
    modal.setAttribute("aria-hidden", "false");
    cancelBtn.focus();
  };

  if (backLink) {
    backLink.addEventListener("click", (event) => {
      event.preventDefault();
      openModal();
    });
  }
  if (sidebarReturnBtn) {
    sidebarReturnBtn.addEventListener("click", () => {
      // Close the sidebar first so the modal isn't competing with it.
      document.getElementById("appSidebar")?.querySelector("[data-sidebar-close]")?.click();
      openModal();
    });
  }

  cancelBtn.addEventListener("click", closeModal);
  backBtn.addEventListener("click", () => {
    window.location.href = targetHref;
  });
  // Persist the current annotation locally + upload the jaw thumbnail. The
  // boolean indicates whether the save part succeeded; thumbnail failures
  // log but don't fail the operation. Shared between the modal's Save &
  // Return button and the sidebar's Save action (which just saves and
  // stays on the page).
  const saveCurrent = async () => {
    let saved = true;
    try {
      localStorage.setItem(locks.getStorageKey(), JSON.stringify(locks.buildPayload()));
    } catch {
      saved = false;
    }
    try {
      setMessage("Uploading thumbnail…", false);
      const ok = await locks.uploadJawPngThumbnail();
      if (!ok) setMessage("Thumbnail upload failed (see console).", true);
    } catch (err) {
      console.warn("[save] thumbnail upload failed", err);
    }
    return saved;
  };
  window.__ann2dSaveCurrent = saveCurrent;

  saveBackBtn.addEventListener("click", async () => {
    saveBackBtn.disabled = true;
    const saved = await saveCurrent();
    if (!saved) setMessage("Could not save locally. Going back anyway.", true);
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
  initAnnFooter();
  init();
}

async function initSidebar() {
  const { setupAppSidebar } = await import("../appSidebar.js");
  const handle = setupAppSidebar({ indexHref: "../../index.html" });

  // Sidebar Save: just runs the save pipeline (no navigation). The full
  // save fn is wired by bindBackNavigationDialog onto window.__ann2dSaveCurrent;
  // try that first, otherwise fall back to clicking the main Save button.
  document.getElementById("sidebarSaveBtn")?.addEventListener("click", async () => {
    handle.close();
    const saveFn = window.__ann2dSaveCurrent;
    if (typeof saveFn === "function") {
      const saved = await saveFn();
      setMessage(saved ? "Saved." : "Save failed locally.", !saved);
    } else {
      document.getElementById("saveAnnotationBtn")?.click();
    }
  });
}

function initAnnFooter() {
  document.body.classList.add("has-ann-footer");

  try {
    const raw = localStorage.getItem("loggedInUser");
    const u = raw ? JSON.parse(raw) : null;
    const userEl = document.getElementById("footerUserName");
    if (userEl) userEl.textContent = u?.username || "—";
  } catch {}

  import("../connectivityIndicator.js").then(({ setupConnectivityIndicator }) => {
    setupConnectivityIndicator(document.getElementById("footerConnection"));
  });

  document.getElementById("footerScreenCaptureBtn")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("request-3d-capture"));
  });

  // "Upload other 3D files": open the upload modal (managed in preview3D.js),
  // which lists the case's extra STLs (jaw_stls_extra_slot_1..4) and handles
  // upload + delete.
  document.getElementById("footerUpload3dBtn")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("request-open-upload-3d"));
  });

  document.getElementById("footerDownloadJawProfileBtn")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("request-download-jaw-profile"));
  });

  // Load Proposal is a placeholder — the action isn't implemented yet, so we
  // just surface a status message rather than wire it to a noop button.
  document.getElementById("loadProposalBtn")?.addEventListener("click", () => {
    setMessage("Load Proposal — coming soon.", false);
  });

  initSidebar();

  // Mirror the existing #caseLabel into the footer's case name slot. The
  // caseLabel text is updated by fetchCaseOwner() asynchronously, so use a
  // MutationObserver instead of patching every write site.
  const caseLabel = document.getElementById("caseLabel");
  const footerCaseName = document.getElementById("footerCaseName");
  if (caseLabel && footerCaseName) {
    const sync = () => {
      const txt = caseLabel.textContent || "";
      footerCaseName.textContent = txt.replace(/^Case:\s*/i, "").trim() || "—";
    };
    sync();
    new MutationObserver(sync).observe(caseLabel, { childList: true, characterData: true, subtree: true });
  }
}

function init() {
  initializeCaseIds();
  bindPreviewPanelToggle();
  bindPanelSplitter();
  // Load render module early so render bridge + mesh env are registered.
  const renderLoad = import("./annotationRender.js");

  Promise.all([
    renderLoad,
    import("./annotationTeethModel.js"),
    import("./annotationLocks.js"),
    import("./annotationCatalog.js"),
    import("./noticeboard.js"),
    import("./clinicalInfo.js"),
  ])
    .then(([, teethModel, locks, catalog, noticeboard, clinicalInfo]) => {
      teethModel.initializeTeethState();
      locks.restoreAnnotationFromStorage();
      bindHistoryControls();
      locks.bindStatusPicker();
      locks.bindJawControls();
      locks.bindArchWhitespaceDismiss();
      locks.bindRemoveComponentModeBtn();
      locks.bindActionButtons();
      catalog.initComponentCatalog();
      fetchCaseOwner().then(() => {
        if (state.caseOwner && state.selectedTab === "case-note") {
          catalog.renderComponentCatalog();
        }
      });
      // Jaw-struct API fetch paused — 2D annotation state is loaded from
      // localStorage via locks.restoreAnnotationFromStorage() above.
      // fetchJawStruct();
      locks.loadPreviewImage();
      locks.syncDesignModeWithLocks(false);
      renderJaws();
      locks.updateEditModeUI();
      bindBackNavigationDialog(locks);
      noticeboard.initNoticeboard();
      clinicalInfo.initClinicalInfo();
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

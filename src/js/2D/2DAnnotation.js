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
};

/** Attach transient UI refs here so other modules can mutate without import reassignment issues. */
export const ui = {
  /** @type {HTMLElement | null} */
  presentToothRadialHost: null,
  removeComponentDialogCleanup: null,
  hasInitialized: false,
};

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

// Present-tooth radial quick pick (Rest / Clasps / Bars).
const RADIAL_SIZE = 160;
const VIEW = 160;
const CX = VIEW / 2;
const CY = VIEW / 2;
const R_OUTER = 76;
const R_INNER = 22;

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

function applyRadialTab(tabId) {
  const id = firstCatalogIdForTab(tabId);
  if (!id || !COMPONENT_BY_ID.has(id)) {
    setMessage(`No component found for tab “${tabId}”.`, true);
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
  const label = COMPONENT_BY_ID.get(id)?.label || id;
  setMessage(`${label} selected — use suggestion markers on the arch.`, false);
}

function sectorPath(startDeg, endDeg) {
  const r0 = R_INNER;
  const r1 = R_OUTER;
  const t0 = (startDeg * Math.PI) / 180;
  const t1 = (endDeg * Math.PI) / 180;
  const x0 = CX + r0 * Math.cos(t0);
  const y0 = CY + r0 * Math.sin(t0);
  const x1 = CX + r1 * Math.cos(t0);
  const y1 = CY + r1 * Math.sin(t0);
  const x2 = CX + r1 * Math.cos(t1);
  const y2 = CY + r1 * Math.sin(t1);
  const x3 = CX + r0 * Math.cos(t1);
  const y3 = CY + r0 * Math.sin(t1);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r1} ${r1} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r0} ${r0} 0 ${large} 0 ${x0.toFixed(2)} ${y0.toFixed(2)} Z`;
}

function labelPoint(angleDeg) {
  const t = (angleDeg * Math.PI) / 180;
  const r = (R_INNER + R_OUTER) / 2;
  return { x: CX + r * Math.cos(t), y: CY + r * Math.sin(t) };
}

/**
 * Present-tooth quick picker: Rest / Clasps / Bars → switches catalog tab and default item.
 */
export function showPresentToothRadialQuickPick(toothId, clientX, clientY) {
  closePresentToothRadialQuickPick();

  const backdrop = document.createElement("div");
  backdrop.className = "tooth-radial-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const panel = document.createElement("div");
  panel.className = "tooth-radial-panel";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${VIEW} ${VIEW}`);
  svg.setAttribute("class", "tooth-radial-svg");

  const sectors = [
    { label: "Rest", tab: "rests", start: 0, end: 120 },
    { label: "Clasps", tab: "clasps", start: 120, end: 240 },
    { label: "Bars", tab: "bars", start: 240, end: 360 },
  ];

  const wedgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wedgeGroup.setAttribute("transform", `rotate(-90 ${CX} ${CY})`);

  for (const s of sectors) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "tooth-radial-sector");
    g.setAttribute("tabindex", "0");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", sectorPath(s.start, s.end));
    g.appendChild(path);
    const mid = (s.start + s.end) / 2;
    const p = labelPoint(mid);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(p.x));
    text.setAttribute("y", String(p.y));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("transform", `rotate(90 ${p.x} ${p.y})`);
    text.setAttribute("class", "tooth-radial-label");
    text.textContent = s.label;
    g.appendChild(text);

    const activate = () => {
      applyRadialTab(s.tab);
      closePresentToothRadialQuickPick();
    };
    g.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate();
    });
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    wedgeGroup.appendChild(g);
  }

  svg.appendChild(wedgeGroup);

  const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  hole.setAttribute("cx", String(CX));
  hole.setAttribute("cy", String(CY));
  hole.setAttribute("r", String(R_INNER));
  hole.setAttribute("class", "tooth-radial-center-box");
  svg.appendChild(hole);

  const idText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  idText.setAttribute("x", String(CX));
  idText.setAttribute("y", String(CY));
  idText.setAttribute("text-anchor", "middle");
  idText.setAttribute("dominant-baseline", "middle");
  idText.setAttribute("class", "tooth-radial-tooth-id");
  idText.textContent = String(toothId);
  svg.appendChild(idText);

  panel.appendChild(svg);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  ui.presentToothRadialHost = backdrop;

  const left = Math.max(8, Math.min(clientX - RADIAL_SIZE / 2, window.innerWidth - RADIAL_SIZE - 8));
  const top = Math.max(8, Math.min(clientY - RADIAL_SIZE / 2, window.innerHeight - RADIAL_SIZE - 8));
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

function start() {
  if (ui.hasInitialized) return;
  ui.hasInitialized = true;
  init();
}

function init() {
  initializeCaseIds();
  // Load render module early so render bridge + mesh env are registered.
  const renderLoad = import("./annotationRender.js");

  try {
    Promise.all([
      renderLoad,
      import("./annotationTeethModel.js"),
      import("./annotationLocks.js"),
      import("./annotationCatalog.js"),
    ])
      .then(([, teethModel, locks, catalog]) => {
        teethModel.initializeTeethState();
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
      })
      .catch((err) => {
        console.error("2D annotation init failed", err);
        setMessage("Loaded jaw view with limited tools. Check console for init error.", true);
      });
  } catch (err) {
    console.error("2D annotation init failed", err);
    setMessage("Loaded jaw view with limited tools. Check console for init error.", true);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

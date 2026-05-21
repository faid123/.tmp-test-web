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
  isPlateComponentId,
  meshSelectionContextFromState,
} from "./components.js";
import { forEachTooth, TOOTH_ORDER } from "./constants.js";
import {
  state,
  DEFAULT_COMPONENT_ID,
  downloadJson,
  getHistoryStateSignature,
  recordHistoryIfChanged,
  registerAutosaveHook,
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
import { loadInteractiveJawPreview, teardown3DPreview } from "./preview3D.js";

// Bind tooth status picker buttons (presence/abutment/compromised).
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

// Bind lock toggle + multi-tooth removal mode button.
export function bindJawControls() {
  const toggle = document.getElementById("jawLockToggleBtn");
  if (toggle) toggle.addEventListener("click", toggleBothJawsLock);
  const rangeBtn = document.getElementById("teethRangeMissingBtn");
  if (rangeBtn) {
    rangeBtn.addEventListener("click", toggleRangeMissingMode);
  }
  bindRangeMissingShiftHotkey();
  bindRangeMissingHintTooltip();
  refreshLockButtons();
  refreshRangeMissingButton();
}

// Desktop selected-mode learning tooltip: the Remove-multiple-teeth button is
// hidden at >=1201px, so teach users about the Shift-range shortcut by showing
// a hint on tooth hover.
const RANGE_HINT_TEXT =
  "Tip: Hold Shift, select one tooth, then click another tooth to remove the entire range.";

function bindRangeMissingHintTooltip() {
  const tooltip = document.createElement("div");
  tooltip.className = "jaw-range-hint-tooltip";
  tooltip.textContent = RANGE_HINT_TEXT;
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);

  let visible = false;
  let currentTooth = null;

  const canShow = () =>
    window.innerWidth > 1200 && !state.designMode && !state.rangeMissingMode;

  const positionTooltip = (clientX, clientY) => {
    const margin = 12;
    const offsetX = 14;
    const offsetY = 18;
    const rect = tooltip.getBoundingClientRect();
    let left = clientX + offsetX;
    let top = clientY + offsetY;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, clientX - rect.width - offsetX);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, clientY - rect.height - offsetY);
    }
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };

  const showTooltip = (clientX, clientY) => {
    if (visible) {
      positionTooltip(clientX, clientY);
      return;
    }
    if (!canShow()) return;
    visible = true;
    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");
    positionTooltip(clientX, clientY);
  };

  const hideTooltip = () => {
    if (!visible) return;
    visible = false;
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
    currentTooth = null;
  };

  const onMouseMove = (event) => {
    const target = event.target;
    const toothEl = target && target.closest ? target.closest(".tooth") : null;
    if (!toothEl) {
      if (visible) hideTooltip();
      return;
    }
    if (toothEl !== currentTooth) {
      currentTooth = toothEl;
      showTooltip(event.clientX, event.clientY);
    } else if (visible) {
      positionTooltip(event.clientX, event.clientY);
    }
  };

  document.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
}

// Hold Shift to temporarily enter "Remove multiple teeth" mode; release to exit.
function bindRangeMissingShiftHotkey() {
  let shiftHeldActivated = false;

  const isTypingTarget = (target) =>
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") ||
      target.isContentEditable);

  const onKeyDown = (event) => {
    if (event.key !== "Shift" || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    if (state.designMode) return;
    if (state.rangeMissingMode) return;
    shiftHeldActivated = true;
    toggleRangeMissingMode();
  };

  const onKeyUp = (event) => {
    if (event.key !== "Shift") return;
    if (!shiftHeldActivated) return;
    shiftHeldActivated = false;
    if (state.rangeMissingMode) toggleRangeMissingMode();
  };

  const onBlur = () => {
    if (!shiftHeldActivated) return;
    shiftHeldActivated = false;
    if (state.rangeMissingMode) toggleRangeMissingMode();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
}

// Update visual active state for multi-tooth removal button.
function refreshRangeMissingButton() {
  const btn = document.getElementById("teethRangeMissingBtn");
  if (!btn) return;
  const active = Boolean(state.rangeMissingMode);
  btn.classList.toggle("is-active", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

// Toggle multi-tooth removal mode used in selected mode.
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

// Bind clear/reset/save action buttons.
function silentSaveToStorage() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(buildPayload()));
  } catch { /* storage full — ignore */ }
}

export function bindActionButtons() {
  const clearTop = document.getElementById("clearTopBtn");
  const clearBottom = document.getElementById("clearBottomBtn");
  const reset = document.getElementById("drawFromScratchBtn");
  const save = document.getElementById("saveAnnotationBtn");
  const saveJpeg = document.getElementById("saveJpegBtn");
  if (clearTop) clearTop.addEventListener("click", () => clearArchButtonClicked("upper"));
  if (clearBottom) clearBottom.addEventListener("click", () => clearArchButtonClicked("lower"));
  if (reset) reset.addEventListener("click", drawFromScratch);
  if (save) save.addEventListener("click", saveAnnotation);
  if (saveJpeg) saveJpeg.addEventListener("click", saveAsJpeg);

  registerAutosaveHook(silentSaveToStorage);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") silentSaveToStorage();
  });
  window.addEventListener("pagehide", silentSaveToStorage);
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
      ? "Unlock for selected mode"
      : "Lock for design mode"
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

  for (const toothId of TOOTH_ORDER[jaw]) {
    const tooth = state.teeth[toothId];
    if (!tooth) continue;
    tooth.componentPlacements = [];
    syncToothComponentsFromPlacements(tooth);
  }

  if (jaw === "upper") {
    state.archOverlayPalatalHoleActive = false;
  }

  renderComponentCatalog();
  renderJaws();
  setMessage(`${titleCase(jaw)} arch cleared.`, false);
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
    // Auto-exit the bars tab/component when the jaws are unlocked.
    // Bar suggestions only render in design mode, so leaving the user
    // parked on a bar component after unlocking is confusing.
    const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
    if (sel && isBarComponent(sel)) {
      state.selectedComponentId = DEFAULT_COMPONENT_ID;
    }
    if (state.selectedTab === "bars") {
      state.selectedTab = "mesh";
    }
    state.suppressArchPlacementSuggestions = false;
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

    // Clicking whitespace cancels the current placement workflow
    // and clears the active component selection.
    state.selectedComponentId = null;
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

export function restoreAnnotationFromStorage() {
  const storageKey = getStorageKey();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (payload?.schema !== "smartrpd.2d-arch.v1") return false;
    // Guard: don't restore a different case's data.
    if (payload.caseIntID != null && payload.caseIntID !== state.caseIntID) return false;

    if (payload.locks) {
      state.locks.upper = Boolean(payload.locks.upper);
      state.locks.lower = Boolean(payload.locks.lower);
    }
    if (payload.editMode != null) state.designMode = Boolean(payload.editMode);
    if (Array.isArray(payload.components)) state.components = payload.components;
    if (payload.selectedComponentId != null) state.selectedComponentId = payload.selectedComponentId;
    if (payload.archOverlayPalatalHoleActive != null) {
      state.archOverlayPalatalHoleActive = Boolean(payload.archOverlayPalatalHoleActive);
    }
    if (payload.activeStatus) state.activeStatus = payload.activeStatus;

    if (Array.isArray(payload.teeth)) {
      for (const saved of payload.teeth) {
        const tooth = state.teeth[saved.tooth_id];
        if (!tooth) continue;
        if (saved.status != null) tooth.status = saved.status;
        if (saved.isPresent != null) tooth.isPresent = Boolean(saved.isPresent);
        if (Array.isArray(saved.componentPlacements)) tooth.componentPlacements = saved.componentPlacements;
        if (Array.isArray(saved.components)) tooth.components = saved.components;
        if (Array.isArray(saved.center)) tooth.center = saved.center;
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchAsDataUrl(href) {
  const absoluteHref = href.startsWith("http") || href.startsWith("data:")
    ? href
    : new URL(href, location.href).href;
  const response = await fetch(absoluteHref);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

let cachedPageCss = "";
function readCssFromStyleSheets() {
  const parts = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = null;
    try {
      rules = sheet.cssRules || sheet.rules;
    } catch {
      rules = null;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (rule && rule.cssText) parts.push(rule.cssText);
    }
  }
  return parts.join("\n");
}

async function fetchPageCss() {
  if (cachedPageCss) return cachedPageCss;

  const fromSheets = readCssFromStyleSheets();
  if (fromSheets.trim()) {
    cachedPageCss = fromSheets;
    return cachedPageCss;
  }

  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const texts = await Promise.all(
    links.map(async (link) => {
      try {
        const response = await fetch(link.href);
        return await response.text();
      } catch {
        return "";
      }
    })
  );
  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((s) => s.textContent || "")
    .join("\n");
  const combined = `${texts.join("\n")}\n${inlineStyles}`;
  if (combined.trim()) cachedPageCss = combined;
  return combined;
}

async function inlineImagesInSvg(svg) {
  const clone = svg.cloneNode(true);

  const cssText = await fetchPageCss();
  if (cssText) {
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = cssText;
    clone.insertBefore(styleEl, clone.firstChild);
  }

  const imageEls = Array.from(clone.querySelectorAll("image"));
  await Promise.all(
    imageEls.map(async (imgEl) => {
      const href =
        imgEl.getAttribute("href") ||
        imgEl.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        "";
      if (!href || href.startsWith("data:")) return;
      try {
        const dataUrl = await fetchAsDataUrl(href);
        imgEl.setAttribute("href", dataUrl);
      } catch (e) {
        console.warn("Could not inline image:", href, e);
      }
    })
  );
  return clone;
}

function svgToImage(inlinedSvg, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    if (Number.isFinite(targetWidth)) {
      inlinedSvg.setAttribute("width", String(Math.round(targetWidth)));
    }
    if (Number.isFinite(targetHeight)) {
      inlinedSvg.setAttribute("height", String(Math.round(targetHeight)));
    }
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(inlinedSvg);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG image load failed")); };
    img.src = url;
  });
}

async function composeJawCanvas(scale = 1) {
  const upperSvg = document.getElementById("upperArchSvg");
  const lowerSvg = document.getElementById("lowerArchSvg");
  if (!upperSvg || !lowerSvg) return null;

  const parseViewBox = (svg) => {
    const parts = (svg.getAttribute("viewBox") || "0 0 620 380").trim().split(/\s+/).map(Number);
    return {
      x: parts[0] || 0,
      y: parts[1] || 0,
      w: parts[2] || 620,
      h: parts[3] || 380,
    };
  };

  const upperDims = parseViewBox(upperSvg);
  const lowerDims = parseViewBox(lowerSvg);
  const gap = 20;
  // Outer aesthetic margin around the composed image.
  const padX = 10;
  const padY = 20;
  // Header band height (in viewBox units) reserved at the top of the canvas
  // for the case ID label.
  const headerH = 36;
  // ViewBox expansion (in viewBox units): individual tooth images placed
  // near the edge of each SVG extend past the original viewBox and get
  // clipped by SVG's default overflow. Expand the cloned SVG's viewBox
  // so those teeth render in full.
  const vbPad = 80;
  const baseW = Math.max(upperDims.w, lowerDims.w) + vbPad * 2;
  const baseH = upperDims.h + lowerDims.h + vbPad * 4 + gap;
  const canvasW = Math.round((baseW + padX * 2) * scale);
  const canvasH = Math.round((baseH + padY * 2 + headerH) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header: case ID text centered at the top.
  const caseLabelText = getCaseLabelTextForExport();
  if (caseLabelText) {
    const fontPx = Math.round(18 * scale);
    ctx.fillStyle = "#1f2937";
    ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(caseLabelText, canvasW / 2, (headerH / 2 + padY / 2) * scale);
  }

  const [upperInlined, lowerInlined] = await Promise.all([
    inlineImagesInSvg(upperSvg),
    inlineImagesInSvg(lowerSvg),
  ]);
  // Expand each cloned SVG's viewBox so edge-clipped content (anterior
  // teeth at the front of each arch) is included in the rendered image.
  upperInlined.setAttribute(
    "viewBox",
    `${upperDims.x - vbPad} ${upperDims.y - vbPad} ${upperDims.w + vbPad * 2} ${upperDims.h + vbPad * 2}`
  );
  lowerInlined.setAttribute(
    "viewBox",
    `${lowerDims.x - vbPad} ${lowerDims.y - vbPad} ${lowerDims.w + vbPad * 2} ${lowerDims.h + vbPad * 2}`
  );

  const upperRenderW = upperDims.w + vbPad * 2;
  const upperRenderH = upperDims.h + vbPad * 2;
  const lowerRenderW = lowerDims.w + vbPad * 2;
  const lowerRenderH = lowerDims.h + vbPad * 2;

  const [upperImg, lowerImg] = await Promise.all([
    svgToImage(upperInlined, upperRenderW * scale, upperRenderH * scale),
    svgToImage(lowerInlined, lowerRenderW * scale, lowerRenderH * scale),
  ]);
  // Center each jaw horizontally within the padded canvas; reserve headerH
  // at the top for the case ID label, then pad/draw both jaws below it.
  const upperX = (padX + (baseW - upperRenderW) / 2) * scale;
  const upperY = (padY + headerH) * scale;
  const lowerX = (padX + (baseW - lowerRenderW) / 2) * scale;
  const lowerY = (padY + headerH + upperRenderH + gap) * scale;
  ctx.drawImage(upperImg, upperX, upperY, upperRenderW * scale, upperRenderH * scale);
  ctx.drawImage(lowerImg, lowerX, lowerY, lowerRenderW * scale, lowerRenderH * scale);
  return canvas;
}

// Resolve the case-id text to render on the exported JPEG. Prefer the on-screen
// label so the file matches what the user sees; fall back to state.
function getCaseLabelTextForExport() {
  const labelEl = document.getElementById("caseLabel");
  const labelText = (labelEl?.textContent || "").trim();
  if (labelText && labelText !== "Case: Unknown") {
    return labelText.replace(/^Case:\s*/i, "");
  }
  if (state.caseIntID != null && state.caseName) {
    return `UID ${state.caseIntID} : ${state.caseName}`;
  }
  if (state.caseName) return state.caseName;
  if (state.caseIntID != null) return `UID ${state.caseIntID}`;
  return "";
}

export async function captureJawJpegDataUrl(quality = 0.92, scale = 3) {
  const canvas = await composeJawCanvas(scale);
  if (!canvas) return null;
  return canvas.toDataURL("image/jpeg", quality);
}

export async function saveAsJpeg() {
  try {
    setMessage("Exporting JPEG…", false);
    const canvas = await composeJawCanvas(3);
    if (!canvas) {
      setMessage("Cannot find jaw SVGs to export.", true);
      return;
    }
    const jpegUrl = canvas.toDataURL("image/jpeg", 0.92);
    const fileName = `case_${state.caseIntID ?? "unknown"}_arch_annotation.jpg`;

    const a = document.createElement("a");
    a.href = jpegUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    const uploaded = await uploadAnnotationJpegToCase(jpegUrl, fileName);
    if (uploaded) {
      setMessage("Arch annotation saved as JPEG and uploaded to case.", false);
    } else {
      setMessage("Arch annotation saved as JPEG (upload skipped).", false);
    }
  } catch (err) {
    console.error("JPEG export failed", err);
    setMessage("Failed to export as JPEG.", true);
  }
}

// Parse the case_id string out of the topbar label (e.g. "UID 2014 : case_04").
function deriveCaseNameFromLabel() {
  const label = document.getElementById("caseLabel");
  if (!label) return "";
  const text = label.textContent || "";
  const colonMatch = text.match(/:\s*(.+)$/);
  if (colonMatch) return colonMatch[1].trim();
  const caseMatch = text.match(/^Case:\s*(.+)$/i);
  if (caseMatch) return caseMatch[1].trim();
  return "";
}

// Upload the JPEG export as a reference image on the current case so it shows
// up in the case-detail thumbnail panel and is preserved server-side.
async function uploadAnnotationJpegToCase(dataUrl, fileName) {
  if (!state.caseIntID) {
    console.warn("[saveAsJpeg] Skipped upload: no caseIntID");
    return false;
  }
  const caseName = state.caseName || deriveCaseNameFromLabel();
  if (!caseName) {
    console.warn("[saveAsJpeg] Skipped upload: case name unknown");
    return false;
  }

  let loggedInUser = null;
  try {
    const raw = localStorage.getItem("loggedInUser");
    loggedInUser = raw ? JSON.parse(raw) : null;
  } catch {
    console.warn("[saveAsJpeg] Skipped upload: bad loggedInUser");
    return false;
  }
  if (!loggedInUser?.uuid) {
    console.warn("[saveAsJpeg] Skipped upload: not logged in");
    return false;
  }

  const payload = [
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: loggedInUser.uuid,
      caseIntID: state.caseIntID,
    },
    {
      case_id: caseName,
      image_name: fileName,
      image_data: dataUrl,
    },
  ];

  try {
    const res = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/referenceimages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const bodyText = await res.text().catch(() => "");
    console.log("[saveAsJpeg] referenceimages POST", res.status, bodyText.slice(0, 300));
    if (!res.ok) return false;
    return true;
  } catch (err) {
    console.warn("[saveAsJpeg] referenceimages POST error", err);
    return false;
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
  const area = document.getElementById("imagePreviewArea");
  if (!img || !fallback || !area) return;

  if (!state.encryptedCaseId) {
    fallback.style.display = "block";
    img.style.display = "none";
    teardown3DPreview();
    return;
  }

  loadInteractiveJawPreview(area).then((loaded3D) => {
    if (loaded3D) {
      img.style.display = "none";
      fallback.style.display = "none";
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
  }).catch((err) => {
    console.error("3D preview load failed", err);
    teardown3DPreview();
    const localImage = localStorage.getItem(`annotateBackground_${state.encryptedCaseId}`);
    if (localImage) {
      img.src = localImage;
      img.style.display = "block";
      fallback.style.display = "none";
      return;
    }
    fallback.style.display = "block";
    img.style.display = "none";
  });
}

export function getStorageKey() {
  return `dentalAnnotation_${state.encryptedCaseId || "draft"}`;
}

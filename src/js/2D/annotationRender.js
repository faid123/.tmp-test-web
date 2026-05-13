import {
  cancelMeshInteractionDefer,
  COMPONENT_BY_ID,
  deferMeshInteraction,
  hasMissingTeethOnBothSidesForBar,
  getBarPlacementSurfaceForTooth,
  getBarSuggestibleToothIdSet,
  handleMeshToolDoubleClick,
  isBarComponent,
  isClaspComponent,
  isMajorConnectorComponent,
  isMeshComponent,
  isPlateComponentId,
  pruneInvalidMajorConnectorPlacementsInJaw,
  isRestComponent,
} from "./components.js";
import { EMPTY_JAW_CALIBRATION, JAW_BACKGROUND_IMAGES, JAW_BACKGROUND_OFFSET_BY_JAW, JAW_BACKGROUND_SCALE_BY_JAW, JAW_CALIBRATION, TOOTH_ASSET_BASE, TOOTH_ORDER } from "./constants.js";
import {
  getHistoryStateSignature,
  state,
  svgEl,
  setMessage,
  recordHistoryIfChanged,
  registerRender,
  registerMeshAnnotationEnv,
  meshAnnotationEnv,
  showPresentToothRadialQuickPick,
  openRemoveComponentPicker,
} from "./2DAnnotation.js";
import { renderComponentCatalog } from "./annotationCatalog.js";
import { placeSelectedComponentOnTooth } from "./annotationPlacement.js";
import {
  getToothPlacement,
  toggleToothPresence,
  toggleToothStatus,
} from "./annotationTeethModel.js";
import {
  appendRetainerClaspSuggestionPoints,
  appendPalatalBarArchOverlay,
  appendPalatalPlateArchOverlay,
  appendPalatalHoleArchOverlay,
  appendPalatalStrapArchOverlay,
  appendPlacedComponentMarkers,
  appendPlateSuggestionPoints,
  appendRestSuggestionPoints,
  appendToothComponentVisuals,
  appendToothPlateComponentVisuals,
  applyToothStatusClass,
  createToothVisual,
  hasBarPlacementAtSurface,
  showBarSuggestions,
} from "./annotationVisuals.js";

// Render jaw background templates for upper/lower arch SVG.
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

function getOppositeBarSurface(surface) {
  const s = String(surface || "").toLowerCase();
  if (s.endsWith("_mesial")) return s.replace(/_mesial$/, "_distal");
  if (s.endsWith("_distal")) return s.replace(/_distal$/, "_mesial");
  return null;
}

// Render both arches.
export function renderJaws() {
  renderJaw("upper");
  renderJaw("lower");
}

// Render one jaw: teeth, overlays, and click handlers.
export function renderJaw(jaw) {
  const config = JAW_BACKGROUND_IMAGES[jaw];
  if (!config) return;
  const svg = document.getElementById(config.svgId);
  if (!svg) return;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", config.viewBox);

  renderArchBackground(svg, jaw);

  const ids = TOOTH_ORDER[jaw];
  pruneInvalidMajorConnectorPlacementsInJaw(state.teeth, COMPONENT_BY_ID, jaw);
  ids.forEach((toothId) => {
    const placement = getToothPlacement(jaw, toothId);
    if (!placement) return;
    const calibration = JAW_CALIBRATION[jaw] || EMPTY_JAW_CALIBRATION;
    const point = {
      x: placement.x + calibration.x,
      y: placement.y + calibration.y,
    };
    const rotation = placement.rotation + calibration.rotation;
    state.teeth[toothId].center = [Math.round(point.x), Math.round(point.y)];

    const group = svgEl("g", { class: "tooth", "data-tooth-id": toothId, "data-jaw": jaw });
    if (state.locks[jaw]) group.classList.add("is-locked");
    const tooth = state.teeth[toothId];
    applyToothStatusClass(group, tooth);
    if (!state.designMode && state.rangeMissingMode && state.rangeMissingStartToothId === toothId) {
      group.classList.add("tooth-range-selected");
    }

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
        class: "tooth-hit-target",
      })
    );

    group.appendChild(createToothVisual(toothId, jaw));
    appendToothComponentVisuals(group, tooth, toothId, jaw);
    // Plates should render above tooth bitmap, but below placed clasps/markers.
    appendToothPlateComponentVisuals(group, tooth, toothId, jaw);
    appendPlateSuggestionPoints(group, tooth, toothId, jaw);
    appendPlacedComponentMarkers(group, tooth, toothId, jaw);
    appendRestSuggestionPoints(group, tooth, toothId, jaw);
    appendRetainerClaspSuggestionPoints(group, tooth, toothId, jaw);

    const toothClickKey = `mesh-tooth:${jaw}:${toothId}`;
    group.addEventListener("click", (event) => {
      if (!state.designMode && state.rangeMissingMode && event.detail > 1) {
        return;
      }
      if (!state.designMode) {
        onToothClick(jaw, toothId);
        return;
      }
      if (state.removeComponentMode) {
        event.stopPropagation();
        openRemoveComponentPicker(toothId, jaw, event);
        return;
      }
      const hadSuppressedHints = state.suppressArchPlacementSuggestions;
      state.suppressArchPlacementSuggestions = false;
      const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
      const suggestionModeActive = Boolean(
        state.designMode &&
          catalogPick &&
          (
            (isRestComponent(catalogPick) && catalogPick.id !== "rest-onlay") ||
            isClaspComponent(catalogPick) ||
            isPlateComponentId(catalogPick.id) ||
            catalogPick.tab === "assembly" ||
            (isBarComponent(catalogPick) && showBarSuggestions())
          )
      );
      if (catalogPick && isPlateComponentId(catalogPick.id)) {
        if (hadSuppressedHints) renderJaw(jaw);
        return;
      }
      if (tooth.isPresent) {
        if (catalogPick?.id === "rest-onlay") {
          placeSelectedComponentOnTooth(toothId, null);
          renderJaw(jaw);
          return;
        }
        if (catalogPick && isBarComponent(catalogPick)) {
          const set = getBarSuggestibleToothIdSet(state.teeth, jaw);
          if (set.has(toothId)) {
            const barSurface = getBarPlacementSurfaceForTooth(toothId, jaw, state.teeth);
            if (!barSurface) {
              setMessage("Could not resolve bar type for this tooth.", true);
              if (hadSuppressedHints) renderJaw(jaw);
              return;
            }
            const existing = (tooth.componentPlacements || []).find(
              (entry) => entry.componentId === catalogPick.id && String(entry.surface || "").startsWith("bar_")
            );
            const canSwitchSide = hasMissingTeethOnBothSidesForBar(toothId, jaw, state.teeth);
            if (existing && !canSwitchSide) {
              setMessage("Bar side switch requires missing teeth on both sides of this anchor tooth.", true);
              renderJaw(jaw);
              return;
            }
            const surfaceToPlace = existing
              ? (canSwitchSide ? (getOppositeBarSurface(existing.surface) || barSurface) : String(existing.surface))
              : barSurface;
            placeSelectedComponentOnTooth(toothId, { surface: surfaceToPlace });
            renderJaw(jaw);
            return;
          }
        }
        if (!catalogPick || !suggestionModeActive) {
          showPresentToothRadialQuickPick(toothId, event.clientX, event.clientY);
          if (hadSuppressedHints) renderJaw(jaw);
          return;
        }
      }
      if (catalogPick && isBarComponent(catalogPick)) {
        const set = getBarSuggestibleToothIdSet(state.teeth, jaw);
        if (!set.has(toothId)) {
          setMessage(
            "Choose a highlighted tooth within two positions of a missing tooth on the arch.",
            true
          );
          if (hadSuppressedHints) renderJaw(jaw);
          return;
        }
        const barSurface = getBarPlacementSurfaceForTooth(toothId, jaw, state.teeth);
        if (!barSurface) {
          setMessage("Could not resolve bar type for this tooth.", true);
          if (hadSuppressedHints) renderJaw(jaw);
          return;
        }
        const existing = (tooth.componentPlacements || []).find(
          (entry) => entry.componentId === catalogPick.id && String(entry.surface || "").startsWith("bar_")
        );
        const canSwitchSide = hasMissingTeethOnBothSidesForBar(toothId, jaw, state.teeth);
        if (existing && !canSwitchSide) {
          setMessage("Bar side switch requires missing teeth on both sides of this anchor tooth.", true);
          renderJaw(jaw);
          return;
        }
        const surfaceToPlace = existing
          ? (canSwitchSide ? (getOppositeBarSurface(existing.surface) || barSurface) : String(existing.surface))
          : barSurface;
        placeSelectedComponentOnTooth(toothId, { surface: surfaceToPlace });
        renderJaw(jaw);
        return;
      }
      if (catalogPick && isMeshComponent(catalogPick)) {
        if (hadSuppressedHints) renderJaw(jaw);
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
      if (!state.designMode && state.rangeMissingMode) {
        const historyBefore = getHistoryStateSignature();
        event.preventDefault();
        markToothMissing(toothId);
        state.rangeMissingStartToothId = null;
        renderJaw(jaw);
        setMessage(`Tooth ${toothId} marked missing. Range mode still active.`, false);
        recordHistoryIfChanged(historyBefore);
        return;
      }
      if (!state.designMode) {
        return;
      }
      if (state.removeComponentMode) {
        event.preventDefault();
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

  if (jaw === "upper") {
    appendPalatalHoleArchOverlay(svg);
    appendPalatalBarArchOverlay(svg);
    appendPalatalPlateArchOverlay(svg);
    appendPalatalStrapArchOverlay(svg);
  }
}

// Handle tooth click in selected mode (status/range) and block in design mode.
export function onToothClick(jaw, toothId) {
  const historyBefore = getHistoryStateSignature();
  try {
  if (state.rangeMissingMode && !state.designMode) {
    handleRangeMissingToothClick(jaw, toothId);
    return;
  }

  if (state.designMode) {
    return;
  }

  const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (catalogPick && isBarComponent(catalogPick)) {
    setMessage(
      "Bars: click a highlighted tooth to place. Click a placed bar to remove it.",
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
  } finally {
    recordHistoryIfChanged(historyBefore);
  }
}

// Mark one tooth as missing and clear its components.
function markToothMissing(toothId) {
  const tooth = state.teeth[toothId];
  if (!tooth) return;
  tooth.isPresent = false;
  tooth.status = "missing";
  tooth.components = [];
  tooth.componentPlacements = [];
}

// Range-missing flow: first click sets start, second click applies missing span.
function handleRangeMissingToothClick(jaw, toothId) {
  const historyBefore = getHistoryStateSignature();
  const ids = TOOTH_ORDER[jaw] || [];
  const start = state.rangeMissingStartToothId;
  if (!start) {
    state.rangeMissingStartToothId = toothId;
    renderJaw(jaw);
    setMessage(`Range start set at tooth ${toothId}. Select end tooth.`, false);
    return;
  }
  if (!ids.includes(start) || !ids.includes(toothId)) {
    setMessage("Range selection must stay on the same arch.", true);
    state.rangeMissingStartToothId = toothId;
    return;
  }
  const startIndex = ids.indexOf(start);
  const endIndex = ids.indexOf(toothId);
  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);
  for (let i = lo; i <= hi; i += 1) {
    markToothMissing(ids[i]);
  }
  state.rangeMissingStartToothId = null;
  renderJaw(jaw);
  setMessage(`Teeth ${ids[lo]} to ${ids[hi]} marked missing. Range mode still active.`, false);
  recordHistoryIfChanged(historyBefore);
}

registerRender({ renderJaw, renderJaws });

registerMeshAnnotationEnv(() => ({
  designMode: state.designMode,
  state,
  componentById: COMPONENT_BY_ID,
  notify: setMessage,
  redrawCatalog: renderComponentCatalog,
  redrawJaws: renderJaws,
  redrawJaw: renderJaw,
  placeSelectedOnTooth: placeSelectedComponentOnTooth,
}));

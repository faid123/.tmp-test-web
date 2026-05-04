import {
  cancelMeshInteractionDefer,
  COMPONENT_BY_ID,
  deferMeshInteraction,
  getBarPlacementSurfaceForTooth,
  getBarSuggestibleToothIdSet,
  handleMeshToolDoubleClick,
  isBarComponent,
  isMajorConnectorComponent,
  isMeshComponent,
  isPlateComponentId,
} from "./components.js";
import { EMPTY_JAW_CALIBRATION, JAW_BACKGROUND_IMAGES, JAW_BACKGROUND_OFFSET_BY_JAW, JAW_BACKGROUND_SCALE_BY_JAW, JAW_CALIBRATION, TOOTH_ASSET_BASE, TOOTH_ORDER } from "./constants.js";
import { state } from "./annotationState.js";
import { svgEl, setMessage } from "./annotationDom.js";
import { registerRender } from "./annotationRenderBridge.js";
import { registerMeshAnnotationEnv, meshAnnotationEnv } from "./annotationMeshEnv.js";
import { renderComponentCatalog } from "./annotationCatalog.js";
import { ensureMajorCatalogPickForTooth } from "./annotationMajorPick.js";
import { placeSelectedComponentOnTooth } from "./annotationPlacement.js";
import { showPresentToothRadialQuickPick } from "./annotationRadial.js";
import { openRemoveComponentPicker } from "./annotationRemove.js";
import {
  getToothPlacement,
  toggleToothPresence,
  toggleToothStatus,
} from "./annotationTeethModel.js";
import {
  appendClaspCircSuggestionPoints,
  appendPalatalBarArchOverlay,
  appendPalatalHoleArchOverlay,
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

export function renderJaws() {
  renderJaw("upper");
  renderJaw("lower");
}

export function renderJaw(jaw) {
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
      y: placement.y + calibration.y,
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
        class: "tooth-hit-target",
      })
    );

    group.appendChild(createToothVisual(toothId, jaw));
    appendToothComponentVisuals(group, tooth, toothId, jaw);
    appendPlateSuggestionPoints(group, tooth, toothId, jaw);
    appendPlacedComponentMarkers(group, tooth, toothId, jaw);
    appendRestSuggestionPoints(group, tooth, toothId, jaw);
    appendClaspCircSuggestionPoints(group, tooth, toothId, jaw);

    const toothClickKey = `mesh-tooth:${jaw}:${toothId}`;
    group.addEventListener("click", (event) => {
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
      const beforeSel = state.selectedComponentId;
      if (state.selectedTab === "major") {
        ensureMajorCatalogPickForTooth(toothId);
        if (state.selectedComponentId !== beforeSel) {
          renderComponentCatalog();
        }
      }
      const catalogPick = COMPONENT_BY_ID.get(state.selectedComponentId || "");
      if (catalogPick && isPlateComponentId(catalogPick.id)) {
        if (hadSuppressedHints) renderJaw(jaw);
        return;
      }
      if (tooth.isPresent) {
        if (catalogPick && isBarComponent(catalogPick)) {
          const set = getBarSuggestibleToothIdSet(state.teeth, jaw);
          if (set.has(toothId) && !hasBarPlacementAtSurface(tooth, catalogPick.id)) {
            const barSurface = getBarPlacementSurfaceForTooth(toothId, jaw, state.teeth);
            if (!barSurface) {
              setMessage("Could not resolve bar type for this tooth.", true);
              if (hadSuppressedHints) renderJaw(jaw);
              return;
            }
            placeSelectedComponentOnTooth(toothId, { surface: barSurface });
            renderJaw(jaw);
            return;
          }
        }
        if (!catalogPick || !isMajorConnectorComponent(catalogPick)) {
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
        placeSelectedComponentOnTooth(toothId, { surface: barSurface });
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

  // Plates after all tooth bodies/majors so wide lower major segments (e.g. lingual bar) do not
  // occlude neighboring teeth' plates.
  ids.forEach((toothId) => {
    const placement = getToothPlacement(jaw, toothId);
    if (!placement) return;
    const tooth = state.teeth[toothId];
    if (!tooth?.isPresent) return;
    const calibration = JAW_CALIBRATION[jaw] || EMPTY_JAW_CALIBRATION;
    const point = {
      x: placement.x + calibration.x,
      y: placement.y + calibration.y,
    };
    const rotation = placement.rotation + calibration.rotation;
    const plateOverlay = svgEl("g", {
      class: "tooth-plate-overlay",
      "data-tooth-id": toothId,
      "data-jaw": jaw,
    });
    plateOverlay.setAttribute(
      "transform",
      `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})`
    );
    appendToothPlateComponentVisuals(plateOverlay, tooth, toothId, jaw);
    if (plateOverlay.childNodes.length > 0) {
      svg.appendChild(plateOverlay);
    }
  });

  if (jaw === "upper") {
    appendPalatalHoleArchOverlay(svg);
    appendPalatalBarArchOverlay(svg);
  }
}

export function onToothClick(jaw, toothId) {
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

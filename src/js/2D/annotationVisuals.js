import {
  augmentTeethForPalatalBarConnectorNeighbors,
  COMPONENT_BY_ID,
  getBarUserOffset,
  getReciprocatingClaspAssetReference,
  getRetainerClaspAssetReference,
  getRetainerClaspPlacementImageSize,
  getRetainerClaspPlacementOffset,
  getRetainerClaspPlacementRenderScale,
  getRetainerClaspSuggestionPointsForTooth,
  getRetainerClaspSuggestionRadius,
  getCingulumAcSuggestionPointsForTooth,
  getComponentAssetReference,
  BAR_PLACEMENT_ANCHOR_SURFACE,
  getBarPlacementAssetReference,
  getBarPlacementImageSize,
  getBarPlacementOffset,
  getBarPlacementRenderScale,
  getMajorConnectorPlacementImageSize,
  getMajorConnectorPlacementOffset,
  getMajorConnectorRenderScaleMultiplier,
  getMeshPlacementImageSize,
  getMeshPlacementOffset,
  getMeshPlacementRenderScale,
  getPlatePlacementImageSize,
  getPlatePlacementOffset,
  getPlatePlacementRenderScale,
  getRestPlacementAssetReference,
  getRestPlacementImageSize,
  getRestPlacementRenderScale,
  getRestSuggestionPointsForTooth,
  getRestSuggestionRadius,
  getRestSuggestionSurfaces,
  hasPalatalBarPlacementOnUpperArch,
  hasPalatalHolePlacementOnUpperArch,
  isBarComponent,
  isBarPlacementSurface,
  isReciprocatingClaspComponent,
  isRetainerClaspComponent,
  isMajorConnectorComponent,
  isMeshComponent,
  isPalatalBarMajorComponent,
  isPalatalHoleMajorComponent,
  isPlateComponentId,
  isRestComponent,
  meshHoleUniformScaleToothId,
  PALATAL_BAR_ARCH_OVERLAY,
  PALATAL_BAR_CONNECTOR_TOOTH_IDS,
  PALATAL_BAR_MAJOR_COMPONENT_ID,
  PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS,
  PALATAL_HOLE_ARCH_OVERLAY_LAYERS,
  shouldMajorConnectorIgnoreMeshPlateAnchor,
  shouldUsePalatalBarSecondMolarDistalTemplate,
  getMajorConnectorAssetReference,
} from "./components.js";
import {
  ANTERIOR_REST_SURFACE_DIALOG_TEETH,
  COMPONENT_IMAGE_HEIGHT,
  COMPONENT_IMAGE_WIDTH,
  COMPONENT_SCALE_BY_JAW,
  COMPONENT_SCALE_BY_TOOTH,
  JAW_IMAGE_FLIP_X,
  PLATE_SUGGESTION_TRANSFORM_BY_JAW,
  PRESENCE_TOOTH_ASSET,
  TOOTH_ASSET_BASE,
  TOOTH_IMAGE_HALF_HEIGHT,
  TOOTH_IMAGE_HALF_WIDTH,
  TOOTH_IMAGE_HEIGHT,
  TOOTH_IMAGE_WIDTH,
  TOOTH_ORDER,
  TOOTH_SCALE_OVERRIDE,
} from "./constants.js";
import {
  REST_CALIBRATION_COMPONENT_ID,
  state,
  ui,
  positionAnteriorRestPanel,
  setMessage,
  svgEl,
  renderJaw,
  renderJaws,
} from "./2DAnnotation.js";
import { placeSelectedComponentOnTooth, resolveMajorConnectorAnchorComponentId } from "./annotationPlacement.js";
import {
  ensureToothPlacementState,
  getToothAssetSpec,
  getToothPlacement,
  getToothScale,
  normalizeStatus,
  normalizeSurface,
  removePlacement,
  removePlacementAtIndex,
} from "./annotationTeethModel.js";

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
  ensureToothPlacementState(tooth);

  const catalogEntries = Array.isArray(tooth.components)
    ? tooth.components
        .map((id) => ({ id, def: COMPONENT_BY_ID.get(id) }))
        .filter((x) => x.def)
    : [];

  const showPalatalBarSegment =
    jaw === "upper" &&
    shouldShowPalatalBarArchOverlay() &&
    PALATAL_BAR_CONNECTOR_TOOTH_IDS.has(String(toothId));

  const majorIds = [];
  for (const { id, def } of catalogEntries) {
    if (!isMajorConnectorComponent(def)) {
      continue;
    }
    if (
      jaw === "upper" &&
      shouldShowPalatalBarArchOverlay() &&
      PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS.has(String(toothId))
    ) {
      continue;
    }
    if (showPalatalBarSegment && !isPalatalBarMajorComponent(id)) {
      continue;
    }
    if (!majorIds.includes(id)) {
      majorIds.push(id);
    }
  }

  for (const majorId of majorIds) {
    const under = createMajorConnectorVisual(majorId, tooth, toothId, jaw);
    if (under) {
      group.appendChild(under);
    }
  }

  if (!tooth.components.length) {
    return;
  }

  if (!tooth.isPresent) {
    for (const { id, def } of catalogEntries) {
      if (!isMeshComponent(def)) {
        continue;
      }
      const visual = createComponentVisual(id, toothId, jaw);
      if (visual) {
        group.appendChild(visual);
      }
    }
    return;
  }
}

/** Placed plates only — rendered in a separate SVG pass after all tooth bodies/majors (see {@link renderJaw}). */
function appendToothPlateComponentVisuals(group, tooth, toothId, jaw) {
  ensureToothPlacementState(tooth);
  if (!tooth.isPresent) return;

  const selected = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (
    state.designMode &&
    jaw === "lower" &&
    selected &&
    isMajorConnectorComponent(selected) &&
    selected.id === "major-lower-lingual-bar"
  ) {
    return;
  }

  const catalogEntries = Array.isArray(tooth.components)
    ? tooth.components
        .map((id) => ({ id, def: COMPONENT_BY_ID.get(id) }))
        .filter((x) => x.def)
    : [];

  for (const { id } of catalogEntries) {
    if (!isPlateComponentId(id)) {
      continue;
    }
    const visual = createComponentVisual(id, toothId, jaw);
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
  const points = getRetainerClaspSuggestionPointsForTooth(toothId, jaw);
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

export function appendPlacedComponentMarkers(group, tooth, toothId, jaw) {
  ensureToothPlacementState(tooth);
  const { mirrored } = getToothAssetSpec(toothId);

  if (!tooth.componentPlacements.length) return;
  if (!tooth.isPresent) {
    const hasBarPlacement = tooth.componentPlacements.some((placement) =>
      isBarComponent(placement.componentId) && isBarPlacementSurface(normalizeSurface(placement.surface))
    );
    if (!hasBarPlacement) return;
  }

  const radius = getRestSuggestionRadius() + 0.6;

  const canRemoveComponentId = (componentId) => {
    // In remove-mode, removal is only allowed via the remove list UI.
    if (state.removeComponentMode) return false;
    return Boolean(componentId && state.selectedComponentId === componentId);
  };

  const blockRemoveMessage = (componentId) => {
    const label = COMPONENT_BY_ID.get(componentId)?.label || componentId;
    setMessage(`Select ${label} to remove it, or enable Remove mode.`, true);
  };

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
        if (state.removeComponentMode) return;
        if (!canRemoveComponentId(placement.componentId)) {
          // Let the tooth click handler run (radial / placement), don't trap the click.
          return;
        }
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
      if (state.removeComponentMode) return;
      if (!canRemoveComponentId(placement.componentId)) {
        // Let the tooth click handler run (radial / placement), don't trap the click.
        return;
      }
      event.stopPropagation();
      removePlacement(tooth, placement.componentId, surface);
      const label = COMPONENT_BY_ID.get(placement.componentId)?.label || placement.componentId;
      setMessage(`Removed ${label} (${surface}) from tooth ${toothId}.`, false);
      renderJaw(jaw);
    });

    group.appendChild(marker);
  }

  const claspRadius = getRetainerClaspSuggestionRadius() + 0.6;
  for (const placement of tooth.componentPlacements) {
    const isRetainer = isRetainerClaspComponent(placement.componentId);
    const isReciprocating = isReciprocatingClaspComponent(placement.componentId);
    if (!isRetainer && !isReciprocating) continue;

    const surface = normalizeSurface(placement.surface);
    if (!surface) continue;

    const claspPointMap = getClaspSurfacePointMap(toothId, jaw);
    const point = claspPointMap.get(surface);
    if (!point) continue;

    const claspOffset = getRetainerClaspPlacementOffset(placement.componentId, toothId, surface);
    const outerG = svgEl("g", {
      transform: `translate(${point.x + claspOffset.x} ${point.y + claspOffset.y}) scale(${mirrored ? -1 : 1} 1)`,
      class: `clasp-placement-root clasp-placement-${surface}`,
    });

    const assetHref = isReciprocating
      ? getReciprocatingClaspAssetReference(toothId, surface)
      : getRetainerClaspAssetReference(toothId, surface);
    const imageSize = getRetainerClaspPlacementImageSize(placement.componentId, toothId, surface);
    const claspScale = getRetainerClaspPlacementRenderScale(placement.componentId, toothId, surface);

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
      if (state.removeComponentMode) return;
      if (!canRemoveComponentId(placement.componentId)) {
        // Let the tooth click handler run (radial / placement), don't trap the click.
        return;
      }
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
      if (state.removeComponentMode) return;
      if (!canRemoveComponentId(placement.componentId)) {
        // Let the tooth click handler run (radial / placement), don't trap the click.
        return;
      }
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
  if (state.suppressArchPlacementSuggestions) return false;
  return state.designMode && isRestComponent(state.selectedComponentId);
}

function shouldShowRetainerClaspSuggestions() {
  if (state.suppressArchPlacementSuggestions) return false;
  if (!state.designMode) return false;
  return (
    isRetainerClaspComponent(state.selectedComponentId) ||
    isReciprocatingClaspComponent(state.selectedComponentId)
  );
}

function shouldShowPlateSuggestions() {
  if (state.suppressArchPlacementSuggestions) return false;
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

function handleRetainerClaspSuggestionPick(jaw, toothId, surface) {
  const normalized = normalizeSurface(surface);
  if (!normalized) return;
  placeSelectedComponentOnTooth(toothId, { surface: normalized });
  renderJaw(jaw);
}

// Clickable circumferential clasp anchors (separate geometry from rest suggestions).
function appendRetainerClaspSuggestionPoints(group, tooth, toothId, jaw) {
  if (!shouldShowRetainerClaspSuggestions()) return;
  if (!tooth.isPresent) return;

  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  const isRetainer = isRetainerClaspComponent(selectedComponent);
  const isReciprocating = isReciprocatingClaspComponent(selectedComponent);
  if (!selectedComponent || (!isRetainer && !isReciprocating)) return;

  ensureToothPlacementState(tooth);

  if (isReciprocating && hasClaspTypePlacement(tooth, isReciprocatingClaspComponent)) {
    return;
  }

  let points = getRetainerClaspSuggestionPointsForTooth(toothId, jaw);
  if (isReciprocating) {
    const retainerSurface = getPlacedClaspSurface(tooth, isRetainerClaspComponent);
    if (retainerSurface) {
      points = points.filter((p) => normalizeSurface(p.surface) !== retainerSurface);
    }
  }
  const radius = getRetainerClaspSuggestionRadius();

  for (const pointData of points) {
    const surface = normalizeSurface(pointData.surface);
    if (!surface) continue;
    if (hasRetainerClaspPlacementAtSurface(tooth, surface)) continue;

    const className = [
      "clasp-suggestion-point",
      isReciprocating ? "rpc-suggestion-point" : "",
      `clasp-suggestion-${surface}`,
    ].filter(Boolean).join(" ");

    const point = svgEl("circle", {
      cx: String(pointData.x),
      cy: String(pointData.y),
      r: String(radius),
      class: className,
      "data-surface": surface,
    });
    point.addEventListener("click", (event) => {
      event.stopPropagation();
      handleRetainerClaspSuggestionPick(jaw, toothId, surface);
    });
    group.appendChild(point);
  }
}

function hasClaspTypePlacement(tooth, classifier) {
  ensureToothPlacementState(tooth);
  return tooth.componentPlacements.some((entry) => classifier(entry.componentId));
}

function getPlacedClaspSurface(tooth, classifier) {
  ensureToothPlacementState(tooth);
  const found = tooth.componentPlacements.find((entry) => classifier(entry.componentId));
  return normalizeSurface(found?.surface);
}

function hasRetainerClaspPlacementAtSurface(tooth, surface) {
  ensureToothPlacementState(tooth);
  const targetSurface = normalizeSurface(surface);
  if (!targetSurface) return false;

  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  const matchReciprocating = isReciprocatingClaspComponent(selectedComponent);

  return tooth.componentPlacements.some((entry) => {
    const sameSurface = normalizeSurface(entry.surface) === targetSurface;
    if (!sameSurface) return false;
    return matchReciprocating
      ? isReciprocatingClaspComponent(entry.componentId)
      : isRetainerClaspComponent(entry.componentId);
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

// Palatal hole / palatal bar arch overlays: show from saved placements whenever the catalog
// is not actively selecting a *different* major type (so plate/clasp/mesh tabs do not hide them).
function shouldShowPalatalHoleArchOverlay() {
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  const suppressForOtherMajor =
    state.designMode &&
    sel &&
    isMajorConnectorComponent(sel) &&
    !isPalatalHoleMajorComponent(sel);

  if (suppressForOtherMajor) {
    return false;
  }
  if (hasPalatalHolePlacementOnUpperArch(state.teeth)) {
    return true;
  }
  if (state.archOverlayPalatalHoleActive) {
    return true;
  }
  return Boolean(state.designMode && sel && isPalatalHoleMajorComponent(sel));
}

function shouldShowPalatalBarArchOverlay() {
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  const suppressForOtherMajor =
    state.designMode &&
    sel &&
    isMajorConnectorComponent(sel) &&
    !isPalatalBarMajorComponent(sel);

  if (suppressForOtherMajor) {
    return false;
  }
  if (hasPalatalBarPlacementOnUpperArch(state.teeth)) {
    return true;
  }
  return Boolean(state.designMode && sel && isPalatalBarMajorComponent(sel));
}

// Arch-wide palatal hole artwork (AP_Strap01/02); not drawn per tooth.
function appendPalatalHoleArchOverlay(svg) {
  if (!svg || !shouldShowPalatalHoleArchOverlay()) {
    return;
  }
  const g = svgEl("g", { class: "palatal-hole-arch-overlay" });
  for (const layer of PALATAL_HOLE_ARCH_OVERLAY_LAYERS) {
    const href = `../../assets/RPD_Component/MajorConnector/${layer.file}`;
    g.appendChild(
      svgEl("image", {
        href,
        x: String(layer.x),
        y: String(layer.y),
        width: String(layer.width),
        height: String(layer.height),
        preserveAspectRatio: "xMidYMid meet",
        class: "palatal-hole-arch-image",
        "pointer-events": "none",
      })
    );
  }
  svg.appendChild(g);
}

// Arch-wide palatal bar (P_Bar.svg); per-tooth segments on 14–18 and 24–28 (see PALATAL_BAR_CONNECTOR_TOOTH_IDS).
function appendPalatalBarArchOverlay(svg) {
  if (!svg || !shouldShowPalatalBarArchOverlay()) {
    return;
  }
  const layer = PALATAL_BAR_ARCH_OVERLAY;
  const g = svgEl("g", { class: "palatal-bar-arch-overlay" });
  const href = `../../assets/RPD_Component/MajorConnector/${layer.file}`;
  g.appendChild(
    svgEl("image", {
      href,
      x: String(layer.x),
      y: String(layer.y),
      width: String(layer.width),
      height: String(layer.height),
      preserveAspectRatio: "xMidYMid meet",
      class: "palatal-bar-arch-image",
      "pointer-events": "none",
    })
  );
  svg.appendChild(g);
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


// Major connector: explicit catalog placement. Scale follows the *tooth* (not mesh/plate render scale).
function createMajorConnectorVisual(majorComponentId, tooth, toothId, jaw) {
  const def = COMPONENT_BY_ID.get(majorComponentId);
  if (!def || !isMajorConnectorComponent(def)) {
    return null;
  }
  const teethForConnector =
    isPalatalBarMajorComponent(majorComponentId) && shouldShowPalatalBarArchOverlay()
      ? augmentTeethForPalatalBarConnectorNeighbors(state.teeth)
      : state.teeth;
  const connectorHref = getMajorConnectorAssetReference(toothId, jaw, teethForConnector, {
    palatalBarSecondMolarDistal:
      isPalatalBarMajorComponent(majorComponentId) &&
      shouldUsePalatalBarSecondMolarDistalTemplate(toothId, state.teeth),
  });
  if (!connectorHref) return null;

  const placement = getToothPlacement(jaw, toothId) || {};
  const jawFlipX = JAW_IMAGE_FLIP_X[jaw] ?? 1;
  const flipX = (placement.scaleX ?? 1) * jawFlipX;
  const flipY = placement.scaleY ?? 1;

  const { mirrored } = getToothAssetSpec(toothId);
  const scaleBoost = TOOTH_SCALE_OVERRIDE[toothId] || 1;
  const base = getToothScale(toothId, jaw) * 0.24 * scaleBoost;

  const scaleX = (mirrored ? -base : base) * flipX;
  const scaleY = base * flipY;

  const anchorId = resolveMajorConnectorAnchorComponentId(tooth);
  let off = { x: 0, y: 0 };
  if (!shouldMajorConnectorIgnoreMeshPlateAnchor() && anchorId) {
    const anchorDef = COMPONENT_BY_ID.get(anchorId);
    if (anchorDef && isMeshComponent(anchorDef)) {
      off = getMeshPlacementOffset(anchorId, toothId);
    } else if (isPlateComponentId(anchorId)) {
      off = getPlatePlacementOffset(anchorId, toothId);
    }
  }
  const extra = getMajorConnectorPlacementOffset(toothId);
  const ox = (Number.isFinite(off.x) ? off.x : 0) + (Number.isFinite(extra.x) ? extra.x : 0);
  const oy = (Number.isFinite(off.y) ? off.y : 0) + (Number.isFinite(extra.y) ? extra.y : 0);

  const connectorSize = getMajorConnectorPlacementImageSize(toothId);
  const imgW = connectorSize?.width ?? COMPONENT_IMAGE_WIDTH;
  const imgH = connectorSize?.height ?? COMPONENT_IMAGE_HEIGHT;
  const halfW = imgW / 2;
  const halfH = imgH / 2;

  const connMul = getMajorConnectorRenderScaleMultiplier(toothId, jaw);
  const scaleXConn = scaleX * connMul;
  const scaleYConn = scaleY * connMul;

  const visual = svgEl("g", {
    class: `component-visual major-connector-visual component-ref-${majorComponentId}`,
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

export {
  applyToothStatusClass,
  appendRetainerClaspSuggestionPoints,
  appendPalatalBarArchOverlay,
  appendPalatalHoleArchOverlay,
  appendPlateSuggestionPoints,
  appendRestSuggestionPoints,
  appendToothComponentVisuals,
  appendToothPlateComponentVisuals,
  createToothVisual,
  hasBarPlacementAtSurface,
  showBarSuggestions,
};

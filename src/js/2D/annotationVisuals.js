import {
  augmentTeethForPalatalBarConnectorNeighbors,
  COMPONENT_BY_ID,
  getBarUserOffset,
  getReciprocatingClaspAssetReference,
  getRingClaspAssetReference,
  getRingClaspPlacementImageSize,
  getRingClaspPlacementOffset,
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
  getMinorConnectorAssetReference,
  getMinorConnectorImageSize,
  getMinorConnectorMidOffset,
  getMinorConnectorOffset,
  getMinorConnectorRenderScale,
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
  getRestPlacementOffset,
  getRestPlacementRenderScale,
  getRestSuggestionPointsForTooth,
  getRestSuggestionRadius,
  getRestSuggestionSurfaces,
  hasPalatalBarPlacementOnUpperArch,
  hasPalatalPlatePlacementOnUpperArch,
  hasPalatalHolePlacementOnUpperArch,
  computePalatalStrapPolygonPoints,
  hasPalatalStrapPlacementOnUpperArch,
  PALATAL_STRAP_MAJOR_COMPONENT_ID,
  isPalatalStrapMajorComponent,
  PALATAL_STRAP_ARCH_POLYGON,
  isBarComponent,
  isBarPlacementSurface,
  isReciprocatingClaspComponent,
  isRingClaspComponent,
  isRetainerClaspComponent,
  isMajorConnectorComponent,
  isMajorConnectorToothExcluded,
  isMajorConnectorPlacementSeparated,
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
  getPalatalPlateArchOverlayFrame,
  shouldMajorConnectorIgnoreMeshPlateAnchor,
  shouldUsePalatalBarSecondMolarDistalTemplate,
  getMajorConnectorAssetReference,
  getPalatalPlateOverlayIndexFromUpperPlacements,
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
  positionAnteriorRestPanel,
  setMessage,
  svgEl,
  renderJaw,
  renderJaws,
} from "./2DAnnotation.js";
import {
  getEmbrasureNeighborToothId,
  placeAssemblyIBarOnTooth,
  placeAssemblyModTBarOnTooth,
  placeEmbrasureCircumAssemblyOnTooth,
  placeHalfAndHalfAssemblyOnTooth,
  placeAssemblyTBarOnTooth,
  placeMultiCircumAssemblyOnTooth,
  placeSelectedComponentOnTooth,
  placeSimpleCircumAssemblyOnTooth,
  resolveMajorConnectorAnchorComponentId,
  toothSupportsMajorConnectorOverlay,
} from "./annotationPlacement.js";
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

// Apply status CSS classes for present/abutment/compromised/missing tooth visuals.
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

// For tooth rendering: draw placed major connectors and mesh visuals.
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

  const jawOrder = TOOTH_ORDER[jaw] || [];
  const toothIndexInJaw = jawOrder.indexOf(String(toothId));
  const prevToothId = toothIndexInJaw > 0 ? jawOrder[toothIndexInJaw - 1] : null;
  const nextToothId =
    toothIndexInJaw >= 0 && toothIndexInJaw < jawOrder.length - 1
      ? jawOrder[toothIndexInJaw + 1]
      : null;

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
    if (isMajorConnectorToothExcluded(id, toothId)) {
      continue;
    }
    if (!majorIds.includes(id)) {
      majorIds.push(id);
    }
  }

  const selectedMajor = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (
    selectedMajor &&
    isMajorConnectorComponent(selectedMajor) &&
    selectedMajor.section === jaw &&
    !isMajorConnectorToothExcluded(selectedMajor.id, toothId)
  ) {
    const supportsSelectedMajor = toothSupportsMajorConnectorOverlay(tooth, toothId, selectedMajor.id);
    const prevHasMajor = Boolean(
      prevToothId && state.teeth[prevToothId]?.componentPlacements?.some((e) => isMajorConnectorComponent(e.componentId))
    );
    const nextHasMajor = Boolean(
      nextToothId && state.teeth[nextToothId]?.componentPlacements?.some((e) => isMajorConnectorComponent(e.componentId))
    );
    const hasAdjacentPlacedMajor = prevHasMajor || nextHasMajor;
    if (
      supportsSelectedMajor &&
      hasAdjacentPlacedMajor &&
      !(
        jaw === "upper" &&
        shouldShowPalatalBarArchOverlay() &&
        PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS.has(String(toothId))
      )
    ) {
      if (!(showPalatalBarSegment && !isPalatalBarMajorComponent(selectedMajor.id))) {
        if (!majorIds.includes(selectedMajor.id)) {
          majorIds.push(selectedMajor.id);
        }
      }
    }
  }

  for (const majorId of majorIds) {
    // Lingual plate = the same bar band as the lingual bar, PLUS a plate filling
    // the lingual surface between each tooth and the bar. The fill climbs the
    // lingual surface of an actual tooth, so it only belongs on PRESENT teeth
    // (anterior + posterior). A missing tooth — a saddle, even one carrying mesh —
    // gets the bar band crossing it but NO plate fill. Draw the plate fill first so
    // the bar band sits on top of it. The lingual bar (and other majors) render the
    // band only.
    // The plate fill IS that tooth's reciprocal/plating element. If the tooth
    // already carries a reciprocating clasp, that is its reciprocal — drawing the
    // plate fill on top would overlap it (clasp XOR plate per tooth), so skip the
    // fill there and let the clasp show. Other present teeth still get filled.
    //
    // Every major connector attaches to the teeth via this per-tooth plate fill BY
    // DEFAULT — the only exceptions are the *bars* (lower lingual bar / upper
    // palatal bar), which are band-only: a bar rides clear of the tissue/palate and
    // touches teeth only at its minor connectors. For the upper arch this fill is
    // complementary to the palate arch overlay: the overlay covers the palate body,
    // the per-tooth fill covers where the plate climbs each tooth's palatal surface.
    // The plate fill is gated on the tooth's own plate-prox component (the per-tooth plating
    // element loaded from / saved to the data), so it is data-driven and per-tooth removable:
    // erasing a tooth's plate-prox drops its fill (and encodes reciprocating=0). On load every
    // present tooth under a plating connector carries a plate-prox, so the default visual is
    // unchanged. This is also the single source for the plate visual (the dedicated plate pass
    // skips plate-prox under a non-bar major), so there is no double-draw / anterior overlap.
    if (
      majorId !== "major-lower-lingual-bar" &&
      tooth.isPresent &&
      tooth.components.includes("plate-prox") &&
      !tooth.components.some((id) => isReciprocatingClaspComponent(id))
    ) {
      const plate = createComponentVisual("plate-prox", toothId, jaw);
      if (plate) group.appendChild(plate);
    }
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

// For tooth rendering: draw placed plates in a dedicated pass above tooth bodies.
function appendToothPlateComponentVisuals(group, tooth, toothId, jaw) {
  ensureToothPlacementState(tooth);
  if (!tooth.isPresent) return;

  if (state.hideLowerPlateVisuals && jaw === "lower") {
    return;
  }

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

  // The connector pass (appendToothComponentVisuals) already draws the plate-prox fill for any
  // major connector except the lower lingual bar, so re-drawing it here would stack two plates
  // per tooth (the anterior overlap). Only draw plate-prox here when there is no such connector
  // (a standalone plate, e.g. RPI under a lingual bar). Mesh plates (plate-crossmesh) are always
  // drawn here — the connector pass never draws those.
  const drawnByConnectorFill = tooth.components.some(
    (id) => isMajorConnectorComponent(id) && id !== "major-lower-lingual-bar"
  );

  for (const { id } of catalogEntries) {
    if (!isPlateComponentId(id)) {
      continue;
    }
    if (id === "plate-prox" && drawnByConnectorFill) {
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
  // ac_both spans both sides; anchor it at the centered full-cingulum point.
  if (s === "lingual_both") return "lingual";
  if (isAnteriorRestSurfaceDialogTooth(toothId)) {
    if (s === "lingual_mesial" || s === "lingual_distal") return s;
    if (s === "lingual") return "lingual";
  }
  return s;
}

/**
 * Which embrasure side(s) a tooth's minor connector should attach on, from its placed
 * components — mirrors the desktop `GenericTooth.GetConnectorData` + `isMesio`: a rest/bar
 * sits on its own surface; a retentive clasp anchors at its ORIGIN, opposite the tip
 * (a mesial-tip clasp connects distally). A reciprocating clasp is not a retainer, so it does
 * not join a minor connector and is ignored here. Returns `{ mesial, distal }` booleans.
 */
function getMinorConnectorSupportSides(tooth) {
  const sides = { mesial: false, distal: false };
  if (!tooth || !Array.isArray(tooth.componentPlacements)) return sides;
  for (const placement of tooth.componentPlacements) {
    const id = placement?.componentId;
    // A mesh plate (cross-mesh) spans the tooth proximally and joins the major
    // connector on both embrasures, so it carries a minor connector even though
    // it has no anchor surface. (A plate-prox under a major connector is already
    // joined by the connector fill, so it's intentionally not added here.)
    if (id === "plate-crossmesh") {
      sides.mesial = true;
      sides.distal = true;
      continue;
    }
    const surface = normalizeSurface(placement?.surface);
    if (!surface) continue;
    if (isRestComponent(id) || isBarComponent(id)) {
      if (surface.includes("mesial")) sides.mesial = true;
      else if (surface.includes("distal")) sides.distal = true;
      else if (surface === "lingual") { sides.mesial = true; sides.distal = true; } // full cingulum
    } else if (isRetainerClaspComponent(id) || isRingClaspComponent(id)) {
      // Retentive clasp origin (where the minor connector attaches) is opposite the tip.
      if (surface.includes("mesial")) sides.distal = true;
      else if (surface.includes("distal")) sides.mesial = true;
    }
  }
  return sides;
}

/**
 * If the embrasure on `side` of `toothId` is shared — the neighbouring tooth across it also
 * carries a minor-connector support facing back — return that neighbour's tooth id, else null.
 * A shared embrasure gets a single `mid` (full) connector spanning the gap; a solo side draws
 * the `mesial`/`distal` half. (Caller renders the shared `mid` once, from the lower-id tooth.)
 */
function getMinorConnectorSharedNeighborId(toothId, jaw, side) {
  const order = TOOTH_ORDER[jaw];
  if (!Array.isArray(order)) return null;
  const idx = order.indexOf(String(toothId));
  if (idx < 0) return null;
  const mid = order.length / 2;
  // Mesial = toward the midline (order centre); distal = toward the back (order ends).
  const step = side === "mesial" ? (idx < mid ? 1 : -1) : (idx < mid ? -1 : 1);
  const neighborId = order[idx + step];
  const neighbor = neighborId ? state.teeth[neighborId] : null;
  if (!neighbor) return null;
  // Side of the neighbour that faces back toward this tooth (mesial-to-mesial at the midline).
  const nIdx = order.indexOf(neighborId);
  const neighborMesialId = order[nIdx + (nIdx < mid ? 1 : -1)];
  const facingSide = neighborMesialId === String(toothId) ? "mesial" : "distal";
  return getMinorConnectorSupportSides(neighbor)[facingSide] ? String(neighborId) : null;
}

/** Build + append one minor-connector image for a tooth side ("mesial"/"distal") and variant. */
function appendMinorConnectorVisual(group, toothId, jaw, variant, side, mirrored) {
  const href = getMinorConnectorAssetReference(toothId, variant);
  const size = getMinorConnectorImageSize(toothId, variant);
  if (!href || !size) return;
  const offset = variant === "mid"
    ? getMinorConnectorMidOffset(toothId)
    : getMinorConnectorOffset(toothId, side);
  const scale = getMinorConnectorRenderScale(jaw);
  const width = size.width * scale;
  const height = size.height * scale;
  const minor = svgEl("g", {
    class: "minor-connector-placement",
    transform: `translate(${offset.x} ${offset.y}) scale(${mirrored ? -1 : 1} 1)`,
    "pointer-events": "none",
  });
  minor.appendChild(
    svgEl("image", {
      href,
      x: String(-width / 2),
      y: String(-height / 2),
      width: String(width),
      height: String(height),
      preserveAspectRatio: "xMidYMid meet",
      class: "minor-connector-image",
      "data-component-id": "minor-connector",
      "pointer-events": "none",
    })
  );
  group.appendChild(minor);
}

function appendPlacedComponentMarkers(group, tooth, toothId, jaw) {
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

  // A minor connector per supported embrasure side. When the neighbour across the embrasure
  // also has support facing back, the gap is bridged by a single `mid` (full) connector drawn
  // ONCE so it isn't doubled. The owner is the higher-id tooth — the more-distal one, whose rest
  // faces the gap on its MESIAL side (e.g. distal rest on 44 + mesial rest on 45 -> 45 owns it).
  // The shared mid uses that tooth's mid offset; a solo side draws its own directional half.
  const minorConnectorSupportSides = getMinorConnectorSupportSides(tooth);
  for (const side of ["mesial", "distal"]) {
    if (!minorConnectorSupportSides[side]) continue;
    const sharedNeighborId = getMinorConnectorSharedNeighborId(toothId, jaw, side);
    if (sharedNeighborId) {
      if (Number(toothId) > Number(sharedNeighborId)) {
        appendMinorConnectorVisual(group, toothId, jaw, "mid", null, mirrored);
      }
      continue;
    }
    appendMinorConnectorVisual(group, toothId, jaw, side, side, mirrored);
  }

  for (const placement of tooth.componentPlacements) {
    if (!isRestComponent(placement.componentId)) continue;

    const surface = normalizeSurface(placement.surface);
    if (!surface) continue;

    const pointMap = getRestSurfacePointMap(
      toothId,
      jaw,
      placement.componentId === "rest-onlay" ? null : placement.componentId
    );
    const anchorSurface = restMarkerAnchorSurface(placement.surface, toothId);
    const point = anchorSurface ? pointMap.get(anchorSurface) : null;
    if (!point) continue;

    const assetHref = getRestPlacementAssetReference(placement.componentId, toothId, surface);
    const imageSize = getRestPlacementImageSize(placement.componentId, toothId, surface);
    const restOffset = getRestPlacementOffset(placement.componentId, toothId, surface);
    const restScale = getRestPlacementRenderScale(placement.componentId, toothId, surface);

    if (assetHref && imageSize) {
      const width = imageSize.width * restScale;
      const height = imageSize.height * restScale;

      const imageGroup = svgEl("g", {
        transform: `translate(${point.x + (Number.isFinite(restOffset?.x) ? restOffset.x : 0)} ${point.y + (Number.isFinite(restOffset?.y) ? restOffset.y : 0)}) scale(${mirrored ? -1 : 1} 1)`
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
    const isRing = isRingClaspComponent(placement.componentId);
    if (!isRetainer && !isReciprocating && !isRing) continue;

    const surface = normalizeSurface(placement.surface);
    if (!surface) continue;

    const claspPointMap = getClaspSurfacePointMap(toothId, jaw);
    const point = claspPointMap.get(surface);
    if (!point) continue;

    const claspOffset = isRing
      ? getRingClaspPlacementOffset(placement.componentId, toothId, surface)
      : getRetainerClaspPlacementOffset(placement.componentId, toothId, surface);
    const outerG = svgEl("g", {
      transform: `translate(${point.x + claspOffset.x} ${point.y + claspOffset.y}) scale(${mirrored ? -1 : 1} 1)`,
      class: `clasp-placement-root clasp-placement-${surface}`,
    });

    const assetHref = isReciprocating
      ? getReciprocatingClaspAssetReference(toothId, surface)
      : isRing
        ? getRingClaspAssetReference(toothId, surface)
      : getRetainerClaspAssetReference(toothId, surface);
    const imageSize = isRing
      ? getRingClaspPlacementImageSize(placement.componentId, toothId, surface)
      : getRetainerClaspPlacementImageSize(placement.componentId, toothId, surface);
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

    // Hit target sized to roughly half the bar image so users can click
    // anywhere on the visible bar to toggle it without catching too much
    // of the surrounding transparent bounding rect (which would block
    // clicks on neighboring teeth). Tuned to be comfortable while still
    // letting genuinely off-bar clicks fall through.
    //
    // Only intercept clicks when this exact bar is the active tool —
    // otherwise the hit target would cover adjacent teeth and prevent
    // their tooth-level interactions (radial quick-pick, rest suggestion
    // points, etc.) when the user isn't in bar mode.
    const barIsActiveTool =
      !state.removeComponentMode &&
      state.selectedComponentId === placement.componentId;
    const hitRadius = Math.max(5, Math.min(width, height) * 0.32);
    const barHitTarget = svgEl("circle", {
      cx: "0",
      cy: "0",
      r: String(hitRadius.toFixed(1)),
      class: `bar-placement-hit-target bar-placement-${barSurface}`,
      "data-surface": barSurface,
      "data-component-id": placement.componentId,
      // Use inline style so this wins against the
      // `.bar-placement-hit-target { pointer-events: visible }` CSS rule.
      style: barIsActiveTool ? "" : "pointer-events: none;",
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

// A cingulum rest can be stored on any lingual sub-surface: full coverage
// ("lingual"), mesial/distal halves ("lingual_mesial"/"lingual_distal"), or both
// halves ("lingual_both", from a loaded ac_both desktop design). They are all the
// same logical rest for placement/removal purposes.
const CINGULUM_REST_SURFACES = new Set([
  "lingual",
  "lingual_mesial",
  "lingual_distal",
  "lingual_both",
]);

function isCingulumRestSurface(surface) {
  const s = normalizeSurface(surface);
  return Boolean(s && CINGULUM_REST_SURFACES.has(s));
}

const ASSEMBLY_REST_SUGGESTION_IDS = new Set([
  "assembly-circ",
  "assembly-circ-embrasure",
  "assembly-circ-multi",
  "assembly-circ-half-n-half",
  "assembly-tbar",
  "assembly-tbar-mod",
  "assembly-ibar",
]);

const SIMPLE_CIRCUM_POSTERIOR_TOOTH_IDS = new Set([
  "14", "15", "16", "17", "18",
  "24", "25", "26", "27", "28",
  "34", "35", "36", "37", "38",
  "44", "45", "46", "47", "48",
]);

function canPlaceEmbrasureAtSurface(toothId, jaw, surface) {
  const neighbor = getEmbrasureNeighborToothId(toothId, jaw, surface);
  return Boolean(neighbor && SIMPLE_CIRCUM_POSTERIOR_TOOTH_IDS.has(neighbor));
}

function canPlaceMultiAtTooth(toothId, jaw) {
  const distalNeighbor = getEmbrasureNeighborToothId(toothId, jaw, "distal");
  return Boolean(distalNeighbor && SIMPLE_CIRCUM_POSTERIOR_TOOTH_IDS.has(distalNeighbor));
}

function getAssemblyTBarAllowedRestSurfaces(toothId, jaw) {
  const id = String(toothId);
  const order = TOOTH_ORDER[jaw] || [];
  const idx = order.indexOf(id);
  if (idx < 0) return [];
  const prevId = idx > 0 ? order[idx - 1] : null;
  const nextId = idx < order.length - 1 ? order[idx + 1] : null;
  const hasMissingAdjacent =
    Boolean(prevId && state.teeth[prevId] && !state.teeth[prevId].isPresent) ||
    Boolean(nextId && state.teeth[nextId] && !state.teeth[nextId].isPresent);
  return hasMissingAdjacent ? ["mesial", "distal"] : [];
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
  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (selectedComponent?.id === "assembly-circ") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "mesial" && surface !== "distal") {
      setMessage("Simple Circum Assembly supports mesial or distal rest seat only.", true);
      return;
    }
    placeSimpleCircumAssemblyOnTooth(toothId, surface);
    renderJaw(jaw);
    return;
  }
  if (selectedComponent?.id === "assembly-circ-multi") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "mesial") {
      setMessage("Multi Assembly supports mesial rest-seat suggestion only.", true);
      return;
    }
    placeMultiCircumAssemblyOnTooth(toothId, jaw);
    renderJaws();
    return;
  }
  if (selectedComponent?.id === "assembly-circ-half-n-half") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "mesial" && surface !== "distal") {
      setMessage("Half & Half supports mesial or distal rest-seat suggestion only.", true);
      return;
    }
    placeHalfAndHalfAssemblyOnTooth(toothId, surface);
    renderJaw(jaw);
    return;
  }
  if (selectedComponent?.id === "assembly-circ-embrasure") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "distal") {
      setMessage("Embrasure Assembly supports distal rest-seat suggestion only.", true);
      return;
    }
    placeEmbrasureCircumAssemblyOnTooth(toothId, jaw, surface);
    renderJaws();
    return;
  }
  if (selectedComponent?.id === "assembly-tbar") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "mesial" && surface !== "distal") {
      setMessage("T-bar Assembly supports mesial or distal rest-seat suggestion only.", true);
      return;
    }
    placeAssemblyTBarOnTooth(toothId, jaw, surface);
    renderJaw(jaw);
    return;
  }
  if (selectedComponent?.id === "assembly-tbar-mod") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "mesial" && surface !== "distal") {
      setMessage("Mod.T-bar Assembly supports mesial or distal rest-seat suggestion only.", true);
      return;
    }
    placeAssemblyModTBarOnTooth(toothId, jaw, surface);
    renderJaw(jaw);
    return;
  }
  if (selectedComponent?.id === "assembly-ibar") {
    const surface = normalizeSurface(pointSurface);
    if (surface !== "mesial" && surface !== "distal") {
      setMessage("I-bar Assembly supports mesial or distal rest-seat suggestion only.", true);
      return;
    }
    placeAssemblyIBarOnTooth(toothId, jaw, surface);
    renderJaw(jaw);
    return;
  }

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

  // Toggle-off path: the surface dialog only offers a subset of the cingulum
  // sub-surfaces, so a surface-exact toggle in placeSelectedComponentOnTooth can't
  // remove a rest whose stored sub-surface isn't on offer (notably a loaded
  // "lingual_both"/ac_both). Treat a click on the lingual point of a tooth that
  // already carries a cingulum rest as "remove it" — regardless of sub-surface —
  // and only open the dialog to choose a surface when none exists yet.
  const selectedTooth = state.teeth[String(toothId)];
  if (selectedComponent?.id === "rest-seat" && selectedTooth) {
    ensureToothPlacementState(selectedTooth);
    const existingCingulum = (selectedTooth.componentPlacements || []).filter(
      (entry) => entry.componentId === "rest-seat" && isCingulumRestSurface(entry.surface)
    );
    if (existingCingulum.length) {
      for (const entry of existingCingulum) {
        removePlacement(selectedTooth, entry.componentId, entry.surface);
      }
      setMessage(`Removed cingulum rest from tooth ${toothId}.`, false);
      renderJaw(jaw);
      return;
    }
  }

  showAnteriorRestSurfaceDialog(toothId, anchor, (chosen) => {
    if (chosen) applySurface(chosen);
  });
}

function shouldShowRestSuggestions() {
  if (state.suppressArchPlacementSuggestions) return false;
  if (!state.designMode) return false;
  if (ASSEMBLY_REST_SUGGESTION_IDS.has(state.selectedComponentId)) return true;
  return isRestComponent(state.selectedComponentId);
}

function shouldShowRetainerClaspSuggestions() {
  if (state.suppressArchPlacementSuggestions) return false;
  if (!state.designMode) return false;
  return (
    isRetainerClaspComponent(state.selectedComponentId) ||
    isReciprocatingClaspComponent(state.selectedComponentId) ||
    isRingClaspComponent(state.selectedComponentId)
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
  if (!selectedComponent) return;
  const isAssembly = ASSEMBLY_REST_SUGGESTION_IDS.has(selectedComponent.id);
  if (!isAssembly && !isRestComponent(selectedComponent)) return;
  if (isAssembly && !SIMPLE_CIRCUM_POSTERIOR_TOOTH_IDS.has(String(toothId))) return;

  ensureToothPlacementState(tooth);

  let points;
  if (
    state.restSeatCalibrationAcOnly &&
    selectedComponent.id === REST_CALIBRATION_COMPONENT_ID &&
    isAnteriorRestSurfaceDialogTooth(toothId)
  ) {
    points = getCingulumAcSuggestionPointsForTooth(toothId) ?? [];
  } else {
    const allowedSurfaces = selectedComponent.id === "assembly-circ-embrasure"
      ? new Set(["distal"])
      : selectedComponent.id === "assembly-circ-multi"
        ? new Set(["mesial"])
        : isAssembly
          ? new Set(["mesial", "distal"])
          : new Set(getRestSuggestionSurfaces(selectedComponent.id, toothId));
    points = [...getRestSurfacePointMap(toothId, jaw, selectedComponent.id).values()].filter((point) =>
      allowedSurfaces.has(normalizeSurface(point.surface))
    );
    if (selectedComponent.id === "assembly-circ-embrasure") {
      points = points.filter((point) => canPlaceEmbrasureAtSurface(toothId, jaw, normalizeSurface(point.surface)));
    }
    if (selectedComponent.id === "assembly-circ-multi") {
      points = points.filter(() => canPlaceMultiAtTooth(toothId, jaw));
    }
    if (selectedComponent.id === "assembly-tbar" || selectedComponent.id === "assembly-tbar-mod" || selectedComponent.id === "assembly-ibar") {
      const allowedByMissingAdjacency = new Set(getAssemblyTBarAllowedRestSurfaces(toothId, jaw));
      points = points.filter((point) => allowedByMissingAdjacency.has(normalizeSurface(point.surface)));
    }
  }
  const radius = getRestSuggestionRadius();
  const { mirrored } = getToothAssetSpec(toothId);

  for (const pointData of points) {
    const surface = normalizeSurface(pointData.surface);
    if (!surface) continue;
    const restVisualComponentId = isAssembly ? "rest-seat" : selectedComponent.id;
    const assetHref = getRestPlacementAssetReference(restVisualComponentId, toothId, surface);
    const imageSize = getRestPlacementImageSize(restVisualComponentId, toothId, surface);
    const restScale = getRestPlacementRenderScale(restVisualComponentId, toothId, surface);

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
  const isRing = isRingClaspComponent(selectedComponent);
  if (!selectedComponent || (!isRetainer && !isReciprocating && !isRing)) return;

  ensureToothPlacementState(tooth);

  if (isReciprocating && hasClaspTypePlacement(tooth, isReciprocatingClaspComponent)) {
    return;
  }

  let points = getRetainerClaspSuggestionPointsForTooth(toothId, jaw);
  if (isReciprocating) {
    // The reciprocating arm sits on the arch-side OPPOSITE the retentive
    // component: a buccal clasp → lingual reci, a lingual clasp → buccal reci,
    // a bar (buccal-approaching) → lingual reci. Offer only the two points
    // (mesial + distal) on that side. With no retentive clasp/bar yet, fall back
    // to all four anchors so a standalone reci clasp can still be placed.
    const reciSide = getReciprocatingArchSide(tooth);
    if (reciSide) {
      points = points.filter((p) => normalizeSurface(p.surface).includes(reciSide));
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

    const cx = pointData.x;
    const cy = pointData.y;
    // Direction from tooth-local origin (tooth center) outward to the suggestion point.
    const angleDeg = (Math.atan2(cy, cx) * 180) / Math.PI;

    const wrapper = svgEl("g", {
      class: `clasp-suggestion-group clasp-suggestion-group-${surface}`,
    });

    const point = svgEl("circle", {
      cx: String(cx),
      cy: String(cy),
      r: String(radius),
      class: className,
      "data-surface": surface,
    });

    // Tiny chevron pointing outward (default points along +X, rotated to face away from center).
    const tip = (radius * 0.55).toFixed(2);
    const back = (-radius * 0.2).toFixed(2);
    const half = (radius * 0.4).toFixed(2);
    const arrow = svgEl("polyline", {
      points: `${back},${-half} ${tip},0 ${back},${half}`,
      class: "clasp-suggestion-arrow",
      transform: `translate(${cx} ${cy}) rotate(${angleDeg.toFixed(2)})`,
    });

    wrapper.appendChild(point);
    wrapper.appendChild(arrow);
    wrapper.addEventListener("click", (event) => {
      event.stopPropagation();
      handleRetainerClaspSuggestionPick(jaw, toothId, surface);
    });
    group.appendChild(wrapper);
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

// The arch-side a reciprocating clasp should occupy on this tooth: opposite the
// retentive clasp/ring (buccal <-> lingual), or lingual when a bar is present
// (bars approach from the buccal). Returns "buccal", "lingual", or null when the
// tooth carries no retentive component to reciprocate.
function getReciprocatingArchSide(tooth) {
  ensureToothPlacementState(tooth);
  if (tooth.componentPlacements.some((entry) => isBarComponent(entry.componentId))) {
    return "lingual";
  }
  const retentiveSurface =
    getPlacedClaspSurface(tooth, isRetainerClaspComponent) ||
    getPlacedClaspSurface(tooth, isRingClaspComponent);
  if (retentiveSurface?.includes("buccal")) return "lingual";
  if (retentiveSurface?.includes("lingual")) return "buccal";
  return null;
}

function hasRetainerClaspPlacementAtSurface(tooth, surface) {
  ensureToothPlacementState(tooth);
  const targetSurface = normalizeSurface(surface);
  if (!targetSurface) return false;

  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  const matchReciprocating = isReciprocatingClaspComponent(selectedComponent);
  const matchRing = isRingClaspComponent(selectedComponent);

  return tooth.componentPlacements.some((entry) => {
    const sameSurface = normalizeSurface(entry.surface) === targetSurface;
    if (!sameSurface) return false;
    return matchReciprocating
      ? isReciprocatingClaspComponent(entry.componentId)
      : matchRing
        ? isRingClaspComponent(entry.componentId)
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
  if (hasPalatalBarPlacementOnUpperArch(state.teeth)) {
    return true;
  }
  return Boolean(state.designMode && sel && isPalatalBarMajorComponent(sel));
}

function shouldShowPalatalPlateArchOverlay() {
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (hasPalatalPlatePlacementOnUpperArch(state.teeth)) {
    return true;
  }
  return Boolean(state.designMode && sel && sel.id === "major-upper-palatal-plate");
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

function appendPalatalPlateArchOverlay(svg) {
  if (!svg || !shouldShowPalatalPlateArchOverlay()) {
    return;
  }

  const idx = getPalatalPlateOverlayIndexFromUpperPlacements(state.teeth);
  if (!Number.isFinite(idx)) {
    return;
  }

  const frame = getPalatalPlateArchOverlayFrame(idx);
  const g = svgEl("g", { class: "palatal-plate-arch-overlay" });
  const href = `../../assets/RPD_Component/MajorConnector/Plalatal%20Plate/Plate_${idx}.svg`;
  g.appendChild(
    svgEl("image", {
      href,
      x: String(frame.x),
      y: String(frame.y),
      width: String(frame.width),
      height: String(frame.height),
      preserveAspectRatio: "xMidYMid meet",
      class: "palatal-plate-arch-image",
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
    // The palatal bar's posterior span always terminates at 14/24, so cap those
    // with the mesial end art even when the load-time auto-placer tagged 13/23.
    palatalBarFirstPremolarMesial:
      isPalatalBarMajorComponent(majorComponentId) &&
      (toothId === "14" || toothId === "24"),
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
  const isSeparated = isMajorConnectorPlacementSeparated(toothId, state.teeth, jaw);
  // A separated segment is a stray, floating major-connector cap on a tooth whose
  // order-neighbors carry no connector — e.g. a lone clasped *8 abutment (18/28/
  // 38/48) under a posterior-only palatal bar/strap, which the per-tooth placer
  // tags on its own. A major connector is a continuous span, so a single-tooth
  // segment is meaningless. Don't render it in the locked preview; design mode
  // still draws it tinted (below) as an editing cue.
  if (isSeparated && !state.designMode) {
    return null;
  }
  const imageClass = isSeparated
    ? "component-image major-connector-image is-separated"
    : "component-image major-connector-image";
  visual.appendChild(
    svgEl("image", {
      href: connectorHref,
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

function shouldShowPalatalStrapArchOverlay() {
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (hasPalatalStrapPlacementOnUpperArch(state.teeth)) {
    return true;
  }
  return Boolean(state.designMode && sel && isPalatalStrapMajorComponent(sel));
}

function roundedPolygonPath(pts, r) {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
    const d2x = next.x - curr.x, d2y = next.y - curr.y;
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    const cr = Math.min(r, l1 / 2, l2 / 2);
    const p1x = curr.x - cr * d1x / l1, p1y = curr.y - cr * d1y / l1;
    const p2x = curr.x + cr * d2x / l2, p2y = curr.y + cr * d2y / l2;
    d += i === 0 ? `M ${p1x},${p1y}` : ` L ${p1x},${p1y}`;
    d += ` Q ${curr.x},${curr.y} ${p2x},${p2y}`;
  }
  return d + " Z";
}

// Editable attachment map for palatal strap control points.
// Values are OFFSETS from each associated tooth center.
const PALATAL_STRAP_ATTACHED_POINTS = Object.freeze([
  { toothId: "14", dx: 45, dy: 10 },
  { toothId: "15", dx: 37, dy: 35 },
  { toothId: "16", dx: 35, dy: 45 },
  { toothId: "17", dx: 40, dy: 45 },
  { toothId: "27", dx: -40, dy: 45 },
  { toothId: "26", dx: -35, dy: 45 },
  { toothId: "25", dx: -37, dy: 35 },
  { toothId: "24", dx: -45, dy: 10 },
]);

const PALATAL_STRAP_CENTER_POINTS = Object.freeze({
  top: { dx: 0, dy: -70 },
  bottom: { dx: 0, dy: -50 },
});

const PALATAL_STRAP_FIXED_CENTER_Y_GAP = 70;

function getPalatalStrapPointsFromAttachments() {
  const pointByToothId = new Map();
  const cfgByToothId = new Map();
  for (const cfg of PALATAL_STRAP_ATTACHED_POINTS) {
    cfgByToothId.set(cfg.toothId, cfg);
    const center = state.teeth[cfg.toothId]?.center;
    if (!Array.isArray(center)) {
      return PALATAL_STRAP_ARCH_POLYGON;
    }
    pointByToothId.set(cfg.toothId, {
      x: (Number(center[0]) || 0) + cfg.dx,
      y: (Number(center[1]) || 0) + cfg.dy,
    });
  }

  const hasStrapOnTooth = (toothId) => {
    const placements = state.teeth[toothId]?.componentPlacements;
    return Array.isArray(placements)
      && placements.some((entry) => entry.componentId === PALATAL_STRAP_MAJOR_COMPONENT_ID);
  };

  const resolveAttachedPoint = (toothId, fallbackIds) => {
    const slotCfg = cfgByToothId.get(toothId);
    if (!slotCfg) return pointByToothId.get(toothId);
    if (hasStrapOnTooth(toothId)) {
      return pointByToothId.get(toothId);
    }
    for (const id of fallbackIds) {
      if (hasStrapOnTooth(id)) {
        const center = state.teeth[id]?.center;
        if (!Array.isArray(center)) {
          break;
        }
        return {
          x: (Number(center[0]) || 0) + slotCfg.dx,
          y: (Number(center[1]) || 0) + slotCfg.dy,
        };
      }
    }
    return pointByToothId.get(toothId);
  };

  const p14 = resolveAttachedPoint("14", ["15", "16", "17"]);
  const p15 = resolveAttachedPoint("15", ["16", "14", "17"]);
  const p16 = resolveAttachedPoint("16", ["15", "17", "14"]);
  const p17 = resolveAttachedPoint("17", ["16", "15", "14"]);
  const p27 = resolveAttachedPoint("27", ["26", "25", "24"]);
  const p26 = resolveAttachedPoint("26", ["25", "27", "24"]);
  const p25 = resolveAttachedPoint("25", ["26", "24", "27"]);
  const p24 = resolveAttachedPoint("24", ["25", "26", "27"]);

  if (!p14 || !p15 || !p16 || !p17 || !p27 || !p26 || !p25 || !p24) {
    return PALATAL_STRAP_ARCH_POLYGON;
  }

  const pickActivePoint = (ids, fallbackPoint) => {
    for (const id of ids) {
      if (hasStrapOnTooth(id)) {
        const pt = ({ "14": p14, "15": p15, "16": p16, "17": p17, "24": p24, "25": p25, "26": p26, "27": p27 })[id];
        if (pt) return pt;
      }
    }
    return fallbackPoint;
  };

  const leftDeepPoint = pickActivePoint(["17", "16", "15", "14"], p17);
  const rightDeepPoint = pickActivePoint(["27", "26", "25", "24"], p27);
  const topMidX = (p16.x + p26.x) / 2;
  const topMidY = (p16.y + p26.y) / 2;
  const bottomMidX = (leftDeepPoint.x + rightDeepPoint.x) / 2;

  const centerTop = {
    x: topMidX + PALATAL_STRAP_CENTER_POINTS.top.dx,
    y: topMidY + PALATAL_STRAP_CENTER_POINTS.top.dy,
  };
  const centerBottom = {
    x: bottomMidX + PALATAL_STRAP_CENTER_POINTS.bottom.dx,
    y: centerTop.y + PALATAL_STRAP_FIXED_CENTER_Y_GAP,
  };

  return [
    p14,
    p15,
    p16,
    p17,
    centerBottom,
    p27,
    p26,
    p25,
    p24,
    centerTop,
  ];
}

function appendPalatalStrapArchOverlay(svg) {
  if (!svg || !shouldShowPalatalStrapArchOverlay()) {
    return;
  }
  const strapPoints = getPalatalStrapPointsFromAttachments();
  const g = svgEl("g", { class: "palatal-strap-arch-overlay" });
  g.appendChild(
    svgEl("path", {
      d: roundedPolygonPath(strapPoints, 22),
      class: "palatal-strap-arch-shape",
      fill: "rgba(175,175,175,0.75)",
      stroke: "rgba(120,120,120,0.5)",
      "stroke-width": "1",
      "pointer-events": "none",
    })
  );
  svg.appendChild(g);
}

export {
  applyToothStatusClass,
  appendPlacedComponentMarkers,
  appendRetainerClaspSuggestionPoints,
  appendPalatalBarArchOverlay,
  appendPalatalPlateArchOverlay,
  appendPalatalHoleArchOverlay,
  appendPalatalStrapArchOverlay,
  appendPlateSuggestionPoints,
  appendRestSuggestionPoints,
  appendToothComponentVisuals,
  appendToothPlateComponentVisuals,
  createToothVisual,
  hasBarPlacementAtSurface,
  showBarSuggestions,
};

import {
  ACTION_UPON_FAILURE,
  COMPONENT_BY_ID,
  getMajorConnectorAssetReference,
  hasPalatalHolePlacementOnUpperArch,
  isBarComponent,
  isReciprocatingClaspComponent,
  isRingClaspComponent,
  isRetainerClaspComponent,
  isClaspComponent,
  isMajorConnectorComponent,
  toothHasMajorConnectorPlacement,
  isMajorConnectorToothExcluded,
  isMeshComponent,
  isPalatalBarMajorComponent,
  isPalatalHoleMajorComponent,
  isPlateComponentId,
  isRestComponent,
  PALATAL_BAR_CONNECTOR_TOOTH_IDS,
  PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS,
} from "./components.js";
import { TOOTH_ORDER } from "./constants.js";
import { state, setMessage } from "./2DAnnotation.js";
import {
  addPlacement,
  ensureToothPlacementState,
  hasPlacement,
  normalizeSurface,
  removePlacement,
  removePlacementsByComponentIds,
  syncToothComponentsFromPlacements,
} from "./annotationTeethModel.js";
import { ensureMajorCatalogPickForTooth } from "./annotationCatalog.js";

function isAnteriorToothId(toothId) {
  const unit = Number(toothId) % 10;
  return Number.isFinite(unit) && unit >= 1 && unit <= 3;
}
import { assessPlacementCriteria } from "./criteria.js";

export function applyRemovalSideEffectsForTooth(tooth, removedEntry) {
  if (!removedEntry) return;
  const { componentId } = removedEntry;
  if (isPlateComponentId(componentId)) {
    const remainingPlate = tooth.componentPlacements.some((e) => isPlateComponentId(e.componentId));
    if (!remainingPlate) {
      tooth.componentPlacements = tooth.componentPlacements.filter(
        (e) => !isClaspComponent(e.componentId)
      );
      syncToothComponentsFromPlacements(tooth);
    }
  }
  if (isPalatalHoleMajorComponent(componentId) && !hasPalatalHolePlacementOnUpperArch(state.teeth)) {
    state.archOverlayPalatalHoleActive = false;
  }
}

export function placeSelectedComponentOnTooth(toothId, placementContext = null) {
  toothId = String(toothId);
  if (state.designMode) {
    ensureMajorCatalogPickForTooth(toothId);
  }
  const tooth = state.teeth[toothId];
  const selectedComponent = COMPONENT_BY_ID.get(state.selectedComponentId || "");

  if (!selectedComponent) {
    setMessage("Select a component from the catalog first.", true);
    return;
  }

  ensureToothPlacementState(tooth);
  syncToothComponentsFromPlacements(tooth);

  if (isMajorConnectorComponent(selectedComponent)) {
    if (isMajorConnectorToothExcluded(selectedComponent.id, toothId)) {
      setMessage(`${selectedComponent.label} is not supported on tooth ${toothId}.`, true);
      return;
    }
    const jaw = TOOTH_ORDER.upper.includes(toothId)
      ? "upper"
      : TOOTH_ORDER.lower.includes(toothId)
        ? "lower"
        : null;
    if (!jaw) {
      setMessage("Unknown tooth.", true);
      return;
    }
    const palatalHoleUpper =
      isPalatalHoleMajorComponent(selectedComponent.id) &&
      jaw === "upper" &&
      TOOTH_ORDER.upper.includes(toothId);
    const palatalBarUpper =
      isPalatalBarMajorComponent(selectedComponent.id) &&
      jaw === "upper" &&
      PALATAL_BAR_CONNECTOR_TOOTH_IDS.has(String(toothId));
    if (
      isPalatalBarMajorComponent(selectedComponent.id) &&
      jaw === "upper" &&
      !PALATAL_BAR_CONNECTOR_TOOTH_IDS.has(String(toothId))
    ) {
      if (PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS.has(String(toothId))) {
        setMessage(
          "Palatal Bar: anterior teeth (13-23) are treated as missing for connector parts.",
          true
        );
        return;
      }
      setMessage(
        "Palatal Bar: use posterior segments only (14–18 and 24–28, not anteriors).",
        true
      );
      return;
    }
    if (
      !palatalHoleUpper &&
      !palatalBarUpper &&
      !getMajorConnectorAssetReference(toothId, jaw)
    ) {
      setMessage("No major connector artwork is available for this tooth in the 2D view.", true);
      return;
    }

    if (hasPlacement(tooth, selectedComponent.id, null)) {
      if (
        shouldBlockMajorConnectorRemoval(toothId, { componentId: selectedComponent.id, surface: null }, state.teeth)
      ) {
        setMessage("Cannot remove this major connector part because it is connected on both sides.", true);
        return;
      }
      removePlacement(tooth, selectedComponent.id, null);
      if (isPalatalHoleMajorComponent(selectedComponent.id)) {
        state.archOverlayPalatalHoleActive = hasPalatalHolePlacementOnUpperArch(state.teeth);
      }
      setMessage(`Removed ${selectedComponent.label} from tooth ${toothId}.`, false);
      return;
    }

    if (!toothSupportsMajorConnectorOverlay(tooth, toothId, selectedComponent.id)) {
      setMessage(
        tooth.isPresent
          ? "Place a plate or reciprocating clasp on this tooth before adding this major connector (design mode)."
          : "Place a mesh on this missing tooth before adding this major connector (design mode).",
        true
      );
      return;
    }

    if (isPalatalHoleMajorComponent(selectedComponent.id) && palatalHoleUpper) {
      const majorIdsOnTooth = (tooth.componentPlacements || [])
        .map((e) => e.componentId)
        .filter((cid) => isMajorConnectorComponent(cid));
      if (majorIdsOnTooth.length > 0) {
        removePlacementsByComponentIds(tooth, majorIdsOnTooth);
      }
      addPlacement(tooth, selectedComponent.id, null);
      state.archOverlayPalatalHoleActive = true;
      setMessage(`Placed ${selectedComponent.label} on tooth ${toothId}.`, false);
      return;
    }

    if (isPalatalBarMajorComponent(selectedComponent.id) && palatalBarUpper) {
      const majorIdsOnTooth = (tooth.componentPlacements || [])
        .map((e) => e.componentId)
        .filter((cid) => isMajorConnectorComponent(cid));
      if (majorIdsOnTooth.length > 0) {
        removePlacementsByComponentIds(tooth, majorIdsOnTooth);
      }
      addPlacement(tooth, selectedComponent.id, null);
      setMessage(`Placed ${selectedComponent.label} on tooth ${toothId}.`, false);
      return;
    }

    const majorCriteria = assessPlacementCriteria(tooth, selectedComponent, COMPONENT_BY_ID);
    if (majorCriteria.pass) {
      addPlacement(tooth, selectedComponent.id, null);
      setMessage(`Placed ${selectedComponent.label} on tooth ${toothId}.`, false);
      return;
    }

    const { failureData: majorFailure } = majorCriteria;
    if (majorFailure.actionUponFailure === ACTION_UPON_FAILURE.PREVENT_PLACEMENT) {
      setMessage(majorFailure.reason, true);
      return;
    }

    if (majorFailure.actionUponFailure === ACTION_UPON_FAILURE.REMOVE_THEN_PLACE) {
      removePlacementsByComponentIds(tooth, majorFailure.conflictingComponents || []);
      addPlacement(tooth, selectedComponent.id, null);
      setMessage(`Replaced prior major and placed ${selectedComponent.label} on tooth ${toothId}.`, false);
    }
    return;
  }

  const requiresSurface =
    isRestComponent(selectedComponent) ||
    isRetainerClaspComponent(selectedComponent) ||
    isReciprocatingClaspComponent(selectedComponent) ||
    isRingClaspComponent(selectedComponent) ||
    isBarComponent(selectedComponent);
  const surface = normalizeSurface(placementContext?.surface);
  const targetSurface = requiresSurface ? surface : null;

  if (requiresSurface && !targetSurface) {
    if (selectedComponent.id === "rest-onlay") {
      if (isAnteriorToothId(toothId)) {
        setMessage("Onlay rest is only allowed on posterior teeth.", true);
        return;
      }
      placeSelectedComponentOnTooth(toothId, { surface: "mesial" });
      return;
    }
    if (
      isRetainerClaspComponent(selectedComponent) ||
      isReciprocatingClaspComponent(selectedComponent) ||
      isRingClaspComponent(selectedComponent)
    ) {
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

  if (selectedComponent.id === "rest-onlay" && isAnteriorToothId(toothId)) {
    setMessage("Onlay rest is only allowed on posterior teeth.", true);
    return;
  }

  if (hasPlacement(tooth, selectedComponent.id, targetSurface)) {
    removePlacement(tooth, selectedComponent.id, targetSurface);
    if (isPlateComponentId(selectedComponent.id)) {
      const remainingPlate = tooth.componentPlacements.some((e) => isPlateComponentId(e.componentId));
      if (!remainingPlate) {
        tooth.componentPlacements = tooth.componentPlacements.filter(
          (e) => !isClaspComponent(e.componentId)
        );
        syncToothComponentsFromPlacements(tooth);
      }
    }
    setMessage(
      `Removed ${selectedComponent.label}${targetSurface ? ` (${targetSurface})` : ""} from tooth ${toothId}.`,
      false
    );
    return;
  }

  // Clasp-circ constraint: max one clasp per tooth.
  // Any existing retainer-clasp on this tooth is replaced by the new placement.
  if (
    (
      isRetainerClaspComponent(selectedComponent) ||
      isReciprocatingClaspComponent(selectedComponent) ||
      isRingClaspComponent(selectedComponent)
    ) &&
    targetSurface
  ) {
    const existingClasp = (tooth.componentPlacements || []).find((entry) => {
      const sameClaspType = isRetainerClaspComponent(selectedComponent)
        ? isRetainerClaspComponent(entry.componentId)
        : isReciprocatingClaspComponent(selectedComponent)
          ? isReciprocatingClaspComponent(entry.componentId)
          : isRingClaspComponent(entry.componentId);
      if (!sameClaspType) return false;
      const s = normalizeSurface(entry.surface);
      return Boolean(s && s !== targetSurface);
    });
    if (existingClasp) {
      removePlacement(tooth, existingClasp.componentId, existingClasp.surface);
    }
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

export function resolveMajorConnectorAnchorComponentId(tooth) {
  ensureToothPlacementState(tooth);
  for (const { componentId } of tooth.componentPlacements) {
    const def = COMPONENT_BY_ID.get(componentId);
    if (!def) continue;
    if (tooth.isPresent && isPlateComponentId(componentId)) return componentId;
    if (tooth.isPresent && isReciprocatingClaspComponent(componentId)) return componentId;
    if (!tooth.isPresent && isMeshComponent(def)) return componentId;
  }
  return null;
}

export function shouldBlockMajorConnectorRemoval(toothId, placementEntry, teeth) {
  if (!placementEntry || !isMajorConnectorComponent(placementEntry.componentId)) {
    return false;
  }
  const id = String(toothId);
  const jaw = TOOTH_ORDER.upper.includes(id)
    ? "upper"
    : TOOTH_ORDER.lower.includes(id)
      ? "lower"
      : null;
  if (!jaw) {
    return false;
  }
  const order = TOOTH_ORDER[jaw] || [];
  const idx = order.indexOf(id);
  if (idx < 0) {
    return false;
  }
  const prevId = idx > 0 ? order[idx - 1] : null;
  const nextId = idx < order.length - 1 ? order[idx + 1] : null;
  const prevHasMajor = Boolean(prevId && toothHasMajorConnectorPlacement(teeth?.[prevId]));
  const nextHasMajor = Boolean(nextId && toothHasMajorConnectorPlacement(teeth?.[nextId]));
  return prevHasMajor && nextHasMajor;
}


export function toothSupportsMajorConnectorOverlay(tooth, toothId, majorComponentId) {
  if (resolveMajorConnectorAnchorComponentId(tooth) !== null) return true;
  if (isPalatalHoleMajorComponent(majorComponentId) && TOOTH_ORDER.upper.includes(String(toothId))) return true;
  if (isPalatalBarMajorComponent(majorComponentId) && PALATAL_BAR_CONNECTOR_TOOTH_IDS.has(String(toothId))) return true;
  if (
    majorComponentId === "major-lower-lingual-bar" &&
    TOOTH_ORDER.lower.includes(String(toothId)) &&
    getMajorConnectorAssetReference(toothId, "lower")
  ) return true;
  return false;
}

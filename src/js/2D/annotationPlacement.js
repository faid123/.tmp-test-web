import {
  ACTION_UPON_FAILURE,
  COMPONENT_BY_ID,
  getMajorConnectorAssetReference,
  hasPalatalHolePlacementOnUpperArch,
  isBarComponent,
  isClaspCircComponent,
  isClaspComponent,
  isMajorConnectorComponent,
  isMeshComponent,
  isPalatalBarMajorComponent,
  isPalatalHoleMajorComponent,
  isPlateComponentId,
  isRestComponent,
  PALATAL_BAR_CONNECTOR_TOOTH_IDS,
  PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS,
} from "./components.js";
import { TOOTH_ORDER } from "./constants.js";
import { state } from "./annotationState.js";
import { setMessage } from "./annotationDom.js";
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
          ? "Place a plate on this tooth before adding this major connector (design mode)."
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
    isClaspCircComponent(selectedComponent) ||
    isBarComponent(selectedComponent);
  const surface = normalizeSurface(placementContext?.surface);
  const targetSurface = requiresSurface ? surface : null;

  if (requiresSurface && !targetSurface) {
    if (selectedComponent.id === "rest-onlay") {
      placeSelectedComponentOnTooth(toothId, { surface: "mesial" });
      return;
    }
    if (isClaspCircComponent(selectedComponent)) {
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
    if (!tooth.isPresent && isMeshComponent(def)) return componentId;
  }
  return null;
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

function _getToothId(tooth) {
  return tooth?.tooth_id ?? tooth?.fdiId ?? "unknown";
}

function _isToothPresent(tooth) {
  if (typeof tooth?.isPresent === "boolean") return tooth.isPresent;
  if (typeof tooth?.presence === "string") return tooth.presence === "present";
  return true;
}

function _isMeshComponentId(componentId, componentById) {
  return isMeshComponent(componentById?.get?.(componentId) ?? componentId);
}

function _failure(reason, actionUponFailure, conflictingComponents = []) {
  return { pass: false, failureData: { reason, actionUponFailure, conflictingComponents } };
}

export function assessPlacementCriteria(tooth, selectedComponent, componentById) {
  const toothId = _getToothId(tooth);
  const present = _isToothPresent(tooth);
  const existingComponents = Array.isArray(tooth?.components) ? tooth.components : [];
  const isMajor = isMajorConnectorComponent(selectedComponent);

  if (!isMajor) {
    if (selectedComponent.requiresPresence && !present)
      return _failure(`Tooth ${toothId} is missing.`, ACTION_UPON_FAILURE.PREVENT_PLACEMENT);
    if (selectedComponent.requiresMissing && present)
      return _failure(`Tooth ${toothId} is present.`, ACTION_UPON_FAILURE.PREVENT_PLACEMENT);
  }

  const conflictsWith = Array.isArray(selectedComponent.conflictsWith) ? selectedComponent.conflictsWith : [];
  const conflicts = existingComponents.filter((id) => conflictsWith.includes(id));
  if (conflicts.length > 0)
    return _failure(`Conflicting components on tooth ${toothId}: ${conflicts.join(", ")}`, selectedComponent.actionUponFailure, conflicts);

  const selectedIsBar = isBarComponent(selectedComponent);
  const selectedIsClasp = isClaspComponent(selectedComponent);
  if (selectedIsBar || selectedIsClasp) {
    const barClaspConflicts = existingComponents.filter((id) =>
      selectedIsBar ? isClaspComponent(id) : isBarComponent(id)
    );
    if (barClaspConflicts.length > 0)
      return _failure(
        `Tooth ${toothId} already has ${selectedIsBar ? "a clasp" : "a bar"}; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        barClaspConflicts
      );
  }

  if (isMajor) {
    const existingMajors = existingComponents.filter((id) => isMajorConnectorComponent(id));
    if (existingMajors.length > 0 && !existingMajors.includes(selectedComponent.id))
      return _failure(
        `Tooth ${toothId} already has a major connector; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        existingMajors
      );
    return { pass: true, failureData: null };
  }

  if (isMeshComponent(selectedComponent)) {
    const overlappingMeshes = existingComponents.filter(
      (id) => id !== selectedComponent.id && _isMeshComponentId(id, componentById)
    );
    if (overlappingMeshes.length > 0)
      return _failure(
        `Tooth ${toothId} already has a mesh; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        overlappingMeshes
      );
  }

  return { pass: true, failureData: null };
}

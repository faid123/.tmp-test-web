import {
  ACTION_UPON_FAILURE,
  isBarComponent,
  isClaspComponent,
  isMajorConnectorComponent,
  isMeshComponent,
  isPlateComponentId,
  isReciprocatingClaspComponent,
} from "./components.js";

function getToothId(tooth) {
  return tooth?.tooth_id ?? tooth?.fdiId ?? "unknown";
}

function isToothPresent(tooth) {
  if (typeof tooth?.isPresent === "boolean") {
    return tooth.isPresent;
  }

  if (typeof tooth?.presence === "string") {
    return tooth.presence === "present";
  }

  return true;
}

function isMeshComponentId(componentId, componentById) {
  const componentDef = componentById?.get?.(componentId);
  return isMeshComponent(componentDef ?? componentId);
}

function failure(reason, actionUponFailure, conflictingComponents = []) {
  return {
    pass: false,
    failureData: {
      reason,
      actionUponFailure,
      conflictingComponents,
    },
  };
}

export function assessPlacementCriteria(tooth, selectedComponent, componentById) {
  const toothId = getToothId(tooth);
  const present = isToothPresent(tooth);
  const existingComponents = Array.isArray(tooth?.components) ? tooth.components : [];
  const isMajor = isMajorConnectorComponent(selectedComponent);

  if (!isMajor) {
    if (selectedComponent.requiresPresence && !present) {
      return failure(
        `Tooth ${toothId} is missing.`,
        ACTION_UPON_FAILURE.PREVENT_PLACEMENT
      );
    }

    if (selectedComponent.requiresMissing && present) {
      return failure(
        `Tooth ${toothId} is present.`,
        ACTION_UPON_FAILURE.PREVENT_PLACEMENT
      );
    }
  }

  const conflictsWith = Array.isArray(selectedComponent.conflictsWith)
    ? selectedComponent.conflictsWith
    : [];
  const conflicts = existingComponents.filter((id) => conflictsWith.includes(id));
  if (conflicts.length > 0) {
    return failure(
      `Conflicting components on tooth ${toothId}: ${conflicts.join(", ")}`,
      selectedComponent.actionUponFailure,
      conflicts
    );
  }

  const selectedIsBar = isBarComponent(selectedComponent);
  const selectedIsClasp = isClaspComponent(selectedComponent);
  if (selectedIsBar || selectedIsClasp) {
    const barClaspConflicts = existingComponents.filter((id) => {
      if (selectedIsBar) {
        return isClaspComponent(id);
      }
      return isBarComponent(id);
    });
    if (barClaspConflicts.length > 0) {
      return failure(
        `Tooth ${toothId} already has ${selectedIsBar ? "a clasp" : "a bar"}; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        barClaspConflicts
      );
    }
  }

  if (selectedIsBar) {
    const barConflicts = existingComponents.filter((id) => {
      if (id === selectedComponent.id) {
        return false;
      }
      return isBarComponent(id);
    });
    if (barConflicts.length > 0) {
      return failure(
        `Tooth ${toothId} already has a bar; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        barConflicts
      );
    }
  }

  const selectedIsReciprocatingClasp = isReciprocatingClaspComponent(selectedComponent);
  const selectedIsReciprocatingPlate = isPlateComponentId(selectedComponent.id);
  if (selectedIsReciprocatingClasp || selectedIsReciprocatingPlate) {
    const reciprocatingConflicts = existingComponents.filter((id) => {
      if (selectedIsReciprocatingClasp) {
        return isPlateComponentId(id);
      }
      return isReciprocatingClaspComponent(id);
    });
    if (reciprocatingConflicts.length > 0) {
      return failure(
        `Tooth ${toothId} already has a reciprocating component; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        reciprocatingConflicts
      );
    }
  }

  if (isMajor) {
    const existingMajors = existingComponents.filter((id) => isMajorConnectorComponent(id));
    if (existingMajors.length > 0 && !existingMajors.includes(selectedComponent.id)) {
      return failure(
        `Tooth ${toothId} already has a major connector; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        existingMajors
      );
    }
    return {
      pass: true,
      failureData: null,
    };
  }

  if (isMeshComponent(selectedComponent)) {
    const overlappingMeshes = existingComponents.filter((id) => {
      if (id === selectedComponent.id) {
        return false;
      }
      return isMeshComponentId(id, componentById);
    });

    if (overlappingMeshes.length > 0) {
      return failure(
        `Tooth ${toothId} already has a mesh; replacing with ${selectedComponent.id}.`,
        ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
        overlappingMeshes
      );
    }
  }

  return {
    pass: true,
    failureData: null,
  };
}

import { ACTION_UPON_FAILURE, isMeshComponent } from "./components.js";

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
  if (componentById && typeof componentById.get === "function") {
    const componentDef = componentById.get(componentId);
    if (componentDef) {
      return isMeshComponent(componentDef);
    }
  }

  return String(componentId || "").startsWith("mesh-");
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

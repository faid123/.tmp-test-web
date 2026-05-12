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
import { getHistoryStateSignature, recordHistoryIfChanged, state, setMessage } from "./2DAnnotation.js";
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
import { assessPlacementCriteria } from "./criteria.js";

// Check whether a tooth ID is anterior (unit 1-3).
function isAnteriorToothId(toothId) {
  const unit = Number(toothId) % 10;
  return Number.isFinite(unit) && unit >= 1 && unit <= 3;
}

// Apply follow-up cleanup rules after removing a placement.
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

// Main placement engine for currently selected component on one tooth.
export function placeSelectedComponentOnTooth(toothId, placementContext = null) {
  const historyBefore = getHistoryStateSignature();
  try {
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
  } finally {
    recordHistoryIfChanged(historyBefore);
  }
}

export function placeSimpleCircumAssemblyOnTooth(toothId, restSurface) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  ensureToothPlacementState(tooth);
  const normalizedRestSurface = normalizeSurface(restSurface);
  if (normalizedRestSurface !== "mesial" && normalizedRestSurface !== "distal") {
    setMessage("Simple Circum Assembly supports mesial or distal rest seat only.", true);
    return false;
  }

  const mapped = normalizedRestSurface === "mesial"
    ? {
      rest: "mesial",
      retainer: "distal_buccal",
      reciprocating: "distal_lingual",
    }
    : {
      rest: "distal",
      retainer: "mesial_buccal",
      reciprocating: "mesial_lingual",
    };

  tooth.componentPlacements = (tooth.componentPlacements || []).filter((entry) => {
    const cid = entry.componentId;
    return !(
      cid === "rest-seat" ||
      isRetainerClaspComponent(cid) ||
      isReciprocatingClaspComponent(cid)
    );
  });
  clearReciprocatingPlateMeshOnTooth(tooth);

  addPlacement(tooth, "rest-seat", mapped.rest);
  addPlacement(tooth, "retainer-clasp", mapped.retainer);
  addPlacement(tooth, "reciprocating-clasp", mapped.reciprocating);
  syncToothComponentsFromPlacements(tooth);

  setMessage(
    `Placed Simple Circum Assembly on tooth ${id} (${mapped.rest} rest, ${mapped.retainer} retainer, ${mapped.reciprocating} reciprocating).`,
    false
  );
  return true;
}

export function getEmbrasureNeighborToothId(toothId, jaw, clickedSurface) {
  const order = TOOTH_ORDER[jaw] || [];
  const idx = order.indexOf(String(toothId));
  if (idx < 0) return null;
  const quadrant = Number(String(toothId).charAt(0));
  const mesialStep = quadrant === 1 || quadrant === 3 ? 1 : -1;
  const distalStep = -mesialStep;
  const step = clickedSurface === "mesial" ? mesialStep : clickedSurface === "distal" ? distalStep : 0;
  if (!step) return null;
  const neighbor = order[idx + step];
  return neighbor ? String(neighbor) : null;
}

function getDistalNeighborToothId(toothId, jaw) {
  return getEmbrasureNeighborToothId(toothId, jaw, "distal");
}

function clearRestAndCircumClaspsOnTooth(tooth) {
  tooth.componentPlacements = (tooth.componentPlacements || []).filter((entry) => {
    const cid = entry.componentId;
    return !(cid === "rest-seat" || isRetainerClaspComponent(cid) || isReciprocatingClaspComponent(cid));
  });
}

function clearReciprocatingPlateMeshOnTooth(tooth) {
  tooth.componentPlacements = (tooth.componentPlacements || []).filter((entry) => {
    const cid = entry.componentId;
    return !(isPlateComponentId(cid) || isMeshComponent(cid));
  });
}

function placeCircumBundle(tooth, mode) {
  if (mode === "mesial") {
    addPlacement(tooth, "rest-seat", "mesial");
    addPlacement(tooth, "retainer-clasp", "distal_buccal");
    addPlacement(tooth, "reciprocating-clasp", "distal_lingual");
    return;
  }
  addPlacement(tooth, "rest-seat", "distal");
  addPlacement(tooth, "retainer-clasp", "mesial_buccal");
  addPlacement(tooth, "reciprocating-clasp", "mesial_lingual");
}

export function placeEmbrasureCircumAssemblyOnTooth(toothId, jaw, restSurface) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  const clicked = normalizeSurface(restSurface);
  if (clicked !== "distal") {
    setMessage("Embrasure Assembly supports distal rest-seat suggestion only.", true);
    return false;
  }

  const neighborToothId = getEmbrasureNeighborToothId(id, jaw, "distal");
  if (!neighborToothId || !state.teeth[neighborToothId]) {
    setMessage("No adjacent posterior tooth available for Embrasure Assembly.", true);
    return false;
  }

  const neighborTooth = state.teeth[neighborToothId];
  if (!tooth.isPresent || !neighborTooth.isPresent) {
    setMessage("Embrasure Assembly requires both adjacent teeth to be present.", true);
    return false;
  }

  ensureToothPlacementState(tooth);
  ensureToothPlacementState(neighborTooth);

  clearRestAndCircumClaspsOnTooth(tooth);
  clearRestAndCircumClaspsOnTooth(neighborTooth);
  clearReciprocatingPlateMeshOnTooth(tooth);
  clearReciprocatingPlateMeshOnTooth(neighborTooth);

  placeCircumBundle(tooth, "distal");
  placeCircumBundle(neighborTooth, "mesial");

  syncToothComponentsFromPlacements(tooth);
  syncToothComponentsFromPlacements(neighborTooth);

  setMessage(`Placed Embrasure Assembly on teeth ${id} and ${neighborToothId}.`, false);
  return true;
}

export function placeMultiCircumAssemblyOnTooth(toothId, jaw) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  const neighborToothId = getDistalNeighborToothId(id, jaw);
  if (!neighborToothId || !state.teeth[neighborToothId]) {
    setMessage("No adjacent distal posterior tooth available for Multi Assembly.", true);
    return false;
  }

  const neighborTooth = state.teeth[neighborToothId];
  if (!tooth.isPresent || !neighborTooth.isPresent) {
    setMessage("Multi Assembly requires both selected and adjacent distal teeth to be present.", true);
    return false;
  }

  ensureToothPlacementState(tooth);
  ensureToothPlacementState(neighborTooth);

  clearRestAndCircumClaspsOnTooth(tooth);
  clearRestAndCircumClaspsOnTooth(neighborTooth);
  clearReciprocatingPlateMeshOnTooth(tooth);
  clearReciprocatingPlateMeshOnTooth(neighborTooth);

  placeCircumBundle(tooth, "mesial");
  placeCircumBundle(neighborTooth, "distal");

  syncToothComponentsFromPlacements(tooth);
  syncToothComponentsFromPlacements(neighborTooth);

  setMessage(`Placed Multi Assembly on teeth ${id} and distal adjacent ${neighborToothId}.`, false);
  return true;
}

export function placeHalfAndHalfAssemblyOnTooth(toothId, restSurface) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  const clicked = normalizeSurface(restSurface);
  if (clicked !== "mesial" && clicked !== "distal") {
    setMessage("Half & Half supports mesial or distal rest-seat suggestion only.", true);
    return false;
  }

  ensureToothPlacementState(tooth);
  clearRestAndCircumClaspsOnTooth(tooth);
  clearReciprocatingPlateMeshOnTooth(tooth);

  if (clicked === "mesial") {
    addPlacement(tooth, "retainer-clasp", "distal_buccal");
    addPlacement(tooth, "reciprocating-clasp", "mesial_buccal");
  } else {
    addPlacement(tooth, "retainer-clasp", "mesial_buccal");
    addPlacement(tooth, "reciprocating-clasp", "distal_buccal");
  }

  syncToothComponentsFromPlacements(tooth);
  setMessage(`Placed Half & Half on tooth ${id}.`, false);
  return true;
}

export function placeAssemblyTBarOnTooth(toothId, jaw, restSurface) {
  return placeAssemblyBarOnTooth(toothId, jaw, restSurface, {
    barComponentId: "bar-t",
    label: "T-bar",
    getReciprocatingSurface: (clicked) =>
      clicked === "mesial" ? "distal_lingual" : "mesial_lingual",
  });
}

function getAssemblyBarContext(toothId, jaw, restSurface, label) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return null;
  }

  const clicked = normalizeSurface(restSurface);
  if (clicked !== "mesial" && clicked !== "distal") {
    setMessage(`${label} Assembly supports mesial or distal rest-seat suggestion only.`, true);
    return null;
  }

  ensureToothPlacementState(tooth);

  const order = TOOTH_ORDER[jaw] || [];
  const idx = order.indexOf(id);
  if (idx < 0) {
    setMessage("Unknown jaw for this tooth.", true);
    return null;
  }
  const prevId = idx > 0 ? order[idx - 1] : null;
  const nextId = idx < order.length - 1 ? order[idx + 1] : null;
  const prevMissing = Boolean(prevId && state.teeth[prevId] && !state.teeth[prevId].isPresent);
  const nextMissing = Boolean(nextId && state.teeth[nextId] && !state.teeth[nextId].isPresent);

  if (!prevMissing && !nextMissing) {
    setMessage("Choose a tooth adjacent to a missing tooth.", true);
    return null;
  }

  const quadrant = Number(id.charAt(0));
  const mesialStep = quadrant === 1 || quadrant === 3 ? 1 : -1;
  const missingNeighborStep = prevMissing ? -1 : 1;
  const missingOnMesial = missingNeighborStep === mesialStep;
  const barSurface = missingOnMesial ? "bar_d1_distal" : "bar_d1_mesial";

  return { id, tooth, clicked, barSurface, missingOnMesial };
}

function placeAssemblyBarOnTooth(toothId, jaw, restSurface, config) {
  const context = getAssemblyBarContext(toothId, jaw, restSurface, config.label);
  if (!context) return false;
  const { id, tooth, clicked, barSurface, missingOnMesial } = context;

  tooth.componentPlacements = (tooth.componentPlacements || []).filter((entry) => {
    const cid = entry.componentId;
    return !(cid === "rest-seat" || isReciprocatingClaspComponent(cid) || cid === "bar-t" || cid === "bar-i");
  });

  tooth.componentPlacements = tooth.componentPlacements.filter((entry) => {
    const cid = entry.componentId;
    return !(isPlateComponentId(cid) || isMeshComponent(cid));
  });

  if (clicked === "mesial") {
    addPlacement(tooth, config.barComponentId, barSurface);
    addPlacement(tooth, "reciprocating-clasp", config.getReciprocatingSurface(clicked, missingOnMesial));
    addPlacement(tooth, "rest-seat", "mesial");
  } else if (clicked === "distal") {
    addPlacement(tooth, config.barComponentId, barSurface);
    addPlacement(tooth, "reciprocating-clasp", config.getReciprocatingSurface(clicked, missingOnMesial));
    addPlacement(tooth, "rest-seat", "distal");
  }

  syncToothComponentsFromPlacements(tooth);
  setMessage(`Placed ${config.label} Assembly on tooth ${id}.`, false);
  return true;
}

export function placeAssemblyModTBarOnTooth(toothId, jaw, restSurface) {
  return placeAssemblyBarOnTooth(toothId, jaw, restSurface, {
    barComponentId: "bar-t",
    label: "Mod.T-bar",
    getReciprocatingSurface: (clicked) =>
      clicked === "mesial" ? "distal_lingual" : "mesial_lingual",
  });
}

export function placeAssemblyIBarOnTooth(toothId, jaw, restSurface) {
  return placeAssemblyBarOnTooth(toothId, jaw, restSurface, {
    barComponentId: "bar-i",
    label: "I-bar",
    getReciprocatingSurface: (clicked) =>
      clicked === "mesial" ? "distal_lingual" : "mesial_lingual",
  });
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

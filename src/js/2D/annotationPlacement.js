import {
  ACTION_UPON_FAILURE,
  ASSEMBLY_REST_SUGGESTION_IDS,
  COMPONENT_BY_ID,
  getBarPlacementSurfaceForTooth,
  getMajorConnectorAssetReference,
  getMajorConnectorSpanTeeth,
  majorConnectorRunsToMidline,
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
import { ensureMajorCatalogPickForTooth, isComponentBlockedByMaterial } from "./annotationCatalog.js";
import { assessPlacementCriteria } from "./criteria.js";

// Check whether a tooth ID is anterior (unit 1-3).
function isAnteriorToothId(toothId) {
  const unit = Number(toothId) % 10;
  return Number.isFinite(unit) && unit >= 1 && unit <= 3;
}

// Default reciprocating element for a retentive placement: the proximal (reciprocating)
// plate. Surfaceless — it plates the whole tooth and encodes reciprocating=2.
const DEFAULT_RECIPROCATING_COMPONENT_ID = "plate-prox";

// A tooth's single reciprocating slot is a reciprocating clasp OR a proximal/mesh
// plate (see annotationTeethModel.RECIPROCATING_SLOT_IDS).
function toothHasReciprocatingElement(tooth) {
  return (tooth?.componentPlacements || []).some(
    (entry) =>
      isReciprocatingClaspComponent(entry.componentId) || isPlateComponentId(entry.componentId)
  );
}

// Clasps, bars, and rests all need reciprocation: placing one auto-adds the default
// reciprocating plate, unless the tooth already carries a reciprocating element
// (clasp or plate) — which includes the case where the placement IS one.
function autoPlaceDefaultReciprocatingElement(tooth, selectedComponent) {
  const needsReciprocation =
    isClaspComponent(selectedComponent) ||
    isBarComponent(selectedComponent) ||
    isRestComponent(selectedComponent);
  if (!needsReciprocation || toothHasReciprocatingElement(tooth)) return;
  addPlacement(tooth, DEFAULT_RECIPROCATING_COMPONENT_ID, null);
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

  // Full acrylic can't carry mesh, bars, or the palatal A-P strap / palatal bar —
  // refuse the placement even if a stale selection slips through the catalog gate.
  if (isComponentBlockedByMaterial(selectedComponent.id)) {
    setMessage("This component isn't available for a full acrylic case.", true);
    return;
  }

  // Assemblies are macros: each places its own components from a rest-seat suggestion
  // dot (handleRestSuggestionPick -> placeXAssemblyOnTooth). They need no surface, so a
  // tap on the tooth body would otherwise fall through and store the assembly id itself
  // as a placement — not a real component, and it then shows up in the remove list.
  if (ASSEMBLY_REST_SUGGESTION_IDS.has(selectedComponent.id)) {
    setMessage(
      `For ${selectedComponent.label}, click a rest suggestion point (mesial or distal).`,
      true
    );
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
      setMessage(`For ${selectedComponent.label}, click a highlighted tooth near a mesh-bearing tooth.`, true);
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

  // Bar constraint: keep exactly one placement per selected bar on a tooth.
  // If user switches side (mesial/distal), replace previous surface with new one.
  if (isBarComponent(selectedComponent) && targetSurface) {
    const existingSameBarDifferentSurface = (tooth.componentPlacements || []).find((entry) => {
      if (entry.componentId !== selectedComponent.id) return false;
      const s = normalizeSurface(entry.surface);
      return Boolean(s && s !== targetSurface);
    });
    if (existingSameBarDifferentSurface) {
      removePlacement(tooth, existingSameBarDifferentSurface.componentId, existingSameBarDifferentSurface.surface);
    }
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
    autoPlaceDefaultReciprocatingElement(tooth, selectedComponent);
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
    autoPlaceDefaultReciprocatingElement(tooth, selectedComponent);
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

/**
 * Back-action Clasps. Both rest dots are offered; the clasp goes on the corner OPPOSITE
 * the rest and the reciprocal stays on the rest's own corner:
 *
 *   45 missing -> 44: distal rest, mesio-buccal clasp, disto-lingual reciprocal
 *                 46: mesial rest, disto-buccal clasp, mesio-lingual reciprocal
 *
 * That reciprocal placement is what separates it from Simple Circum, where the
 * reciprocal is the retainer arch-flipped at the SAME corner (mesial rest -> distal
 * clasp AND distal reciprocal).
 */
export function placeBackActionAssemblyOnTooth(toothId, restSurface) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  const rest = normalizeSurface(restSurface);
  if (rest !== "mesial" && rest !== "distal") {
    setMessage("Back-action Clasps supports mesial or distal rest seat only.", true);
    return false;
  }

  if (!tooth.isPresent) {
    setMessage("Back-action Clasps requires a present abutment tooth.", true);
    return false;
  }

  const clasp = `${oppositeRestSurface(rest)}_buccal`;
  const reciprocating = `${rest}_lingual`;

  ensureToothPlacementState(tooth);
  clearRestAndCircumClaspsOnTooth(tooth);
  clearReciprocatingPlateMeshOnTooth(tooth);

  addPlacement(tooth, "rest-seat", rest);
  addPlacement(tooth, "retainer-clasp", clasp);
  addPlacement(tooth, "reciprocating-clasp", reciprocating);
  syncToothComponentsFromPlacements(tooth);

  setMessage(
    `Placed Back-action Clasps on tooth ${id} (${rest} rest, ${clasp} clasp, ${reciprocating} reciprocating).`,
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

// Which of a present tooth's mesial/distal surfaces face an adjacent missing tooth.
// Combine Clasps brackets an edentulous area, so its rest seats sit on exactly these
// surfaces — e.g. with 23 missing, 22 offers distal and 24 offers mesial.
export function getGapFacingRestSurfaces(toothId, jaw) {
  const tooth = state.teeth[String(toothId)];
  if (!tooth || !tooth.isPresent) return [];
  const surfaces = [];
  for (const side of ["mesial", "distal"]) {
    const neighbourId = getEmbrasureNeighborToothId(toothId, jaw, side);
    const neighbour = neighbourId ? state.teeth[neighbourId] : null;
    if (neighbour && !neighbour.isPresent) surfaces.push(side);
  }
  return surfaces;
}

// The abutment bracketing the far end of the gap that `side` opens onto, skipping the
// whole edentulous run (23 + 24 missing -> 22's partner is 25). Null when the gap runs
// off the end of the arch, i.e. a free-end saddle with a single abutment.
function getAbutmentAcrossGap(toothId, jaw, side) {
  const id = String(toothId);
  const order = TOOTH_ORDER[jaw] || [];
  const idx = order.indexOf(id);
  if (idx < 0) return null;
  const quadrant = Number(id.charAt(0));
  const mesialStep = quadrant === 1 || quadrant === 3 ? 1 : -1;
  const step = side === "mesial" ? mesialStep : -mesialStep;

  let i = idx + step;
  const isMissingAt = (n) => Boolean(order[n] && state.teeth[order[n]] && !state.teeth[order[n]].isPresent);
  if (!isMissingAt(i)) return null;
  while (isMissingAt(i)) i += step;

  const acrossId = order[i];
  const across = acrossId ? state.teeth[acrossId] : null;
  return across && across.isPresent ? String(acrossId) : null;
}

const oppositeRestSurface = (surface) => (surface === "mesial" ? "distal" : "mesial");

/**
 * Combine Clasps bundles, keyed by tier. `side` is the mesial/distal label that points
 * at the edentulous area — the same label for both tiers, since an outward neighbour
 * faces its abutment across the matching surface.
 *
 * Worked example, 15 missing (so side = "distal" on the mesial run):
 *   14 (abutment): mesial + distal rests, disto-buccal clasp, disto-lingual reciprocal
 *   13 (outward) : distal rest,           mesio-buccal clasp, mesio-lingual reciprocal
 * 16/17 mirror it with side = "mesial".
 *
 * The abutment carries both arms on its gap-facing corner; the outward tooth carries
 * both on the corner away from its abutment. Either way the reciprocal is the retainer
 * arch-flipped at the SAME corner, matching the rest of the app.
 */
function placeCombineClaspAbutmentBundle(tooth, side) {
  addPlacement(tooth, "rest-seat", "mesial");
  addPlacement(tooth, "rest-seat", "distal");
  addPlacement(tooth, "retainer-clasp", `${side}_buccal`);
  addPlacement(tooth, "reciprocating-clasp", `${side}_lingual`);
}

function placeCombineClaspOutwardBundle(tooth, side) {
  addPlacement(tooth, "rest-seat", side);
  addPlacement(tooth, "retainer-clasp", `${oppositeRestSurface(side)}_buccal`);
  addPlacement(tooth, "reciprocating-clasp", `${oppositeRestSurface(side)}_lingual`);
}

/**
 * Teeth a Combine Clasps click builds, as {toothId, side, tier} records:
 *   tier "abutment" — the teeth bracketing the gap, `side` facing it (15 missing ->
 *                     14 distal, 16 mesial);
 *   tier "outward"  — the next present tooth beyond each abutment (-> 13, 17).
 */
function collectCombineClaspTargets(toothId, jaw, clickedSurface) {
  const abutments = [{ toothId: String(toothId), side: clickedSurface, tier: "abutment" }];

  const partnerId = getAbutmentAcrossGap(toothId, jaw, clickedSurface);
  if (partnerId) {
    abutments.push({ toothId: partnerId, side: oppositeRestSurface(clickedSurface), tier: "abutment" });
  }

  const targets = [...abutments];
  const claimed = new Set(abutments.map((t) => t.toothId));
  for (const abutment of abutments) {
    const outwardSide = oppositeRestSurface(abutment.side);
    const nextId = getEmbrasureNeighborToothId(abutment.toothId, jaw, outwardSide);
    const next = nextId ? state.teeth[nextId] : null;
    if (!next || !next.isPresent || claimed.has(nextId)) continue;
    claimed.add(nextId);
    targets.push({ toothId: nextId, side: abutment.side, tier: "outward" });
  }
  return targets;
}

export function placeEmbrasureCircumAssemblyOnTooth(toothId, jaw, restSurface) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  const clicked = normalizeSurface(restSurface);
  if (!getGapFacingRestSurfaces(id, jaw).includes(clicked)) {
    setMessage("Combine Clasps needs a rest seat facing a missing tooth.", true);
    return false;
  }

  const targets = collectCombineClaspTargets(id, jaw, clicked);

  // Clear every target first: an outward neighbour may already carry components from
  // an earlier click, and clearing as we go would wipe a bundle just placed.
  for (const target of targets) {
    const rec = state.teeth[target.toothId];
    ensureToothPlacementState(rec);
    clearRestAndCircumClaspsOnTooth(rec);
    clearReciprocatingPlateMeshOnTooth(rec);
  }
  for (const target of targets) {
    const rec = state.teeth[target.toothId];
    if (target.tier === "abutment") placeCombineClaspAbutmentBundle(rec, target.side);
    else placeCombineClaspOutwardBundle(rec, target.side);
    syncToothComponentsFromPlacements(rec);
  }

  const summary = targets.map((t) => `${t.toothId} (${t.side})`).join(", ");
  setMessage(`Placed Combine Clasps on ${summary}.`, false);
  return true;
}

/**
 * The tooth a Continuous Clasps click splints to: the neighbour AWAY from the gap, so a
 * distal (gap-facing) rest pairs mesially. Null unless that neighbour exists and is present.
 */
function getContinuousClaspPartnerId(toothId, jaw, restSurface) {
  const partnerId = getEmbrasureNeighborToothId(toothId, jaw, oppositeRestSurface(restSurface));
  const partner = partnerId ? state.teeth[partnerId] : null;
  return partner && partner.isPresent ? String(partnerId) : null;
}

/**
 * Continuous Clasps splints an abutment to the next tooth away from the edentulous area,
 * so — like RPI/RPA — its rest suggestions sit beside the missing tooth: on whichever
 * surfaces face the gap, and only where there is a present tooth to splint back to.
 * With 25 missing that is 24's distal (pairing 23) and 26's mesial (pairing 27).
 */
export function getContinuousClaspRestSurfaces(toothId, jaw) {
  return getGapFacingRestSurfaces(toothId, jaw).filter((side) =>
    Boolean(getContinuousClaspPartnerId(toothId, jaw, side))
  );
}

export function placeMultiCircumAssemblyOnTooth(toothId, jaw, restSurface) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return false;
  }

  const clicked = normalizeSurface(restSurface);
  if (!getGapFacingRestSurfaces(id, jaw).includes(clicked)) {
    setMessage("Continuous Clasps needs a rest seat facing a missing tooth.", true);
    return false;
  }

  const neighborToothId = getContinuousClaspPartnerId(id, jaw, clicked);
  if (!neighborToothId) {
    setMessage("No adjacent tooth beyond the abutment to splint Continuous Clasps to.", true);
    return false;
  }

  const neighborTooth = state.teeth[neighborToothId];
  ensureToothPlacementState(tooth);
  ensureToothPlacementState(neighborTooth);

  clearRestAndCircumClaspsOnTooth(tooth);
  clearRestAndCircumClaspsOnTooth(neighborTooth);
  clearReciprocatingPlateMeshOnTooth(tooth);
  clearReciprocatingPlateMeshOnTooth(neighborTooth);

  // Rests at the two outer ends of the splinted pair; both clasps meet in the shared
  // embrasure between them.
  placeCircumBundle(tooth, clicked);
  placeCircumBundle(neighborTooth, oppositeRestSurface(clicked));

  syncToothComponentsFromPlacements(tooth);
  syncToothComponentsFromPlacements(neighborTooth);

  setMessage(
    `Placed Continuous Clasps on teeth ${id} (${clicked} rest) and ${neighborToothId}.`,
    false
  );
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

  // Half & Half is double-rested: the retentive and reciprocal arms arise from
  // opposite directions, so each gets its own rest seat.
  addPlacement(tooth, "rest-seat", "mesial");
  addPlacement(tooth, "rest-seat", "distal");

  // Retentive arm buccal, reciprocal arm lingual, at opposite mesial/distal corners.
  if (clicked === "mesial") {
    addPlacement(tooth, "retainer-clasp", "distal_buccal");
    addPlacement(tooth, "reciprocating-clasp", "mesial_lingual");
  } else {
    addPlacement(tooth, "retainer-clasp", "mesial_buccal");
    addPlacement(tooth, "reciprocating-clasp", "distal_lingual");
  }

  syncToothComponentsFromPlacements(tooth);
  setMessage(`Placed Half & Half on tooth ${id} (mesial + distal rests).`, false);
  return true;
}

// The immediately-distal neighbour (away from the midline), or null at the arch end.
function getDistalNeighbourId(toothId, jaw) {
  const id = String(toothId);
  const order = TOOTH_ORDER[jaw] || [];
  const idx = order.indexOf(id);
  if (idx < 0) return null;
  const quadrant = Number(id.charAt(0));
  const mesialStep = quadrant === 1 || quadrant === 3 ? 1 : -1;
  return order[idx - mesialStep] || null;
}

// True when `toothId` is a distal-extension abutment: its distal neighbour is missing.
// RPI/RPA are only defined for that case — the rest sits mesial and the retentive
// element plus proximal plate face the saddle on the distal.
export function hasMissingDistalNeighbour(toothId, jaw) {
  const distalId = getDistalNeighbourId(toothId, jaw);
  return Boolean(distalId && state.teeth[distalId] && !state.teeth[distalId].isPresent);
}

// An I-bar bases from the denture saddle, which this tool represents as a mesh
// placement. Without one, pruneInvalidBarPlacementsInJaw drops the bar on the very
// next render — so RPI needs the distal saddle actually meshed, matching the rule
// the BARS tab already enforces via getBarSuggestibleToothIdSet.
export function hasMeshedDistalSaddle(toothId, jaw) {
  const distalId = getDistalNeighbourId(toothId, jaw);
  const distalTooth = distalId ? state.teeth[distalId] : null;
  if (!distalTooth || distalTooth.isPresent) return false;
  return (distalTooth.componentPlacements || []).some((entry) => isMeshComponent(entry.componentId));
}

function getRpxAssemblyContext(toothId, jaw, restSurface, label) {
  const id = String(toothId);
  const tooth = state.teeth[id];
  if (!tooth) {
    setMessage("Unknown tooth.", true);
    return null;
  }

  if (normalizeSurface(restSurface) !== "mesial") {
    setMessage(`${label} places its rest on the mesial only.`, true);
    return null;
  }

  if (!tooth.isPresent) {
    setMessage(`${label} requires a present abutment tooth.`, true);
    return null;
  }

  if (!hasMissingDistalNeighbour(id, jaw)) {
    setMessage(`${label} needs a distal-extension abutment (the distal neighbour must be missing).`, true);
    return null;
  }

  ensureToothPlacementState(tooth);
  return { id, tooth };
}

// Resolve the I-bar's placement surface from the real mesh layout rather than
// hardcoding it: the `bar_d?_{mesial|distal}` label is keyed to per-tooth offset and
// scale tuning and is NOT the anatomical side of the saddle, so deriving it here
// keeps RPI consistent with the BARS tab and with pruneInvalidBarPlacementsInJaw.
function getRpiBarSurface(toothId, jaw) {
  const surface = getBarPlacementSurfaceForTooth(toothId, jaw, state.teeth);
  return surface && surface.startsWith("bar_d1_") ? surface : null;
}

// Shared RPI/RPA placement: mesial rest + proximal (reciprocal) plate + one distal
// retentive element. `config.resolveRetentiveElement` returns the {componentId, surface}
// to place, or null when this abutment can't carry it.
function placeRpxAssemblyOnTooth(toothId, jaw, restSurface, config) {
  const context = getRpxAssemblyContext(toothId, jaw, restSurface, config.label);
  if (!context) return false;
  const { id, tooth } = context;

  const retentive = config.resolveRetentiveElement(id, jaw);
  if (!retentive) {
    setMessage(config.retentiveFailureReason, true);
    return false;
  }

  tooth.componentPlacements = (tooth.componentPlacements || []).filter((entry) => {
    const cid = entry.componentId;
    return !(
      cid === "rest-seat" ||
      isRetainerClaspComponent(cid) ||
      isReciprocatingClaspComponent(cid) ||
      isBarComponent(cid) ||
      isPlateComponentId(cid) ||
      isMeshComponent(cid)
    );
  });

  addPlacement(tooth, "rest-seat", "mesial");
  addPlacement(tooth, retentive.componentId, retentive.surface);
  // Last: plate-prox owns the reciprocating slot, so it clears any stray
  // reciprocating clasp the retentive element may have brought with it.
  addPlacement(tooth, "plate-prox", null);

  syncToothComponentsFromPlacements(tooth);
  setMessage(`Placed ${config.label} on tooth ${id} (mesial rest, proximal plate, ${config.retentiveLabel}).`, false);
  return true;
}

export function placeAssemblyRpiOnTooth(toothId, jaw, restSurface) {
  return placeRpxAssemblyOnTooth(toothId, jaw, restSurface, {
    label: "RPI",
    retentiveLabel: "I-bar off the distal saddle",
    retentiveFailureReason:
      "RPI needs a saddle to base the I-bar from — place a mesh on the missing distal tooth first.",
    resolveRetentiveElement: (id, jawKey) => {
      const surface = getRpiBarSurface(id, jawKey);
      return surface ? { componentId: "bar-i", surface } : null;
    },
  });
}

export function placeAssemblyRpaOnTooth(toothId, jaw, restSurface) {
  return placeRpxAssemblyOnTooth(toothId, jaw, restSurface, {
    label: "RPA",
    // The Akers arm originates at the mesial rest and faces it, so unlike Simple
    // Circum (mesial rest -> distal_buccal retainer) the clasp stays on the mesial.
    retentiveLabel: "mesial buccal clasp",
    retentiveFailureReason: "RPA could not resolve a clasp position for this tooth.",
    resolveRetentiveElement: () => ({ componentId: "retainer-clasp", surface: "mesial_buccal" }),
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


export function toothSupportsMajorConnectorOverlay(tooth, toothId, majorComponentId, teeth = state.teeth) {
  if (resolveMajorConnectorAnchorComponentId(tooth) !== null) return true;
  // Past here the tooth anchors nothing, so it can only be carried by a run that reaches it.
  const id = String(toothId);
  const jaw = TOOTH_ORDER.upper.includes(id) ? "upper" : TOOTH_ORDER.lower.includes(id) ? "lower" : null;
  if (!jaw) return false;
  // A posterior-only major (palatal bar/strap) is placed per anchored tooth and carries
  // nobody, so an unanchored tooth is never its own — matching the catalog's own
  // "click teeth with mesh or plate".
  if (!majorConnectorRunsToMidline(majorComponentId)) return false;
  // A midline-reaching major DOES carry bare teeth, but only the ones between its run's start
  // and the midline — which the span walk itself decides. Asking anything looser (the old
  // "any upper tooth" / "any lower tooth with art") offers the terminal molars 18/28/38/48:
  // they sit distal of every anchor, so no run reaches them, and the arch then ghosts — and
  // lets you click — a connector stub hanging off the back of the design.
  return getMajorConnectorSpanTeeth(teeth, majorComponentId, COMPONENT_BY_ID, jaw, {
    includeExistingPlacements: true,
  }).includes(id);
}

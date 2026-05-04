import {
  COMPONENT_BY_ID,
  getMajorConnectorAssetReference,
  isMeshComponent,
  isPalatalBarMajorComponent,
  isPalatalHoleMajorComponent,
  isPlateComponentId,
  PALATAL_BAR_CONNECTOR_TOOTH_IDS,
} from "./components.js";
import { TOOTH_ORDER } from "./constants.js";
import { ensureToothPlacementState } from "./annotationTeethModel.js";

export function resolveMajorConnectorAnchorComponentId(tooth) {
  ensureToothPlacementState(tooth);
  for (const { componentId } of tooth.componentPlacements) {
    const def = COMPONENT_BY_ID.get(componentId);
    if (!def) {
      continue;
    }
    if (tooth.isPresent && isPlateComponentId(componentId)) {
      return componentId;
    }
    if (!tooth.isPresent && isMeshComponent(def)) {
      return componentId;
    }
  }
  return null;
}

/** True when we allow **adding** this major on the tooth (mesh/plate anchor), with a Palatal Hole exception. */
export function toothSupportsMajorConnectorOverlay(tooth, toothId, majorComponentId) {
  if (resolveMajorConnectorAnchorComponentId(tooth) !== null) {
    return true;
  }
  if (
    isPalatalHoleMajorComponent(majorComponentId) &&
    TOOTH_ORDER.upper.includes(String(toothId))
  ) {
    return true;
  }
  if (
    isPalatalBarMajorComponent(majorComponentId) &&
    PALATAL_BAR_CONNECTOR_TOOTH_IDS.has(String(toothId))
  ) {
    return true;
  }
  if (
    majorComponentId === "major-lower-lingual-bar" &&
    TOOTH_ORDER.lower.includes(String(toothId)) &&
    getMajorConnectorAssetReference(toothId, "lower")
  ) {
    return true;
  }
  return false;
}

import {
  COMPONENT_BY_ID,
  COMPONENT_CATALOG,
  getDefaultMajorConnectorIdForDesignMode,
  isMajorConnectorComponent,
  isPalatalHoleMajorComponent,
} from "./components.js";
import { TOOTH_ORDER } from "./constants.js";
import { state } from "./annotationState.js";

export function getDefaultMajorConnectorIdForJaw(jaw) {
  const section = jaw === "upper" ? "upper" : "lower";
  const entry = COMPONENT_CATALOG.find((e) => e.tab === "major" && e.section === section);
  return entry?.id ?? getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
}

/**
 * With the Major tab active in design mode, tooth clicks should add/remove a major without requiring
 * an explicit catalog icon click. Resolve the default major for this tooth's arch when needed.
 */
export function ensureMajorCatalogPickForTooth(toothId) {
  if (state.selectedTab !== "major" || !state.designMode) {
    return;
  }
  const jaw = TOOTH_ORDER.upper.includes(toothId)
    ? "upper"
    : TOOTH_ORDER.lower.includes(toothId)
      ? "lower"
      : null;
  if (!jaw) {
    return;
  }
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (sel && isMajorConnectorComponent(sel) && sel.section === jaw) {
    return;
  }
  const id = getDefaultMajorConnectorIdForJaw(jaw);
  if (!id || !COMPONENT_BY_ID.has(id)) {
    return;
  }
  state.selectedComponentId = id;
  if (isPalatalHoleMajorComponent(id)) {
    state.archOverlayPalatalHoleActive = true;
  } else if (jaw === "upper") {
    state.archOverlayPalatalHoleActive = false;
  }
}

export function ensureMajorTabDefaultSelection() {
  if (!state.designMode) {
    return;
  }
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (sel && isMajorConnectorComponent(sel)) {
    if (isPalatalHoleMajorComponent(sel.id)) {
      state.archOverlayPalatalHoleActive = true;
    }
    return;
  }
  const id = getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
  if (!id || !COMPONENT_BY_ID.has(id)) {
    return;
  }
  state.selectedComponentId = id;
  state.archOverlayPalatalHoleActive = isPalatalHoleMajorComponent(id);
}

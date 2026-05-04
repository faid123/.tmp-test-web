import { COMPONENT_BY_ID, COMPONENT_CATALOG } from "./components.js";

/** Calibrated tooth-image scale (SVG tooth-local units). */
export const TOOTH_SCALE_BASE = 0.24;

export const DEFAULT_COMPONENT_ID =
  COMPONENT_BY_ID.has("mesh-hole") ? "mesh-hole" : COMPONENT_CATALOG[0]?.id || null;

export const REST_CALIBRATION_COMPONENT_ID = "rest-seat";

// Runtime annotation state.
export const state = {
  encryptedCaseId: "",
  caseIntID: null,
  activeStatus: "presence",
  locks: { upper: false, lower: false },
  /** Both arches locked — component catalog placement mode. */
  designMode: false,
  teeth: {},
  components: [],
  selectedTab: "mesh",
  selectedComponentId: DEFAULT_COMPONENT_ID,
  archOverlayPalatalHoleActive: false,
  restSeatCalibrationAcOnly: false,
  removeComponentMode: false,
  suppressArchPlacementSuggestions: false,
};

/** Attach transient UI refs here so other modules can mutate without import reassignment issues. */
export const ui = {
  /** @type {HTMLElement | null} */
  presentToothRadialHost: null,
  removeComponentDialogCleanup: null,
  hasInitialized: false,
};

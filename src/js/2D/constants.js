export const SVG_NS = "http://www.w3.org/2000/svg";

// FDI tooth order for each arch.
export const TOOTH_ORDER = {
  upper: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  lower: ["38", "37", "36", "35", "34", "33", "32", "31", "41", "42", "43", "44", "45", "46", "47", "48"]
};

/**
 * Distal-most uppers/lowers — skip automatic **plate** on these present teeth when entering design mode
 * (lock) and when re-applying defaults on “clear arch”. Matches automatic **mesh** skips on missing teeth.
 */
export const AUTO_MESH_PLATE_EXCLUDED_TOOTH_IDS = Object.freeze(
  new Set(["18", "28", "38", "48"])
);

/** Same teeth as {@link AUTO_MESH_PLATE_EXCLUDED_TOOTH_IDS}: skip automatic **mesh** when locking / clear-arch. */
export const AUTO_MESH_EXCLUDED_TOOTH_IDS = AUTO_MESH_PLATE_EXCLUDED_TOOTH_IDS;

/** Teeth skipped for automatic mesh (missing) and plate (present) defaults — same rule set; see {@link AUTO_MESH_EXCLUDED_TOOTH_IDS}. */
export function isAutoMeshPlacementExcludedToothId(toothId) {
  return AUTO_MESH_EXCLUDED_TOOTH_IDS.has(String(toothId));
}

export const isAutoMeshPlatePlacementExcludedToothId = isAutoMeshPlacementExcludedToothId;

/** Base path for tooth SVG assets in the 2D arch view. */
export const TOOTH_ASSET_BASE = "../../assets/teeth";

export const TOOTH_IMAGE_WIDTH = 1100;
export const TOOTH_IMAGE_HEIGHT = 180;
export const TOOTH_IMAGE_HALF_WIDTH = TOOTH_IMAGE_WIDTH / 2;
export const TOOTH_IMAGE_HALF_HEIGHT = TOOTH_IMAGE_HEIGHT / 2;

export const COMPONENT_IMAGE_WIDTH = 154;
export const COMPONENT_IMAGE_HEIGHT = 246;

export const COMPONENT_SCALE_BY_JAW = Object.freeze({
  upper: 1.3,
  lower: 0.7,
});

export const JAW_BACKGROUND_SCALE_BY_JAW = Object.freeze({
  upper: 1,
  lower: 0.9,
});

export const JAW_BACKGROUND_OFFSET_BY_JAW = Object.freeze({
  upper: { x: 8, y: 22 },
  lower: { x: 0, y: 0 },
});

/** Plate suggestion visual tuning (design mode). */
export const PLATE_SUGGESTION_TRANSFORM_BY_JAW = Object.freeze({
  upper: Object.freeze({
    scale: 1,
    offset: Object.freeze({ x: 0, y: 0 }),
  }),
  lower: Object.freeze({
    scale: 1,
    offset: Object.freeze({ x: 0, y: 0 }),
  }),
});

export const COMPONENT_SCALE_BY_TOOTH = Object.freeze({
  "41": 0.5,
  "42": 0.7,
  "11": 0.8,
  "12": 0.8,
  "21": 0.8,
  "22": 0.8,
  "31": 0.5,
  "32": 0.7,
});

export const PRESENCE_TOOTH_ASSET = `${TOOTH_ASSET_BASE}/11.svg`;

export const COMPONENT_GROUPS = Object.freeze({
  major: [
    { key: "upper", title: "Upper" },
    { key: "lower", title: "Lower" },
  ],
  assembly: [
    { key: "circum", title: "Circum" },
    { key: "bars", title: "Bars" },
  ],
});

export function forEachTooth(callback) {
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    for (const toothId of TOOTH_ORDER[jaw]) {
      callback(toothId, jaw);
    }
  }
}

export const JAW_BACKGROUND_IMAGES = {
  upper: {
    svgId: "upperArchSvg",
    viewBox: "0 0 600 420",
    template: "Upper_Jaw.svg",
    details: null
  },
  lower: {
    svgId: "lowerArchSvg",
    viewBox: "0 0 580 400",
    template: "Lower_Jaw.svg",
    details: null
  }
};

export const STATUS_VALUES = ["presence", "abutment", "compromised", "missing"];

export const TOOTH_SCALE_BY_UNIT = {
  1: 0.84,
  2: 0.88,
  3: 0.9,
  4: 0.96,
  5: 1.01,
  6: 1.07,
  7: 1.1,
  8: 0.92
};

export const EMPTY_JAW_CALIBRATION = { x: 0, y: 0, rotation: 0 };

export const TOOTH_POSITION_MAP = {
  upper: {
    "18": { x: 137, y: 361, rotation: 0 },
    "17": { x: 145, y: 302, rotation: 0 },
    "16": { x: 160, y: 239, rotation: 0 },
    "15": { x: 173, y: 183, rotation: 0 },
    "14": { x: 190, y: 137, rotation: 0 },
    "13": { x: 213, y: 95, rotation: 0 },
    "12": { x: 245, y: 69, rotation: 0 },
    "11": { x: 289, y: 56, rotation: 0 },
    "21": { x: 347, y: 56, rotation: 0 },
    "22": { x: 390, y: 69, rotation: 0 },
    "23": { x: 425, y: 95, rotation: 0 },
    "24": { x: 446, y: 137, rotation: 0 },
    "25": { x: 464, y: 183, rotation: 0 },
    "26": { x: 475, y: 239, rotation: 0 },
    "27": { x: 490, y: 302, rotation: 0 },
    "28": { x: 499, y: 361, rotation: 0 }
  },
  lower: {
    "48": { x: 135, y: 57, rotation: 0 },
    "47": { x: 150, y: 115, rotation: 0 },
    "46": { x: 165, y: 182, rotation: 0 },
    "45": { x: 181, y: 243, rotation: 0 },
    "44": { x: 201, y: 286, rotation: 0 },
    "43": { x: 233, y: 315, rotation: 0 },
    "42": { x: 265, y: 327, rotation: 0 },
    "41": { x: 295, y: 335, rotation: 0 },
    "31": { x: 325, y: 335, rotation: 0 },
    "32": { x: 355, y: 327, rotation: 0 },
    "33": { x: 387, y: 315, rotation: 0 },
    "34": { x: 419, y: 286, rotation: 0 },
    "35": { x: 438, y: 243, rotation: 0 },
    "36": { x: 455, y: 182, rotation: 0 },
    "37": { x: 469, y: 115, rotation: 0 },
    "38": { x: 484, y: 57, rotation: 0 }
  }
};

export const JAW_IMAGE_FLIP_X = {
  upper: 1,
  lower: 1
};

export const TOOTH_SCALE_OVERRIDE = {
  "18": 1.95,
  "17": 1.65,
  "16": 1.7,
  "15": 1.8,
  "14": 1.9,
  "13": 2.0,
  "12": 2.0,
  "11": 1.8,
  "21": 1.8,
  "22": 2.0,
  "23": 2.0,
  "24": 1.9,
  "25": 1.8,
  "26": 1.7,
  "27": 1.65,
  "28": 1.95,
  "38": 2,
  "37": 1.7,
  "36": 1.75,
  "35": 1.78,
  "34": 1.9,
  "33": 2.0,
  "32": 2.25,
  "31": 2.35,
  "41": 2.35,
  "42": 2.25,
  "43": 2.0,
  "44": 1.9,
  "45": 1.78,
  "46": 1.75,
  "47": 1.7,
  "48": 2.0,
};

export const JAW_CALIBRATION = {
  upper: { x: 0, y: 8, rotation: 0 },
  lower: { x: 0, y: 1, rotation: 0 }
};

// Upper anteriors 13→23 and lower anteriors 43→33 (FDI order); rest-seat picker uses a surface dialog.
export const ANTERIOR_REST_SURFACE_DIALOG_TEETH = new Set([
  "13", "12", "11", "21", "22", "23",
  "43", "42", "41", "31", "32", "33",
]);

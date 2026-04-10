export const SVG_NS = "http://www.w3.org/2000/svg";

// FDI tooth order for each arch.
export const TOOTH_ORDER = {
  upper: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  lower: ["38", "37", "36", "35", "34", "33", "32", "31", "41", "42", "43", "44", "45", "46", "47", "48"]
};

export const JAW_BACKGROUND_IMAGES = {
  upper: {
    svgId: "upperArchSvg",
    viewBox: "0 0 620 380",
    template: "Upper_Jaw.svg",
    details: null
  },
  lower: {
    svgId: "lowerArchSvg",
    viewBox: "0 0 620 380",
    template: "Lower_Jaw.svg",
    details: null
  }
};

export const STATUS_VALUES = ["presence", "abutment", "compromised"];

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
    "38": { x: 135, y: 57, rotation: 0 },
    "37": { x: 150, y: 115, rotation: 0 },
    "36": { x: 165, y: 182, rotation: 0 },
    "35": { x: 181, y: 243, rotation: 0 },
    "34": { x: 201, y: 286, rotation: 0 },
    "33": { x: 233, y: 315, rotation: 0 },
    "32": { x: 265, y: 327, rotation: 0 },
    "31": { x: 295, y: 335, rotation: 0 },
    "41": { x: 325, y: 335, rotation: 0 },
    "42": { x: 355, y: 327, rotation: 0 },
    "43": { x: 387, y: 315, rotation: 0 },
    "44": { x: 419, y: 286, rotation: 0 },
    "45": { x: 438, y: 243, rotation: 0 },
    "46": { x: 455, y: 182, rotation: 0 },
    "47": { x: 469, y: 115, rotation: 0 },
    "48": { x: 484, y: 57, rotation: 0 }
  }
};

export const JAW_IMAGE_FLIP_X = {
  upper: 1,
  lower: -1
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
  upper: { x: -8, y: -14, rotation: 0 },
  lower: { x: 0, y: 1, rotation: 0 }
};

export const MODE = {
  DESIGN: "design",
  PRESENCE: "presence",
};

export const JAW = {
  UPPER: "upper",
  LOWER: "lower",
};

export const UPPER_FDI = TOOTH_ORDER.upper.map(Number);
export const LOWER_FDI = TOOTH_ORDER.lower.map(Number);

export const ALL_FDI = [...UPPER_FDI, ...LOWER_FDI];

export const CRITERIA = {
  TOOTH_PRESENT: "ToothPresent",
  TOOTH_MISSING: "ToothMissing",
  NO_CONFLICTING_COMPONENTS: "NoConflictingComponents",
};

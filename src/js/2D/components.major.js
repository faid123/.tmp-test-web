import { TOOTH_ORDER, TOOTH_POSITION_MAP } from "./constants.js";

const MAJOR_TAB = "major";

// No major connector excludes the third molars (*8) anymore — every connector may
// span them when those teeth anchor it. The only remaining exclusion is the palatal
// strap's anterior teeth (11-13 / 21-23), a separate rule.
const MAJOR_CONNECTOR_EXCLUDED_TOOTH_IDS_BY_COMPONENT = Object.freeze({
  "major-upper-palatal-strap": Object.freeze(new Set(["11", "12", "13", "21", "22", "23"])),
  "major-upper-horseshoe": Object.freeze(new Set([])),
  "major-upper-palatal-hole": Object.freeze(new Set([])),
  "major-upper-palatal-plate": Object.freeze(new Set([])),
  "major-upper-palatal-bar": Object.freeze(new Set([])),
  "major-lower-lingual-bar": Object.freeze(new Set([])),
});

/** Fallback major-connector id auto-placed on lock (design mode). Upper-arch only for now. */
const DEFAULT_MAJOR_CONNECTOR_ID_FOR_LOCK_DESIGN_MODE = "major-upper-horseshoe";

export const PALATAL_STRAP_MAJOR_COMPONENT_ID = "major-upper-palatal-strap";

/**
 * Polygon vertices for the Palatal Strap arch-wide visual (upper jaw SVG viewBox 0 0 600 420).
 * Order: 14 → 15 → 16 → 17 → center2 → 27 → 26 → 25 → 24 → center1
 */
export const PALATAL_STRAP_ARCH_POLYGON = Object.freeze([
  { x: 320, y: 240 }, // 14
  { x: 239, y: 155 }, // 15
  { x: 211, y: 360 }, // 16
  { x: 321, y: 305 }, // 17
  { x: 425, y: 360 }, // center2
  { x: 400, y: 155 }, // 27

]);

/** True when this major type is Palatal Strap. */
export function isPalatalStrapMajorComponent(componentOrId) {
  const id =
    typeof componentOrId === "object" && componentOrId !== null
      ? String(componentOrId.id || "")
      : String(componentOrId || "");
  return id === PALATAL_STRAP_MAJOR_COMPONENT_ID;
}

/** Any upper tooth carries a palatal-strap placement — drives arch overlay visibility. */
export function hasPalatalStrapPlacementOnUpperArch(teeth) {
  if (!teeth || typeof teeth !== "object") return false;
  for (const tid of TOOTH_ORDER.upper) {
    const tooth = teeth[tid];
    if (!tooth?.componentPlacements?.length) continue;
    if (tooth.componentPlacements.some((e) => e.componentId === PALATAL_STRAP_MAJOR_COMPONENT_ID)) {
      return true;
    }
  }
  return false;
}

const STRAP_PALATAL_OFFSET = 32;
const STRAP_BUCCAL_OFFSET = 22;
const LEFT_STRAP_TEETH = ["14", "15", "16", "17"];  // anterior → posterior
const RIGHT_STRAP_TEETH = ["24", "25", "26", "27"]; // anterior → posterior
const LEFT_STRAP_DEFAULTS = ["15", "16"];
const RIGHT_STRAP_DEFAULTS = ["25", "26"];

function strapAttachPoints(toothId, archCenter) {
  const pos = TOOTH_POSITION_MAP.upper[toothId];
  if (!pos) return null;
  const dx = archCenter.x - pos.x, dy = archCenter.y - pos.y;
  const len = Math.hypot(dx, dy);
  const nx = dx / len, ny = dy / len;
  return {
    palatal: { x: Math.round(pos.x + nx * STRAP_PALATAL_OFFSET), y: Math.round(pos.y + ny * STRAP_PALATAL_OFFSET) },
    buccal:  { x: Math.round(pos.x - nx * STRAP_BUCCAL_OFFSET),  y: Math.round(pos.y - ny * STRAP_BUCCAL_OFFSET)  },
  };
}

/**
 * 8 polygon points for the palatal strap overlay from the placed teeth. Each pair
 * (palatal + buccal) attaches to a connector tooth; each side uses its most-anterior
 * and most-posterior placed tooth.
 */
export function computePalatalStrapPolygonPoints(teeth) {
  const has = (id) => teeth?.[id]?.componentPlacements?.some((e) => e.componentId === PALATAL_STRAP_MAJOR_COMPONENT_ID);

  const leftPlaced  = LEFT_STRAP_TEETH.filter(has);
  const rightPlaced = RIGHT_STRAP_TEETH.filter(has);

  const [laId, lpId] = leftPlaced.length
    ? [leftPlaced[0], leftPlaced[leftPlaced.length - 1]]
    : LEFT_STRAP_DEFAULTS;
  const [raId, rpId] = rightPlaced.length
    ? [rightPlaced[0], rightPlaced[rightPlaced.length - 1]]
    : RIGHT_STRAP_DEFAULTS;

  const p11 = TOOTH_POSITION_MAP.upper["11"], p21 = TOOTH_POSITION_MAP.upper["21"];
  const archCenter = { x: Math.round((p11.x + p21.x) / 2), y: Math.round((p11.y + p21.y) / 2) };

  const la = strapAttachPoints(laId, archCenter);
  const lp = strapAttachPoints(lpId, archCenter);
  const ra = strapAttachPoints(raId, archCenter);
  const rp = strapAttachPoints(rpId, archCenter);

  // 8 points clockwise: outer-anterior left → inner-anterior → inner-posterior → outer-posterior
  return [
    la.buccal,
    la.palatal,
    ra.palatal,
    ra.buccal,
    rp.buccal,
    rp.palatal,
    lp.palatal,
    lp.buccal,
  ];
}

/**
 * Palatal Hole uses shared arch artwork ({@link PALATAL_HOLE_ARCH_OVERLAY_LAYERS}) and the same per-tooth
 * `MajorConnector/{11–18}*.svg` segments as other upper majors (e.g. Horseshoe) when tagged on a tooth.
 */
export const PALATAL_HOLE_MAJOR_COMPONENT_ID = "major-upper-palatal-hole";

/** Palatal Bar: arch-wide {@link PALATAL_BAR_ARCH_OVERLAY} plus per-tooth majors on {@link PALATAL_BAR_CONNECTOR_TOOTH_IDS} only. */
export const PALATAL_BAR_MAJOR_COMPONENT_ID = "major-upper-palatal-bar";

/** Palatal Plate: arch-wide Plate_{n}.svg chosen from latest major connector endpoints. */
export const PALATAL_PLATE_MAJOR_COMPONENT_ID = "major-upper-palatal-plate";

/**
 * Per-tooth palatal-bar segments: both posterior runs including distal second molars, excluding anteriors
 * (11–13, 21–23). Derived from {@link TOOTH_ORDER}.upper: indices 0–4 (18→14) and 11–15 (24→28).
 */
export const PALATAL_BAR_CONNECTOR_TOOTH_IDS = Object.freeze(
  new Set([
    ...TOOTH_ORDER.upper.slice(0, 5),
    ...TOOTH_ORDER.upper.slice(11, 16),
  ])
);

/**
 * Upper teeth where choosing Palatal Bar **clears** any major connector from placements (anteriors only).
 * Posterior bar span uses {@link PALATAL_BAR_CONNECTOR_TOOTH_IDS}.
 */
export const PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS = Object.freeze(
  new Set(["13", "12", "11", "21", "22", "23"])
);

/**
 * Arch-wide bar artwork in upper jaw viewBox (`0 0 600 420`). Native asset viewBox: `0 0 418 186`.
 */
export const PALATAL_BAR_ARCH_OVERLAY = Object.freeze({
  file: "P_Bar.svg",
  x: 220,
  y: 194,
  width: 195,
  height: 186,
});

/** Arch-wide palatal plate overlay box (Plate_{n}.svg). */
export const PALATAL_PLATE_ARCH_OVERLAY = Object.freeze({
  x: 212,
  y: 190,
  width: 212,
  height: 192,
});

/**
 * Optional per-plate frame tuning. Set only plates that need unique placement/size.
 * Example: "5": { x: 210, y: 188, width: 216, height: 196 }
 */
export const PALATAL_PLATE_ARCH_OVERLAY_BY_INDEX = Object.freeze({
  "1": { x: 203, y: 123.7, width: 230, height: 292 },
  "2": { x: 203, y: 123, width: 230, height: 292 },
  "3": { x: 203, y: 123.5, width: 230, height: 292 },
  "4": { x: 203, y: 122, width: 230, height: 292 },
  "5": { x: 203, y: 122, width: 230, height: 292 },
  "6": { x: 203, y: 124, width: 230, height: 292 },
  "7": { x: 203, y: 122, width: 230, height: 292 },
  "8": { x: 203, y: 119, width: 230, height: 292 },
});

export function getPalatalPlateArchOverlayFrame(index) {
  const key = String(index);
  const perIndex = PALATAL_PLATE_ARCH_OVERLAY_BY_INDEX[key];
  const src = perIndex || PALATAL_PLATE_ARCH_OVERLAY;
  return {
    x: Number.isFinite(src?.x) ? src.x : PALATAL_PLATE_ARCH_OVERLAY.x,
    y: Number.isFinite(src?.y) ? src.y : PALATAL_PLATE_ARCH_OVERLAY.y,
    width: Number.isFinite(src?.width) ? src.width : PALATAL_PLATE_ARCH_OVERLAY.width,
    height: Number.isFinite(src?.height) ? src.height : PALATAL_PLATE_ARCH_OVERLAY.height,
  };
}

/**
 * Templates with shipped `{base}_mesial.svg` / `{base}_distal.svg` under MajorConnector/ (upper 11–17).
 * `18` only has `18.svg` (no mesial/distal pair); open ends on 18 use the base body art.
 */
const MAJOR_CONNECTOR_MESIAL_DISTAL_TEMPLATES = Object.freeze(
  new Set(["11", "12", "13", "14", "15", "16", "17"])
);

/** Lower quadrant 4 (41–47): `48` uses `48.svg` only. */
const MAJOR_CONNECTOR_LOWER_Q4_MESIAL_DISTAL_TEMPLATES = Object.freeze(
  new Set(["41", "42", "43", "44", "45", "46", "47"])
);

/**
 * @param {unknown} tooth
 * @returns {boolean}
 */
export function toothHasMajorConnectorPlacement(tooth) {
  if (!tooth || !Array.isArray(tooth.componentPlacements)) {
    return false;
  }
  return tooth.componentPlacements.some((e) => isMajorConnectorComponent(e.componentId));
}

/**
 * Along arch order, whether the previous/next neighbor tooth carries a major connector.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 * @param {readonly string[]} order {@link TOOTH_ORDER}.upper or .lower
 */
function getMajorConnectorNeighborMajorFlagsInOrder(toothId, teeth, order) {
  const id = String(toothId);
  const idx = order.indexOf(id);
  if (idx < 0 || !teeth || typeof teeth !== "object") {
    return { prevHasMajor: false, nextHasMajor: false };
  }
  const prevId = idx > 0 ? order[idx - 1] : null;
  const nextId = idx < order.length - 1 ? order[idx + 1] : null;
  return {
    prevHasMajor: Boolean(prevId && toothHasMajorConnectorPlacement(teeth[prevId])),
    nextHasMajor: Boolean(nextId && toothHasMajorConnectorPlacement(teeth[nextId])),
  };
}

/**
 * Along {@link TOOTH_ORDER}.upper (18→…→11→21→…→28), whether the mesial/distal neighbor carries a major connector.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 */
export function getMajorConnectorNeighborMajorFlags(toothId, teeth) {
  return getMajorConnectorNeighborMajorFlagsInOrder(toothId, teeth, TOOTH_ORDER.upper);
}

/**
 * Along {@link TOOTH_ORDER}.lower (38→…→31→41→…→48), same neighbor convention for lower FDI.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 */
export function getMajorConnectorNeighborMajorFlagsLower(toothId, teeth) {
  return getMajorConnectorNeighborMajorFlagsInOrder(toothId, teeth, TOOTH_ORDER.lower);
}

/**
 * Map arch neighbor flags to FDI mesial/distal major continuity.
 * Upper: Q1 same as lower Q3; upper Q2 same as lower Q4 (arch direction vs FDI).
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 * @param {"upper"|"lower"} jaw
 */
function getMesialDistalConnectorMajorFlags(toothId, teeth, jaw) {
  const id = String(toothId);
  const q = Number(id[0]);
  if (jaw === "upper") {
    const { prevHasMajor, nextHasMajor } = getMajorConnectorNeighborMajorFlags(toothId, teeth);
    if (q === 1) {
      return { mesialHasMajor: nextHasMajor, distalHasMajor: prevHasMajor };
    }
    if (q === 2) {
      return { mesialHasMajor: prevHasMajor, distalHasMajor: nextHasMajor };
    }
  }
  if (jaw === "lower") {
    const { prevHasMajor, nextHasMajor } = getMajorConnectorNeighborMajorFlagsLower(toothId, teeth);
    if (q === 3) {
      return { mesialHasMajor: nextHasMajor, distalHasMajor: prevHasMajor };
    }
    if (q === 4) {
      return { mesialHasMajor: prevHasMajor, distalHasMajor: nextHasMajor };
    }
  }
  return { mesialHasMajor: false, distalHasMajor: false };
}

/**
 * True when mesial or distal neighbor has no adjacent major-connector placement (open end of a run).
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 */
export function shouldUseMajorConnectorEndAsset(toothId, teeth) {
  if (!teeth || typeof teeth !== "object") {
    return false;
  }
  const id = String(toothId);
  const jaw = /^[12]/.test(id) ? "upper" : /^[34]/.test(id) ? "lower" : null;
  if (!jaw) {
    return false;
  }
  if (!getMajorConnectorAssetReference(toothId, jaw)) {
    return false;
  }
  const { mesialHasMajor, distalHasMajor } = getMesialDistalConnectorMajorFlags(toothId, teeth, jaw);
  return !mesialHasMajor || !distalHasMajor;
}

/**
 * Page-relative href for a MajorConnector template SVG.
 * Upper Q1/Q2: template 11–18 naming (Q2 maps to 11–18 by unit digit).
 * Lower Q4 (`41`–`48`) and Q3 (`31`–`38`): same rule as upper — Q4 uses FDI id; Q3 uses the Q4
 * twin basename `4${u}` (only `41`–`48` SVGs on disk). View mirroring comes from the tooth transform.
 * When `teeth` is passed: mesial/distal open ends use `_mesial` / `_distal` where available.
 * @param {string} toothId
 * @param {string} jaw
 * @param {Record<string, unknown> | null | undefined} [teeth]
 * @param {{ palatalBarSecondMolarDistal?: boolean, palatalBarFirstPremolarMesial?: boolean }} [options] Palatal bar: `palatalBarSecondMolarDistal` makes `17` / `27` use `{17}_distal.svg` (set only while `18` / `28` have no palatal-bar placement); `palatalBarFirstPremolarMesial` makes `14` / `24` use `{14}_mesial.svg` (the bar's anterior cap — set whenever the palatal bar is rendering, since the posterior bar span always terminates at 14/24).
 */
export function getMajorConnectorAssetReference(toothId, jaw, teeth, options) {
  const id = String(toothId);
  const baseDir = "../../assets/RPD_Component/MajorConnector";

  if (jaw === "upper") {
    if (!/^[12][1-8]$/.test(id)) {
      return null;
    }
    const q = Number(id[0]);
    const u = Number(id[1]);
    const file = q === 1 ? id : `1${u}`;

    if (options?.palatalBarSecondMolarDistal && (id === "17" || id === "27")) {
      if (MAJOR_CONNECTOR_MESIAL_DISTAL_TEMPLATES.has(file)) {
        return `${baseDir}/${file}_distal.svg`;
      }
    }

    if (options?.palatalBarFirstPremolarMesial && (id === "14" || id === "24")) {
      if (MAJOR_CONNECTOR_MESIAL_DISTAL_TEMPLATES.has(file)) {
        return `${baseDir}/${file}_mesial.svg`;
      }
    }

    if (teeth && typeof teeth === "object") {
      const { mesialHasMajor, distalHasMajor } = getMesialDistalConnectorMajorFlags(id, teeth, "upper");
      if (!mesialHasMajor) {
        if (MAJOR_CONNECTOR_MESIAL_DISTAL_TEMPLATES.has(file)) {
          return `${baseDir}/${file}_mesial.svg`;
        }
        return `${baseDir}/${file}.svg`;
      }
      if (!distalHasMajor) {
        if (MAJOR_CONNECTOR_MESIAL_DISTAL_TEMPLATES.has(file)) {
          return `${baseDir}/${file}_distal.svg`;
        }
        return `${baseDir}/${file}.svg`;
      }
    }
    return `${baseDir}/${file}.svg`;
  }

  if (jaw === "lower") {
    if (!/^3[1-8]$/.test(id) && !/^4[1-8]$/.test(id)) {
      return null;
    }
    const q = Number(id[0]);
    const u = Number(id[1]);
    const file = q === 4 ? id : `4${u}`;
    if (teeth && typeof teeth === "object") {
      const { mesialHasMajor, distalHasMajor } = getMesialDistalConnectorMajorFlags(id, teeth, "lower");
      if (!mesialHasMajor) {
        if (MAJOR_CONNECTOR_LOWER_Q4_MESIAL_DISTAL_TEMPLATES.has(file)) {
          return `${baseDir}/${file}_mesial.svg`;
        }
        return `${baseDir}/${file}.svg`;
      }
      if (!distalHasMajor) {
        if (MAJOR_CONNECTOR_LOWER_Q4_MESIAL_DISTAL_TEMPLATES.has(file)) {
          return `${baseDir}/${file}_distal.svg`;
        }
        return `${baseDir}/${file}.svg`;
      }
    }
    return `${baseDir}/${file}.svg`;
  }

  return null;
}

export function isMajorConnectorComponent(componentOrId) {
  if (typeof componentOrId === "object" && componentOrId !== null) {
    return (
      componentOrId.tab === MAJOR_TAB || String(componentOrId.id || "").startsWith("major-")
    );
  }
  return String(componentOrId || "").startsWith("major-");
}

export function isMajorConnectorToothExcluded(componentId, toothId) {
  const excluded = MAJOR_CONNECTOR_EXCLUDED_TOOTH_IDS_BY_COMPONENT[String(componentId)];
  if (!excluded) return false;
  return excluded.has(String(toothId));
}

/** True when this major type is Palatal Hole (arch-wide AP_Strap SVGs). */
export function isPalatalHoleMajorComponent(componentOrId) {
  const id =
    typeof componentOrId === "object" && componentOrId !== null
      ? String(componentOrId.id || "")
      : String(componentOrId || "");
  return id === PALATAL_HOLE_MAJOR_COMPONENT_ID;
}

/** True when this major type is Palatal Bar (segment connectors + arch P_Bar artwork). */
export function isPalatalBarMajorComponent(componentOrId) {
  const id =
    typeof componentOrId === "object" && componentOrId !== null
      ? String(componentOrId.id || "")
      : String(componentOrId || "");
  return id === PALATAL_BAR_MAJOR_COMPONENT_ID;
}

/** True when this major type is Palatal Plate. */
export function isPalatalPlateMajorComponent(componentOrId) {
  const id =
    typeof componentOrId === "object" && componentOrId !== null
      ? String(componentOrId.id || "")
      : String(componentOrId || "");
  return id === PALATAL_PLATE_MAJOR_COMPONENT_ID;
}

/** Any upper tooth carries a palatal-plate placement. */
export function hasPalatalPlatePlacementOnUpperArch(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return false;
  }
  for (const tid of TOOTH_ORDER.upper) {
    const tooth = teeth[tid];
    if (!tooth?.componentPlacements?.length) {
      continue;
    }
    if (tooth.componentPlacements.some((e) => e.componentId === PALATAL_PLATE_MAJOR_COMPONENT_ID)) {
      return true;
    }
  }
  return false;
}

function isUpperRightToothId(toothId) {
  return /^1[1-8]$/.test(String(toothId));
}

function isUpperLeftToothId(toothId) {
  return /^2[1-8]$/.test(String(toothId));
}

/**
 * Select Plate_{n} from palatal-plate endpoints: the most-posterior placed unit on each
 * side (11-18 and 21-28); n = max(rightUnit, leftUnit), single-side fallback.
 */
export function getPalatalPlateOverlayIndexFromUpperPlacements(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return null;
  }

  let rightUnit = null;
  let leftUnit = null;

  for (const toothId of TOOTH_ORDER.upper) {
    const tooth = teeth[toothId];
    if (!tooth?.componentPlacements?.length) {
      continue;
    }
    const hasPalatalPlate = tooth.componentPlacements.some(
      (e) => e.componentId === PALATAL_PLATE_MAJOR_COMPONENT_ID
    );
    if (!hasPalatalPlate) {
      continue;
    }

    const unit = Number(String(toothId).slice(1));
    if (!Number.isFinite(unit)) {
      continue;
    }

    if (isUpperRightToothId(toothId)) {
      rightUnit = rightUnit === null ? unit : Math.max(rightUnit, unit);
    } else if (isUpperLeftToothId(toothId)) {
      leftUnit = leftUnit === null ? unit : Math.max(leftUnit, unit);
    }
  }

  if (rightUnit === null && leftUnit === null) {
    return null;
  }

  const overlay = rightUnit === null
    ? leftUnit
    : leftUnit === null
      ? rightUnit
      : Math.max(rightUnit, leftUnit);

  return Math.max(1, Math.min(8, overlay));
}

/** Any tooth in {@link PALATAL_BAR_CONNECTOR_TOOTH_IDS} carries a palatal-bar placement — drives overlay + connectors. */
export function hasPalatalBarPlacementOnUpperArch(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return false;
  }
  for (const tid of PALATAL_BAR_CONNECTOR_TOOTH_IDS) {
    const tooth = teeth[tid];
    if (!tooth?.componentPlacements?.length) {
      continue;
    }
    if (
      tooth.componentPlacements.some((e) => e.componentId === PALATAL_BAR_MAJOR_COMPONENT_ID)
    ) {
      return true;
    }
  }
  return false;
}

function toothHasPalatalBarPlacementOnTooth(tooth) {
  if (!tooth || !Array.isArray(tooth.componentPlacements)) {
    return false;
  }
  return tooth.componentPlacements.some((e) => e.componentId === PALATAL_BAR_MAJOR_COMPONENT_ID);
}

/**
 * Palatal bar: distal second-molar caps (17_distal / mirrored 27) only while 18/28
 * have no real palatal-bar placement. After tagging 18/28, augmented neighbors make
 * getMajorConnectorAssetReference return body art so segments connect.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth Un-augmented arch state.
 */
export function shouldUsePalatalBarSecondMolarDistalTemplate(toothId, teeth) {
  const id = String(toothId);
  if (id !== "17" && id !== "27") {
    return false;
  }
  if (!teeth || typeof teeth !== "object") {
    return true;
  }
  if (id === "17") {
    return !toothHasPalatalBarPlacementOnTooth(teeth["18"]);
  }
  return !toothHasPalatalBarPlacementOnTooth(teeth["28"]);
}

/**
 * Mirrors Unity palatal-bar span continuity: both posterior runs get virtual bar
 * placements so internal teeth prefer straight templates over `_mesial`/`_distal` at run ends.
 * @param {Record<string, unknown> | null | undefined} teeth
 * @returns {Record<string, unknown>}
 */
export function augmentTeethForPalatalBarConnectorNeighbors(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return teeth || {};
  }
  /** @type {Record<string, unknown>} */
  const out = { ...teeth };
  for (const tid of PALATAL_BAR_CONNECTOR_TOOTH_IDS) {
    const tooth = teeth[tid];
    if (!tooth || typeof tooth !== "object") {
      continue;
    }
    const placements = Array.isArray(tooth.componentPlacements)
      ? [...tooth.componentPlacements]
      : [];
    const hasBar = placements.some(
      (e) => e.componentId === PALATAL_BAR_MAJOR_COMPONENT_ID
    );
    out[tid] = {
      ...tooth,
      componentPlacements: hasBar
        ? placements
        : [...placements, { componentId: PALATAL_BAR_MAJOR_COMPONENT_ID, surface: null }],
    };
  }
  return out;
}

/**
 * Anterior AP strap — always drawn for a palatal-hole connector. Frame in the upper
 * jaw viewBox (0 0 600 420). Posterior straps are selected per side by
 * getPalatalHoleArchOverlayLayers.
 */
export const PALATAL_HOLE_ARCH_OVERLAY_LAYERS = Object.freeze([
  { file: "AP_Strap01.svg", x: 248, y: 138, width: 140, height: 74 },
]);

/**
 * Posterior AP strap, selected per side by the terminal molar the palatal-hole
 * connector reaches: unit 6/7/8 → AP-Strap_6/7/8. A side ending before the molars
 * gets none. Frames in the 600×420 viewBox (7 verified vs case 2511; 6/8 best-effort).
 * One as-authored half per molar; Q2 reuses the SAME asset shifted one half-width
 * right and mirrored by the renderer. `width` is one half-width.
 */
const PALATAL_HOLE_POSTERIOR_STRAP_BY_UNIT = Object.freeze({
  6: { file: "AP-Strap_6.svg", x: 209, y: 220, width: 108, height: 150 },
  7: { file: "AP-Strap_7.svg", x: 212, y: 254, width: 105, height: 127 },
  8: { file: "AP-Strap_8.svg", x: 212, y: 268.5, width: 105, height: 165 },
});

// Most-distal-first, so the first molar carrying the connector is the terminal.
const PALATAL_HOLE_Q1_MOLARS = Object.freeze(["18", "17", "16"]);
const PALATAL_HOLE_Q2_MOLARS = Object.freeze(["28", "27", "26"]);

function palatalHoleTerminalMolarUnit(teeth, molars) {
  for (const id of molars) {
    if (
      teeth?.[id]?.componentPlacements?.some((e) =>
        isPalatalHoleMajorComponent(e.componentId)
      )
    ) {
      return Number(id[1]); // 8 | 7 | 6
    }
  }
  return null;
}

/**
 * Overlay layers for the current palatal-hole design: anterior strap + each side's
 * posterior strap sized to its terminal molar (AP-Strap_6/7/8). The Q2 half is the
 * same asset shifted one half-width right with `mirror: true`.
 */
export function getPalatalHoleArchOverlayLayers(teeth) {
  const layers = [...PALATAL_HOLE_ARCH_OVERLAY_LAYERS];
  const q1 = palatalHoleTerminalMolarUnit(teeth, PALATAL_HOLE_Q1_MOLARS);
  if (q1 && PALATAL_HOLE_POSTERIOR_STRAP_BY_UNIT[q1]) {
    layers.push({ ...PALATAL_HOLE_POSTERIOR_STRAP_BY_UNIT[q1], mirror: false });
  }
  const q2 = palatalHoleTerminalMolarUnit(teeth, PALATAL_HOLE_Q2_MOLARS);
  if (q2 && PALATAL_HOLE_POSTERIOR_STRAP_BY_UNIT[q2]) {
    const s = PALATAL_HOLE_POSTERIOR_STRAP_BY_UNIT[q2];
    layers.push({ ...s, x: s.x + s.width, mirror: true });
  }
  return layers;
}

/** Any upper tooth carries a palatal-hole placement — drives arch overlay visibility. */
export function hasPalatalHolePlacementOnUpperArch(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return false;
  }
  for (const tid of TOOTH_ORDER.upper) {
    const tooth = teeth[tid];
    if (!tooth?.componentPlacements?.length) {
      continue;
    }
    if (tooth.componentPlacements.some((e) => e.componentId === PALATAL_HOLE_MAJOR_COMPONENT_ID)) {
      return true;
    }
  }
  return false;
}

// --- Placement tuning (offset / scale for major-connector SVG per tooth) ---

/**
 * When true, major-connector translation uses only CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH
 * (plus mirroring) — mesh/plate anchors ignored, so the frame is the same for mesh or
 * plate sites. When false, translation = mesh/plate anchor + extra.
 */
export const CONNECTOR_POSITION_IGNORE_MESH_PLATE_ANCHOR = true;

const VALID_FDI_TOOTH_ID = /^[1-4][1-8]$/;
const DEFAULT_OFFSET = Object.freeze({ x: 0, y: 0 });

/** Keep empty to always use mesh/plate image box (default image size path). */
export const CONNECTOR_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  // Intentionally empty: tune size via render scale, not image box overrides.
});

/**
 * Extra x/y (tooth-local), added on top of the mesh/plate anchor (unless
 * CONNECTOR_POSITION_IGNORE_MESH_PLATE_ANCHOR). Keys: upper template 11-18 (Q2 mirrors),
 * lower 41-48 (Q3 mirrors), or exact FDI to override. Quadrants 2/3 flip X for template rows.
 */
export const CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH = Object.freeze({
  "11": { x: 13, y: 76 },
  "12": { x: 35.3, y: 70.7 },
  "22": { x: -34.4, y: 70.7 },
  "13": { x: 49.3, y: 50 },
  "23": { x: -51.3, y: 50 },
  "14": { x: 58.3, y: 31.5 },
  "24": { x: -58.3, y: 31.5 },
  "15": { x: 55, y: 23.6 },
  "25": { x: -56, y: 23.6 },
  "16": { x: 57.3, y: 22 },
  "26": { x: -56.3, y: 22 },
  "17": { x: 61.3, y: 16.6 },
  "27": { x: -60.3, y: 16.6 },
  "18": { x: 62.2, y: 9.5 },
  "28": { x: -62.2, y: 9.5 },
  "41": { x: 5., y: -64 },
  "42": { x: 21.6, y: -57.6 },
  "43": { x: 38.7, y: -48.4 },
  "44": { x: 55.2, y: -33 },
  "45": { x: 57, y: -20.6 },
  "35": { x: -56.4, y: -20.6 },
  "46": { x: 55.8, y: -17.4 },
  "47": { x: 54.9, y: -16.3 },
  "37": { x: -53.9, y: -16.3 },
  "48": { x: 60, y: -11 },
  "38": { x: -59, y: -11 },
});

/** Multiplier on the scaled connector group per arch. */
export const CONNECTOR_RENDER_SCALE_BY_JAW = Object.freeze({
  upper: 1,
  lower: 1,
});

/**
 * Per–template-tooth scale: `11`–`18` on upper, `41`–`48` on lower (Q3 mirrors Q4 like Q2 mirrors Q1).
 * Optional exact FDI overrides — see {@link getMajorConnectorRenderScaleMultiplier}.
 */
export const CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH = Object.freeze({
  "11": 0.58,
  "12": 0.565,
  "13": 0.63,
  "14": 0.8,
  "15": 0.65,
  "16": 0.7,
  "17": 0.63,
  "18": 0.6,
  "41": 0.375,
  "42": 0.43,
  "43": 0.59,
  "44": 0.88,
  "45": 0.825,
  "46": 0.8,
  "47": 0.665,
  "48": 0.61,
});

function inferMajorConnectorJawFromFdiToothId(toothId) {
  const id = String(toothId);
  if (!VALID_FDI_TOOTH_ID.test(id)) {
    return "upper";
  }
  const q = Number(id[0]);
  return q >= 3 ? "lower" : "upper";
}

/**
 * Basename / tuning-table key for connector seeds — mirrors {@link getMajorConnectorAssetReference}:
 * upper Q1/Q2 → `11`–`18`; lower Q3/Q4 → `41`–`48`.
 * @param {string} toothId
 * @param {"upper"|"lower"} jaw
 */
function getMajorConnectorSeedTemplateToothId(toothId, jaw) {
  const id = String(toothId);
  if (!VALID_FDI_TOOTH_ID.test(id)) {
    return jaw === "lower" ? "41" : "11";
  }
  const q = Number(id[0]);
  const u = id[1];
  if (jaw === "lower") {
    if (q === 3 || q === 4) {
      return q === 4 ? id : `4${u}`;
    }
    return "41";
  }
  if (q === 1 || q === 2) {
    return q === 1 ? id : `1${u}`;
  }
  return "11";
}

/**
 * @param {string} toothId
 * @param {"upper"|"lower"} [jaw] Defaults from FDI quadrant (3–4 → lower).
 */
export function getMajorConnectorPlacementOffset(toothId, jaw = inferMajorConnectorJawFromFdiToothId(toothId)) {
  const id = String(toothId);
  const tmpl = getMajorConnectorSeedTemplateToothId(toothId, jaw);
  const exact = CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH[id];
  const tmplSeed = CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH[tmpl];
  const row = exact ?? tmplSeed ?? DEFAULT_OFFSET;
  const numeric = Number(id);
  const quadrant = Number.isFinite(numeric) ? Math.floor(numeric / 10) : 0;
  const mirrorX = !exact && (quadrant === 2 || quadrant === 3);
  const x = mirrorX ? -row.x : row.x;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(row.y) ? row.y : 0,
  };
}

/**
 * @param {string} toothId
 * @param {"upper"|"lower"} [jaw] Defaults from FDI quadrant (3–4 → lower).
 */
export function getMajorConnectorPlacementImageSize(toothId, jaw = inferMajorConnectorJawFromFdiToothId(toothId)) {
  const tmpl = getMajorConnectorSeedTemplateToothId(toothId, jaw);
  return CONNECTOR_PLACEMENT_IMAGE_SIZE_BY_TOOTH[tmpl] ?? null;
}

export function getMajorConnectorRenderScaleMultiplier(toothId, jaw) {
  const jawM = CONNECTOR_RENDER_SCALE_BY_JAW[jaw] ?? 1;
  const id = String(toothId);
  const tmpl = getMajorConnectorSeedTemplateToothId(toothId, jaw);
  const toothM =
    CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH[id] ??
    CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH[tmpl] ??
    1;
  return jawM * toothM;
}

export function shouldMajorConnectorIgnoreMeshPlateAnchor() {
  return CONNECTOR_POSITION_IGNORE_MESH_PLATE_ANCHOR === true;
}

/** Pick a default major-connector id for auto-placement, falling back to the first major in the catalog. */
export function getDefaultMajorConnectorIdForDesignMode(componentById) {
  if (componentById.has(DEFAULT_MAJOR_CONNECTOR_ID_FOR_LOCK_DESIGN_MODE)) {
    return DEFAULT_MAJOR_CONNECTOR_ID_FOR_LOCK_DESIGN_MODE;
  }
  for (const [id, def] of componentById) {
    if (isMajorConnectorComponent(def)) {
      return id;
    }
  }
  return null;
}

/**
 * Major-connector ids whose coverage runs continuously to the midline. The desktop draws
 * these as one span from the most-distal anchor across every tooth to the central incisors
 * (CheckAndSetTop for upper, SetLingualMajor for ALL lower connectors, lingual bar included).
 * The only posterior-only majors are the upper palatal bar/strap (EndCheck=5), which keep
 * per-tooth placement.
 */
const MIDLINE_REACHING_MAJOR_CONNECTOR_IDS = Object.freeze(
  new Set([
    "major-upper-horseshoe",
    "major-upper-palatal-hole",
    "major-upper-palatal-plate",
    "major-lower-lingual-bar",
    "major-lower-lingual-plate",
    "major-lower-lingual-kennedy",
  ])
);

/** True when the major connector spans the arch to the midline (vs. posterior-only bar/strap). */
export function majorConnectorRunsToMidline(componentId) {
  return MIDLINE_REACHING_MAJOR_CONNECTOR_IDS.has(String(componentId));
}

/**
 * Whether a tooth can anchor a major-connector run: present via plate/clasp, missing via
 * mesh. Mirrors the desktop start test, narrowed to web-modeled components. Shared by
 * placement and pruneInvalidMajorConnectorPlacementsInJaw.
 */
function toothAnchorsMajorConnector(tooth, componentById) {
  if (!tooth || !Array.isArray(tooth.componentPlacements)) {
    return false;
  }
  return tooth.componentPlacements.some(({ componentId }) => {
    const def = componentById?.get?.(componentId);
    if (!def) {
      return false;
    }
    if (tooth.isPresent) {
      // Plate or any clasp anchors the connector (matches the desktop anchor test), so
      // a clasped terminal molar (38/48) starts the span and is covered.
      return (
        String(componentId).startsWith("plate-") ||
        String(componentId).endsWith("-clasp")
      );
    }
    return def.tab === "mesh" || String(componentId).startsWith("mesh-");
  });
}

/** Add `majorComponentId` to a tooth once, keeping `componentPlacements` and `components` in sync. */
function placeMajorConnectorOnce(tooth, majorComponentId) {
  if (!Array.isArray(tooth.componentPlacements)) {
    tooth.componentPlacements = [];
  }
  if (tooth.componentPlacements.some(({ componentId }) => isMajorConnectorComponent(componentId))) {
    return;
  }
  tooth.componentPlacements.push({ componentId: majorComponentId, surface: null });
  if (Array.isArray(tooth.components) && !tooth.components.includes(majorComponentId)) {
    tooth.components.push(majorComponentId);
  }
}

/** Per-tooth placement for posterior-only majors (bar/strap): place on every eligible
 *  tooth that already anchors it (mesh if missing, plate if present). */
function placeMajorConnectorPerTooth(teeth, majorComponentId, componentById, jawKey) {
  const ids = TOOTH_ORDER && Array.isArray(TOOTH_ORDER[jawKey]) ? TOOTH_ORDER[jawKey] : [];
  for (const toothId of ids) {
    if (!getMajorConnectorAssetReference(toothId, jawKey)) continue;
    if (isMajorConnectorToothExcluded(majorComponentId, toothId)) continue;
    const tooth = teeth[toothId];
    if (!tooth) continue;
    if (!toothAnchorsMajorConnector(tooth, componentById)) continue;
    placeMajorConnectorOnce(tooth, majorComponentId);
  }
}

/**
 * Desktop-style span fill for midline-reaching majors. Per side, scan distal → midline,
 * start the run at the first anchor tooth (mesh saddle or plate/clasp abutment), then place
 * the major on EVERY subsequent tooth with connector art to the midline (bare anteriors
 * included). Mirrors the isStartFound continuation in CheckAndSetTop.
 */
function fillMajorConnectorSpanInArch(teeth, majorComponentId, componentById, jawKey) {
  const order = TOOTH_ORDER && Array.isArray(TOOTH_ORDER[jawKey]) ? TOOTH_ORDER[jawKey] : [];
  if (order.length === 0) return;
  const mid = Math.floor(order.length / 2);
  // Each quadrant is scanned distal -> midline. The right quadrant is reversed so both
  // walks run from the back of the mouth toward the central incisors.
  const quadrants = [order.slice(0, mid), order.slice(mid).reverse()];
  for (const quadrant of quadrants) {
    let started = false;
    for (const toothId of quadrant) {
      const tooth = teeth[toothId];
      if (!tooth) continue;
      const hasArt = Boolean(getMajorConnectorAssetReference(toothId, jawKey));
      const excluded = isMajorConnectorToothExcluded(majorComponentId, toothId);
      if (!started) {
        // The run begins at the first anchor tooth that can carry the major.
        if (excluded || !hasArt) continue;
        if (!toothAnchorsMajorConnector(tooth, componentById)) continue;
        started = true;
      } else if (excluded || !hasArt) {
        // Skip teeth with no connector art / excluded; the run carries on past them.
        continue;
      }
      placeMajorConnectorOnce(tooth, majorComponentId);
    }
  }
}

/**
 * Place `majorComponentId` on EXACTLY the given teeth — the load path honoring a saved
 * design's major-connector span instead of re-deriving it (fillMajorConnectorSpanInArch).
 * Teeth with no art or that the connector excludes are skipped; no gap-filling, so
 * coverage matches the data, not the rule.
 */
export function placeMajorConnectorOnExactTeeth(
  teeth,
  majorComponentId,
  componentById,
  jawKey,
  fdiList
) {
  if (
    !majorComponentId ||
    !componentById.has(majorComponentId) ||
    !isMajorConnectorComponent(majorComponentId) ||
    !Array.isArray(fdiList)
  ) {
    return;
  }
  for (const fdi of fdiList) {
    const toothId = String(fdi);
    if (!getMajorConnectorAssetReference(toothId, jawKey)) continue;
    if (isMajorConnectorToothExcluded(majorComponentId, toothId)) continue;
    const tooth = teeth[toothId];
    if (!tooth) continue;
    placeMajorConnectorOnce(tooth, majorComponentId);
  }
}

/**
 * On lock, drop a default major connector on every tooth that already has mesh (missing) or
 * plate (present) and has connector art for that jaw (upper 11-28; lower 31-48 via 41-48
 * basenames, Q3 mirrored).
 */
export function ensureMajorConnectorPlacementsOnSupportedTeeth(teeth, majorComponentId, componentById) {
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws(
    teeth,
    majorComponentId,
    componentById,
    ["upper", "lower"]
  );
}

// Terminal third molars — excluded so a full-acrylic span runs "7 to 7".
const TERMINAL_THIRD_MOLAR_IDS = Object.freeze(new Set(["18", "28", "38", "48"]));

/**
 * Full-acrylic span: the acrylic denture base runs the whole arch from #7 to #7
 * (second molar to second molar), independent of per-tooth anchors and without the
 * metal-framework plate/mesh stamping. The terminal third molars (#8: 18/28/38/48)
 * are excluded. Used when the case material is full acrylic (state.jawMaterial === 2).
 */
function fillMajorConnectorFullArchSpan(teeth, majorComponentId, jawKey) {
  const order = TOOTH_ORDER && Array.isArray(TOOTH_ORDER[jawKey]) ? TOOTH_ORDER[jawKey] : [];
  for (const toothId of order) {
    if (TERMINAL_THIRD_MOLAR_IDS.has(toothId)) continue; // keep the span 7-to-7
    if (!getMajorConnectorAssetReference(toothId, jawKey)) continue;
    if (isMajorConnectorToothExcluded(majorComponentId, toothId)) continue;
    const tooth = teeth[toothId];
    if (!tooth) continue;
    placeMajorConnectorOnce(tooth, majorComponentId);
  }
}

/**
 * Jaw-scoped variant of major auto-placement.
 * `jawKeys` accepts `"upper"` and/or `"lower"`.
 * `options.fullAcrylic` — when true, midline-reaching majors span the full arch
 * (7-to-7), anchor-independent, for an all-acrylic denture base.
 */
export function ensureMajorConnectorPlacementsOnSupportedTeethInJaws(
  teeth,
  majorComponentId,
  componentById,
  jawKeys,
  options = {}
) {
  if (
    !majorComponentId ||
    !componentById.has(majorComponentId) ||
    !isMajorConnectorComponent(majorComponentId) ||
    !Array.isArray(jawKeys)
  ) {
    return;
  }

  const fullAcrylic = options.fullAcrylic === true;

  // Midline-reaching majors (plate / horseshoe / hole / kennedy) fill one continuous run
  // across the arch — including bare anterior teeth between anchors — matching the desktop.
  // Posterior-only majors (bar / strap) keep the per-tooth placement. Full-acrylic cases
  // span 7-to-7 regardless of anchors (the acrylic base covers the arch).
  const runsToMidline = majorConnectorRunsToMidline(majorComponentId);
  for (const jawKey of jawKeys) {
    if (jawKey !== "upper" && jawKey !== "lower") {
      continue;
    }
    if (fullAcrylic && runsToMidline) {
      fillMajorConnectorFullArchSpan(teeth, majorComponentId, jawKey);
    } else if (runsToMidline) {
      fillMajorConnectorSpanInArch(teeth, majorComponentId, componentById, jawKey);
    } else {
      placeMajorConnectorPerTooth(teeth, majorComponentId, componentById, jawKey);
    }
  }
}

/**
 * Picking Palatal Bar places per-tooth bar segments on PALATAL_BAR_CONNECTOR_TOOTH_IDS
 * wherever mesh/plate exists, replacing any other major there. Sync `tooth.components` after.
 */
export function ensurePalatalBarPlacementsOnConnectorTeeth(teeth, componentById) {
  const majorId = PALATAL_BAR_MAJOR_COMPONENT_ID;
  if (!teeth || !componentById?.has?.(majorId)) {
    return;
  }
  for (const toothId of PALATAL_BAR_CONNECTOR_TOOTH_IDS) {
    if (!getMajorConnectorAssetReference(toothId, "upper")) {
      continue;
    }
    if (isMajorConnectorToothExcluded(majorId, toothId)) {
      continue;
    }
    const tooth = teeth[toothId];
    if (!tooth) {
      continue;
    }
    if (!Array.isArray(tooth.componentPlacements)) {
      tooth.componentPlacements = [];
    }
    const hasMeshOrPlate = tooth.componentPlacements.some(({ componentId }) => {
      const def = componentById.get(componentId);
      if (!def) {
        return false;
      }
      if (tooth.isPresent) {
        // Plate or any clasp anchors the connector (matches the desktop anchor test).
        return (
          String(componentId).startsWith("plate-") ||
          String(componentId).endsWith("-clasp")
        );
      }
      return def.tab === "mesh" || String(componentId).startsWith("mesh-");
    });
    if (!hasMeshOrPlate) {
      continue;
    }
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (e) => !isMajorConnectorComponent(e.componentId)
    );
    tooth.componentPlacements.push({ componentId: majorId, surface: null });
  }
}

/** Strip all major placements from PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS so those
 *  regions start empty when Palatal Bar is selected. */
export function removeMajorPlacementsFromPalatalBarExcludedUpperTeeth(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return;
  }
  for (const toothId of PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS) {
    const tooth = teeth[toothId];
    if (!tooth || !Array.isArray(tooth.componentPlacements)) {
      continue;
    }
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (e) => !isMajorConnectorComponent(e.componentId)
    );
  }
}

/**
 * Switching Palatal Bar → Palatal Hole: swap per-tooth bar tags to hole so posterior straps
 * stay consistent; callers then re-fill anteriors via ensureMajorConnectorPlacementsOnSupportedTeeth.
 */
export function replaceUpperPalatalBarPlacementsWithPalatalHole(teeth) {
  if (!teeth || typeof teeth !== "object") {
    return;
  }
  const barId = PALATAL_BAR_MAJOR_COMPONENT_ID;
  const holeId = PALATAL_HOLE_MAJOR_COMPONENT_ID;
  for (const toothId of TOOTH_ORDER.upper) {
    const tooth = teeth[toothId];
    if (!tooth || !Array.isArray(tooth.componentPlacements)) {
      continue;
    }
    tooth.componentPlacements = tooth.componentPlacements.map((e) =>
      e.componentId === barId ? { ...e, componentId: holeId } : e
    );
  }
}

export function pruneInvalidMajorConnectorPlacementsInJaw(teeth, componentById, jawKey) {
  if (!teeth || typeof teeth !== "object") {
    return;
  }
  if (!Array.isArray(TOOTH_ORDER?.[jawKey])) {
    return;
  }

  const order = TOOTH_ORDER[jawKey];

  const touchedToothIds = new Set();

  const hasAnchorSupport = (tooth) => {
    if (!tooth || !Array.isArray(tooth.componentPlacements)) {
      return false;
    }
    return tooth.componentPlacements.some(({ componentId }) => {
      const def = componentById?.get?.(componentId);
      if (!def) {
        return false;
      }
      if (tooth.isPresent) {
        // Plate or any clasp anchors the connector (matches the desktop anchor test).
        return (
          String(componentId).startsWith("plate-") ||
          String(componentId).endsWith("-clasp")
        );
      }
      return def.tab === "mesh" || String(componentId).startsWith("mesh-");
    });
  };

  for (const toothId of order) {
    const tooth = teeth[toothId];
    if (!tooth || !Array.isArray(tooth.componentPlacements)) {
      continue;
    }
    const beforeLen = tooth.componentPlacements.length;
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (entry) =>
        !(
          isMajorConnectorComponent(entry.componentId) &&
          isMajorConnectorToothExcluded(entry.componentId, toothId)
        )
    );
    if (tooth.componentPlacements.length !== beforeLen) {
      touchedToothIds.add(toothId);
    }
  }

  // Drop major-connector runs that aren't anchored anywhere. A major is one continuous span
  // anchored by ≥1 mesh saddle or abutment; a run of major-bearing teeth with no anchor is
  // stray → remove the whole run. Run-scoped (not per-tooth) so span-filled bare anteriors
  // mid-run survive instead of unravelling from the open end.
  const majorOnTooth = (tooth) =>
    tooth &&
    Array.isArray(tooth.componentPlacements) &&
    tooth.componentPlacements.some((entry) => isMajorConnectorComponent(entry.componentId));

  let i = 0;
  while (i < order.length) {
    if (!majorOnTooth(teeth[order[i]])) {
      i += 1;
      continue;
    }
    // Extent of this contiguous run of major-bearing teeth: [i, runEnd).
    let runEnd = i;
    let runAnchored = false;
    while (runEnd < order.length && majorOnTooth(teeth[order[runEnd]])) {
      if (hasAnchorSupport(teeth[order[runEnd]])) {
        runAnchored = true;
      }
      runEnd += 1;
    }
    if (!runAnchored) {
      for (let k = i; k < runEnd; k += 1) {
        const stray = teeth[order[k]];
        const beforeLen = stray.componentPlacements.length;
        stray.componentPlacements = stray.componentPlacements.filter(
          (entry) => !isMajorConnectorComponent(entry.componentId)
        );
        if (stray.componentPlacements.length !== beforeLen) {
          touchedToothIds.add(order[k]);
        }
      }
    }
    i = runEnd + 1;
  }

  for (const toothId of touchedToothIds) {
    const tooth = teeth[toothId];
    if (!tooth || !Array.isArray(tooth.componentPlacements)) {
      continue;
    }
    const ids = [];
    for (const entry of tooth.componentPlacements) {
      const cid = entry?.componentId;
      if (!cid || !componentById?.has?.(cid)) {
        continue;
      }
      if (!ids.includes(cid)) {
        ids.push(cid);
      }
    }
    tooth.components = ids;
  }
}

export function isMajorConnectorPlacementSeparated(toothId, teeth, jawKey) {
  if (!teeth || typeof teeth !== "object") {
    return false;
  }
  const order = Array.isArray(TOOTH_ORDER?.[jawKey]) ? TOOTH_ORDER[jawKey] : null;
  if (!order) {
    return false;
  }
  const idx = order.indexOf(String(toothId));
  if (idx < 0) {
    return false;
  }
  const tooth = teeth[String(toothId)];
  if (!toothHasMajorConnectorPlacement(tooth)) {
    return false;
  }
  const prevId = idx > 0 ? order[idx - 1] : null;
  const nextId = idx < order.length - 1 ? order[idx + 1] : null;
  const prevHasMajor = Boolean(prevId && toothHasMajorConnectorPlacement(teeth[prevId]));
  const nextHasMajor = Boolean(nextId && toothHasMajorConnectorPlacement(teeth[nextId]));
  return !prevHasMajor && !nextHasMajor;
}

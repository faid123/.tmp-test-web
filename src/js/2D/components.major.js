import { TOOTH_ORDER } from "./constants.js";

const MAJOR_TAB = "major";

/** Fallback major-connector id auto-placed on lock (design mode). Upper-arch only for now. */
const DEFAULT_MAJOR_CONNECTOR_ID_FOR_LOCK_DESIGN_MODE = "major-upper-palatal-strap";

/**
 * Palatal Hole uses shared arch artwork ({@link PALATAL_HOLE_ARCH_OVERLAY_LAYERS}) and the same per-tooth
 * `MajorConnector/{11–18}*.svg` segments as other upper majors (e.g. Horseshoe) when tagged on a tooth.
 */
export const PALATAL_HOLE_MAJOR_COMPONENT_ID = "major-upper-palatal-hole";

/** Palatal Bar: arch-wide {@link PALATAL_BAR_ARCH_OVERLAY} plus per-tooth majors on {@link PALATAL_BAR_CONNECTOR_TOOTH_IDS} only. */
export const PALATAL_BAR_MAJOR_COMPONENT_ID = "major-upper-palatal-bar";

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
 * @param {{ palatalBarSecondMolarDistal?: boolean }} [options] Palatal bar: when true, `17` / `27` use `{17}_distal.svg` (caller should set this only while `18` / `28` have no palatal-bar placement).
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
 * Palatal bar: distal second-molar caps (`17_distal.svg` / mirrored on `27`) only while **18** / **28**
 * have no real palatal-bar placement—same idea as palatal hole. After tagging 18–28, use augmented
 * neighbors so {@link getMajorConnectorAssetReference} returns body art and segments connect.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth Un-augmented arch state ({@link state.teeth}).
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
 * Mirrors Unity palatal-bar connector **span** continuity: both posterior runs use virtual palatal-bar
 * placements so internal teeth prefer straight templates over `{base}_mesial.svg` / `{base}_distal.svg` at run ends.
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
 * Positions in upper jaw SVG viewBox space (`0 0 600 420`). Tune to align with the palate template.
 * Native ratios: AP_Strap01 ~294×92, AP_Strap02 ~241×153.
 */
export const PALATAL_HOLE_ARCH_OVERLAY_LAYERS = Object.freeze([
  { file: "AP_Strap01.svg", x: 248, y: 138, width: 140, height: 74 },
  { file: "AP_Strap02.svg", x: 212, y: 255, width: 210, height: 127 },
]);

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
 * When true, major-connector translation uses only {@link CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH}
 * (plus mirroring rules)—mesh/plate anchors are ignored so the same connector frame is used
 * whether the site is mesh or plate. When false, translation = mesh OR plate anchor + extra.
 */
export const CONNECTOR_POSITION_IGNORE_MESH_PLATE_ANCHOR = true;

const VALID_FDI_TOOTH_ID = /^[1-4][1-8]$/;
const DEFAULT_OFFSET = Object.freeze({ x: 0, y: 0 });

/** Keep empty to always use mesh/plate image box (default image size path). */
export const CONNECTOR_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  // Intentionally empty: tune size via render scale, not image box overrides.
});

/**
 * Extra x/y in tooth-local units, added on top of the mesh/plate anchor (unless
 * {@link CONNECTOR_POSITION_IGNORE_MESH_PLATE_ANCHOR} is true).
 * Keys: upper template `11`–`18` (Q2 mirrors); lower template `41`–`48` (Q3 mirrors); optional exact
 * FDI rows to override mirroring. Quadrants 2 / 3 flip X when resolving from the template row only.
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
 * When both arches lock, drop a default major connector on every tooth that already has
 * mesh (missing) or plate (present) **where** {@link getMajorConnectorAssetReference} returns art
 * for that jaw (upper 11–28; lower 31–48 using `41`–`48` basenames; Q3 mirrored like upper Q2).
 */
export function ensureMajorConnectorPlacementsOnSupportedTeeth(teeth, majorComponentId, componentById) {
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws(
    teeth,
    majorComponentId,
    componentById,
    ["upper", "lower"]
  );
}

/**
 * Jaw-scoped variant of major auto-placement.
 * `jawKeys` accepts `"upper"` and/or `"lower"`.
 */
export function ensureMajorConnectorPlacementsOnSupportedTeethInJaws(
  teeth,
  majorComponentId,
  componentById,
  jawKeys
) {
  if (
    !majorComponentId ||
    !componentById.has(majorComponentId) ||
    !isMajorConnectorComponent(majorComponentId) ||
    !Array.isArray(jawKeys)
  ) {
    return;
  }

  const tryArch = (jawKey) => {
    const ids = TOOTH_ORDER && Array.isArray(TOOTH_ORDER[jawKey]) ? TOOTH_ORDER[jawKey] : [];
    for (const toothId of ids) {
      if (!getMajorConnectorAssetReference(toothId, jawKey)) {
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
          return String(componentId).startsWith("plate-");
        }
        return def.tab === "mesh" || String(componentId).startsWith("mesh-");
      });
      if (!hasMeshOrPlate) {
        continue;
      }
      const hasMajor = tooth.componentPlacements.some(({ componentId }) =>
        isMajorConnectorComponent(componentId)
      );
      if (hasMajor) {
        continue;
      }
      tooth.componentPlacements.push({ componentId: majorComponentId, surface: null });
      if (Array.isArray(tooth.components) && !tooth.components.includes(majorComponentId)) {
        tooth.components.push(majorComponentId);
      }
    }
  };

  for (const jawKey of jawKeys) {
    if (jawKey === "upper" || jawKey === "lower") {
      tryArch(jawKey);
    }
  }
}

/**
 * When the user picks Palatal Bar in the catalog, place per-tooth bar segments on
 * {@link PALATAL_BAR_CONNECTOR_TOOTH_IDS} wherever mesh/plate exists, replacing any other major on those
 * teeth so straps/horseshoe do not block. Sync `tooth.components` after calling (see 2DAnnotation).
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
        return String(componentId).startsWith("plate-");
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

/**
 * Strip all major-connector placements from {@link PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS} so those
 * regions start “empty” when Palatal Bar is selected.
 */
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
 * When switching the catalog from **Palatal Bar** to **Palatal Hole**, swap per-tooth bar segment tags
 * to hole so posterior straps stay consistent, then callers can run
 * {@link ensureMajorConnectorPlacementsOnSupportedTeeth} to re-fill anteriors (11–13, 21–23).
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

function toothHasMeshOrPlateAnchor(tooth, componentById) {
  if (!tooth || !Array.isArray(tooth.componentPlacements)) {
    return false;
  }
  return tooth.componentPlacements.some(({ componentId }) => {
    const def = componentById?.get?.(componentId);
    if (!def) {
      return false;
    }
    if (tooth.isPresent) {
      return String(componentId).startsWith("plate-");
    }
    return def.tab === "mesh" || String(componentId).startsWith("mesh-");
  });
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

  for (const toothId of order) {
    const tooth = teeth[toothId];
    if (!tooth || !Array.isArray(tooth.componentPlacements)) {
      continue;
    }
    const hasAnchor = toothHasMeshOrPlateAnchor(tooth, componentById);
    if (hasAnchor) {
      continue;
    }
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (entry) => !isMajorConnectorComponent(entry.componentId)
    );
    touchedToothIds.add(toothId);
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

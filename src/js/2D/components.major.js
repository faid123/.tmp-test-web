import { TOOTH_ORDER } from "./constants.js";

const MAJOR_TAB = "major";

/** Fallback major-connector id auto-placed on lock (design mode). Upper-arch only for now. */
const DEFAULT_MAJOR_CONNECTOR_ID_FOR_LOCK_DESIGN_MODE = "major-upper-palatal-strap";

/**
 * Palatal Hole uses shared arch artwork ({@link PALATAL_HOLE_ARCH_OVERLAY_LAYERS}), not per-tooth `11.svg`-style majors.
 */
export const PALATAL_HOLE_MAJOR_COMPONENT_ID = "major-upper-palatal-hole";

/** Palatal Bar: arch-wide {@link PALATAL_BAR_ARCH_OVERLAY} plus per-tooth majors on {@link PALATAL_BAR_CONNECTOR_TOOTH_IDS} only. */
export const PALATAL_BAR_MAJOR_COMPONENT_ID = "major-upper-palatal-bar";

/**
 * Per-tooth palatal-bar major SVGs: posterior segments **without** distal tails (18 / 28) or anteriors
 * (11–13, 21–23). Matches the regions hidden when palatal bar is selected in the 2D view.
 * Derived from {@link TOOTH_ORDER}.upper: indices 1–4 (17→14) and 11–14 (24→27).
 */
export const PALATAL_BAR_CONNECTOR_TOOTH_IDS = Object.freeze(
  new Set([
    ...TOOTH_ORDER.upper.slice(1, 5),
    ...TOOTH_ORDER.upper.slice(11, 15),
  ])
);

/**
 * When palatal bar is shown, hide other major types (e.g. auto strap) on these teeth so anterior
 * and distal “cross” connector art does not appear.
 */
export const PALATAL_BAR_SUPPRESS_OTHER_MAJOR_TOOTH_IDS = Object.freeze(
  new Set(["18", "28", "13", "12", "11", "21", "22", "23"])
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
 * Template bases that ship a matching `*_end.svg` beside `{base}.svg` under MajorConnector/.
 * (There is no `18_end.svg`; terminal 18/28 sites keep `18.svg`.)
 */
const MAJOR_CONNECTOR_END_TEMPLATE_BASES = Object.freeze(
  new Set(["11", "12", "13", "14", "15", "16", "17"])
);

/**
 * @param {unknown} tooth
 * @returns {boolean}
 */
export function toothHasMajorConnectorPlacement(tooth) {
  if (!tooth || !Array.isArray(tooth.componentPlacements)) {
    return false;
  }
  return tooth.componentPlacements.some(
    (e) =>
      isMajorConnectorComponent(e.componentId) && !isPalatalHoleMajorComponent(e.componentId)
  );
}

/**
 * Along {@link TOOTH_ORDER}.upper (18→…→11→21→…→28), whether the mesial/distal neighbor carries a major connector.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 */
export function getMajorConnectorNeighborMajorFlags(toothId, teeth) {
  const id = String(toothId);
  const order = TOOTH_ORDER.upper;
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
 * Use `{template}_end.svg` when this tooth is a run endpoint: mesial or distal neighbor has no major placement.
 * @param {string} toothId
 * @param {Record<string, unknown> | null | undefined} teeth
 */
export function shouldUseMajorConnectorEndAsset(toothId, teeth) {
  if (!teeth || typeof teeth !== "object") {
    return false;
  }
  const { prevHasMajor, nextHasMajor } = getMajorConnectorNeighborMajorFlags(toothId, teeth);
  return !prevHasMajor || !nextHasMajor;
}

/**
 * Page-relative href for a MajorConnector template SVG (upper arch only).
 * Quadrant 1 (11–18): file matches tooth id; quadrant 2 (21–28): maps by unit → 11–18 (e.g. 21 → 11.svg).
 * @param {string} toothId
 * @param {string} jaw
 * @param {Record<string, unknown> | null | undefined} [teeth] When passed, run-end teeth use `*_end.svg` where available.
 */
export function getMajorConnectorAssetReference(toothId, jaw, teeth) {
  if (jaw !== "upper") return null;
  const id = String(toothId);
  if (!/^[12][1-8]$/.test(id)) return null;
  const q = Number(id[0]);
  const u = Number(id[1]);
  const file = q === 1 ? id : `1${u}`;
  const useEnd = shouldUseMajorConnectorEndAsset(id, teeth);
  if (useEnd && MAJOR_CONNECTOR_END_TEMPLATE_BASES.has(file)) {
    return `../../assets/RPD_Component/MajorConnector/${file}_end.svg`;
  }
  return `../../assets/RPD_Component/MajorConnector/${file}.svg`;
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

/**
 * Mirrors Unity palatal-bar connector **span** continuity: both posterior runs use virtual palatal-bar
 * placements so internal teeth prefer straight templates over `_end.svg`.
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
 * Keys: template teeth `11`–`18`, or exact FDI (e.g. `"21"`) to override mirroring.
 * Quadrants 2 / 3 flip X when only the template row exists (same rule as plates).
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
  "17": { x: 61.3, y: 16.6 },
  "18": { x: 62.2, y: 9.5 },
  "28": { x: -63.2, y: 9.5 },
});

/** Multiplier on the scaled connector group per arch. */
export const CONNECTOR_RENDER_SCALE_BY_JAW = Object.freeze({
  upper: 1,
  lower: 1,
});

/** Optional per–template-tooth (11–18) scale multiplier. */
export const CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH = Object.freeze({
  "11": 0.58,
  "12": 0.565,
  "13": 0.63,
  "14": 0.8,
  "15": 0.65,
  "16": 0.7,
  "17": 0.63,
  "18": 0.6,
});

function getMajorConnectorTemplateToothId(toothId) {
  const id = String(toothId);
  if (!VALID_FDI_TOOTH_ID.test(id)) {
    return "11";
  }
  const unit = id[1];
  return `1${unit}`;
}

export function getMajorConnectorPlacementOffset(toothId) {
  const id = String(toothId);
  const tmpl = getMajorConnectorTemplateToothId(toothId);
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

export function getMajorConnectorPlacementImageSize(toothId) {
  const tmpl = getMajorConnectorTemplateToothId(toothId);
  return CONNECTOR_PLACEMENT_IMAGE_SIZE_BY_TOOTH[tmpl] ?? null;
}

export function getMajorConnectorRenderScaleMultiplier(toothId, jaw) {
  const jawM = CONNECTOR_RENDER_SCALE_BY_JAW[jaw] ?? 1;
  const tmpl = getMajorConnectorTemplateToothId(toothId);
  const toothM = CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH[tmpl] ?? 1;
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
 * When both arches lock, drop a default major connector on every upper tooth that already has
 * mesh (missing) or plate (present) — siblings to the auto mesh/plate flow. Lower arch is skipped
 * because lower-arch major artwork isn't wired into the 2D view yet.
 */
export function ensureMajorConnectorPlacementsOnSupportedTeeth(teeth, majorComponentId, componentById) {
  if (
    !majorComponentId ||
    !componentById.has(majorComponentId) ||
    !isMajorConnectorComponent(majorComponentId)
  ) {
    return;
  }
  const upperIds = TOOTH_ORDER && Array.isArray(TOOTH_ORDER.upper) ? TOOTH_ORDER.upper : [];
  for (const toothId of upperIds) {
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
      if (!def) return false;
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
}

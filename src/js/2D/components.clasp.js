import { getComponentTemplateToothId } from "./components.mesh.js";
import { TOOTH_ORDER } from "./constants.js";

export const CLASP_CIRC_SURFACE = Object.freeze({
  MESIAL_BUCCAL: "mesial_buccal",
  DISTAL_BUCCAL: "distal_buccal",
  MESIAL_LINGUAL: "mesial_lingual",
  DISTAL_LINGUAL: "distal_lingual",
});

const CLASP_CIRC_SURFACE_ORDER = [
  CLASP_CIRC_SURFACE.MESIAL_BUCCAL,
  CLASP_CIRC_SURFACE.DISTAL_BUCCAL,
  CLASP_CIRC_SURFACE.MESIAL_LINGUAL,
  CLASP_CIRC_SURFACE.DISTAL_LINGUAL,
];

const CLASP_ASSET_BASE = "../../../assets/RPD_Component";

const CLASP_CIRC_SUGGESTION_RADIUS = 5;

/**
 * Per-template (Q1: 11–18, Q4: 41–48) clasp anchor quad in tooth-local space.
 * Intentionally **not** derived from rest M/D/L suggestion points — separate layout for clasp arms.
 */
const CLASP_QUAD_BY_TEMPLATE = Object.freeze({
  "11": {
    mesial_buccal: { x: 17, y: -20 },
    distal_buccal: { x: -17, y: -10 },
    mesial_lingual: { x: 13, y: 13 },
    distal_lingual: { x: -2, y: 15 },
  },
  "12": {
    mesial_buccal: { x: 5, y: -16 },
    distal_buccal: { x: -14, y: -3 },
    mesial_lingual: { x: 10, y: 5 },
    distal_lingual: { x: -4, y: 12 },
  },
  "13": {
    mesial_buccal: { x: 3, y: -16 },
    distal_buccal: { x: -16, y: 7 },
    mesial_lingual: { x: 11, y: 4 },
    distal_lingual: { x: 1, y: 15 },
  },
  "14": {
    mesial_buccal: { x: -1, y: -15 },
    distal_buccal: { x: -14, y: 10 },
    mesial_lingual: { x: 15, y: -2 },
    distal_lingual: { x: 5, y: 18 },
  },
  "15": {
    mesial_buccal: { x: -5, y: -16 },
    distal_buccal: { x: -14, y: 10 },
    mesial_lingual: { x: 15, y: -6 },
    distal_lingual: { x: 6, y: 16 },
  },
  "16": {
    mesial_buccal: { x: -8, y: -25 },
    distal_buccal: { x: -20, y: 18 },
    mesial_lingual: { x: 20, y: -8 },
    distal_lingual: { x: 10, y: 25 },
  },
  "17": {
    mesial_buccal: { x: -10, y: -20 },
    distal_buccal: { x: -17, y: 16 },
    mesial_lingual: { x: 19, y: -8 },
    distal_lingual: { x: 12, y: 18 },
  },
  "18": {
    mesial_buccal: { x: -13, y: -20 },
    distal_buccal: { x: -16, y: 16 },
    mesial_lingual: { x: 17, y: -10 },
    distal_lingual: { x: 13, y: 19 },
  },
  "41": {
    mesial_buccal: { x: 7, y: 15 },
    distal_buccal: { x: -11, y: 12 },
    mesial_lingual: { x: 6, y: -8 },
    distal_lingual: { x: -5, y: -9 },
  },
  "42": {
    mesial_buccal: { x: 3, y: 15 },
    distal_buccal: { x: -13, y: 10 },
    mesial_lingual: { x: 8, y: -6 },
    distal_lingual: { x: -3, y: -9 },
  },
  "43": {
    mesial_buccal: { x: 4, y: 15 },
    distal_buccal: { x: -16, y: 1 },
    mesial_lingual: { x: 10, y: -5 },
    distal_lingual: { x: 0, y: -12 },
  },
  "44": {
    mesial_buccal: { x: 5, y: 16 },
    distal_buccal: { x: -15, y: -7 },
    mesial_lingual: { x: 17, y: 4 },
    distal_lingual: { x: 0, y: -15 },
  },
  "45": {
    mesial_buccal: { x: -2, y: 19 },
    distal_buccal: { x: -15, y: -8 },
    mesial_lingual: { x: 15, y: 10 },
    distal_lingual: { x: 7, y: -16 },
  },
  "46": {
    mesial_buccal: { x: -7, y: 28 },
    distal_buccal: { x: -21, y: -16 },
    mesial_lingual: { x: 22, y: 18 },
    distal_lingual: { x: 8, y: -26 },
  },
  "47": {
    mesial_buccal: { x: -8, y: 24 },
    distal_buccal: { x: -18, y: -16 },
    mesial_lingual: { x: 17, y: 18 },
    distal_lingual: { x: 11, y: -23 },
  },
  "48": {
    mesial_buccal: { x: -8, y: 20 },
    distal_buccal: { x: -15, y: -20 },
    mesial_lingual: { x: 16, y: 13 },
    distal_lingual: { x: 9, y: -20 },
  },
});

function mirrorQuad(row) {
  return {
    mesial_buccal: { x: -row.mesial_buccal.x, y: row.mesial_buccal.y },
    distal_buccal: { x: -row.distal_buccal.x, y: row.distal_buccal.y },
    mesial_lingual: { x: -row.mesial_lingual.x, y: row.mesial_lingual.y },
    distal_lingual: { x: -row.distal_lingual.x, y: row.distal_lingual.y },
  };
}

function buildClaspCircPointOverrides() {
  const out = {};
  for (let u = 1; u <= 8; u += 1) {
    const unit = String(u);
    const upper = CLASP_QUAD_BY_TEMPLATE[`1${unit}`];
    const lower = CLASP_QUAD_BY_TEMPLATE[`4${unit}`];
    if (upper) {
      out[`1${unit}`] = upper;
      out[`2${unit}`] = mirrorQuad(upper);
    }
    if (lower) {
      out[`4${unit}`] = lower;
      out[`3${unit}`] = mirrorQuad(lower);
    }
  }
  return Object.freeze(out);
}

/** FDI tooth id → four clasp suggestion anchors (independent of rest suggestion geometry). */
export const CLASP_CIRC_POINT_OVERRIDES = buildClaspCircPointOverrides();

/** Fallback `<image>` box when a template tooth has no `clasp-circ` row in {@link CLASP_CIRC_PLACEMENT_IMAGE_SIZE_BY_TOOTH}. */
const CLASP_CIRC_IMAGE_DEFAULT = Object.freeze({ width: 40, height: 40 });

/**
 * Placed clasp SVG logical size by **template tooth** (`11`–`18`, `41`–`48`).
 * Teeth `21`–`28` / `31`–`38` resolve via {@link getComponentTemplateToothId}.
 */
const CLASP_CIRC_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  "11": { mesial_buccal: { width: 155, height: 140 },distal_buccal: { width: 155, height: 140 },mesial_lingual: { width: 137, height: 130 },distal_lingual: { width: 150, height: 140 },},
  "12": { mesial_buccal: { width: 130, height: 130 }, distal_buccal: { width: 170, height: 150 },mesial_lingual: { width: 85, height: 80 }, distal_lingual: { width: 122, height: 120 },}, 
  "13": {
    mesial_buccal: { width: 145, height: 130 },
    distal_buccal: { width: 170, height: 150 },
    mesial_lingual: { width: 135, height: 100 },
    distal_lingual: { width: 122, height: 125 },
  }, 
  "14": {
    mesial_buccal: { width: 145, height: 140 },
    distal_buccal: { width: 175, height: 165 },
    mesial_lingual: { width: 155, height: 140 },
    distal_lingual: { width: 135, height: 125 },
  },
  "15": {
    mesial_buccal: { width: 145, height: 130 },
    distal_buccal: { width: 170, height: 156 },
    mesial_lingual: { width: 165, height: 145 },
    distal_lingual: { width: 122, height: 125 },
  },
  "16": {
    mesial_buccal: { width: 245, height: 170 },
    distal_buccal: { width: 250, height: 185 },
    mesial_lingual: { width: 165, height: 165 },
    distal_lingual: { width: 162, height: 155 },
  }, 
  "17": {
    mesial_buccal: { width: 240, height: 165 },
    distal_buccal: { width: 200, height: 175 },
    mesial_lingual: { width: 170, height: 170 },
    distal_lingual: { width: 142, height: 150 },
  }, 
  "18": {
    mesial_buccal: { width: 180, height: 145 },
    distal_buccal: { width: 185, height: 175 },
    mesial_lingual: { width: 165, height: 155 },
    distal_lingual: { width: 150, height: 160 },
  },          
  "41": { mesial_buccal: { width: 100, height: 90 },distal_buccal: { width: 95, height: 85 },mesial_lingual: { width: 75, height: 70 },distal_lingual: { width: 80, height: 75 },},
  "42": { mesial_buccal: { width: 100, height: 90 },distal_buccal: { width: 100, height: 90 },mesial_lingual: { width: 95, height: 75 },distal_lingual: { width: 82, height: 75 },},
 "43": { mesial_buccal: { width: 105, height: 100 },distal_buccal: { width: 100, height: 100 },mesial_lingual: { width: 100, height: 85 },distal_lingual: { width: 92, height: 85 },},
  "44": { mesial_buccal: { width: 115, height: 100 },distal_buccal: { width: 120, height: 120 },mesial_lingual: { width: 130, height: 110 },distal_lingual: { width: 100, height: 100 },},
   "45": { mesial_buccal: { width: 105, height: 100 },distal_buccal: { width: 130, height: 120 },mesial_lingual: { width: 145, height: 117 },distal_lingual: { width: 112, height: 105 },},
  "46": { mesial_buccal: { width: 165, height: 140 },distal_buccal: { width: 170, height: 155 },mesial_lingual: { width: 155, height: 167 },distal_lingual: { width: 145, height: 145 },}, 
  "47": { mesial_buccal: { width: 135, height: 125 },distal_buccal: { width: 170, height: 150 },mesial_lingual: { width: 115, height: 137 },distal_lingual: { width: 115, height: 115 },},
   "48": { mesial_buccal: { width: 115, height: 110 },distal_buccal: { width: 145, height: 145 },mesial_lingual: { width: 115, height: 137 },distal_lingual: { width: 102, height: 125 },},
});

/**
 * Nudge placed clasp art on top of the suggestion anchor. Use **`clasp-circ`** for all four surfaces, or set per-surface keys to override.
 * Template teeth `11`–`18` / `41`–`48` only; `21`–`28` / `31`–`38` mirror **x** unless you add an explicit FDI row.
 */
const CLASP_CIRC_POSITION_OFFSET_OVERRIDE_SEED_BY_TOOTH = Object.freeze({
  "11": {
    mesial_buccal: { x: -13, y: -4 },
    distal_buccal: { x: 5, y: -8 },
    mesial_lingual: { x: -7, y: 3.8 },
    distal_lingual: { x: 11, y: 7 },
  },
  "12": {
    mesial_buccal: { x: -10, y: -4 },
    distal_buccal: { x: 1, y: -9 },
    mesial_lingual: { x: -3.7, y: 12 },
    distal_lingual: { x: 13, y: 7 },
  },
  "13": {
    mesial_buccal: { x: -13, y: 8 },
    distal_buccal: { x: -3, y: -12 },
    mesial_lingual: { x: -4, y: 9 },
    distal_lingual: { x: 13, y: -4 },
  },
  "14": {
    mesial_buccal: { x: -12, y: 11.7 },
    distal_buccal: { x: -3, y: -17 },
    mesial_lingual: { x: 9, y: 13 },
    distal_lingual: { x: 9, y: -4 },
  },
  "15": {
    mesial_buccal: { x: -9, y: 10 },
    distal_buccal: { x: -10, y: -17 },
    mesial_lingual: { x: 8.5, y: 11 },
    distal_lingual: { x: 11, y: -13 },
  },
  "16": {
    mesial_buccal: { x: -8, y: 18 },
    distal_buccal: { x: -6, y: -21 },
    mesial_lingual: { x: 9, y: 12 },
    distal_lingual: { x: 7, y: -18 },
  },
  "17": {
    mesial_buccal: { x: -10, y: 20 },
    distal_buccal: { x: -9, y: -18 },
    mesial_lingual: { x: 6, y: 12 },
    distal_lingual: { x: 4, y: -13 },
  },
  "18": {
    mesial_buccal: { x: -9, y: 15 },
    distal_buccal: { x: -6, y: -19 },
    mesial_lingual: { x: 6, y: 8 },
    distal_lingual: { x: 9, y: -18 },
  },
  "41": {
    mesial_buccal: { x: -11, y: 4 },
    distal_buccal: { x: 6, y: 7 },
    mesial_lingual: { x: -3, y: 1 },
    distal_lingual: { x: 2, y: 1 },
  }, 
  "42": {
    mesial_buccal: { x: -9, y: 5 },
    distal_buccal: { x: 3, y: 5.2 },
    mesial_lingual: { x: -5, y: 6 },
    distal_lingual: { x: 0, y: 0.5 },
  },
  "43": {
    mesial_buccal: { x: -10, y: 2 },
    distal_buccal: { x: 3, y: 8 },
    mesial_lingual: { x: -4, y: 2.2 },
    distal_lingual: { x: 0, y: -0.5 },
  },
  "44": {
    mesial_buccal: { x: -11, y: -2 },
    distal_buccal: { x: -2.5, y: 11 },
    mesial_lingual: { x: 2, y: -9 },
    distal_lingual: { x: 11, y: 0 },
  },
  "45": {
    mesial_buccal: { x: -10.8, y: -9 },
    distal_buccal: { x: -5, y: 6 },
    mesial_lingual: { x: 6, y: -7.7 },
    distal_lingual: { x: 8, y: 9 },
  },
  "46": {
    mesial_buccal: { x: -11.2, y: -16.5 },
    distal_buccal: { x: -8, y: 9 },
    mesial_lingual: { x: 5.8, y: -14.5 },
    distal_lingual: { x: 12, y: 12 },
  },
  "47": {
    mesial_buccal: { x: -10, y:-14 },
    distal_buccal: { x: -4, y: 15 },
    mesial_lingual: { x: 6, y: -13 },
    distal_lingual: { x: 7, y: 10 },
  },
  "48": {
    mesial_buccal: { x: -8, y: -9 },
    distal_buccal: { x: -6, y: 18 },
    mesial_lingual: { x: 8.6, y: -11 },
    distal_lingual: { x: 9, y: 9 },
  },
});

const CLASP_CIRC_ALL_TOOTH_IDS = Object.freeze([...TOOTH_ORDER.upper, ...TOOTH_ORDER.lower]);

function mirrorClaspOffsetSeedRow(row) {
  const next = {};
  if (row["clasp-circ"]) {
    const p = row["clasp-circ"];
    next["clasp-circ"] = {
      x: Number.isFinite(p.x) ? -p.x : 0,
      y: Number.isFinite(p.y) ? p.y : 0,
    };
  }
  for (const sur of CLASP_CIRC_SURFACE_ORDER) {
    if (row[sur]) {
      const p = row[sur];
      next[sur] = {
        x: Number.isFinite(p.x) ? -p.x : 0,
        y: Number.isFinite(p.y) ? p.y : 0,
      };
    }
  }
  return next;
}

function expandClaspOffsetSeed(seedByTooth) {
  const out = { ...seedByTooth };
  for (let u = 1; u <= 8; u += 1) {
    const s = String(u);
    const k1 = `1${s}`;
    const k2 = `2${s}`;
    const k4 = `4${s}`;
    const k3 = `3${s}`;
    if (out[k1] && out[k2] === undefined) {
      out[k2] = mirrorClaspOffsetSeedRow(out[k1]);
    }
    if (out[k4] && out[k3] === undefined) {
      out[k3] = mirrorClaspOffsetSeedRow(out[k4]);
    }
  }
  return out;
}

function buildClaspCircPositionOffsetByTooth(seedByTooth) {
  const expanded = expandClaspOffsetSeed(seedByTooth);
  const result = {};
  for (const toothId of CLASP_CIRC_ALL_TOOTH_IDS) {
    const seedRow = expanded[toothId] || {};
    const defaultCirc = seedRow["clasp-circ"];
    const fb = {
      x: Number.isFinite(defaultCirc?.x) ? defaultCirc.x : 0,
      y: Number.isFinite(defaultCirc?.y) ? defaultCirc.y : 0,
    };
    const surfaces = {};
    for (const sur of CLASP_CIRC_SURFACE_ORDER) {
      const spec = seedRow[sur];
      surfaces[sur] = {
        x: Number.isFinite(spec?.x) ? spec.x : fb.x,
        y: Number.isFinite(spec?.y) ? spec.y : fb.y,
      };
    }
    result[toothId] = surfaces;
  }
  return Object.freeze(result);
}

const CLASP_CIRC_POSITION_OFFSET_BY_TOOTH = buildClaspCircPositionOffsetByTooth(
  CLASP_CIRC_POSITION_OFFSET_OVERRIDE_SEED_BY_TOOTH
);

const CLASP_CIRC_RENDER_SCALE = 0.48;

export function isClaspCircComponent(componentOrId) {
  if (typeof componentOrId === "object" && componentOrId !== null) {
    return String(componentOrId.id || "") === "clasp-circ";
  }
  return String(componentOrId || "") === "clasp-circ";
}

export function getClaspCircSuggestionRadius() {
  return CLASP_CIRC_SUGGESTION_RADIUS;
}

/**
 * @param {string} toothId FDI
 * @param {string} jaw "upper" | "lower" (reserved; coordinates are per FDI row)
 */
export function getClaspCircSuggestionPointsForTooth(toothId, _jaw) {
  const row = CLASP_CIRC_POINT_OVERRIDES[String(toothId)];
  if (!row) return [];

  return CLASP_CIRC_SURFACE_ORDER.map((surface) => ({
    surface,
    x: row[surface].x,
    y: row[surface].y,
  }));
}

export function getClaspCircAssetReference(toothId, surface) {
  const normalized = normalizeClaspSurface(surface);
  if (!normalized) return null;
  const templateToothId = getComponentTemplateToothId(toothId);
  return `${CLASP_ASSET_BASE}/${templateToothId}/clasps/${templateToothId}-rc_${normalized}.svg`;
}

export function getClaspCircPlacementImageSize(_componentId, toothId, surface) {
  const norm = normalizeClaspSurface(surface);
  const templateToothId = getComponentTemplateToothId(toothId);
  const row = CLASP_CIRC_PLACEMENT_IMAGE_SIZE_BY_TOOTH[templateToothId];
  if (!row) {
    return CLASP_CIRC_IMAGE_DEFAULT;
  }
  if (norm) {
    const per = row[norm];
    if (per && Number.isFinite(per.width) && Number.isFinite(per.height)) {
      return { width: per.width, height: per.height };
    }
  }
  const box = row["clasp-circ"];
  if (box && Number.isFinite(box.width) && Number.isFinite(box.height)) {
    return { width: box.width, height: box.height };
  }
  return CLASP_CIRC_IMAGE_DEFAULT;
}

export function getClaspCircPlacementOffset(_componentId, toothId, surface) {
  const norm = normalizeClaspSurface(surface);
  if (!norm) return { x: 0, y: 0 };
  const exactToothId = String(toothId ?? "");
  const templateToothId = getComponentTemplateToothId(toothId);
  const row =
    CLASP_CIRC_POSITION_OFFSET_BY_TOOTH[exactToothId] ??
    CLASP_CIRC_POSITION_OFFSET_BY_TOOTH[templateToothId];
  const o = row?.[norm] ?? { x: 0, y: 0 };
  return {
    x: Number.isFinite(o.x) ? o.x : 0,
    y: Number.isFinite(o.y) ? o.y : 0,
  };
}

export function getClaspCircPlacementRenderScale(_componentId, _toothId, _surface) {
  return CLASP_CIRC_RENDER_SCALE;
}

function normalizeClaspSurface(surface) {
  if (typeof surface !== "string") return null;
  const s = surface.toLowerCase();
  if (CLASP_CIRC_SURFACE_ORDER.includes(s)) return s;
  return null;
}

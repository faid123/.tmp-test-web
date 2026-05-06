import { TOOTH_ORDER } from "./constants.js";
import { COMPONENT_ASSET_BASE, getComponentTemplateToothId } from "./components.mesh.js";

const BAR_TAB = "bars";
const BAR_SURFACE_RE = /^bar_(d[12])_(mesial|distal)$/;
const BAR_SURFACE_SIDE_RE = /^bar_d[12]_(mesial|distal)$/;

/** Anchor key in `getClaspSurfacePointMap` used to place bar SVGs. */
export const BAR_PLACEMENT_ANCHOR_SURFACE = "mesial_buccal";

/** Logical source box for bar SVG art. */
export const BAR_IMAGE_SIZE = Object.freeze({ width: 92, height: 92 });

/**
 * **Main control for how big bars look everywhere** (d1 / d2 use the same baseline).
 * `1` = current design baseline. Use `1.2` for ~20% larger, `0.85` for smaller, etc.
 * Final size = tier unit × this × per-tooth override.
 */
export const BAR_DEFAULT_RENDER_SCALE = 1.2;

/**
 * d1: adjacent to missing tooth, d2: two teeth away.
 * These units preserve previous visible size with the new common source box.
 */
const BAR_TIER_DISPLAY_UNIT = Object.freeze({
  d1: (80 * 1) / BAR_IMAGE_SIZE.width,
  d2: (88 * 1) / BAR_IMAGE_SIZE.width,
});

/**
 * Optional per-tooth size fine tuning.
 * Keys per tooth: `mesial` / `distal` (side of the bar), and/or the full bar surface
 * string (`bar_d1_mesial`, `bar_d2_distal`, …) if you want different scales for d1 vs d2.
 */
export const BAR_RENDER_SCALE_BY_TOOTH_SURFACE = Object.freeze({
  "11": {
    bar_d1_mesial: 1.2,
    bar_d1_distal: 1.25,
    bar_d2_mesial: 2,
    bar_d2_distal: 1.9,
  },
  "12": {
    bar_d1_mesial: 1.05,
    bar_d1_distal: 1.25,
    bar_d2_mesial: 1.95,
    bar_d2_distal: 1.95,
  },
  "13": {
    bar_d1_mesial: 1.25,
    bar_d1_distal: 1.15,
    bar_d2_mesial: 1.95,
    bar_d2_distal: 1.95,
  },
  "14": {
    bar_d1_mesial: 1.05,
    bar_d1_distal: 1.05,
    bar_d2_mesial: 1.5,
    bar_d2_distal: 1.65,
  },
  "15": {
    bar_d1_mesial: 1.15,
    bar_d1_distal: 1.15,
    bar_d2_mesial: 1.6,
    bar_d2_distal: 1.95,
  },
  "16": {
    bar_d1_mesial: 1.35,
    bar_d1_distal: 1.35,
    bar_d2_mesial: 1.8,
    bar_d2_distal: 1.95,
  },
  "17": {
    bar_d1_mesial: 1.35,
    bar_d1_distal: 1.25,
    bar_d2_mesial: 1.85,
    bar_d2_distal: 0,
  },
  "18": {
    bar_d1_mesial: 0.95,
    bar_d1_distal: 0,
    bar_d2_mesial: 1.75,
    bar_d2_distal: 0,
  },
  "41": {
    bar_d1_mesial: 0.75,
    bar_d1_distal: 0.85,
    bar_d2_mesial: 1.15,
    bar_d2_distal: 1.05,
  },
  "42": {
    bar_d1_mesial: 0.8,
    bar_d1_distal: 0.95,
    bar_d2_mesial: 1.10,
    bar_d2_distal: 1.30,
  },
  "43": {
    bar_d1_mesial: 0.85,
    bar_d1_distal: 1.25,
    bar_d2_mesial: 1.25,
    bar_d2_distal: 1.45,
  },
  "44": {
    bar_d1_mesial: 0.95,
    bar_d1_distal: 1.25,
    bar_d2_mesial: 1.05,
    bar_d2_distal: 1.65,
  },
  "45": {
    bar_d1_mesial: 1.05,
    bar_d1_distal: 1.35,
    bar_d2_mesial: 1.15,
    bar_d2_distal: 1.80,
  },
  "46": {
    bar_d1_mesial: 1.25,
    bar_d1_distal: 1.45,
    bar_d2_mesial: 1.55,
    bar_d2_distal: 1.75,
  },
  "47": {
    bar_d1_mesial: 1.2,
    bar_d1_distal: 1.3,
    bar_d2_mesial: 1.65,
    bar_d2_distal: 0,
  },
  "48": {
    bar_d1_mesial: 1.4,
    bar_d1_distal: 0,
    bar_d2_mesial: 1.74,
    bar_d2_distal: 0,
  },
});

/**
 * Optional per-tooth placement fine tuning (tooth-local coordinates).
 * Format: { "11": { mesial: { x: -6, y: 8, rotation: -8 } } }
 * Also supports full surface keys: { "11": { bar_d2_mesial: { x: 0, y: 0, rotation: -12 } } }
 */
export const BAR_PLACEMENT_OFFSET_BY_TOOTH_SURFACE = Object.freeze({
  "11": {
    bar_d1_mesial: { x: 46, y: -21, rotation: 4 },
    bar_d1_distal: { x: -15, y: -10, rotation: -22 },
    bar_d2_mesial: { x: 60, y: -15, rotation: -5 },
    bar_d2_distal: { x: -22, y: 4, rotation: -3 },
  },
  "21": {
    bar_d1_mesial: { x: 46, y: -21, rotation: -4 },
    bar_d1_distal: { x: -15, y: -10, rotation: 22  },
    bar_d2_mesial: { x: 60, y: -15, rotation: 5 },
    bar_d2_distal: { x: -22, y: 4, rotation: 3 },
  },
  "12": {
    bar_d1_mesial: { x: 20, y: -38, rotation: 15 },
    bar_d1_distal: { x: -15, y: -13, rotation: -21 },
    bar_d2_mesial: { x: 41, y: -38, rotation: 3 },
    bar_d2_distal: { x: -35, y: 7, rotation: -1 },
  },
  "22": {
    bar_d1_mesial: { x: 20, y: -38, rotation: -15 },
    bar_d1_distal: { x: -15, y: -13, rotation: 21 },
    bar_d2_mesial: { x: 41, y: -38, rotation: -3},
    bar_d2_distal: {  x: -35, y: 7, rotation: 1 },
  },
  "13": {
    bar_d1_mesial: { x: 8, y: -43, rotation: 19 },
    bar_d1_distal: { x: -20, y: -6, rotation: -24 },
    bar_d2_mesial: { x: 28, y: -53, rotation: 4 },
    bar_d2_distal: { x: -30, y: 15, rotation: -2 },
  },
  "23": {
    bar_d1_mesial: { x: 8, y: -43, rotation: -20 },
    bar_d1_distal: { x: -18, y: -6, rotation: 24 },
    bar_d2_mesial: { x:  28, y: -53, rotation: -4 },
    bar_d2_distal: { x: -30, y: 15, rotation: 2  },
  },
  "14": {
    bar_d1_mesial: { x: 2, y: -50, rotation: 8 },
    bar_d1_distal: { x: -16, y: -13, rotation: -5 },
    bar_d2_mesial: { x: 20, y: -65, rotation: 6 },
    bar_d2_distal: { x: -25, y: 11, rotation: -3 },
  },
  "24": {
    bar_d1_mesial: { x: 2, y: -50, rotation: -8 },
    bar_d1_distal: { x: -16, y: -13, rotation: 5  },
    bar_d2_mesial: { x: 20, y: -65, rotation: -6  },
    bar_d2_distal: { x: -25, y: 11, rotation: 3 },
  },
  "15": {
    bar_d1_mesial: { x: -11, y: -36, rotation: 8 },
    bar_d1_distal: { x: -23, y: -10, rotation: -5 },
    bar_d2_mesial: { x: 0, y: -54, rotation: 2 },
    bar_d2_distal: { x: -34, y: 45, rotation: -6 },
  },
  "25": {
    bar_d1_mesial: { x: -11, y: -36, rotation: -8 },
    bar_d1_distal: { x: -23, y: -10, rotation: 5 },
    bar_d2_mesial: { x: 0, y: -54, rotation: -2 },
    bar_d2_distal: { x: -34, y: 45, rotation: 6  },
  },
  "16": {
    bar_d1_mesial: { x: -8, y: -50, rotation: 1 },
    bar_d1_distal: { x: -16, y: -5, rotation: -3 },
    bar_d2_mesial: { x: 5, y: -70, rotation: -1 },
    bar_d2_distal: { x: -23, y: 45, rotation: -1 },
  },
  "26": {
    bar_d1_mesial: { x: -9, y: -50, rotation: -1 },
    bar_d1_distal: { x: -17, y: -5, rotation: 3 },
    bar_d2_mesial: { x: 5, y: -70, rotation: 1  },
    bar_d2_distal: { x: -23, y: 45, rotation: 1 },
  },
  "17": {
    bar_d1_mesial: { x: -14, y: -40, rotation: 4 },
    bar_d1_distal: { x: -18, y: 4, rotation: -8 },
    bar_d2_mesial: { x: 9, y: -95, rotation: -1 },
  },
  "27": {
    bar_d1_mesial: { x: -15, y: -40, rotation: -4 },
    bar_d1_distal: { x: -18, y: 4, rotation: 8  },
    bar_d2_mesial: { x: 9, y: -95, rotation: 1 },
  },
  "18": {
    bar_d1_mesial: { x: -10, y: -42, rotation: 15 },
    bar_d2_mesial: { x: -6, y: -90, rotation: 11 },
  },
  "28": {
    bar_d1_mesial: { x: -10, y: -42, rotation: -15 },
    bar_d2_mesial: { x: -6, y: -90, rotation: -11 },
  },
  "41": {
    bar_d1_mesial: { x: 21, y: 9, rotation: -17 },
    bar_d1_distal: { x: -9, y: 9, rotation: 13 },
    bar_d2_mesial: { x: 40, y: 5, rotation: 9 },
    bar_d2_distal: { x: -20, y: 0, rotation: 8 },
  },
  "31": {
    bar_d1_mesial: { x: 21, y: 9, rotation: 17 },
    bar_d1_distal: { x: -9, y: 9, rotation: -13  },
    bar_d2_mesial: { x: 40, y: 5, rotation: -9 },
    bar_d2_distal: { x: -20, y: 0, rotation: -8 },
  },
  "42": {
    bar_d1_mesial: { x: 16, y: 22, rotation: -20 },
    bar_d1_distal: { x: -9, y: 13, rotation: 14 },
    bar_d2_mesial: { x: 38, y: 24, rotation: -3 },
    bar_d2_distal: { x: -25, y: 0, rotation: 13 },
  },
  "32": {
    bar_d1_mesial: { x: 16, y: 22, rotation: 20 },
    bar_d1_distal: { x: -9, y: 13, rotation: -14 },
    bar_d2_mesial: { x: 38, y: 24, rotation: 3 },
    bar_d2_distal: { x: -25, y: 0, rotation: -13 },
  },
  "43": {
    bar_d1_mesial: { x: 18, y: 32, rotation: -33 },
    bar_d1_distal: { x: -16, y: 14, rotation: 19},
    bar_d2_mesial: { x: 36, y: 36, rotation: -11 },
    bar_d2_distal: { x: -35, y: -20, rotation: -2 },
  },
  "33": {
    bar_d1_mesial: { x: 18, y: 32, rotation: 33 },
    bar_d1_distal: { x: -16, y: 14, rotation: -19 },
    bar_d2_mesial: { x: 36, y: 36, rotation: 11 },
    bar_d2_distal: { x: -35, y: -20, rotation: 2 },
  },
  "44": {
    bar_d1_mesial: { x: 7, y: 39, rotation: -30 },
    bar_d1_distal: { x: -22, y: 10, rotation: 9 },
    bar_d2_mesial: { x: 27, y: 53, rotation: -6 },
    bar_d2_distal: { x: -30, y: -38, rotation: 17 },
  },
  "34": {
    bar_d1_mesial: { x: 7, y: 39, rotation: 30 },
    bar_d1_distal: { x: -22, y: 10, rotation: -9 },
    bar_d2_mesial: { x: 27, y: 53, rotation: 6 },
    bar_d2_distal: {  x: -30, y: -38, rotation: -17 },
  },
  "45": {
    bar_d1_mesial: { x: -1, y: 40, rotation: -15 },
    bar_d1_distal: { x: -20, y: 10, rotation: 3 },
    bar_d2_mesial: { x: 18, y: 65, rotation: -7 },
    bar_d2_distal: { x: -30, y: -45, rotation: -1 },
  },
  "35": {
    bar_d1_mesial: { x: -1, y: 40, rotation: 15 },
    bar_d1_distal: { x: -20, y: 10, rotation: -3 },
    bar_d2_mesial: { x: 18, y: 65, rotation: 8 },
    bar_d2_distal: { x: -30, y: -45, rotation: 1 },
  },
  "46": {
    bar_d1_mesial: { x: -4, y: 55, rotation: -11 },
    bar_d1_distal: { x: -14, y: 12, rotation: 4 },
    bar_d2_mesial: { x: 11, y: 80, rotation: -5 },
    bar_d2_distal: { x: -27, y: -35, rotation: 1 },
  },
  "36": {
    bar_d1_mesial: { x: -4, y: 54, rotation: 12 },
    bar_d1_distal: { x: -14, y: 12, rotation: -4 },
    bar_d2_mesial: { x: 11, y: 80, rotation: 5 },
    bar_d2_distal: { x: -27, y: -35, rotation: -1 },
  },
  "47": {
    bar_d1_mesial: { x: -12, y: 42, rotation: -2 },
    bar_d1_distal: { x: -17, y: 6, rotation: 1 },
    bar_d2_mesial: { x: 2, y: 80, rotation: -5 },
  },
  "37": {
    bar_d1_mesial: { x: -12, y: 42, rotation: 2 },
    bar_d1_distal: { x: -17, y: 6, rotation: -1 },
    bar_d2_mesial: { x: 2, y: 80, rotation: 5 },
  },
  "48": {
    bar_d1_mesial: { x: -7, y: 40, rotation: -1 },
    bar_d2_mesial: { x: 0, y: 82, rotation: -3 },
  },
  "38": {
    bar_d1_mesial: { x: -7, y: 40, rotation: 1 },
    bar_d2_mesial: { x: 0, y: 82, rotation: 3 },
  },
});

const BAR_SHAPE_LETTER = Object.freeze({
  "bar-i": "I",
  "bar-s": "S",
  "bar-u": "U",
  "bar-y": "Y",
});

/** Surfaces: `bar_d1_mesial` | `bar_d1_distal` | `bar_d2_mesial` | `bar_d2_distal` */
export function isBarPlacementSurface(surface) {
  const s = typeof surface === "string" ? surface.toLowerCase() : "";
  return BAR_SURFACE_SIDE_RE.test(s);
}

export function isBarComponent(componentOrId) {
  if (typeof componentOrId === "object" && componentOrId !== null) {
    return componentOrId.tab === BAR_TAB || String(componentOrId.id || "").startsWith("bar-");
  }
  return String(componentOrId || "").startsWith("bar-");
}

/** Present teeth within arch index ±1/±2 from any missing tooth in the same jaw. */
export function getBarSuggestibleToothIdSet(teethById, jaw) {
  const order = TOOTH_ORDER[jaw];
  const out = new Set();

  for (let i = 0; i < order.length; i += 1) {
    const missingTooth = teethById[order[i]];
    if (!missingTooth || missingTooth.isPresent) continue;

    for (const delta of [-2, -1, 1, 2]) {
      const j = i + delta;
      if (j < 0 || j >= order.length) continue;
      const candidateId = order[j];
      if (teethById[candidateId]?.isPresent) {
        out.add(candidateId);
      }
    }
  }

  return out;
}

/**
 * Resolve bar surface from nearest missing tooth:
 * - distance 1 => d1
 * - distance 2 => d2
 * - side => mesial/distal (relative to each side of the arch)
 */
export function getBarPlacementSurfaceForTooth(toothId, jaw, teethById) {
  const order = TOOTH_ORDER[jaw];
  const toothIndex = order.indexOf(toothId);
  if (toothIndex < 0 || !teethById[toothId]?.isPresent) return null;

  let nearestMissingIndex = null;
  let nearestDistance = null;

  for (let i = 0; i < order.length; i += 1) {
    if (teethById[order[i]]?.isPresent) continue;
    const distance = Math.abs(toothIndex - i);
    if (distance !== 1 && distance !== 2) continue;
    if (nearestDistance === null || distance < nearestDistance || (distance === nearestDistance && i < nearestMissingIndex)) {
      nearestDistance = distance;
      nearestMissingIndex = i;
    }
  }

  if (nearestDistance === null || nearestMissingIndex === null) return null;

  const rightHemisphereStartIndex = order.length / 2;
  const mesialDirection = toothIndex < rightHemisphereStartIndex ? 1 : -1;
  const missingDirection = nearestMissingIndex > toothIndex ? 1 : -1;
  const side = missingDirection === mesialDirection ? "mesial" : "distal";
  const tier = nearestDistance === 1 ? "d1" : "d2";

  return `bar_${tier}_${side}`;
}

export function getBarPlacementAssetReference(componentId, toothId, surface) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const letter = BAR_SHAPE_LETTER[String(componentId || "").toLowerCase()] || "I";
  const match = BAR_SURFACE_RE.exec(String(surface || "").toLowerCase());

  if (!match) {
    return `${COMPONENT_ASSET_BASE}/${templateToothId}/bars/${templateToothId}_${letter}-bar_mesial.svg`;
  }

  const [, tier, side] = match;
  const modelName = tier === "d1" ? `${letter}-bar` : `${letter}-long-bar`;
  return `${COMPONENT_ASSET_BASE}/${templateToothId}/bars/${templateToothId}_${modelName}_${side}.svg`;
}

export function getBarPlacementImageSize() {
  return { width: BAR_IMAGE_SIZE.width, height: BAR_IMAGE_SIZE.height };
}

function getBarSurfaceSide(surface) {
  const match = BAR_SURFACE_SIDE_RE.exec(String(surface || "").toLowerCase());
  return match ? match[1] : null;
}

function getBarToothConfig(configByTooth, toothId) {
  const exactToothId = String(toothId ?? "");
  const templateToothId = getComponentTemplateToothId(toothId);
  return configByTooth[exactToothId] ?? configByTooth[templateToothId] ?? null;
}

export function getBarPlacementRenderScale(_componentId, toothId, surface) {
  const normalizedSurface = String(surface || "").toLowerCase();
  const tier = normalizedSurface.startsWith("bar_d2_") ? "d2" : "d1";
  const tierScale = BAR_TIER_DISPLAY_UNIT[tier] ?? BAR_TIER_DISPLAY_UNIT.d1;

  const side = getBarSurfaceSide(surface);
  const byTooth = getBarToothConfig(BAR_RENDER_SCALE_BY_TOOTH_SURFACE, toothId);
  let perToothScale = Number(byTooth?.[normalizedSurface]);
  if (!Number.isFinite(perToothScale) && side) {
    perToothScale = Number(byTooth?.[side]);
  }
  const toothScale = Number.isFinite(perToothScale) ? perToothScale : 1;

  return tierScale * BAR_DEFAULT_RENDER_SCALE * toothScale;
}

export function getBarPlacementOffset(_componentId, toothId, surface) {
  const normalizedSurface = String(surface || "").toLowerCase();
  const side = getBarSurfaceSide(surface);
  const byTooth = getBarToothConfig(BAR_PLACEMENT_OFFSET_BY_TOOTH_SURFACE, toothId);
  let point = byTooth?.[normalizedSurface];
  if (!point && side) {
    point = byTooth?.[side];
  }
  const x = Number(point?.x);
  const y = Number(point?.y);
  const rotation = Number(point?.rotation);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    rotation: Number.isFinite(rotation) ? rotation : 0,
  };
}

export function getBarUserOffset(placement) {
  const x = Number(placement?.barOffsetX);
  const y = Number(placement?.barOffsetY);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

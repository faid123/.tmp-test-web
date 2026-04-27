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
    "11": { mesial: 1.2, distal: 1.25 },  
    "12": { mesial: 1.05, distal: 1.25 },
    "13": { mesial: 1.25, distal: 1.15 },
    "14": { mesial: 1.05, distal: 1.05 },
    "15": { mesial: 1.15, distal: 1.15 },
    "16": { mesial: 1.35, distal: 1.35 },
    "17": { mesial: 1.35, distal: 1.25 },
    "18": { mesial: 0.95, distal: 0 },
    "41": { mesial: 0.75, distal: 0.85 },
    "42": { mesial: 0.80, distal: 0.95 },
    "43": { mesial: 0.85, distal: 0.95 },
    "44": { mesial: 0.95, distal: 0.85 },
    "45": { mesial: 1.05, distal: 1.00 },
    "46": { mesial: 1.25, distal: 1.25 },
    "47": { mesial: 1.20, distal: 1.20 },
    "48": { mesial: 1.40, distal: 0 },

  // Or per placement: "21": { "bar_d1_mesial": 1.1, "bar_d2_distal": 0.9 },
});

/**
 * Optional per-tooth placement fine tuning (tooth-local coordinates).
 * Format: { "11": { mesial: { x: -6, y: 8, rotation: -8 } } }
 * Also supports full surface keys: { "11": { bar_d2_mesial: { x: 0, y: 0, rotation: -12 } } }
 */
export const BAR_PLACEMENT_OFFSET_BY_TOOTH_SURFACE = Object.freeze({
  "11": { bar_d1_mesial: { x: 12, y: -11, rotation: 3 },bar_d1_distal: { x: 12, y: -12, rotation: -1 } },
  "21": { bar_d1_mesial: { x: 12, y: -11, rotation: -3 },bar_d1_distal: { x: 12, y: -12, rotation: 1 } },   
  "12": { bar_d1_mesial: { x: 0, y: -24, rotation: 14 }, bar_d1_distal: { x: 15, y: -27, rotation: -3 } },
  "22": { bar_d1_mesial: { x: 0, y: -24, rotation: -14 },bar_d1_distal: { x: 15, y: -27, rotation: 3 } },
  "13": { bar_d1_mesial: { x: -15, y: -17, rotation: 19 },bar_d1_distal: { x: -4, y: -22, rotation: -7 } },
  "23": { bar_d1_mesial: { x: -15, y: -17, rotation: -19 }, bar_d1_distal: { x: -4, y: -21, rotation: 6 } },
  "14": { bar_d1_mesial: { x: -13, y: -21, rotation: 8 }, bar_d1_distal: { x: -10, y: -28, rotation: 0 } },
  "24": { bar_d1_mesial: { x: -13, y: -21, rotation: -8 }, bar_d1_distal: { x: -10, y: -28, rotation: 0 } },
  "15": { bar_d1_mesial: { x: -18, y: -13, rotation: 8 }, bar_d1_distal: { x: -10, y: -37, rotation: 3 } },
  "25": { bar_d1_mesial: { x: -18, y: -13, rotation: -8 }, bar_d1_distal: { x: -10, y: -37, rotation: -3 }} ,
  "16": { bar_d1_mesial: { x: -20, y: -5, rotation: 1 }, bar_d1_distal: { x: -14, y: -24, rotation: -3 } },
  "26": { bar_d1_mesial: { x: -22, y: -5, rotation: -1 }, bar_d1_distal: { x: -14, y: -24, rotation: 3 } },
  "17": { bar_d1_mesial: { x: -20, y: -5, rotation: 4 }, bar_d1_distal: { x: -13, y: -27, rotation: -3 } },
  "27": { bar_d1_mesial: { x: -20, y: -5, rotation: -4  }, bar_d1_distal: { x: -13, y: -27, rotation: 3 }  },
  "18": { bar_d1_mesial: { x: -13, y: -2, rotation: 15 } },"28": { bar_d1_mesial: { x: -13, y: -2, rotation: -15   } },
  "41": { bar_d1_mesial: { x: 3, y: 7, rotation: -17 }, bar_d1_distal: { x: 9, y: 9, rotation: 1 } },
  "31": { bar_d1_mesial: { x: 3, y: 7, rotation: 17 }, bar_d1_distal: { x: 9, y: 9, rotation: -1 } },   
  "42": { bar_d1_mesial: { x: -4, y: 15, rotation: -17 }, bar_d1_distal: { x: 9, y: 20, rotation: 4 }  },
  "32": { bar_d1_mesial: { x: -4, y: 15, rotation: 17 } ,bar_d1_distal: { x: 9, y: 20, rotation: -4 } },   
  "43": { bar_d1_mesial: { x: -5, y: 17, rotation: -33 }, bar_d1_distal: { x: 7, y: 21, rotation: 3 } },
  "33": { bar_d1_mesial: { x: -5, y: 17, rotation: 33 }, bar_d1_distal: { x: 7, y: 21, rotation: -3 } },   
  "44": { bar_d1_mesial: { x: -12, y: 17, rotation: -29 }, bar_d1_distal: { x: -4, y: 23, rotation: -3 } },
  "34": { bar_d1_mesial: { x: -12, y: 17, rotation: 29 }, bar_d1_distal: { x: -4, y: 23, rotation: 3 } },   
  "45": { bar_d1_mesial: { x: -17, y: 6, rotation: -15 }, bar_d1_distal: { x: -10, y: 27, rotation: 3 } },
  "35": { bar_d1_mesial: { x: -17, y: 9, rotation: 15 }, bar_d1_distal: { x: -10, y: 27, rotation: -3 } },   
  "46": { bar_d1_mesial: { x: -20, y: 6, rotation: -12 }, bar_d1_distal: { x: -2, y: 35, rotation: 1 }  },
  "36": { bar_d1_mesial: { x: -20, y: 6, rotation: 12 }, bar_d1_distal: { x: -2, y: 35, rotation: -1 }  },   
  "47": { bar_d1_mesial: { x: -20, y: 6, rotation: -2 }, bar_d1_distal: { x: -13, y: 35, rotation: 3 }  },
  "37": { bar_d1_mesial: { x: -22, y: 6, rotation: 2 }, bar_d1_distal: { x: -13, y: 35, rotation: -3 }  },   
  "48": { bar_d1_mesial: { x: -14, y: 2, rotation: -1 } },"38": { bar_d1_mesial: { x: -14, y: 2, rotation: 1 } },   

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

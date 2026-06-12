import { getComponentTemplateToothId } from "./components.mesh.js";

export const REST_SURFACE = Object.freeze({
  MESIAL: "distal",
  DISTAL: "mesial",
  LINGUAL: "lingual",
});

const REST_SURFACE_ORDER = [
  REST_SURFACE.MESIAL,
  REST_SURFACE.DISTAL,
  REST_SURFACE.LINGUAL,
];

const REST_SUGGESTION_CONFIG = Object.freeze({
  radius: 8,
  defaultPoints: {
    [REST_SURFACE.MESIAL]: { x: -8.2, y: -3.2 },
    [REST_SURFACE.DISTAL]: { x: 8.2, y: -3.2 },
    [REST_SURFACE.LINGUAL]: { x: 0, y: -8.4 },
  },
});

export const REST_SUGGESTION_POINT_OVERRIDES = {
  "18": { mesial: { x: 2, y: -22 }, distal: { x: -1, y: 23 }, lingual: { x: 20, y: 8 } },
  "17": { mesial: { x: 8, y: -22 }, distal: { x: -1, y: 23 }, lingual: { x: 21, y: 8 } },
  "16": { mesial: { x: 10, y: -22 }, distal: { x: -5, y: 26 }, lingual: { x: 23, y: 10 } },
  "15": { mesial: { x: 10, y: -15 }, distal: { x: -5, y: 18 }, lingual: { x: 20, y: 7 } },
  "14": { mesial: { x: 16, y: -10 }, distal: { x: -3, y: 19 }, lingual: { x: 19, y: 11 } },
  "13": { mesial: { x: 1, y: -16 }, distal: { x: -16, y: 5 }, lingual: { x: 11, y: 15 } },
  "12": { mesial: { x: 5, y: -18 }, distal: { x: -15, y: -4 }, lingual: { x: 10, y: 19 } },
  "11": { mesial: { x: 18, y: -22 }, distal: { x: -18, y: -12 }, lingual: { x: 6.5, y: 23 } },
  "21": { mesial: { x: -18, y: -22 }, distal: { x: 18, y: -12 }, lingual: { x: -6.5, y: 25 } },
  "22": { mesial: { x: -5, y: -18 }, distal: { x: 15, y: -4 }, lingual: { x: -10, y: 19 } },
  "23": { mesial: { x: -1, y: -16 }, distal: { x: 16, y: 5 }, lingual: { x: -11, y: 15 } },
  "24": { mesial: { x: -16, y: -10 }, distal: { x: 3, y: 19 }, lingual: { x: -19, y: 11 } },
  "25": { mesial: { x: -10, y: -15 }, distal: { x: 5, y: 18 }, lingual: { x: -18, y: 9 } },
  "26": { mesial: { x: -10, y: -22 }, distal: { x: 5, y: 26 }, lingual: { x: -23, y: 10 } },
  "27": { mesial: { x: -8, y: -22 }, distal: { x: 1, y: 23 }, lingual: { x: -21, y: 8 } },
  "28": { mesial: { x: -2, y: -22 }, distal: { x: 1, y: 23 }, lingual: { x: -20, y: 8 } },

  "48": { mesial: { x: 7, y: 21 }, distal: { x: -7, y: -22 }, lingual: { x: 17, y: -5 } },
  "47": { mesial: { x: 8, y: 24 }, distal: { x: -5, y: -24 }, lingual: { x: 16, y: -3 } },
  "46": { mesial: { x: 12, y: 27 }, distal: { x: -5, y: -28 }, lingual: { x: 19, y: -10 } },
  "45": { mesial: { x: 9, y: 17.6 }, distal: { x: -5, y: -18 }, lingual: { x: 14, y: -7 } },
  "44": { mesial: { x: 12, y: 14 }, distal: { x: -9, y: -13 }, lingual: { x: 12, y: -7 } },
  "43": { mesial: { x: 0, y: 15 }, distal: { x: -16, y: 3 }, lingual: { x: 7, y: -11 } },
  "42": { mesial: { x: -1, y: 17 }, distal: { x: -14, y: 12 }, lingual: { x: 4, y: -11 } },
  "41": { mesial: { x: 4, y: 15 }, distal: { x: -11, y: 13 }, lingual: { x: 0, y: -10 } },
  "31": { mesial: { x: -4, y: 15 }, distal: { x: 11, y: 13 }, lingual: { x: 0, y: -10 } },  
  "32": { mesial: { x: 1, y: 17 }, distal: { x: 14, y: 12 }, lingual: { x: -4, y: -11 } }, 
  "33": { mesial: { x: 0, y: 15 }, distal: { x: 16, y: 3 }, lingual: { x: -7, y: -11 } },   
  "34": { mesial: { x: -12, y: 14 }, distal: { x: 9, y: -13 }, lingual: { x: -12, y: -7 } },  
  "35": { mesial: { x: -9, y: 17.6 }, distal: { x: 5, y: -18 }, lingual: { x: -14, y: -7 } }, 
  "36": { mesial: { x: -12, y: 27 }, distal: { x: 5, y: -28 }, lingual: { x: -19, y: -10 } }, 
  "37": { mesial: { x: -8, y: 24 }, distal: { x: 5, y: -24 }, lingual: { x: -16, y: -3 } },   
  "38": { mesial: { x: -6, y: 20 }, distal: { x: 7, y: -22 }, lingual: { x: -17, y: -5 } },

};

/**
 * Explicit cingulum rest (ac_mesial / ac_distal) suggestion anchor positions per FDI tooth.
 * Coordinates match the same tooth-local space as {@link REST_SUGGESTION_POINT_OVERRIDES}.
 */
export const REST_CINGULUM_AC_POINT_BY_TOOTH = Object.freeze({
  "11": {
    lingual_mesial: { x: 15, y: 16 },
    lingual_distal: { x: -4, y: 18 },
  },
  "12": {
    lingual_mesial: { x: 10.1, y: 4.94 },
    lingual_distal: { x: -3, y: 15 },
  },
  "13": {
    lingual_mesial: { x: 12.2, y: 3.22 },
    lingual_distal: { x: 3.74, y: 16.2 },
  },
  "21": {
    lingual_mesial: { x: -15, y: 16 },
    lingual_distal: { x: 4, y: 18 },
  },
  "22": {
    lingual_mesial: { x: -10.1, y: 4.94 },
    lingual_distal: { x: 3, y: 15 },
  },
  "23": {
    lingual_mesial: { x: -12.2, y: 3.22 },
    lingual_distal: { x: -3.74, y: 16.2 },
  },
  "41": {
    lingual_mesial: { x: 6, y: -0.5 },
    lingual_distal: { x: -8, y: -1.26 },
  },
  "42": {
    lingual_mesial: { x: 7.1, y: 1.36 },
    lingual_distal: { x: -6.84, y: -4.44 },
  },
  "43": {
    lingual_mesial: { x: 8.34, y: 2.88 },
    lingual_distal: { x: -4.74, y: -8.12 },
  },
  "31": {
    lingual_mesial: { x: -6, y: -0.5 },
    lingual_distal: { x: 8, y: -1.26 },
  },
  "32": {
    lingual_mesial: { x: -7.1, y: 1.36 },
    lingual_distal: { x: 6.84, y: -4.44 },
  },
  "33": {
    lingual_mesial: { x: -8.34, y: 2.88 },
    lingual_distal: { x: 4.74, y: -8.12 },
  },
});

const REST_PLACEMENT_ASSET_BASE = "../../assets/RPD_Component";

const REST_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  "11": { ac_mesial: { width: 30, height: 25 }, ac_distal: { width: 25, height: 33 }, ac_full: { width: 40, height: 37 }, ai_mesial: { width: 32, height: 30 }, ai_distal: { width: 33, height: 41 } },
  "12": { ac_mesial: { width: 22, height: 25 }, ac_distal: { width: 22, height: 29 }, ac_full: { width: 30, height: 31 }, ai_mesial: { width: 30, height: 30 }, ai_distal: { width: 34, height: 35 } },
  "13": { ac_mesial: { width: 22, height: 23 }, ac_distal: { width: 20, height: 23 }, ac_full: { width: 30, height: 31 }, ai_mesial: { width: 39, height: 30 }, ai_distal: { width: 36, height: 30 } },
  "14": { p_mesial: { width: 30, height: 30}, p_distal: { width: 35, height: 34 }, p_lingual: { width: 38, height: 35 }, p_full: { width: 126, height: 127 } },
  "15": { p_mesial: { width: 40, height: 42 }, p_distal: { width: 53, height: 34 }, p_lingual: { width: 33, height: 38 }, p_full: { width: 130, height: 123 } },
  "16": { p_mesial: { width: 45, height: 51 }, p_distal: { width: 53, height: 39 }, p_lingual: { width: 59, height: 45 }, p_full: { width: 163, height: 176 } },
  "17": { p_mesial: { width: 51, height: 40 }, p_distal: { width: 50, height: 29 }, p_lingual: { width: 50, height: 40 }, p_full: { width: 152, height: 148 } },
  "18": { p_mesial: { width: 40, height: 42 }, p_distal: { width: 48, height: 32 }, p_lingual: { width: 50, height: 38 }, p_full: { width: 145, height: 151 } },
  "41": { ac_mesial: { width: 20, height: 21 }, ac_distal: { width: 20, height: 28 }, ac_full: { width: 30, height: 38 }, ac_both: { width: 65, height: 35 }, ai_mesial: { width: 23, height: 25 }, ai_distal: { width: 24, height: 25 } },
  "42": { ac_mesial: { width: 18, height: 25 }, ac_distal: { width: 18, height: 33 }, ac_full: { width: 28, height: 34 }, ac_both: { width: 63, height: 54 }, ai_mesial: { width: 25, height: 25 }, ai_distal: { width: 24, height: 25 } },
  "43": { ac_mesial: { width: 22, height: 27 }, ac_distal: { width: 23, height: 25 }, ac_full: { width: 30, height: 52 }, ac_both: { width: 27, height: 27 }, ai_mesial: { width: 25, height: 35 }, ai_distal: { width: 22, height: 35 } },
  "44": { p_mesial: { width: 35, height: 35 }, p_distal: { width: 35, height: 42 }, p_lingual: { width: 38, height: 47 }, p_full: { width: 111, height: 107 } },
  "45": { p_mesial: { width: 41, height: 37 }, p_distal: { width: 43, height: 42 }, p_lingual: { width: 30, height: 80 }, p_full: { width: 112, height: 123 } },
  "46": { p_mesial: { width: 42, height: 55 }, p_distal: { width: 45, height: 45 }, p_lingual: { width: 40, height: 89 }, p_full: { width: 154, height: 181 } },
  "47": { p_mesial: { width: 49, height: 49 }, p_distal: { width: 45, height: 43 }, p_lingual: { width: 43, height: 71 }, p_full: { width: 137, height: 157 } },
  "48": { p_mesial: { width: 45, height: 41 }, p_distal: { width: 49, height: 44 }, p_lingual: { width: 38, height: 59 }, p_full: { width: 137, height: 147 } },
});

const REST_PLACEMENT_SCALE_BY_TOKEN = Object.freeze({
  ac_mesial: 0.72, ac_distal: 0.72, ac_full: 0.66, ai_mesial: 0.65, ai_distal: 0.65, ac_both: 0.66,
  p_mesial: 0.52, p_distal: 0.52, p_lingual: 0.52, p_full: 0.5,
});

const REST_PLACEMENT_SCALE_OVERRIDE_BY_TOOTH = Object.freeze({
  "11": { ac_full: 0.63 },
  "12": { ac_full: 0.64 },
  "13": { ac_full: 0.64 },
  "14": { p_lingual: 0.49 },
  "15": { p_lingual: 0.5 },
  "16": { p_lingual: 0.5 },
  "17": { p_lingual: 0.5 },
  "18": { p_lingual: 0.5 },
});

const REST_ONLAY_FULL_SCALE_OVERRIDE_BY_TOOTH = Object.freeze({
  "14": 0.42,
  "15": 0.42,
  "16": 0.42,
  "17": 0.42,
  "18": 0.42,
  "44": 0.43,
  "45": 0.43,
  "46": 0.43,
  "47": 0.43,
  "48": 0.43,
});

const REST_ONLAY_FULL_OFFSET_OVERRIDE_BY_TOOTH = Object.freeze({
  "14": { x: -16, y: 11 },
  "15": { x: -9, y: 15 },
  "16": { x: -10, y: 22 },
  "17": { x: -7, y: 21 },
  "18": { x: -2, y: 22 },
  "24": { x: 16, y: 11 },
  "25": { x: 9, y: 15 },
  "26": { x: 11, y: 22 },
  "27": { x: 7, y: 21 },
  "28": { x: 2, y: 22 },
  "44": { x: -12, y: -13 },
  "45": { x: -9, y: -16 },
  "46": { x: -12, y: -27 },
  "47": { x: -9, y: -23 },
  "48": { x: -7, y: -21 },
  "34": { x: 12, y: -13 },
  "35": { x: 9, y: -16 },
  "36": { x: 12, y: -27 },
  "37": { x: 9, y: -23 },
  "38": { x: 7, y: -20 },
});

function getToothUnit(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) return null;
  return numeric % 10;
}

function getRestVariantForTooth(toothId) {
  const unit = getToothUnit(toothId);
  if (!Number.isFinite(unit)) return "posterior";
  return unit >= 1 && unit <= 3 ? "anterior" : "posterior";
}

function normalizeRestSurface(surface) {
  if (typeof surface !== "string") return null;
  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

function getRestPlacementToken(_componentId, toothId, surface) {
  const variant = getRestVariantForTooth(toothId);

  if (_componentId === "rest-onlay") {
    return variant === "anterior" ? null : "p_full";
  }

  const normalizedSurface = normalizeRestSurface(surface);
  if (!normalizedSurface) return null;

  if (variant === "anterior") {
    if (normalizedSurface === "mesial") return "ai_mesial";
    if (normalizedSurface === "distal") return "ai_distal";
    if (normalizedSurface === "lingual_mesial") return "ac_mesial";
    if (normalizedSurface === "lingual_distal") return "ac_distal";
    if (normalizedSurface === "lingual_both") {
      // ac_both art exists only on the lower anterior templates (41/42/43, which
      // 31/32/33 mirror). Upper anterior (11/12/13) has no ac_both — fall back to
      // the full cingulum.
      const templateToothId = getComponentTemplateToothId(toothId);
      return templateToothId === "41" || templateToothId === "42" || templateToothId === "43"
        ? "ac_both"
        : "ac_full";
    }
    if (normalizedSurface === "lingual") return "ac_full";
    return null;
  }

  if (normalizedSurface === "mesial") return "p_mesial";
  if (normalizedSurface === "distal") return "p_distal";
  if (normalizedSurface === "lingual") return "p_lingual";
  return null;
}

// Resolve rest SVG reference for component/tooth/surface.
export function getRestPlacementAssetReference(componentId, toothId, surface) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const token = getRestPlacementToken(componentId, toothId, surface);
  if (!token) return null;
  return `${REST_PLACEMENT_ASSET_BASE}/${templateToothId}/rest/${templateToothId}-${token}.svg`;
}

// Resolve rest image size by component/tooth/surface.
export function getRestPlacementImageSize(componentId, toothId, surface) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const token = getRestPlacementToken(componentId, toothId, surface);
  if (!token) return null;
  return REST_PLACEMENT_IMAGE_SIZE_BY_TOOTH[templateToothId]?.[token] ?? null;
}

// Resolve rest render scale by component/tooth/surface.
export function getRestPlacementRenderScale(componentId, toothId, surface) {
  const exactToothId = String(toothId ?? "");
  const templateToothId = getComponentTemplateToothId(toothId);
  const token = getRestPlacementToken(componentId, toothId, surface);
  if (!token) return 0.55;

  if (componentId === "rest-onlay" && token === "p_full") {
    const onlayOverride =
      REST_ONLAY_FULL_SCALE_OVERRIDE_BY_TOOTH[exactToothId] ??
      REST_ONLAY_FULL_SCALE_OVERRIDE_BY_TOOTH[templateToothId];
    if (Number.isFinite(onlayOverride)) return onlayOverride;
  }

  const override = REST_PLACEMENT_SCALE_OVERRIDE_BY_TOOTH[templateToothId]?.[token];
  if (Number.isFinite(override)) return override;
  return REST_PLACEMENT_SCALE_BY_TOKEN[token] || 0.55;
}

// Resolve rest placement offset by component/tooth/surface.
export function getRestPlacementOffset(componentId, toothId, surface) {
  const token = getRestPlacementToken(componentId, toothId, surface);
  if (!(componentId === "rest-onlay" && token === "p_full")) {
    return { x: 0, y: 0 };
  }
  const exactToothId = String(toothId ?? "");
  const templateToothId = getComponentTemplateToothId(toothId);
  const ov =
    REST_ONLAY_FULL_OFFSET_OVERRIDE_BY_TOOTH[exactToothId] ??
    REST_ONLAY_FULL_OFFSET_OVERRIDE_BY_TOOTH[templateToothId];
  return {
    x: Number.isFinite(ov?.x) ? ov.x : 0,
    y: Number.isFinite(ov?.y) ? ov.y : 0,
  };
}

// Return allowed suggestion surfaces for selected rest component.
export function getRestSuggestionSurfaces(componentId, _toothId) {
  if (componentId === "rest-onlay") {
    return [];
  }
  return [...REST_SURFACE_ORDER];
}

// Radius for clickable rest suggestion markers.
export function getRestSuggestionRadius() {
  return REST_SUGGESTION_CONFIG.radius;
}

/** Positions for {@link REST_CINGULUM_AC_POINT_BY_TOOTH}; maps to ac_mesial / ac_distal assets. */
// Return cingulum AC suggestion points for anterior teeth.
export function getCingulumAcSuggestionPointsForTooth(toothId) {
  if (getRestVariantForTooth(toothId) !== "anterior") return null;
  const row = REST_CINGULUM_AC_POINT_BY_TOOTH[String(toothId)];
  const lm = row?.lingual_mesial;
  const ld = row?.lingual_distal;
  if (
    !lm ||
    !ld ||
    !Number.isFinite(lm.x) ||
    !Number.isFinite(lm.y) ||
    !Number.isFinite(ld.x) ||
    !Number.isFinite(ld.y)
  ) {
    return null;
  }
  return [
    { surface: "lingual_mesial", x: lm.x, y: lm.y },
    { surface: "lingual_distal", x: ld.x, y: ld.y },
  ];
}

// Check whether a component belongs to rest family.
export function isRestComponent(componentOrId) {
  if (typeof componentOrId === "object" && componentOrId !== null) {
    if (componentOrId.tab === "rests") return true;
    return String(componentOrId.id || "").startsWith("rest-");
  }
  return String(componentOrId || "").startsWith("rest-");
}

// Return geometric suggestion points for rest placement on tooth.
export function getRestSuggestionPointsForTooth(
  toothId,
  _jaw,
  mirrored,
  jawFlipX = 1,
  componentId = null
) {
  const direction = (mirrored ? -1 : 1) * jawFlipX;
  const override = REST_SUGGESTION_POINT_OVERRIDES[toothId] || {};
  const allowedSurfaces = new Set(getRestSuggestionSurfaces(componentId, toothId));

  return REST_SURFACE_ORDER.map((surface) => {
    const base = REST_SUGGESTION_CONFIG.defaultPoints[surface];
    const surfaceOverride = override[surface] || {};
    const x = surface === REST_SURFACE.LINGUAL ? base.x : base.x * direction;

    return {
      surface,
      x: Number.isFinite(surfaceOverride.x) ? surfaceOverride.x : x,
      y: Number.isFinite(surfaceOverride.y) ? surfaceOverride.y : base.y,
    };
  }).filter((point) => allowedSurfaces.has(point.surface));
}

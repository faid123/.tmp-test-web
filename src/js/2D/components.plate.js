import { isAutoMeshPlacementExcludedToothId, TOOTH_ORDER } from "./constants.js";
import { COMPONENT_ASSET_BASE, getComponentTemplateToothId } from "./components.mesh.js";
import { isReciprocatingClaspComponent } from "./components.clasp.js";

/** Major connectors that are BARS (band-only) — they plate no teeth. */
const BAR_MAJOR_CONNECTOR_IDS = Object.freeze(
  new Set(["major-lower-lingual-bar", "major-upper-palatal-bar"])
);

/** Default plate when entering design mode (both arches locked) if no plate is selected in the catalog. */
const DEFAULT_PLATE_ID_FOR_LOCK_DESIGN_MODE = "plate-prox";

/** Catalog id → filename tail `{template}-{tail}` under `plates/` (e.g. `11-plate.svg`). */
export const PLATE_IMAGE_SUFFIX_BY_ID = Object.freeze({
  "plate-prox": "plate.svg",
  "plate-crossmesh": "mesh.svg",
});

// Check whether a component id is a plate type.
export function isPlateComponentId(componentId) {
  return Object.prototype.hasOwnProperty.call(PLATE_IMAGE_SUFFIX_BY_ID, componentId);
}

const PLATE_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  "11": { width: 300, height: 365 },
  "12": { width: 345, height: 330 },
  "13": { width: 245, height: 330 },
  "14": { width: 270, height: 290 },
  "15": { width: 252, height: 290 },
  "16": { width: 265, height: 330 },
  "17": { width: 265, height: 320 },
  "18": { width: 265, height: 310 },
  "41": { width: 205, height: 350 },
  "42": { width: 195, height: 350 },
  "43": { width: 155, height: 350 },
  "44": { width: 185, height: 350 },
  "45": { width: 185, height: 350 },
  "46": { width: 193, height: 350 },
  "47": { width: 180, height: 350 },
  "48": { width: 135, height: 350 },
});

/** Per–catalog-id scale factor (multiplied with jaw scale below). Tune for overall plate size. */
const PLATE_RENDER_SCALE_BY_COMPONENT = Object.freeze({
  "plate-prox": 1,
  "plate-crossmesh": 1,
});

const PLATE_RENDER_SCALE_BY_JAW = Object.freeze({
  upper: 1,
  lower: 1,
});

/**
 * Mesh Plate (`plate-crossmesh`) scale overrides for tuning.
 * Supports exact tooth ids first, then template tooth fallback.
 */
const PLATE_CROSSMESH_SCALE_OVERRIDE_BY_TOOTH = Object.freeze({
  "11": 1.05,
  "12": 1.05,
  "13": 1.05,
  "14": .92,
  "15": .95,
  "16": .95,
  "17": .93,
  "18": .87,

  "41": .65,
  "42": .64,
  "43": .80,
  "44": .75,
  "45": .75,
  "46": .65,
  "47": .65,
  "48": .65
});

/**
 * Tooth-local translation before scale (same units as mesh offsets).
 * Keys: template teeth `11`–`18`, `41`–`48`; optional exact FDI keys override template.
 * Quadrants 2 / 3 mirror X when only the template row exists.
 */
const PLATE_POSITION_OFFSET_SEED_BY_TOOTH = Object.freeze({
  "11": { x: -5, y: 10 },
  "21": { x: 4, y: 10 },
  "12": { x: 6.5, y: 11.5 },
  "22": { x: -6.5, y: 11.5 },
  "13": { x: 8.3, y: 7 },
  "23": { x: -10.3, y: 7 },
  "14": { x: 7, y: 8.2 },
  "24": { x: -7, y: 8.2 },
  "15": { x: 4.5, y: 5.8 },  
  "25": { x: -5.5, y: 5.8 },
  "16": { x: 4, y: 8 },
  "26": { x: -4, y: 8 },
  "17": { x: 6, y: 8 },
  "27": { x: -6, y: 8 },
  "18": { x: 10, y: -3 },
  "28": { x: -11, y: -3 },
  "41": { x: 3.4, y: -26 },
  "42": { x: 7.4, y: -22 },
  "43": { x: 15.2, y: -20 },
  "44": { x: 28.5, y: -12.5 },
  "45": { x: 28, y: -4 },
  "46": { x: 25, y: -9.5 },
  "47": { x: 25.5, y: -10 },
  "48": { x: 34.5, y: 2.2 },
});

/**
 * Mesh Plate (`plate-crossmesh`) x/y offset overrides for tuning.
 * Values are additive offsets on top of the base plate seed map.
 * Supports exact tooth ids first, then template tooth fallback.
 */
const PLATE_CROSSMESH_OFFSET_OVERRIDE_BY_TOOTH = Object.freeze({
"11": { x: 0, y: 0 },
"12": { x: -6, y: -7 },"22": { x: 6, y: -7 },
"13": { x: -8, y: -10 },"23": { x: 8, y: -10 },
"14": { x: -2, y: -7 },"24": { x: 2, y: -7 },
"15": { x: -1, y: -7 },"25": { x: 1, y: -7 },
"16": { x: -2, y: -7 },"26": { x: 2, y: -7 },
"17": { x: -1.5, y: -10 },"27": { x: 1.5, y: -10 },
"18": { x: -3, y: 1 },"28": { x: 3, y: 1 },

"41": { x: -4, y: 2 },
"42": { x: -2, y: 1.5 },
"43": { x: -4, y: 2.5 },
"44": { x: -7, y: 2 },
"45": { x: -8, y: -1 },
"46": { x: -1, y: 4 },
"47": { x: -2.5, y: 5 },
"48": { x: -2, y: -4 },
"31": { x: 4, y: 2 },
"32": { x: 2, y: 1.5 },
"33": { x: 4, y: 2.5 },
"34": { x: 7, y: 2 },
"35": { x: 8, y: -1 },
"36": { x: 0, y: 4 },
"37": { x: 2.5, y: 5 },
"38": { x: 2, y: -4 },
});

// Get render scale for plate placement.
export function getPlatePlacementRenderScale(componentId, _toothId, jaw) {
  if (!isPlateComponentId(componentId)) {
    return 1;
  }
  const componentScale = PLATE_RENDER_SCALE_BY_COMPONENT[componentId] || 1;
  const jawScale = PLATE_RENDER_SCALE_BY_JAW[jaw] || 1;
  if (componentId === "plate-crossmesh") {
    const exactToothId = String(_toothId ?? "");
    const templateToothId = getComponentTemplateToothId(_toothId);
    const toothScale =
      PLATE_CROSSMESH_SCALE_OVERRIDE_BY_TOOTH[exactToothId] ??
      PLATE_CROSSMESH_SCALE_OVERRIDE_BY_TOOTH[templateToothId] ??
      1;
    return componentScale * jawScale * (Number.isFinite(toothScale) ? toothScale : 1);
  }
  return componentScale * jawScale;
}

// Get per-tooth offset for plate placement.
export function getPlatePlacementOffset(componentId, toothId) {
  if (!isPlateComponentId(componentId)) {
    return { x: 0, y: 0 };
  }
  const templateToothId = getComponentTemplateToothId(toothId);
  const exact = PLATE_POSITION_OFFSET_SEED_BY_TOOTH[toothId];
  const tmpl = PLATE_POSITION_OFFSET_SEED_BY_TOOTH[templateToothId];
  const row = exact ?? tmpl ?? { x: 0, y: 0 };
  const numeric = Number(toothId);
  const quadrant = Number.isFinite(numeric) ? Math.floor(numeric / 10) : 0;
  const mirrorX = !exact && (quadrant === 2 || quadrant === 3);
  const x = mirrorX ? -row.x : row.x;
  if (componentId === "plate-crossmesh") {
    const exactToothId = String(toothId ?? "");
    const ov =
      PLATE_CROSSMESH_OFFSET_OVERRIDE_BY_TOOTH[exactToothId] ??
      PLATE_CROSSMESH_OFFSET_OVERRIDE_BY_TOOTH[templateToothId] ??
      null;
    return {
      x: (Number.isFinite(x) ? x : 0) + (Number.isFinite(ov?.x) ? ov.x : 0),
      y: (Number.isFinite(row.y) ? row.y : 0) + (Number.isFinite(ov?.y) ? ov.y : 0),
    };
  }
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(row.y) ? row.y : 0,
  };
}

// Get plate image size for a tooth.
export function getPlatePlacementImageSize(componentId, toothId) {
  if (!isPlateComponentId(componentId)) {
    return null;
  }
  const templateToothId = getComponentTemplateToothId(toothId);
  return PLATE_PLACEMENT_IMAGE_SIZE_BY_TOOTH[templateToothId] ?? null;
}

// Resolve plate SVG asset reference.
export function getPlateAssetReference(componentId, toothId) {
  const suffix = PLATE_IMAGE_SUFFIX_BY_ID[componentId];
  if (!suffix) {
    return null;
  }
  const templateToothId = getComponentTemplateToothId(toothId);
  return `${COMPONENT_ASSET_BASE}/${templateToothId}/plates/${templateToothId}-${suffix}`;
}

function syncToothComponentsFromCatalog(tooth, componentById) {
  const placements = Array.isArray(tooth.componentPlacements) ? tooth.componentPlacements : [];
  tooth.components = [
    ...new Set(placements.map((e) => e.componentId).filter((id) => componentById.has(id))),
  ];
}

/** Fallback plate id for auto-placement when locking both arches (design mode). */
// Get default plate id for auto-placement in design mode.
export function getDefaultPlateIdForDesignMode(componentById) {
  if (componentById.has(DEFAULT_PLATE_ID_FOR_LOCK_DESIGN_MODE)) {
    return DEFAULT_PLATE_ID_FOR_LOCK_DESIGN_MODE;
  }
  for (const id of Object.keys(PLATE_IMAGE_SUFFIX_BY_ID)) {
    if (componentById.has(id)) {
      return id;
    }
  }
  return null;
}

/**
 * Add default plate on every **present** tooth in `jawKeys` that has no plate yet (`upper` / `lower`).
 * Pass both arches via `Object.keys(TOOTH_ORDER)` for full-arch behavior.
 */
// Ensure present teeth have default plate in selected jaws.
export function ensurePlatePlacementsOnPresentTeethInJaws(
  teeth,
  plateComponentId,
  componentById,
  jawKeys
) {
  if (
    !plateComponentId ||
    !componentById.has(plateComponentId) ||
    !isPlateComponentId(plateComponentId) ||
    !teeth ||
    typeof teeth !== "object" ||
    !Array.isArray(jawKeys)
  ) {
    return;
  }
  for (const jaw of jawKeys) {
    const ids = TOOTH_ORDER[jaw];
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const toothId of ids) {
      if (isAutoMeshPlacementExcludedToothId(toothId)) {
        continue;
      }
      const tooth = teeth[toothId];
      if (!tooth || !tooth.isPresent) {
        continue;
      }
      if (!Array.isArray(tooth.componentPlacements)) {
        tooth.componentPlacements = [];
      }
      const hasPlate = tooth.componentPlacements.some((e) => isPlateComponentId(e.componentId));
      if (hasPlate) {
        continue;
      }
      tooth.componentPlacements.push({ componentId: plateComponentId, surface: null });
      syncToothComponentsFromCatalog(tooth, componentById);
    }
  }
}

/**
 * When both arches are locked, add `plateComponentId` to every **present** tooth that has no plate yet.
 * Mirrors {@link ensureMeshPlacementsOnMissingTeeth} for the plate tab.
 */
// Ensure present teeth have default plate on both jaws.
export function ensurePlatePlacementsOnPresentTeeth(teeth, plateComponentId, componentById) {
  ensurePlatePlacementsOnPresentTeethInJaws(teeth, plateComponentId, componentById, Object.keys(TOOTH_ORDER));
}

/**
 * Keep each tooth's `plate-prox` (the per-tooth plating element — the desktop's
 * `Reciprocating.Tooth Type = 2`) in step with the jaw's major connector after a switch:
 *  - a PLATE / strap / horseshoe plates every present tooth it actually covers, giving each a
 *    real, erasable `plate-prox` component (matches the desktop's blanket plating, and the
 *    renderer draws that as the tooth's plate fill);
 *  - a BAR plates nothing, so it CLEARS every per-tooth `plate-prox`. This matters most after
 *    loading a PLATE (which stamps `plate-prox` on every present tooth): switching to a bar must
 *    drop those, otherwise the bar encodes `Reciprocating.Tooth Type = 2` on each tooth and the
 *    desktop / a reopen re-materializes the plate — i.e. the bar comes back as a plate.
 * A tooth carrying a reciprocating clasp keeps that as its reciprocal (clasp XOR plate), and a
 * tooth the connector excludes loses its plate. This is what makes the plate data-driven and
 * removable.
 */
// Sync per-tooth plate-prox to the jaw's major connector type.
export function syncReciprocatingPlatesToMajorConnector(teeth, majorComponentId, jawKeys) {
  if (!teeth || typeof teeth !== "object" || !Array.isArray(jawKeys)) {
    return;
  }
  // For a bar, `covered` below is forced false (the `!isBar` term), so every tooth
  // with a plate falls into the removal branch — clearing the plating a bar can't carry.
  const isBar = BAR_MAJOR_CONNECTOR_IDS.has(String(majorComponentId));
  for (const jaw of jawKeys) {
    const ids = TOOTH_ORDER[jaw];
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const toothId of ids) {
      const tooth = teeth[toothId];
      if (!tooth || !Array.isArray(tooth.componentPlacements)) {
        continue;
      }
      const hasPlate = tooth.componentPlacements.some((e) => e.componentId === "plate-prox");
      const covered =
        !isBar &&
        tooth.isPresent &&
        tooth.componentPlacements.some((e) => e.componentId === majorComponentId) &&
        !tooth.componentPlacements.some((e) => isReciprocatingClaspComponent(e.componentId));
      if (covered && !hasPlate) {
        tooth.componentPlacements.push({ componentId: "plate-prox", surface: null });
      } else if (!covered && hasPlate) {
        tooth.componentPlacements = tooth.componentPlacements.filter(
          (e) => e.componentId !== "plate-prox"
        );
      }
    }
  }
}

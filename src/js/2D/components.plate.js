import { isAutoMeshPlatePlacementExcludedToothId, TOOTH_ORDER } from "./constants.js";
import { COMPONENT_ASSET_BASE, getComponentTemplateToothId } from "./components.mesh.js";

/** Default plate when entering design mode (both arches locked) if no plate is selected in the catalog. */
const DEFAULT_PLATE_ID_FOR_LOCK_DESIGN_MODE = "plate-prox";

/** Catalog id → filename tail `{template}-{tail}` under `plates/` (e.g. `11-plate.svg`). */
export const PLATE_IMAGE_SUFFIX_BY_ID = Object.freeze({
  "plate-prox": "plate.svg",
  "plate-crossmesh": "mesh.svg",
});

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

export function getPlatePlacementRenderScale(componentId, _toothId, jaw) {
  if (!isPlateComponentId(componentId)) {
    return 1;
  }
  const componentScale = PLATE_RENDER_SCALE_BY_COMPONENT[componentId] || 1;
  const jawScale = PLATE_RENDER_SCALE_BY_JAW[jaw] || 1;
  return componentScale * jawScale;
}

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
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(row.y) ? row.y : 0,
  };
}

export function getPlatePlacementImageSize(componentId, toothId) {
  if (!isPlateComponentId(componentId)) {
    return null;
  }
  const templateToothId = getComponentTemplateToothId(toothId);
  return PLATE_PLACEMENT_IMAGE_SIZE_BY_TOOTH[templateToothId] ?? null;
}

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
 * When both arches are locked, add `plateComponentId` to every **present** tooth that has no plate yet.
 * Mirrors {@link ensureMeshPlacementsOnMissingTeeth} for the plate tab.
 */
export function ensurePlatePlacementsOnPresentTeeth(teeth, plateComponentId, componentById) {
  if (
    !plateComponentId ||
    !componentById.has(plateComponentId) ||
    !isPlateComponentId(plateComponentId)
  ) {
    return;
  }
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    for (const toothId of TOOTH_ORDER[jaw]) {
      if (isAutoMeshPlatePlacementExcludedToothId(toothId)) {
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

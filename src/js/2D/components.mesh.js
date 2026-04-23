import { TOOTH_ORDER } from "./constants.js";

export const COMPONENT_ASSET_BASE = "../../../assets/RPD_Component";

/** When no mesh is selected in the annotation UI, new mesh sites use this component id. */
export const MESH_PLACEMENT_FALLBACK_ID = "mesh-hole";

/** Reference FDI tooth per jaw so mesh draw scale is uniform across the arch (2D annotation). */
export const MESH_HOLE_UNIFORM_SCALE_REFERENCE_BY_JAW = Object.freeze({
  upper: "16",
  lower: "46",
});

export function meshHoleUniformScaleToothId(jaw) {
  return MESH_HOLE_UNIFORM_SCALE_REFERENCE_BY_JAW[jaw] || "16";
}

export const COMPONENT_IMAGE_SUFFIX_BY_ID = {
  "mesh-tori": "tori_mesh.svg",
  "mesh-stripe": "stripe_mesh.svg",
  "mesh-hole": "hole_mesh.svg",
  "mesh-cross": "cross_mesh.svg",
  "mesh-flange": "flange.svg",
};

export function isMeshComponent(componentOrId) {
  if (typeof componentOrId === "object" && componentOrId !== null) {
    if (componentOrId.tab === "mesh") return true;
    return String(componentOrId.id || "").startsWith("mesh-");
  }
  return String(componentOrId || "").startsWith("mesh-");
}

export function getComponentTemplateToothId(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) {
    return "11";
  }

  const unit = numeric % 10;
  const quadrant = Math.floor(numeric / 10);
  if (quadrant === 2) {
    return `1${unit}`;
  }
  if (quadrant === 3) {
    return `4${unit}`;
  }
  return `${quadrant}${unit}`;
}

export function getComponentAssetReference(componentId, toothId) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const suffix = COMPONENT_IMAGE_SUFFIX_BY_ID[componentId];
  const fileName = suffix ? `${templateToothId}-${suffix}` : null;
  if (!fileName) {
    return null;
  }
  return `${COMPONENT_ASSET_BASE}/${templateToothId}/mesh/${fileName}`;
}

/**
 * Fallback `<image>` width/height when a template tooth has no row in {@link MESH_PLACEMENT_IMAGE_SIZE_BY_TOOTH}.
 */
const MESH_IMAGE_SIZE_BY_COMPONENT = Object.freeze({
  "mesh-hole": { width: 154, height: 246 },
  "mesh-tori": { width: 154, height: 246 },
  "mesh-stripe": { width: 154, height: 246 },
  "mesh-cross": { width: 154, height: 246 },
  "mesh-flange": { width: 154, height: 246 },
});

/**
 * Mesh SVG logical size by **template tooth** only (quadrants 1 & 4: `11`–`18`, `41`–`48`), like `REST_PLACEMENT_IMAGE_SIZE_BY_TOOTH`.
 * Teeth `21`–`28` / `31`–`38` resolve via {@link getComponentTemplateToothId} so the mirrored arch reuses the same `width`/`height`.
 * Define **`mesh-hole`** per tooth; `mesh-tori`, `mesh-stripe`, `mesh-cross`, and `mesh-flange` reuse that box unless you add a per-type override.
 * Teeth with no row fall back to {@link MESH_IMAGE_SIZE_BY_COMPONENT}.
 */
const MESH_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  "11": { "mesh-hole": { width: 155, height: 370 } },
  "12": { "mesh-hole": { width: 188, height: 350 } },
  "13": { "mesh-hole": { width: 215, height: 420 } },
  "14": { "mesh-hole": { width: 225, height: 420 } },
  "15": { "mesh-hole": { width: 225, height: 420 } },
  "16": { "mesh-hole": { width: 240, height: 420 } },
  "17": { "mesh-hole": { width: 235, height: 420 } },
  "18": { "mesh-hole": { width: 220, height: 420 } },
  "41": { "mesh-hole": { width: 105, height: 160 } },
  "42": { "mesh-hole": { width: 135, height: 285 } },
  "43": { "mesh-hole": { width: 175, height: 405 } },
  "44": { "mesh-hole": { width: 200, height: 420 } },
  "45": { "mesh-hole": { width: 185, height: 420 } },
  "46": { "mesh-hole": { width: 200, height: 420 } },
  "47": { "mesh-hole": { width: 190, height: 420 } },
  "48": { "mesh-hole": { width: 185, height: 420 } },
});

const MESH_RENDER_SCALE_BY_COMPONENT = Object.freeze({
  "mesh-tori": 1,
  "mesh-stripe": 1,
  "mesh-hole": 1,
  "mesh-cross": 1,
  "mesh-flange": 1,
});

const MESH_RENDER_SCALE_BY_JAW = Object.freeze({
  upper: 1,
  lower: 0.72,
});

const MESH_COMPONENT_IDS = Object.freeze([
  "mesh-hole",
  "mesh-tori",
  "mesh-stripe",
  "mesh-cross",
  "mesh-flange",
]);

const MESH_TOOTH_IDS = Object.freeze([
  "11", "12", "13", "14", "15", "16", "17", "18",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "31", "32", "33", "34", "35", "36", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48",
]);

/**
 * Default mesh translation in tooth-local units (before scale).
 * Seed {@link MESH_POSITION_OFFSET_OVERRIDE_SEED_BY_TOOTH} with **`mesh-hole`** per tooth; other mesh ids copy that offset unless given their own entry.
 */
const MESH_POSITION_OFFSET_BY_COMPONENT = Object.freeze({
  "mesh-hole": { x: 0, y: 0 },
  "mesh-tori": { x: 0, y: 0 },
  "mesh-stripe": { x: 0, y: 0 },
  "mesh-cross": { x: 0, y: 0 },
  "mesh-flange": { x: 0, y: 0 },
});

const MESH_POSITION_OFFSET_OVERRIDE_SEED_BY_TOOTH = Object.freeze({
  "11": { "mesh-hole": { x: -4.7, y: 7 } },
  "12": { "mesh-hole": { x: -0.5, y: 5} },
  "13": { "mesh-hole": { x: 2.3, y: 0.5 } },
  "14": { "mesh-hole": { x: 4.0, y: 0.2 } },
  "15": { "mesh-hole": { x: 0.5, y: -1.2 } },
  "16": { "mesh-hole": { x: -2, y: 1 } },
  "17": { "mesh-hole": { x: 0, y: 0 } },
  "18": { "mesh-hole": { x: 1.5, y: 2 } },

  "21": { "mesh-hole": { x: 4.7, y: 7 } },
  "22": { "mesh-hole": { x: 1.5, y: 5 } },
  "23": { "mesh-hole": { x: -4.3, y: 0.5 } },
  "24": { "mesh-hole": { x: -4.0, y: 0.2 } },
  "25": { "mesh-hole": { x: -0.5, y: -1.2 } },
  "26": { "mesh-hole": { x: 2, y: 1 } },
  "27": { "mesh-hole": { x: 0, y: 0 } },
  "28": { "mesh-hole": { x: -1.5, y: 2 } },

  "31": { "mesh-hole": { x: 0, y: -21 } },
  "32": { "mesh-hole": { x: -5.6, y: -17} },
  "33": { "mesh-hole": { x: -12.6, y: -14.5 } },
  "34": { "mesh-hole": { x: -22.5, y: -8.5 } },
  "35": { "mesh-hole": { x: -19, y: -5.7 } },
  "36": { "mesh-hole": { x: -17.5, y: -6.5 } },
  "37": { "mesh-hole": { x: -17, y: -7 } },
  "38": { "mesh-hole": { x: -20.5, y: -5.8 } },

  "41": { "mesh-hole": { x: 0, y: -21 } },
  "42": { "mesh-hole": { x: 5.6, y: -17 } },
  "43": { "mesh-hole": { x: 12.6, y: -14.5 } },
  "44": { "mesh-hole": { x: 22.5, y: -8.5 } },
  "45": { "mesh-hole": { x: 19, y: -5.7 } },
  "46": { "mesh-hole": { x: 17.5, y: -6.5 } },
  "47": { "mesh-hole": { x: 17, y: -7 } },
  "48": { "mesh-hole": { x: 20.5, y: -5.8 } },
});

function buildMeshPositionOffsetByTooth(seedByTooth) {
  const result = {};

  for (const toothId of MESH_TOOTH_IDS) {
    const byComponent = {};
    const holeOverride = seedByTooth[toothId]?.["mesh-hole"];

    for (const componentId of MESH_COMPONENT_IDS) {
      const baseOffset = MESH_POSITION_OFFSET_BY_COMPONENT[componentId] || { x: 0, y: 0 };
      const explicit = seedByTooth[toothId]?.[componentId];
      const useHoleFallback =
        componentId !== "mesh-hole" &&
        holeOverride &&
        (!explicit || (!Number.isFinite(explicit.x) && !Number.isFinite(explicit.y)));
      const override = useHoleFallback ? holeOverride : explicit || {};
      byComponent[componentId] = {
        x: Number.isFinite(override.x) ? override.x : baseOffset.x,
        y: Number.isFinite(override.y) ? override.y : baseOffset.y,
      };
    }

    result[toothId] = byComponent;
  }

  return Object.freeze(result);
}

const MESH_POSITION_OFFSET_BY_TOOTH = buildMeshPositionOffsetByTooth(
  MESH_POSITION_OFFSET_OVERRIDE_SEED_BY_TOOTH
);

function getMeshOverrideValue(overrideMap, toothId, componentId) {
  const exactToothId = String(toothId ?? "");
  const templateToothId = getComponentTemplateToothId(toothId);

  const exactOverride = overrideMap?.[exactToothId]?.[componentId];
  if (exactOverride !== undefined) {
    return exactOverride;
  }

  return overrideMap?.[templateToothId]?.[componentId];
}

export function getMeshPlacementRenderScale(componentId, toothId, jaw) {
  void toothId;
  const componentScale = MESH_RENDER_SCALE_BY_COMPONENT[componentId] || 1;
  const jawScale = MESH_RENDER_SCALE_BY_JAW[jaw] || 1;
  return componentScale * jawScale;
}

export function getMeshPlacementOffset(componentId, toothId) {
  const base = MESH_POSITION_OFFSET_BY_COMPONENT[componentId] || { x: 0, y: 0 };
  const override = getMeshOverrideValue(MESH_POSITION_OFFSET_BY_TOOTH, toothId, componentId) || {};

  const x = Number.isFinite(override.x) ? override.x : base.x;
  const y = Number.isFinite(override.y) ? override.y : base.y;
  return { x, y };
}

export function getMeshPlacementImageSize(componentId, toothId) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const row = MESH_PLACEMENT_IMAGE_SIZE_BY_TOOTH[templateToothId];
  const specific = row?.[componentId];
  if (specific && Number.isFinite(specific.width) && Number.isFinite(specific.height)) {
    return { width: specific.width, height: specific.height };
  }
  const hole = row?.["mesh-hole"];
  if (hole && Number.isFinite(hole.width) && Number.isFinite(hole.height)) {
    return { width: hole.width, height: hole.height };
  }
  const base = MESH_IMAGE_SIZE_BY_COMPONENT[componentId] || null;
  if (base && Number.isFinite(base.width) && Number.isFinite(base.height)) {
    return { width: base.width, height: base.height };
  }
  return null;
}

// --- Mesh placement state (2D annotation): sync with `componentById` from the live catalog Map ---

function ensureToothComponentPlacementsForMesh(tooth) {
  if (Array.isArray(tooth.componentPlacements)) {
    return;
  }
  const fallback = Array.isArray(tooth.components) ? tooth.components : [];
  tooth.componentPlacements = fallback.map((componentId) => ({
    componentId,
    surface: null,
  }));
}

function syncToothComponentsFromPlacementsMap(tooth, componentById) {
  const placements = Array.isArray(tooth.componentPlacements) ? tooth.componentPlacements : [];
  tooth.components = [
    ...new Set(placements.map((entry) => entry.componentId).filter((id) => componentById.has(id))),
  ];
}

/**
 * Mesh id for new sites when the catalog selection is not a mesh (design list or {@link MESH_PLACEMENT_FALLBACK_ID}).
 * @param {{ selectedComponentId: string | null | undefined, components: string[] }} ctx
 * @param {Map<string, object>} componentById
 */
export function getDefaultMeshIdForDesignMode(ctx, componentById) {
  const catalogPick = componentById.get(ctx.selectedComponentId || "");
  if (catalogPick && isMeshComponent(catalogPick)) {
    return ctx.selectedComponentId;
  }
  const fromList = ctx.components.find((id) => isMeshComponent(id));
  if (fromList && componentById.has(fromList)) {
    return fromList;
  }
  return MESH_PLACEMENT_FALLBACK_ID;
}

/**
 * Replace mesh component ids on one tooth; updates `tooth.components` when anything changed.
 * @returns {{ changed: boolean, hadMesh: boolean }}
 */
export function replaceMeshPlacementsOnToothWithMeshId(tooth, newMeshId, componentById) {
  ensureToothComponentPlacementsForMesh(tooth);
  const hadMesh = tooth.componentPlacements.some((e) => isMeshComponent(e.componentId));
  let changed = false;
  tooth.componentPlacements = tooth.componentPlacements.map((entry) => {
    if (!isMeshComponent(entry.componentId)) {
      return entry;
    }
    if (entry.componentId === newMeshId) {
      return entry;
    }
    changed = true;
    return { ...entry, componentId: newMeshId };
  });
  if (changed) {
    syncToothComponentsFromPlacementsMap(tooth, componentById);
  }
  return { changed, hadMesh };
}

/** Set every tooth’s mesh placements to `meshComponentId` where a mesh exists. */
export function migrateAllMeshPlacementsToMeshId(teeth, meshComponentId, componentById) {
  if (!isMeshComponent(meshComponentId) || !componentById.has(meshComponentId)) {
    return;
  }
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    for (const toothId of TOOTH_ORDER[jaw]) {
      const tooth = teeth[toothId];
      if (!tooth) {
        continue;
      }
      replaceMeshPlacementsOnToothWithMeshId(tooth, meshComponentId, componentById);
    }
  }
}

/** Add default mesh to missing teeth that have no mesh yet (entering design mode). */
export function ensureMeshPlacementsOnMissingTeeth(teeth, meshId, componentById) {
  if (!componentById.has(meshId) || !isMeshComponent(meshId)) {
    return;
  }
  for (const jaw of Object.keys(TOOTH_ORDER)) {
    for (const toothId of TOOTH_ORDER[jaw]) {
      const tooth = teeth[toothId];
      if (!tooth || tooth.isPresent) {
        continue;
      }
      ensureToothComponentPlacementsForMesh(tooth);
      const hasMesh = tooth.componentPlacements.some((e) => isMeshComponent(e.componentId));
      if (hasMesh) {
        continue;
      }
      tooth.componentPlacements.push({ componentId: meshId, surface: null });
      syncToothComponentsFromPlacementsMap(tooth, componentById);
    }
  }
}

// --- 2D annotation UI: deferred clicks + catalog/tooth double-click (keeps 2DAnnotation thin) ---

/**
 * Defer mesh single-click briefly so double-click (catalog “apply all” or tooth mesh swap) can cancel.
 * 200ms balances responsiveness vs accidental double-click leakage.
 */
export const MESH_CLICK_DEFER_MS = 200;

const meshInteractionDeferTimers = new Map();

export function cancelMeshInteractionDefer(key) {
  const t = meshInteractionDeferTimers.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    meshInteractionDeferTimers.delete(key);
  }
}

export function deferMeshInteraction(key, fn, ms = MESH_CLICK_DEFER_MS) {
  cancelMeshInteractionDefer(key);
  meshInteractionDeferTimers.set(
    key,
    setTimeout(() => {
      meshInteractionDeferTimers.delete(key);
      fn();
    }, ms)
  );
}

/** @param {{ selectedComponentId?: string | null, components: string[] }} state */
export function meshSelectionContextFromState(state) {
  return { selectedComponentId: state.selectedComponentId, components: state.components };
}

/**
 * @typedef {object} MeshAnnotationEnv
 * @property {boolean} designMode
 * @property {{ teeth: object, selectedComponentId?: string | null, components: string[] }} state
 * @property {Map<string, object>} componentById
 * @property {(msg: string, isError?: boolean) => void} notify
 * @property {() => void} redrawCatalog
 * @property {() => void} redrawJaws
 * @property {(jaw: string) => void} redrawJaw
 * @property {(toothId: string, placementContext: null) => void} placeSelectedOnTooth
 */

/** Double-click mesh catalog icon: set every mesh site to this type. */
export function handleMeshCatalogDoubleClickApplyAll(env, componentId) {
  if (!env.designMode) {
    env.notify("Lock both arches to use the component catalog.", true);
    return;
  }
  const def = env.componentById.get(componentId);
  if (!def || !isMeshComponent(componentId)) {
    return;
  }
  migrateAllMeshPlacementsToMeshId(env.state.teeth, componentId, env.componentById);
  env.state.selectedComponentId = componentId;
  env.state.components = env.state.components.filter((id) => !isMeshComponent(id));
  if (!env.state.components.includes(componentId)) {
    env.state.components.push(componentId);
  }
  env.redrawCatalog();
  env.redrawJaws();
  env.notify(`All mesh sites now use ${def.label}.`, false);
}

/** Double-click tooth in design mode with mesh tool: swap mesh or place if none. */
export function handleMeshToolDoubleClick(env, jaw, toothId) {
  const selected = env.componentById.get(env.state.selectedComponentId || "");
  if (!selected || !isMeshComponent(selected)) {
    env.notify("Select a mesh type in the catalog, then double-click a tooth.", true);
    return;
  }
  const tooth = env.state.teeth[toothId];
  if (!tooth) {
    return;
  }
  const { changed, hadMesh } = replaceMeshPlacementsOnToothWithMeshId(tooth, selected.id, env.componentById);
  if (!hadMesh) {
    env.placeSelectedOnTooth(toothId, null);
    env.redrawJaw(jaw);
    return;
  }
  if (changed) {
    env.notify(`Mesh on tooth ${toothId} set to ${selected.label}.`, false);
  } else {
    env.notify(`Tooth ${toothId} already has ${selected.label}.`, false);
  }
  env.redrawJaw(jaw);
}

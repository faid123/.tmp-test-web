import { COMPONENT_BY_ID } from "./components.js";
import { forEachTooth, STATUS_VALUES, TOOTH_POSITION_MAP, TOOTH_SCALE_BY_UNIT, TOOTH_SCALE_OVERRIDE } from "./constants.js";
import { state } from "./2DAnnotation.js";

export function initializeTeethState() {
  forEachTooth((toothId, jaw) => {
    state.teeth[toothId] = {
      tooth_id: toothId,
      jaw,
      status: "presence",
      isPresent: true,
      components: [],
      componentPlacements: [],
      center: [0, 0],
    };
  });
}

export function resetToothRecord(toothId, status) {
  const tooth = state.teeth[toothId];
  if (!tooth) return;
  tooth.status = status ?? "presence";
  tooth.components = [];
  tooth.componentPlacements = [];
  tooth.isPresent = true;
}

export function toggleToothPresence(tooth, toothId) {
  tooth.isPresent = !tooth.isPresent;
  if (!tooth.isPresent) {
    tooth.status = "missing";
    tooth.components = [];
    tooth.componentPlacements = [];
  } else {
    tooth.status = "presence";
  }
  return `Tooth ${toothId} is now ${tooth.isPresent ? "present" : "missing"}.`;
}

export function toggleToothStatus(tooth, toothId, status) {
  if (!tooth.isPresent) {
    tooth.isPresent = true;
  }
  tooth.status = tooth.status === status ? "presence" : status;
  return `Tooth ${toothId} set to ${tooth.status}.`;
}

export function normalizeSurface(surface) {
  if (typeof surface !== "string") {
    return null;
  }
  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

export function ensureToothPlacementState(tooth) {
  if (Array.isArray(tooth.componentPlacements)) return;

  const fallback = Array.isArray(tooth.components) ? tooth.components : [];
  tooth.componentPlacements = fallback.map((componentId) => ({
    componentId,
    surface: null,
  }));
}

export function syncToothComponentsFromPlacements(tooth) {
  const placements = Array.isArray(tooth.componentPlacements) ? tooth.componentPlacements : [];
  tooth.components = [
    ...new Set(
      placements
        .map((entry) => entry.componentId)
        .filter((componentId) => COMPONENT_BY_ID.has(componentId))
    ),
  ];
}

export function hasPlacement(tooth, componentId, surface) {
  const targetSurface = normalizeSurface(surface);
  return tooth.componentPlacements.some(
    (entry) =>
      entry.componentId === componentId && normalizeSurface(entry.surface) === targetSurface
  );
}

export function addPlacement(tooth, componentId, surface) {
  tooth.componentPlacements.push({
    componentId,
    surface: normalizeSurface(surface),
  });
  syncToothComponentsFromPlacements(tooth);
}

export function removePlacement(tooth, componentId, surface) {
  const targetSurface = normalizeSurface(surface);
  tooth.componentPlacements = tooth.componentPlacements.filter(
    (entry) =>
      !(
        entry.componentId === componentId && normalizeSurface(entry.surface) === targetSurface
      )
  );
  syncToothComponentsFromPlacements(tooth);
}

export function removePlacementsByComponentIds(tooth, componentIds) {
  const removeSet = new Set(componentIds || []);
  tooth.componentPlacements = tooth.componentPlacements.filter(
    (entry) => !removeSet.has(entry.componentId)
  );
  syncToothComponentsFromPlacements(tooth);
}

export function removePlacementAtIndex(tooth, index) {
  ensureToothPlacementState(tooth);
  const pl = tooth.componentPlacements;
  if (!Array.isArray(pl) || index < 0 || index >= pl.length) {
    return null;
  }
  const [removed] = pl.splice(index, 1);
  syncToothComponentsFromPlacements(tooth);
  return removed;
}

export function normalizeStatus(value) {
  return STATUS_VALUES.includes(value) ? value : null;
}

export function statusJsonForToothRecord(record) {
  if (!record.isPresent) {
    return "missing";
  }
  const st = normalizeStatus(record.status);
  if (st === "missing") {
    return "presence";
  }
  return st || "presence";
}

export function getToothPlacement(jaw, toothId) {
  return TOOTH_POSITION_MAP[jaw]?.[toothId] || null;
}

export function getToothScale(toothId, jaw) {
  const unit = Number(toothId.slice(1));
  let scale = TOOTH_SCALE_BY_UNIT[unit] || 1;
  if (jaw === "lower" && unit <= 2) scale *= 0.92;
  if (jaw === "lower" && unit >= 6) scale *= 0.96;
  return scale;
}

export function getToothAssetSpec(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) {
    return { sourceToothId: "11", mirrored: false };
  }

  const unit = numeric % 10;
  const quadrant = Math.floor(numeric / 10);
  if (quadrant === 2) {
    return { sourceToothId: `1${unit}`, mirrored: true };
  }
  if (quadrant === 3) {
    return { sourceToothId: `4${unit}`, mirrored: true };
  }
  return { sourceToothId: toothId, mirrored: false };
}

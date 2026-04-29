/**
 * Major-connector placement tuning (under mesh/plate). Leave tables empty for
 * mesh/plate anchor, box size, and base scale only.
 *
 * Examples (uncomment / copy):
 *
 * CONNECTOR_PLACEMENT_IMAGE_SIZE_BY_TOOTH: { "11": { width: 76, height: 98 }, "16": { width: 80, height: 100 } }
 * CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH: { "11": { x: 2, y: -4 }, "21": { x: 5, y: 0 } }
 * CONNECTOR_RENDER_SCALE_BY_JAW: { upper: 1.05, lower: 0.95 }
 * CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH: { "11": 1.1, "16": 0.92 }
 */

/** Optional { width, height } per template tooth 11–18. Omitted teeth use the mesh/plate image box. */
export const CONNECTOR_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  "11": { width: 76, height: 98 },
});

/**
 * Extra x/y in tooth-local units, added on top of the mesh/plate anchor.
 * Keys: template teeth `11`–`18`, or exact FDI (e.g. `"21"`) to override mirroring.
 * Quadrants 2 / 3 flip X when only the template row exists (same rule as plates).
 */
export const CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH = Object.freeze({
  // "11": { x: 0, y: 0 },
});

/** Multiplier on the scaled connector group per arch. */
export const CONNECTOR_RENDER_SCALE_BY_JAW = Object.freeze({
  upper: 1,
  lower: 1,
});

/** Optional per–template-tooth (11–18) scale multiplier. */
export const CONNECTOR_RENDER_SCALE_BY_TEMPLATE_TOOTH = Object.freeze({
  // "11": 1,
});

/** FDI → major-connector template id 11–18 (matches SVG stem for upper arch). */
function getMajorConnectorTemplateToothId(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) {
    return "11";
  }
  const unit = numeric % 10;
  return `1${unit}`;
}

export function getMajorConnectorPlacementOffset(toothId) {
  const tmpl = getMajorConnectorTemplateToothId(toothId);
  const exact = CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH[toothId];
  const tmplSeed = CONNECTOR_EXTRA_OFFSET_SEED_BY_TOOTH[tmpl];
  const row = exact ?? tmplSeed ?? { x: 0, y: 0 };
  const numeric = Number(toothId);
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

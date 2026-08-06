import { getComponentTemplateToothId, isMeshComponent } from "./components.mesh.js";
import { isBarComponent } from "./components.bar.js";
import {
  isReciprocatingClaspComponent,
  isRetainerClaspComponent,
  isRingClaspComponent,
} from "./components.clasp.js";
import { isPlateComponentId } from "./components.plate.js";
import { isRestComponent } from "./components.rest.js";
import { normalizeSurface } from "./toothUtils.js";

const MINOR_CONNECTOR_ASSET_BASE = "../../assets/RPD_Component/MinorConnector";

const MINOR_CONNECTOR_IMAGE_SIZE_BY_TEMPLATE_TOOTH = Object.freeze({
  "11": { width: 151, height: 152 },
  "12": { width: 158, height: 141 },
  "13": { width: 120, height: 111 },
  "14": { width: 118, height: 90 },
  "15": { width: 108, height: 99 },
  "16": { width: 106, height: 123 },
  "17": { width: 120, height: 133 },
  "18": { width: 133, height: 116 },
  "41": { width: 113, height: 117 },
  "42": { width: 115, height: 117 },
  "43": { width: 115, height: 116 },
  "44": { width: 114, height: 100 },
  "45": { width: 114, height: 101 },
  "46": { width: 133, height: 101 },
  "47": { width: 133, height: 101 },
  "48": { width: 126, height: 101 },
});

const MINOR_CONNECTOR_RENDER_SCALE = Object.freeze({
  upper: 0.56,
  lower: 0.56,
});

/** Mirror a per-template `{x, y}` row for a tooth: quadrants 2 & 3 flip X, 1 & 4
 *  pass through. Single home for the mirror rule. Missing row → no offset. */
function mirrorTemplateRowForTooth(toothId, row) {
  if (!row) return { x: 0, y: 0 };
  const quadrant = Math.floor(Number(toothId) / 10);
  const mirrorX = quadrant === 2 || quadrant === 3;
  return {
    x: (mirrorX ? -1 : 1) * (Number.isFinite(row.x) ? row.x : 0),
    y: Number.isFinite(row.y) ? row.y : 0,
  };
}

/**
 * Base offset for a SOLO mesial/distal minor-connector half, per template tooth
 * (11-18 / 41-48; quadrants 2 & 3 mirror X). The directional nudge is added on top
 * (getMinorConnectorOffset); the `mid` connector uses its own table. +x = toward lingual.
 */
const MINOR_CONNECTOR_OFFSET_SEED_BY_TEMPLATE_TOOTH = Object.freeze({
  "11": { x: 29, y: 33 },
  "12": { x: 34, y: 25 },
  "13": { x: 36, y: 11 },
  "14": { x: 36, y: -4 },
  "15": { x: 31, y: -9 },
  "16": { x: 31, y: -20 },
  "17": { x: 31, y: -16 },
  "18": { x: 31, y: -19 },
  "41": { x: 15, y: -28 },
  "42": { x: 24, y: -21 },
  "43": { x: 30, y: -16 },
  "44": { x: 41, y: -1 },
  "45": { x: 36, y: 14 },
  "46": { x: 33, y: 27 },
  "47": { x: 28, y: 20 },
  "48": { x: 32, y: 18 },
});

/** Filename suffix per variant: "mid" = full embrasure connector, else the mesial/distal half. */
const MINOR_CONNECTOR_VARIANT_SUFFIX = Object.freeze({
  mid: "_minor",
  mesial: "-mesial_minor",
  distal: "-distal_minor",
});

// Resolve minor-connector asset by tooth + variant ("mid" | "mesial" | "distal").
export function getMinorConnectorAssetReference(toothId, variant = "mid") {
  const templateToothId = getComponentTemplateToothId(toothId);
  const size = MINOR_CONNECTOR_IMAGE_SIZE_BY_TEMPLATE_TOOTH[templateToothId];
  if (!size) return null;
  const suffix = MINOR_CONNECTOR_VARIANT_SUFFIX[variant] || MINOR_CONNECTOR_VARIANT_SUFFIX.mid;
  return `${MINOR_CONNECTOR_ASSET_BASE}/${templateToothId}${suffix}.svg`;
}

/**
 * Per-variant size multiplier to fine-tune a mesial/distal half that renders too
 * big/small. Keyed by template tooth (11-18 / 41-48); default 1.
 * e.g. shrink tooth 12's distal half → `distal: { "12": 0.8 }`.
 */
const MINOR_CONNECTOR_VARIANT_SCALE_BY_TEMPLATE_TOOTH = Object.freeze({
  mid: {},
  mesial: {},
  distal: {
    "12": 0.8,
  },
});

// Resolve minor-connector image size by tooth + variant ("mid" | "mesial" | "distal"),
// applying the optional per-variant resize multiplier above.
export function getMinorConnectorImageSize(toothId, variant = "mid") {
  const templateToothId = getComponentTemplateToothId(toothId);
  const base = MINOR_CONNECTOR_IMAGE_SIZE_BY_TEMPLATE_TOOTH[templateToothId];
  if (!base) return null;
  const scale = MINOR_CONNECTOR_VARIANT_SCALE_BY_TEMPLATE_TOOTH[variant]?.[templateToothId] ?? 1;
  return { width: base.width * scale, height: base.height * scale };
}

// Resolve render scale for minor connector by jaw.
export function getMinorConnectorRenderScale(jaw) {
  return MINOR_CONNECTOR_RENDER_SCALE[jaw] ?? 1.00;
}

/**
 * Hand-tuned nudge toward the tooth's rest/clasp side: a `{x, y}` delta added to
 * the base offset per template tooth (11-18 / 41-48; quadrants 2 & 3 mirror X),
 * for MESIAL vs DISTAL support. Absent = no nudge. +x = toward lingual.
 */
const MINOR_CONNECTOR_DIRECTIONAL_OFFSET_SEED_BY_TEMPLATE_TOOTH = Object.freeze({
  // template: { mesial: { x, y }, distal: { x, y } }
  "48": { mesial: { x: 0, y: 0 }, distal: { x: -7, y: -56 } },
  "47": { mesial: { x: 2, y: 4 }, distal: { x: -13, y: -64 } },
  "46": { mesial: { x: 1, y: 2 }, distal: { x: -20, y: -75 } },
  "45": { mesial: { x: 0, y: -2 }, distal: { x: -18, y: -49 } },
  "44": { mesial: { x: 0, y: 0 }, distal: { x: -27, y: -29 } },
  "43": { mesial: { x: 0, y: 0 }, distal: { x: -23, y: -14 } },
  "42": { mesial: { x: 0, y: 0 }, distal: { x: -27, y: -6 } },
  "41": { mesial: { x: 0, y: 0 }, distal: { x: -21, y: 0 } },
  "18": { mesial: { x: 0, y: -1 }, distal: { x: -5, y: 48 } },
  "17": { mesial: { x: 0, y: -1 }, distal: { x: -8, y: 57 } },
  "16": { mesial: { x: 0, y: -1 }, distal: { x: -12, y: 66 } },
  "15": { mesial: { x: 0, y: 0 }, distal: { x: -13, y: 45 } },
  "14": { mesial: { x: 0, y: 0 }, distal: { x: -24, y: 44 } },
  "13": { mesial: { x: 0, y: 0 }, distal: { x: -25, y: 28 } },
  "12": { mesial: { x: 0, y: 0 }, distal: { x: -31, y: 12 } },
  "11": { mesial: { x: 0, y: 0 }, distal: { x: -40, y: 3 } },
  // Quadrants 2 & 3 (e.g. 35/34) are driven by their 1x/4x template rows, X mirrored automatically.
});

/** Hand-tuned directional delta for a tooth (template lookup; X mirrored for quadrants 2 & 3). */
function getMinorConnectorDirectionalDelta(toothId, direction) {
  if (direction !== "mesial" && direction !== "distal") return { x: 0, y: 0 };
  const template = getComponentTemplateToothId(toothId);
  const row = MINOR_CONNECTOR_DIRECTIONAL_OFFSET_SEED_BY_TEMPLATE_TOOTH[template]?.[direction];
  return mirrorTemplateRowForTooth(toothId, row);
}

// SOLO mesial/distal half offset: mirrored base seed + directional nudge. The shared
// `mid` half (both adjacent teeth support) uses getMinorConnectorMidOffset instead.
export function getMinorConnectorOffset(toothId, direction) {
  const template = getComponentTemplateToothId(toothId);
  const base = mirrorTemplateRowForTooth(
    toothId,
    MINOR_CONNECTOR_OFFSET_SEED_BY_TEMPLATE_TOOTH[template]
  );
  const delta = getMinorConnectorDirectionalDelta(toothId, direction);
  return { x: base.x + delta.x, y: base.y + delta.y };
}

/**
 * Per-template OVERRIDE for the shared `mid` connector (embrasure, both teeth support).
 * Defaults to the solo-half base seed; add a row only where the mid connector must sit
 * elsewhere. Keyed per template tooth (11-18 / 41-48; quadrants 2 & 3 mirror X). +x = lingual.
 */
const MINOR_CONNECTOR_MID_OFFSET_OVERRIDE_BY_TEMPLATE_TOOTH = Object.freeze({
  // e.g. "12": { x: 30, y: 20 },  // move only tooth 12's mid connector, leaving its solo halves
});

// Mid-connector offset: per-template override if present, else the solo-half base
// seed (X mirrored for quadrants 2 & 3).
export function getMinorConnectorMidOffset(toothId) {
  const template = getComponentTemplateToothId(toothId);
  const row =
    MINOR_CONNECTOR_MID_OFFSET_OVERRIDE_BY_TEMPLATE_TOOTH[template] ??
    MINOR_CONNECTOR_OFFSET_SEED_BY_TEMPLATE_TOOTH[template];
  return mirrorTemplateRowForTooth(toothId, row);
}

/**
 * Back-action geometry: the retentive clasp and the reciprocating clasp sit at OPPOSITE
 * mesial/distal corners. Simple Circum keeps them at the SAME corner (the reciprocal is
 * the retainer arch-flipped), so this only matches an arm that wraps the tooth — today
 * Back-action Clasps and Half & Half. Returns the clasp's own side, or null when the
 * tooth isn't in that geometry.
 */
function getWrappedArmConnectorSide(tooth) {
  let claspSide = null;
  let reciprocalSide = null;
  for (const placement of tooth.componentPlacements) {
    const surface = normalizeSurface(placement?.surface);
    if (!surface) continue;
    const side = surface.includes("mesial")
      ? "mesial"
      : surface.includes("distal")
        ? "distal"
        : null;
    if (!side) continue;
    const id = placement?.componentId;
    if (isRetainerClaspComponent(id) || isRingClaspComponent(id)) claspSide = side;
    else if (isReciprocatingClaspComponent(id)) reciprocalSide = side;
  }
  if (!claspSide || !reciprocalSide || claspSide === reciprocalSide) return null;
  return claspSide;
}

/** A site already reaches the major connector when it carries a reciprocating element
 *  (reciprocating clasp / plate) or is itself meshed — the saddle continues into it. */
function hasReciprocatingOrMeshElement(tooth) {
  if (!tooth || !Array.isArray(tooth.componentPlacements)) return false;
  return tooth.componentPlacements.some(
    ({ componentId }) =>
      isReciprocatingClaspComponent(componentId) ||
      isPlateComponentId(componentId) ||
      isMeshComponent(componentId)
  );
}

/** Sides a meshed saddle must bridge itself: the neighbour across that embrasure is a
 *  present tooth carrying no reciprocating element and no mesh, so nothing else joins
 *  the mesh to the major connector there. Needs `neighbors` — without it, no mesh sides. */
function getMeshMinorConnectorSides(tooth, neighbors) {
  const sides = { mesial: false, distal: false };
  if (!neighbors) return sides;
  if (!tooth.componentPlacements.some((entry) => isMeshComponent(entry.componentId))) return sides;
  for (const side of ["mesial", "distal"]) {
    const neighbor = neighbors[side];
    if (!neighbor || !neighbor.isPresent) continue;
    if (hasReciprocatingOrMeshElement(neighbor)) continue;
    sides[side] = true;
  }
  return sides;
}

/**
 * Which embrasure side(s) a tooth's minor connector attaches on, from placed components
 * (mirrors desktop GetConnectorData + isMesio): a rest/bar sits on its own surface; a
 * retentive clasp anchors at its ORIGIN, opposite the tip (mesial-tip → connects distally).
 * A reciprocating clasp isn't a retainer, so it's ignored. Returns `{ mesial, distal }`.
 *
 * `neighbors` — `{ mesial, distal }` tooth records across each embrasure — enables the
 * mesh rule (see getMeshMinorConnectorSides); omit it for pure single-tooth derivation.
 *
 * Exception: a wrapped arm (see getWrappedArmConnectorSide) joins at the clasp's own
 * side, which replaces the derivation rather than adding to it.
 */
export function getMinorConnectorSupportSides(tooth, neighbors = null) {
  const sides = { mesial: false, distal: false };
  if (!tooth || !Array.isArray(tooth.componentPlacements)) return sides;

  const wrappedArmSide = getWrappedArmConnectorSide(tooth);
  if (wrappedArmSide) {
    sides[wrappedArmSide] = true;
    return sides;
  }

  const meshSides = getMeshMinorConnectorSides(tooth, neighbors);
  sides.mesial = meshSides.mesial;
  sides.distal = meshSides.distal;

  for (const placement of tooth.componentPlacements) {
    const id = placement?.componentId;
    // A mesh plate (cross-mesh) spans the tooth proximally and joins the major on both
    // embrasures, so it carries a minor connector despite no anchor surface. (plate-prox
    // under a major is already joined by the connector fill, so not added here.)
    if (id === "plate-crossmesh") {
      sides.mesial = true;
      sides.distal = true;
      continue;
    }
    const surface = normalizeSurface(placement?.surface);
    if (!surface) continue;
    if (isRestComponent(id) || isBarComponent(id)) {
      if (surface.includes("mesial")) sides.mesial = true;
      else if (surface.includes("distal")) sides.distal = true;
      else if (surface === "lingual") { sides.mesial = true; sides.distal = true; } // full cingulum
    } else if (isRetainerClaspComponent(id) || isRingClaspComponent(id)) {
      // Retentive clasp origin (where the minor connector attaches) is opposite the tip.
      if (surface.includes("mesial")) sides.distal = true;
      else if (surface.includes("distal")) sides.mesial = true;
    }
  }
  return sides;
}

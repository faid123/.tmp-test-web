import { getComponentTemplateToothId } from "./components.mesh.js";

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

function mirrorMinorConnectorOffsetSeedRow(row) {
  return {
    x: Number.isFinite(row?.x) ? -row.x : 0,
    y: Number.isFinite(row?.y) ? row.y : 0,
  };
}

function buildMinorConnectorOffsetByTooth() {
  const out = {};
  for (let u = 1; u <= 8; u += 1) {
    const unit = String(u);
    const upper = MINOR_CONNECTOR_OFFSET_SEED_BY_TEMPLATE_TOOTH[`1${unit}`];
    const lower = MINOR_CONNECTOR_OFFSET_SEED_BY_TEMPLATE_TOOTH[`4${unit}`];

    if (upper) {
      out[`1${unit}`] = {
        x: Number.isFinite(upper.x) ? upper.x : 0,
        y: Number.isFinite(upper.y) ? upper.y : 0,
      };
      out[`2${unit}`] = mirrorMinorConnectorOffsetSeedRow(upper);
    }

    if (lower) {
      out[`4${unit}`] = {
        x: Number.isFinite(lower.x) ? lower.x : 0,
        y: Number.isFinite(lower.y) ? lower.y : 0,
      };
      out[`3${unit}`] = mirrorMinorConnectorOffsetSeedRow(lower);
    }
  }
  return Object.freeze(out);
}

const MINOR_CONNECTOR_OFFSET_BY_TOOTH = buildMinorConnectorOffsetByTooth();

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
 * Per-variant size multiplier for fine-tuning a minor-connector variant that renders too
 * big/small (the `mesial`/`distal` halves can differ in scale from the `mid` art). Keyed by
 * template tooth (`11`–`18` / `41`–`48`; quadrants 2 & 3 share the same row); default 1.
 * e.g. shrink tooth 12's distal half -> `distal: { "12": 0.8 }`.
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
 * Hand-tuned per-tooth nudge of the minor connector toward its rest/clasp side. For each
 * template tooth (`11`–`18` / `41`–`48`; quadrants 2 & 3 mirror X automatically) a `{x, y}`
 * delta is **added to the base offset** when the tooth's rest/clasp sits on the MESIAL vs the
 * DISTAL side. Edit these by hand to position each tooth; an absent tooth/direction = no nudge
 * (keeps the base offset). +x = toward the lingual/arch centre, sign of y as in the base seed.
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
  // "44": { mesial: { x: 0, y: 0 }, distal: { x: 0, y: 0 } },
  // "35"/"34"/... are driven by their "45"/"44" template rows (X mirrored automatically).
});

/** Hand-tuned directional delta for a tooth (template lookup; X mirrored for quadrants 2 & 3). */
function getMinorConnectorDirectionalDelta(toothId, direction) {
  if (direction !== "mesial" && direction !== "distal") return { x: 0, y: 0 };
  const template = getComponentTemplateToothId(toothId);
  const row = MINOR_CONNECTOR_DIRECTIONAL_OFFSET_SEED_BY_TEMPLATE_TOOTH[template]?.[direction];
  if (!row) return { x: 0, y: 0 };
  const quadrant = Math.floor(Number(toothId) / 10);
  const mirrorX = quadrant === 2 || quadrant === 3;
  return {
    x: (mirrorX ? -1 : 1) * (Number.isFinite(row.x) ? row.x : 0),
    y: Number.isFinite(row.y) ? row.y : 0,
  };
}

// Resolve per-tooth XY offset for minor connector, plus a hand-tuned mesial/distal nudge
// (`direction` from the placed rest/clasp) so it sits in the correct interproximal gap.
export function getMinorConnectorOffset(toothId, direction) {
  const offset = MINOR_CONNECTOR_OFFSET_BY_TOOTH[String(toothId)];
  const baseX = Number.isFinite(offset?.x) ? offset.x : 0;
  const baseY = Number.isFinite(offset?.y) ? offset.y : 0;
  const delta = getMinorConnectorDirectionalDelta(toothId, direction);
  return { x: baseX + delta.x, y: baseY + delta.y };
}

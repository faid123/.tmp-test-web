import { getComponentTemplateToothId } from "./components.mesh.js";

const MINOR_CONNECTOR_ASSET_BASE = "../../../assets/RPD_Component/MinorConnector";

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

// Resolve minor-connector asset by tooth.
export function getMinorConnectorAssetReference(toothId) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const size = MINOR_CONNECTOR_IMAGE_SIZE_BY_TEMPLATE_TOOTH[templateToothId];
  if (!size) return null;
  return `${MINOR_CONNECTOR_ASSET_BASE}/${templateToothId}_minor.svg`;
}

// Resolve minor-connector image size by tooth.
export function getMinorConnectorImageSize(toothId) {
  const templateToothId = getComponentTemplateToothId(toothId);
  return MINOR_CONNECTOR_IMAGE_SIZE_BY_TEMPLATE_TOOTH[templateToothId] ?? null;
}

// Resolve render scale for minor connector by jaw.
export function getMinorConnectorRenderScale(jaw) {
  return MINOR_CONNECTOR_RENDER_SCALE[jaw] ?? 0.56;
}

// Resolve per-tooth XY offset for minor connector.
export function getMinorConnectorOffset(toothId) {
  const offset = MINOR_CONNECTOR_OFFSET_BY_TOOTH[String(toothId)];
  if (!offset) return { x: 0, y: 0 };
  return {
    x: Number.isFinite(offset.x) ? offset.x : 0,
    y: Number.isFinite(offset.y) ? offset.y : 0,
  };
}

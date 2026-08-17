// Vertex-colour decoding shared by the OFF and STL loaders. The backend sends
// per-vertex heatmaps as RGBA float32 blobs; three.js reads colour attributes as
// LINEAR, so sRGB values must be converted or the heatmap renders washed out.

// Matches preview3D.js's srgbToLinear byte-for-byte — keep the two in sync.
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const BASE_R = 208 / 255;
const BASE_G = 190 / 255;
const BASE_B = 141 / 255;

export function baseColorArray(vertexCount) {
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = BASE_R;
    colors[i * 3 + 1] = BASE_G;
    colors[i * 3 + 2] = BASE_B;
  }
  return colors;
}

const asFloats = (buffer) => new Float32Array(new Uint8Array(buffer).buffer);

// Occlusion: each channel that is exactly 1 falls back to the base tooth colour,
// independently of the other two. No sRGB conversion.
export function occlusionColorArray(vertexCount, buffer) {
  const rgba = asFloats(buffer);
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    let r = rgba[i * 4];
    let g = rgba[i * 4 + 1];
    let b = rgba[i * 4 + 2];
    if (r == 1) r = BASE_R;
    if (g == 1) g = BASE_G;
    if (b == 1) b = BASE_B;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

// Surveying: (1,1,1) is the backend's "no undercut" sentinel, so ONLY the full
// white triple maps to the base colour — real heatmap bands (yellow #FFD200 has
// r=1) must not be caught. Everything else is sRGB and converts.
export function surveyColorArray(vertexCount, buffer) {
  const rgba = asFloats(buffer);
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    let r = rgba[i * 4];
    let g = rgba[i * 4 + 1];
    let b = rgba[i * 4 + 2];
    if (r === 1 && g === 1 && b === 1) {
      r = BASE_R;
      g = BASE_G;
      b = BASE_B;
    } else {
      r = srgbToLinear(r);
      g = srgbToLinear(g);
      b = srgbToLinear(b);
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

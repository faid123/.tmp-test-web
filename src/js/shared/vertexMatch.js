// Nearest-vertex matching between two meshes of the same scan.
//
// Used to copy per-vertex data — the undercut heatmap — from a case jaw onto an uploaded
// copy of that jaw. Matching is by POSITION, never by index: the uploaded file is usually a
// different export of the same scan, so vertex counts can agree while the ordering doesn't
// (case 2270 ships an OFF jaw and an STL slot that both weld to 181,755 vertices in different
// orders). Copying by index there lands each value on an unrelated vertex, which paints as
// speckle scattered over the mesh.
//
// Both position arrays must be in the SAME frame — pass world-space positions when the two
// meshes carry different transforms.

export const NO_VERTEX_MATCH = 0xffffffff;

// Vertices further than this from any target vertex go unmatched.
export const DEFAULT_MATCH_RADIUS_MM = 1;

// Uniform grid over a mesh's vertices, so the nearest one to a query point is a small local
// search rather than a scan of every vertex. `positions` is a flat xyz Float32Array.
export function buildVertexGrid(positions, matchRadiusMm = DEFAULT_MATCH_RADIUS_MM) {
  const count = Math.floor(positions.length / 3);
  if (!count) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }

  // Roughly one vertex per cell, with a floor at the match radius so a big scan can't
  // allocate a huge grid and a cell is never smaller than the search needs.
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const cell = Math.max(matchRadiusMm, span / 128);
  const nx = Math.floor((maxX - minX) / cell) + 1;
  const ny = Math.floor((maxY - minY) / cell) + 1;
  const nz = Math.floor((maxZ - minZ) / cell) + 1;
  const cellOf = (x, y, z) =>
    (Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell))) * ny +
      Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cell)))) * nx +
    Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell)));

  // Counting sort into per-cell buckets: counts -> offsets -> filled vertex ids.
  const cellCount = nx * ny * nz;
  const starts = new Uint32Array(cellCount + 1);
  for (let v = 0; v < count; v += 1) {
    starts[cellOf(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]) + 1] += 1;
  }
  for (let c = 0; c < cellCount; c += 1) starts[c + 1] += starts[c];
  const items = new Uint32Array(count);
  const cursor = starts.slice(0, cellCount);
  for (let v = 0; v < count; v += 1) {
    items[cursor[cellOf(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])]++] = v;
  }

  return { positions, count, minX, minY, minZ, cell, nx, ny, nz, starts, items };
}

// Map every vertex in `positions` to its nearest vertex in `grid`, or NO_VERTEX_MATCH when
// nothing is within the radius. Returns the map plus how many vertices found a match, which
// is what tells a caller whether the two meshes are actually the same thing.
export function mapNearestVertices(positions, grid, matchRadiusMm = DEFAULT_MATCH_RADIUS_MM) {
  const count = Math.floor(positions.length / 3);
  if (!grid || !count) return null;

  const { positions: target, minX, minY, minZ, cell, nx, ny, nz, starts, items } = grid;
  const map = new Uint32Array(count).fill(NO_VERTEX_MATCH);
  const maxDistSq = matchRadiusMm * matchRadiusMm;
  let matched = 0;

  for (let v = 0; v < count; v += 1) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const cx = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cell)));
    const cz = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell)));

    let best = NO_VERTEX_MATCH;
    let bestSq = maxDistSq;
    for (let dz = -1; dz <= 1; dz += 1) {
      const zc = cz + dz;
      if (zc < 0 || zc >= nz) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yc = cy + dy;
        if (yc < 0 || yc >= ny) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xc = cx + dx;
          if (xc < 0 || xc >= nx) continue;
          const c = (zc * ny + yc) * nx + xc;
          for (let i = starts[c]; i < starts[c + 1]; i += 1) {
            const j = items[i];
            const ddx = target[j * 3] - x;
            const ddy = target[j * 3 + 1] - y;
            const ddz = target[j * 3 + 2] - z;
            const dSq = ddx * ddx + ddy * ddy + ddz * ddz;
            if (dSq < bestSq) { bestSq = dSq; best = j; }
          }
        }
      }
    }
    map[v] = best;
    if (best !== NO_VERTEX_MATCH) matched += 1;
  }

  return { map, matched };
}

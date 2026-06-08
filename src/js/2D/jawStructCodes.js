/**
 * Integer code <-> web componentId mapping for the jaw-struct text format.
 *
 * Values come straight from the Unity enums in StructData.cs (repo root) and are
 * validated against the real samples 03_jawstruct_upper/lower_jaw.txt (case 03).
 * C# enums are implicit 0-based unless noted. Rows marked "inferred" follow the
 * enum order but had no confirming instance in the samples.
 *
 * IMPORTANT — these are NOT all flat one-field->one-component mappings:
 *   - Retainer is composite: Retainer Type picks clasp/ring, but a bar needs
 *     Retainer Bar Category for its shape (i/s/u/y/t).
 *   - Mesh is stored as spans (Tooth Mesh N), not per tooth.
 *   - Major connector is a jaw-level field.
 * Those three are resolved in jawStructCodec.js (resolveJawStructDesign), so only
 * the genuinely flat fields live in FIELD_TO_MAP below; the other maps are
 * exported for that resolver to use directly.
 */

// Posterior_Rest_Type { no_pr=0, pr_full=1, pr_non_full=2 }
export const POSTERIOR_REST_TYPE = new Map([
  [1, "rest-onlay"], // inferred (no sample instance)
  [2, "rest-seat"],  // confirmed: lower 37/45, upper 17/15/27 abutments
]);

// Retainer_Type { no_retainer=0, clasp_retainer=1, ring_retainer=2, bar_retainer=3 }
// 3 (bar) resolves to a bar-* shape via RETAINER_BAR_CATEGORY — handled in the codec.
export const RETAINER_TYPE = new Map([
  [1, "retainer-clasp"], // confirmed: upper 17/23/27, lower 37
  [2, "ring-clasp"],     // inferred (no sample instance)
]);

// Retainer_Bar_Category { rb_I=0, rb_S=1, rb_U=2, rb_Y=3, rb_T=4, rb_R=5 } -- bar SHAPE.
// NB: "Retainer Bar Type" (rb_mesial=0/rb_distal=1) is LOCATION, not shape, and is
// left unmapped — the placement surface is derived from arch geometry instead.
export const RETAINER_BAR_CATEGORY = new Map([
  [0, "bar-i"], // confirmed: lower 45 (distal I-bar)
  [1, "bar-s"], // inferred
  [2, "bar-u"], // inferred
  [3, "bar-y"], // inferred
  [4, "bar-t"], // inferred
  // 5 (rb_R) has no web catalog id (RPI is commented out in components.js) -> unmapped
]);

// Mesh_Type { no_mesh=0, hole_mesh=1, tori_mesh=2, strip_mesh=3, cross_mesh=4, plate_mesh=5 }
export const MESH_TYPE = new Map([
  [1, "mesh-hole"],   // confirmed: upper span 24-26, lower span 46-47
  [2, "mesh-tori"],   // inferred
  [3, "mesh-stripe"], // inferred
  [4, "mesh-cross"],  // inferred
  [5, "mesh-flange"], // inferred (plate_mesh)
]);

// Major_Connector_Type { mc_none=0, mc_palatal_strap=1, mc_horseshoe=2, mc_hole=3,
//   mc_palatal_bar=4, mc_palatal_full_plate=5, mc_lingual_bar=6, mc_lingual_plate=7,
//   mc_lingual_kennedy=8, mc_cingulum_bar=9 }
export const MAJOR_CONNECTOR_TYPE = new Map([
  [1, "major-upper-palatal-strap"],
  [2, "major-upper-horseshoe"],      // confirmed (upper sample)
  [3, "major-upper-palatal-hole"],
  [4, "major-upper-palatal-bar"],
  [5, "major-upper-palatal-plate"],
  [6, "major-lower-lingual-bar"],
  [7, "major-lower-lingual-plate"],  // confirmed (lower sample)
  [8, "major-lower-lingual-kennedy"],
  // 9 (mc_cingulum_bar) -> major-lower-cingulum-bar is commented out in components.js -> unmapped
]);

/**
 * Field path -> mapping table, for the genuinely flat one-field->one-component
 * fields only. Retainer (composite), mesh (spans) and major connector
 * (jaw-level) are resolved directly in jawStructCodec.js, not here.
 *
 * The "Tooth Reciprocating.Tooth Type" field is intentionally absent: in both
 * samples it is 2 on every present tooth and 0 on every missing tooth
 * (presence-correlated noise, not a per-tooth reciprocating choice), so mapping
 * it would drop a plate onto every present tooth.
 */
export const FIELD_TO_MAP = {
  "Tooth Main.Tooth Rest.Posterior Rest Type": POSTERIOR_REST_TYPE,
};

/** Build a reverse Map<componentId, int> on first use. */
const _inverseCache = new WeakMap();
export function inverseOf(map) {
  let inv = _inverseCache.get(map);
  if (inv) return inv;
  inv = new Map();
  for (const [code, id] of map) {
    if (id != null) inv.set(id, code);
  }
  _inverseCache.set(map, inv);
  return inv;
}

/** Look up componentId by integer code for a flat field. Returns null if unknown. */
export function componentIdForCode(fieldPath, code) {
  const map = FIELD_TO_MAP[fieldPath];
  if (!map) return null;
  return map.get(code) ?? null;
}

/** Reverse lookup. Returns null if unmapped. */
export function codeForComponentId(fieldPath, componentId) {
  const map = FIELD_TO_MAP[fieldPath];
  if (!map) return null;
  return inverseOf(map).get(componentId) ?? null;
}

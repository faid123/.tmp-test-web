/**
 * Integer code <-> web componentId mapping for the jaw-struct text format.
 *
 * The jaw-struct text returned by /jawstruct_l2/getall uses integer enum values
 * (e.g. "Retainer Type: 1", "Posterior Rest Type: 2"). The enums that define
 * those integers live in the compiled DLL on the Unity side
 * (Posterior_Rest_Type, Retainer_Clasp_type, Retainer_Bar_Type, etc.) and are
 * NOT in the visible source. Until those values are documented, the tables
 * below are empty stubs — the codec will pass through unknown codes verbatim
 * so nothing is lost on round-trip, and warnings are logged so we can catalog
 * which codes appear in real data.
 *
 * To populate: open EnumToRPDComponent in the Unity Inspector and read each
 * (enum int -> RPDComponent.displayName) pair, then add a row here mapping the
 * int to the matching `id` from src/js/2D/components.js COMPONENT_CATALOG.
 */

/** Each map: Map<int, componentId-string>. Inverse is built lazily. */
export const POSTERIOR_REST_TYPE = new Map([
  // [0, null],                  // none
  // [1, "rest-seat"],           // TODO confirm
  // [2, "rest-onlay"],          // TODO confirm
]);

export const POSTERIOR_REST_POSITION = new Map([
  // [0, null],
  // TODO
]);

export const ANTERIOR_CINGULUM_REST_TYPE = new Map([
  // TODO
]);

export const ANTERIOR_INCISAL_REST_TYPE = new Map([
  // TODO
]);

export const RETAINER_TYPE = new Map([
  // Coarse category: 0=none, then clasp/ring/bar/recip variants. TODO confirm.
]);

export const RETAINER_CLASP_TYPE = new Map([
  // [0, null],
  // [?, "retainer-clasp"],
  // TODO
]);

export const RETAINER_RING_TYPE = new Map([
  // [?, "ring-clasp"],
  // TODO
]);

export const RETAINER_BAR_TYPE = new Map([
  // I/S/U/Y/T — distinguish via Retainer Bar Category too
  // TODO
]);

export const RETAINER_BAR_CATEGORY = new Map([
  // Per BarComponent.Location (mesial/distal). TODO
]);

export const RECIPROCATING_TYPE = new Map([
  // [0, null],
  // [?, "reciprocating-clasp"],
  // [?, "plate-prox"],
  // [?, "plate-crossmesh"],
  // TODO
]);

export const MESH_TYPE = new Map([
  // [0, null],   // no mesh
  // [?, "mesh-hole"],
  // [?, "mesh-tori"],
  // [?, "mesh-stripe"],
  // [?, "mesh-cross"],
  // [?, "mesh-flange"],
  // TODO confirm
]);

/** Mesh Presence is a 0/1 boolean field, kept separately from MESH_TYPE. */

/**
 * Field path -> mapping table.
 * Keys mirror the "Tooth Main.<Group>.<Field>" structure from the text.
 */
export const FIELD_TO_MAP = {
  "Tooth Main.Tooth Rest.Posterior Rest Type": POSTERIOR_REST_TYPE,
  "Tooth Main.Tooth Rest.Posterior Rest Position": POSTERIOR_REST_POSITION,
  "Tooth Main.Tooth Rest.Anterior Cingulum Rest Type": ANTERIOR_CINGULUM_REST_TYPE,
  "Tooth Main.Tooth Rest.Anterior Incisal Rest Type": ANTERIOR_INCISAL_REST_TYPE,
  "Tooth Main.Tooth Retainer.Retainer Type": RETAINER_TYPE,
  "Tooth Main.Tooth Retainer.Retainer Clasp Type": RETAINER_CLASP_TYPE,
  "Tooth Main.Tooth Retainer.Retainer Ring Type": RETAINER_RING_TYPE,
  "Tooth Main.Tooth Retainer.Retainer Bar Type": RETAINER_BAR_TYPE,
  "Tooth Main.Tooth Retainer.Retainer Bar Category": RETAINER_BAR_CATEGORY,
  "Tooth Main.Tooth Reciprocating.Tooth Type": RECIPROCATING_TYPE,
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

/** Look up componentId by integer code. Returns null if unknown. */
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

/**
 * Jaw-struct text <-> JS state codec.
 *
 * The smartrpdai backend stores per-case design data as base64-encoded text
 * (see responses_case_2001/03_jawstruct_upper_jaw.txt for shape). One record
 * per jaw: { case_id, type: "upper_jaw"|"lower_jaw", filename, data: <base64> }.
 *
 * The text is a flat list of lines like:
 *   "Tooth 0: Tooth Main.Tooth Index.Tooth Presence: 1"
 *   "Tooth Mesh 3: <field>: <value>"
 *   "Jaw Type: 0"
 *
 * Unknown integer codes are preserved verbatim on state.teeth[fdi].rawFields so
 * round-trip serialization does not lose information.
 */
import { FIELD_TO_MAP, componentIdForCode, codeForComponentId } from "./jawStructCodes.js";

const PRESENCE_FIELD = "Tooth Main.Tooth Index.Tooth Presence";
const MAJOR_INDEX_FIELD = "Tooth Main.Tooth Index.Major Index";
const MINOR_INDEX_FIELD = "Tooth Main.Tooth Index.Minor Index";
const MESH_PRESENCE_FIELD = "Tooth Main.Tooth Index.Mesh Presence";

/** Tolerant base64 decode (mirrors safeAtob in clinicalInfo.js). */
export function safeAtob(b64) {
  if (typeof b64 !== "string") return null;
  try {
    const cleaned = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

/**
 * Parse one jaw's text body.
 * Returns { teeth: { idx: { fields: {} } }, meshes: [{}], other: {} }
 * where idx is the per-jaw tooth index (0..15), not the FDI id.
 */
export function parseJawStructText(text) {
  const teeth = {};
  const meshes = [];
  const other = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "End of Jaw Struct") continue;
    if (line.startsWith("Start of Jaw Struct")) continue;

    const meshMatch = line.match(/^Tooth Mesh (\d+): (.+?): (.+)$/);
    if (meshMatch) {
      const idx = Number(meshMatch[1]);
      meshes[idx] = meshes[idx] || {};
      meshes[idx][meshMatch[2]] = meshMatch[3];
      continue;
    }

    const toothMatch = line.match(/^Tooth (\d+): (.+?): (.+)$/);
    if (toothMatch) {
      const idx = Number(toothMatch[1]);
      teeth[idx] = teeth[idx] || { fields: {} };
      teeth[idx].fields[toothMatch[2]] = toothMatch[3];
      continue;
    }

    const colon = line.indexOf(":");
    if (colon > 0) {
      other[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { teeth, meshes, other };
}

/**
 * Decode the array returned by POST /jawstruct_l2/getall.
 * Returns { upper, lower, raw } where upper/lower are parsed jaws (or null).
 */
export function decodeJawStructResponse(records) {
  const out = { upper: null, lower: null, raw: {} };
  if (!Array.isArray(records)) return out;
  for (const record of records) {
    if (!record?.data) continue;
    const text = safeAtob(record.data);
    if (text == null) {
      console.warn("[jawStructCodec] base64 decode failed for", record.type);
      continue;
    }
    const parsed = parseJawStructText(text);
    out.raw[record.type || "unknown"] = parsed;
    if (record.type === "upper_jaw") out.upper = parsed;
    else if (record.type === "lower_jaw") out.lower = parsed;
  }
  return out;
}

/** Derive FDI tooth id from a parsed tooth record. Returns string or null. */
function fdiFromTooth(tooth) {
  const major = Number(tooth?.fields?.[MAJOR_INDEX_FIELD]);
  const minor = Number(tooth?.fields?.[MINOR_INDEX_FIELD]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return `${major}${minor}`;
}

/** Track unmapped codes so the user can see what's missing from jawStructCodes.js. */
const _unmappedSeen = new Set();
function reportUnmapped(fieldPath, code) {
  const key = `${fieldPath}=${code}`;
  if (_unmappedSeen.has(key)) return;
  _unmappedSeen.add(key);
  console.warn(`[jawStructCodec] unmapped code for "${fieldPath}": ${code}`);
}

/**
 * Apply a parsed jaw into the existing 2DAnnotation state object.
 * - Tooth Presence -> rec.isPresent / rec.status (mirrors prior applyJawStructPresence)
 * - Mapped component fields -> rec.components (componentId list)
 * - All raw fields stashed on rec.rawJawStructFields for round-trip preservation
 * Does not call renderJaws — caller handles UI refresh.
 */
export function applyJawStructToState(parsed, state) {
  if (!parsed?.teeth || !state?.teeth) return;
  for (const tooth of Object.values(parsed.teeth)) {
    const fdi = fdiFromTooth(tooth);
    if (!fdi) continue;
    const rec = state.teeth[fdi];
    if (!rec) continue;

    // Stash raw fields so encoder can round-trip values we don't (yet) understand.
    rec.rawJawStructFields = { ...tooth.fields };

    // Tooth Presence
    const presence = tooth.fields[PRESENCE_FIELD];
    if (presence === "1") {
      rec.isPresent = true;
      if (rec.status === "missing") rec.status = "presence";
    } else if (presence === "0") {
      rec.isPresent = false;
      rec.status = "missing";
      rec.components = [];
      rec.componentPlacements = [];
    }

    // Mapped component fields -> additive components list.
    // Skip when tooth missing (already cleared above).
    if (presence !== "0") {
      const placedIds = new Set(Array.isArray(rec.components) ? rec.components : []);
      for (const fieldPath of Object.keys(FIELD_TO_MAP)) {
        const raw = tooth.fields[fieldPath];
        if (raw == null) continue;
        const code = Number(raw);
        if (!Number.isFinite(code) || code === 0) continue;
        const componentId = componentIdForCode(fieldPath, code);
        if (componentId == null) {
          reportUnmapped(fieldPath, code);
          continue;
        }
        placedIds.add(componentId);
      }
      rec.components = [...placedIds];
    }

    // Mesh Presence is a plain 0/1 flag — exposed for callers that care.
    const meshPresence = tooth.fields[MESH_PRESENCE_FIELD];
    if (meshPresence === "0" || meshPresence === "1") {
      rec.meshPresence = meshPresence === "1";
    }
  }
}

/**
 * Encode `state` back to the jaw-struct text format for one jaw.
 * Uses rec.rawJawStructFields as the source of truth, overlays current state
 * (presence + mapped components) on top so unknown fields round-trip cleanly.
 * jawSide: "upper" | "lower".
 */
export function encodeJawStructText(state, jawSide) {
  const isUpper = jawSide === "upper";
  // Build ordered list of teeth for this jaw, in array-index 0..15.
  // FDI quadrants: upper = Major 1 (1.8..1.1) then Major 2 (2.1..2.8).
  //                lower = Major 4 (4.8..4.1) then Major 3 (3.1..3.8).
  const fdiOrder = isUpper
    ? [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
    : [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const lines = [];
  lines.push("");
  lines.push(`Start of Jaw Struct yr.mth.day.hr.min.sec: ${stampNow()}`);
  lines.push(`Jaw Type: ${isUpper ? 0 : 1}`);
  lines.push("Jaw Material: 0");

  fdiOrder.forEach((fdi, arrayIdx) => {
    const rec = state.teeth?.[fdi] || {};
    const raw = { ...(rec.rawJawStructFields || {}) };

    // Overlay current state into raw fields.
    raw[MAJOR_INDEX_FIELD] = String(Math.floor(fdi / 10));
    raw[MINOR_INDEX_FIELD] = String(fdi % 10);
    raw[PRESENCE_FIELD] = rec.isPresent ? "1" : "0";
    raw["Tooth Main.Tooth Index.Array Index"] = String(arrayIdx);

    // Reverse-map componentId list -> integer codes per field.
    // For each mapped field, find a matching componentId in rec.components.
    const componentIds = new Set(Array.isArray(rec.components) ? rec.components : []);
    for (const fieldPath of Object.keys(FIELD_TO_MAP)) {
      let matched = null;
      for (const id of componentIds) {
        const code = codeForComponentId(fieldPath, id);
        if (code != null) {
          matched = code;
          componentIds.delete(id);
          break;
        }
      }
      if (matched != null) {
        raw[fieldPath] = String(matched);
      } else if (!(fieldPath in raw)) {
        raw[fieldPath] = "0";
      }
    }

    for (const [fieldPath, value] of Object.entries(raw)) {
      lines.push(`Tooth ${arrayIdx}: ${fieldPath}: ${value}`);
    }
  });

  lines.push("End of Jaw Struct");
  return lines.join("\r\n");
}

/** Base64-encode the text for transport. */
export function encodeJawStructBase64(state, jawSide) {
  return btoa(encodeJawStructText(state, jawSide));
}

function stampNow() {
  const d = new Date();
  return [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ].join(".");
}

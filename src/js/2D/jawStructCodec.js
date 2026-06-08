/**
 * Jaw-struct text <-> JS codec (pure / DOM-free / Node-testable).
 *
 * The smartrpdai backend stores per-case 2D design data as base64-encoded text
 * (see 03_jawstruct_upper/lower_jaw.txt for the shape). One record per jaw:
 *   { case_id, type: "upper_jaw"|"lower_jaw", filename, data: <base64> }.
 *
 * The text is a flat list of lines:
 *   "Tooth 5: Tooth Main.Tooth Rest.Posterior Rest Type: 2"
 *   "Tooth Mesh 0: Mesh Type: 1"
 *   "Major Connector Type: 7"
 *
 * Pipeline: decodeJawStructResponse() -> parsed jaw -> resolveJawStructDesign()
 * -> a normalized, render-agnostic "design" that jawStructApply.js applies to the
 * 2D annotation state. Integer enums are decoded via ./jawStructCodes.js.
 *
 * Enum semantics worth remembering (from StructData.cs, validated vs samples):
 *   - Tooth_Presence: present=0, missing=1   (NOT the other way round)
 *   - Retainer is composite (Retainer Type + Retainer Bar Category)
 *   - Mesh is stored as spans, applied across array indices start..end
 */
import {
  POSTERIOR_REST_TYPE,
  RETAINER_TYPE,
  RETAINER_BAR_CATEGORY,
  MESH_TYPE,
  MAJOR_CONNECTOR_TYPE,
  inverseOf,
} from "./jawStructCodes.js";

const PRESENCE_FIELD = "Tooth Main.Tooth Index.Tooth Presence";
const MAJOR_INDEX_FIELD = "Tooth Main.Tooth Index.Major Index";
const MINOR_INDEX_FIELD = "Tooth Main.Tooth Index.Minor Index";
const MESH_PRESENCE_FIELD = "Tooth Main.Tooth Index.Mesh Presence";
const POSTERIOR_REST_FIELD = "Tooth Main.Tooth Rest.Posterior Rest Type";
const RETAINER_TYPE_FIELD = "Tooth Main.Tooth Retainer.Retainer Type";
const RETAINER_BAR_CATEGORY_FIELD = "Tooth Main.Tooth Retainer.Retainer Bar Category";

const JAW_TYPE_KEY = "Jaw Type";
const MAJOR_CONNECTOR_KEY = "Major Connector Type";

// Tooth_Presence enum: present=0, missing=1.
const PRESENCE_PRESENT = "0";

/** Tolerant base64 decode (mirrors safeAtob in clinicalInfo.js). */
export function safeAtob(b64) {
  if (typeof b64 !== "string") return null;
  try {
    const cleaned = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
    // atob in browser; Buffer fallback for Node-based tests.
    if (typeof atob === "function") return atob(padded);
    return Buffer.from(padded, "base64").toString("binary");
  } catch {
    return null;
  }
}

/**
 * Parse one jaw's text body.
 * Returns { teeth: { idx: { fields: {} } }, meshes: [{}], other: {} }
 * where idx is the per-jaw tooth array index (0..15), not the FDI id.
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
 * Decode the array returned by POST /jawstruct/l2/getall.
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

/** Jaw side from the "Jaw Type" header (0=upper, 1=lower). Null if absent. */
function jawSideFromParsed(parsed) {
  const jt = parsed?.other?.[JAW_TYPE_KEY];
  if (jt === "0") return "upper";
  if (jt === "1") return "lower";
  return null;
}

/** Track unmapped codes so we can catalog what's missing from jawStructCodes.js. */
const _unmappedSeen = new Set();
function reportUnmapped(fieldPath, code) {
  const key = `${fieldPath}=${code}`;
  if (_unmappedSeen.has(key)) return;
  _unmappedSeen.add(key);
  console.warn(`[jawStructCodec] unmapped code for "${fieldPath}": ${code}`);
}

/**
 * Resolve a parsed jaw into a normalized, render-agnostic design:
 *   {
 *     jawSide: "upper" | "lower" | null,
 *     teeth: { [fdi]: { present, simple: [componentId], bars: [componentId] } },
 *     mesh:  [ { componentId, fdis: [fdi...] } ],
 *     major: componentId | null,
 *     rawByFdi: { [fdi]: {<raw fields>} },   // stashed for round-trip
 *   }
 * Pure: no DOM, no annotation-state mutation. jawStructApply.js consumes this.
 */
export function resolveJawStructDesign(parsed) {
  const design = {
    jawSide: jawSideFromParsed(parsed),
    teeth: {},
    mesh: [],
    major: null,
    rawByFdi: {},
  };
  if (!parsed?.teeth) return design;

  // array index (0..15) -> FDI, derived from the data itself (robust vs hardcoding).
  const idxToFdi = {};
  for (const [idx, tooth] of Object.entries(parsed.teeth)) {
    const fdi = fdiFromTooth(tooth);
    if (fdi) idxToFdi[idx] = fdi;
  }

  for (const tooth of Object.values(parsed.teeth)) {
    const fdi = fdiFromTooth(tooth);
    if (!fdi) continue;
    const f = tooth.fields || {};
    design.rawByFdi[fdi] = { ...f };

    const present = f[PRESENCE_FIELD] === PRESENCE_PRESENT;
    const entry = { present, simple: [], bars: [] };
    design.teeth[fdi] = entry;
    if (!present) continue; // components live on present (abutment) teeth only

    // Posterior rest (flat).
    const prCode = Number(f[POSTERIOR_REST_FIELD]);
    if (Number.isFinite(prCode) && prCode > 0) {
      const id = POSTERIOR_REST_TYPE.get(prCode);
      if (id) entry.simple.push(id);
      else reportUnmapped(POSTERIOR_REST_FIELD, prCode);
    }

    // Retainer (composite): type picks clasp/ring; a bar's shape comes from category.
    const retCode = Number(f[RETAINER_TYPE_FIELD]);
    if (Number.isFinite(retCode) && retCode > 0) {
      if (retCode === 3) {
        const barCode = Number(f[RETAINER_BAR_CATEGORY_FIELD]);
        const barId = RETAINER_BAR_CATEGORY.get(barCode);
        if (barId) entry.bars.push(barId);
        else reportUnmapped(RETAINER_BAR_CATEGORY_FIELD, barCode);
      } else {
        const id = RETAINER_TYPE.get(retCode);
        if (id) entry.simple.push(id);
        else reportUnmapped(RETAINER_TYPE_FIELD, retCode);
      }
    }
  }

  // Mesh spans -> mesh component across array indices start..end (missing teeth).
  if (Array.isArray(parsed.meshes)) {
    for (const span of parsed.meshes) {
      if (!span) continue;
      const mt = Number(span["Mesh Type"]);
      const start = Number(span["Start Index"]);
      const end = Number(span["End Index"]);
      if (!Number.isFinite(mt) || mt === 0) continue;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0) continue;
      const meshId = MESH_TYPE.get(mt);
      if (!meshId) {
        reportUnmapped("Mesh Type", mt);
        continue;
      }
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const fdis = [];
      for (let i = lo; i <= hi; i += 1) {
        if (idxToFdi[i]) fdis.push(idxToFdi[i]);
      }
      if (fdis.length) design.mesh.push({ componentId: meshId, fdis });
    }
  }

  // Major connector (jaw-level).
  const mcCode = Number(parsed?.other?.[MAJOR_CONNECTOR_KEY]);
  if (Number.isFinite(mcCode) && mcCode > 0) {
    const id = MAJOR_CONNECTOR_TYPE.get(mcCode);
    if (id) design.major = id;
    else reportUnmapped(MAJOR_CONNECTOR_KEY, mcCode);
  }

  return design;
}

// ---- Encode: web state -> complete jaw-struct text -----------------------
// Emits the full desktop field set (26 fields/tooth + the Mesh / Major / Minor /
// Ball tail). Component values are derived from the placed web components;
// fields the web doesn't model are written with the desktop defaults the samples
// use (tooth positions 0, tissue stop / retention pin 0, clasp/ring orientation
// 0, minor-connector paths 1, ball connectors 0). Result is a complete,
// desktop-readable file. It is NOT byte-identical to a desktop export that
// carried data the web has no concept of: exact tooth positions, user-edited
// minor-connector paths, clasp/ring orientation, and reciprocating uses the
// observed present->2 desktop default rather than the web's reciprocating choice.

// Array slot -> FDI, per StructData.cs get_array_index (major 1/3 reversed).
const UPPER_FDI_ORDER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_FDI_ORDER = [38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48];

function componentList(rec) {
  return Array.isArray(rec?.components) ? rec.components : [];
}

// Contiguous same-type runs of mesh-bearing teeth -> mesh spans for the tail.
function buildMeshSpans(state, fdiOrder) {
  const spans = [];
  let cur = null;
  fdiOrder.forEach((fdi, idx) => {
    const meshId = componentList(state.teeth?.[fdi]).find((id) => String(id).startsWith("mesh-"));
    const mt = meshId ? inverseOf(MESH_TYPE).get(meshId) ?? 0 : 0;
    if (mt > 0 && cur && cur.meshType === mt && idx === cur.end + 1) {
      cur.end = idx;
    } else if (mt > 0) {
      cur = { meshType: mt, start: idx, end: idx };
      spans.push(cur);
    } else {
      cur = null;
    }
  });
  return spans.slice(0, 8);
}

function majorConnectorCode(state, fdiOrder) {
  for (const fdi of fdiOrder) {
    const majId = componentList(state.teeth?.[fdi]).find((id) => String(id).startsWith("major-"));
    if (majId) return inverseOf(MAJOR_CONNECTOR_TYPE).get(majId) ?? 0;
  }
  return 0;
}

function encodeToothLines(arrayIdx, fdi, rec, hasMesh) {
  const maj = Math.floor(fdi / 10);
  const min = fdi % 10;
  const toothType = min < 4 ? 1 : 0;       // Tooth_Type: anterior=1, posterior=0
  const present = rec?.isPresent ? 0 : 1;  // Tooth_Presence: present=0, missing=1
  const condition = rec?.status === "abutment" ? 1 : rec?.status === "compromised" ? 2 : 0;
  const comps = componentList(rec);

  let posteriorRest = 0;
  if (comps.includes("rest-onlay")) posteriorRest = inverseOf(POSTERIOR_REST_TYPE).get("rest-onlay");
  else if (comps.includes("rest-seat")) posteriorRest = inverseOf(POSTERIOR_REST_TYPE).get("rest-seat");

  let retainerType = 0;
  let barType = 0;
  let barCategory = 0;
  const barId = comps.find((id) => String(id).startsWith("bar-"));
  if (comps.includes("retainer-clasp")) retainerType = 1;       // clasp_retainer
  else if (comps.includes("ring-clasp")) retainerType = 2;      // ring_retainer
  else if (barId) {
    retainerType = 3;                                           // bar_retainer
    barCategory = inverseOf(RETAINER_BAR_CATEGORY).get(barId) ?? 0;
    const placements = Array.isArray(rec?.componentPlacements) ? rec.componentPlacements : [];
    const barPl = placements.find((p) => p.componentId === barId);
    barType = barPl && String(barPl.surface || "").includes("distal") ? 1 : 0; // rb_distal=1
  }

  const fields = [
    ["Tooth Main.Tooth Index.Major Index", maj],
    ["Tooth Main.Tooth Index.Minor Index", min],
    ["Tooth Main.Tooth Index.Tooth Type", toothType],
    ["Tooth Main.Tooth Index.Tooth Presence", present],
    ["Tooth Main.Tooth Index.Tooth Condition", condition],
    ["Tooth Main.Tooth Index.Mesh Presence", hasMesh ? 0 : 1], // 0 = mesh present
    ["Tooth Main.Tooth Index.Array Index", arrayIdx],
    ["Tooth Main.Tooth Index.Tissue Stop Presence", 0],
    ["Tooth Main.Tooth Index.Retention Pin Presence", 0],
    ["Tooth Main.Tooth Index.Tooth Position X", 0],
    ["Tooth Main.Tooth Index.Tooth Position Y", 0],
    ["Tooth Main.Tooth Index.Tooth Position Z", 0],
    ["Tooth Main.Tooth Rest.Tooth Type", toothType],
    ["Tooth Main.Tooth Rest.Anterior Rest", 0],
    ["Tooth Main.Tooth Rest.Anterior Cingulum Rest Type", 0],
    ["Tooth Main.Tooth Rest.Anterior Incisal Rest Type", 0],
    ["Tooth Main.Tooth Rest.Posterior Rest Type", posteriorRest],
    ["Tooth Main.Tooth Rest.Pr Config 0", posteriorRest > 0 ? 0 : 1],
    ["Tooth Main.Tooth Rest.Pr Config 1", 1],
    ["Tooth Main.Tooth Rest.Pr Config 2", 1],
    ["Tooth Main.Tooth Retainer.Retainer Type", retainerType],
    ["Tooth Main.Tooth Retainer.Retainer Clasp Type", 0],
    ["Tooth Main.Tooth Retainer.Retainer Ring Type", 0],
    ["Tooth Main.Tooth Retainer.Retainer Bar Type", barType],
    ["Tooth Main.Tooth Retainer.Retainer Bar Category", barCategory],
    ["Tooth Main.Tooth Reciprocating.Tooth Type", present === 0 ? 2 : 0], // present->2 (desktop default)
  ];
  return fields.map(([k, v]) => `Tooth ${arrayIdx}: ${k}: ${v}`);
}

/**
 * Encode `state` to a complete jaw-struct text file for one jaw.
 * jawSide: "upper" | "lower". See the block comment above for fidelity notes.
 */
export function encodeJawStructText(state, jawSide) {
  const isUpper = jawSide === "upper";
  const fdiOrder = isUpper ? UPPER_FDI_ORDER : LOWER_FDI_ORDER;

  const meshFdi = new Set();
  fdiOrder.forEach((fdi) => {
    if (componentList(state.teeth?.[fdi]).some((id) => String(id).startsWith("mesh-"))) meshFdi.add(fdi);
  });
  const meshSpans = buildMeshSpans(state, fdiOrder);

  const lines = [];
  lines.push("");
  lines.push(`Start of Jaw Struct yr.mth.day.hr.min.sec: ${stampNow()}`);
  lines.push(`Jaw Type: ${isUpper ? 0 : 1}`);
  lines.push("Jaw Material: 0");

  fdiOrder.forEach((fdi, arrayIdx) => {
    lines.push(...encodeToothLines(arrayIdx, fdi, state.teeth?.[fdi], meshFdi.has(fdi)));
  });

  lines.push(`Mesh Number: ${meshSpans.length}`);
  for (let i = 0; i < 8; i += 1) {
    const span = meshSpans[i];
    lines.push(`Tooth Mesh ${i}: Mesh Type: ${span ? span.meshType : 0}`);
    lines.push(`Tooth Mesh ${i}: Start Index: ${span ? span.start : -1}`);
    lines.push(`Tooth Mesh ${i}: End Index: ${span ? span.end : -1}`);
  }

  lines.push(`Major Connector Type: ${majorConnectorCode(state, fdiOrder)}`);
  for (let c = 0; c < 16; c += 1) {
    for (let p = 0; p < 16; p += 1) {
      lines.push(`Minor Connector ${c} Path Index ${p}: 1`);
    }
  }
  for (let b = 0; b < 17; b += 1) {
    lines.push(`Ball Connector ${b}: 0`);
  }

  lines.push("End of Jaw Struct");
  return lines.join("\r\n");
}

/** Base64-encode the text for transport. */
export function encodeJawStructBase64(state, jawSide) {
  const text = encodeJawStructText(state, jawSide);
  if (typeof btoa === "function") return btoa(text);
  return Buffer.from(text, "binary").toString("base64");
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

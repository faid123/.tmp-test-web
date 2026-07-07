/**
 * Jaw-struct text <-> JS codec (pure / DOM-free / Node-testable).
 *
 * The backend stores per-case 2D data as base64 text (see 03_jawstruct_*.txt), one
 * record per jaw: { case_id, type: "upper_jaw"|"lower_jaw", filename, data: <base64> }.
 * The text is a flat list of lines, e.g.:
 *   "Tooth 5: Tooth Main.Tooth Rest.Posterior Rest Type: 2"
 *   "Tooth Mesh 0: Mesh Type: 1" / "Major Connector Type: 7"
 *
 * Pipeline: decodeJawStructResponse() → resolveJawStructDesign() → a normalized,
 * render-agnostic "design" that jawStructApply.js applies. Enums via jawStructCodes.js.
 *
 * Enum semantics to remember (StructData.cs, validated vs samples):
 *   - Tooth_Presence: present=0, missing=1 (NOT the reverse)
 *   - Retainer is composite (Retainer Type + Retainer Bar Category)
 *   - Mesh is stored as spans, applied across array indices start..end
 */
import {
  POSTERIOR_REST_TYPE,
  RETAINER_TYPE,
  RETAINER_BAR_CATEGORY,
  RECIPROCATING_TYPE,
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
const RETAINER_BAR_TYPE_FIELD = "Tooth Main.Tooth Retainer.Retainer Bar Type";
const RETAINER_CLASP_TYPE_FIELD = "Tooth Main.Tooth Retainer.Retainer Clasp Type";
const RETAINER_RING_TYPE_FIELD = "Tooth Main.Tooth Retainer.Retainer Ring Type";
const RECIPROCATING_FIELD = "Tooth Main.Tooth Reciprocating.Tooth Type";
const ANTERIOR_REST_FIELD = "Tooth Main.Tooth Rest.Anterior Rest";
const ANTERIOR_CINGULUM_FIELD = "Tooth Main.Tooth Rest.Anterior Cingulum Rest Type";
const ANTERIOR_INCISAL_FIELD = "Tooth Main.Tooth Rest.Anterior Incisal Rest Type";
const PR_CONFIG_FIELDS = [
  "Tooth Main.Tooth Rest.Pr Config 0",
  "Tooth Main.Tooth Rest.Pr Config 1",
  "Tooth Main.Tooth Rest.Pr Config 2",
];

// Rests/clasps only render with a surface the renderer can anchor to (null-surface
// markers are skipped). These map the desktop's position/orientation fields to that
// surface vocabulary. Pr Config index (value "0" = present) → rest anchor surface.
const REST_POSITION_SURFACE = ["mesial", "distal", "lingual"];
// Retainer_Clasp_type / Retainer_Ring_type (0..3) -> clasp anchor surface.
const CLASP_ORIENT_SURFACE = ["mesial_buccal", "mesial_lingual", "distal_buccal", "distal_lingual"];

// "Implied plating": a plate/strap/horseshoe major stamps reciprocating=2 on EVERY
// present tooth (confirmed: upper horseshoe(2), lower lingual plate(7) plate all; lower
// lingual bar(6) plates none). Decoded into real per-tooth plate-prox (data-driven,
// removable); the renderer draws one plate per tooth, and the connector switch adds/removes
// plate-prox so plate↔bar still flips plating. See annotationVisuals.js + annotationCatalog.js.

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

/** Rest anchor surface from Pr Config (first position flagged present, default mesial). */
function restSurfaceFromConfig(f) {
  for (let i = 0; i < REST_POSITION_SURFACE.length; i += 1) {
    if (f[PR_CONFIG_FIELDS[i]] === "0") return REST_POSITION_SURFACE[i];
  }
  return "mesial";
}

/**
 * Pr Config triple (0 = present) for a posterior rest surface — inverse of
 * restSurfaceFromConfig (unknown → mesial). The surface is web-owned, so Save derives
 * Pr Config from the live placement, else a surface edit (mesial → lingual) is dropped.
 */
function prConfigFromSurface(surface) {
  const idx = REST_POSITION_SURFACE.indexOf(String(surface ?? "").toLowerCase());
  const present = idx >= 0 ? idx : 0;
  return REST_POSITION_SURFACE.map((_, i) => (i === present ? 0 : 1));
}

/** Clasp anchor surface from a Retainer Clasp/Ring Type field (default mesial_buccal). */
function claspSurfaceFromField(f, field) {
  return CLASP_ORIENT_SURFACE[Number(f[field])] || "mesial_buccal";
}

/**
 * Retainer Clasp/Ring Type code (0..3) for a clasp placement surface — inverse of
 * claspSurfaceFromField (unknown → 0 = mesial_buccal). The clasp orientation is
 * web-owned, so Save derives it live from the placement; otherwise a surface edit
 * (e.g. mesial_buccal → distal_buccal) is dropped and reopens as the loaded value.
 */
function claspFieldFromSurface(surface) {
  const idx = CLASP_ORIENT_SURFACE.indexOf(String(surface ?? "").toLowerCase());
  return idx < 0 ? 0 : idx;
}

// The reciprocating clasp sits on the arch-surface OPPOSITE the retentive clasp
// (buccal ↔ lingual) at the SAME mesial/distal corner; the desktop stores no reci
// orientation, so it's derived from the retainer. Do NOT add a quadrant/mesial-distal
// flip here: the renderer already mirrors quadrants 2 & 3 (getToothAssetSpec), so the
// decoder only needs the anatomical surface. A decode-side flip would cancel the render
// mirror on the left side, leaving both sides identical (the "nothing changed" symptom).
function reciprocalClaspSurface(retainerSurface) {
  let s = String(retainerSurface);
  if (s.includes("buccal")) s = s.replace("buccal", "lingual");
  else if (s.includes("lingual")) s = s.replace("lingual", "buccal");
  return s;
}

/**
 * Anterior rest -> rest-seat surface, or null when none.
 * Anterior_Rest: 1=cingulum (lingual_mesial/lingual_distal), 2=incisal (mesial/distal).
 */
function anteriorRestSurface(f) {
  const ar = Number(f[ANTERIOR_REST_FIELD]);
  if (ar === 1) {
    // Anterior_Cingulum_Rest_Type: ac_full=0, ac_mesial=1, ac_distal=2, ac_both=3.
    // Surface -> rest asset (components.rest.js getRestPlacementToken):
    //   "lingual"=ac_full, "lingual_mesial"=ac_mesial, "lingual_distal"=ac_distal,
    //   "lingual_both"=ac_both. ac_both art exists only on the lower anterior
    //   templates; the token resolver falls back to ac_full for the upper arch.
    const ac = Number(f[ANTERIOR_CINGULUM_FIELD]);
    if (ac === 1) return "lingual_mesial";
    if (ac === 2) return "lingual_distal";
    if (ac === 3) return "lingual_both";
    return "lingual"; // 0 -> full cingulum coverage
  }
  if (ar === 2) {
    // Anterior_Incisal_Rest_Type: ai_mesial=0, ai_distal=1
    return Number(f[ANTERIOR_INCISAL_FIELD]) === 1 ? "distal" : "mesial";
  }
  return null;
}

/** Jaw side from the "Jaw Type" header (0=upper, 1=lower). Null if absent. */
function jawSideFromParsed(parsed) {
  const jt = parsed?.other?.[JAW_TYPE_KEY];
  if (jt === "0") return "upper";
  if (jt === "1") return "lower";
  return null;
}

// Map the saved major-connector span (array-slot ranges) to the FDIs it covers.
// Unions both connectors (1 & 2); `idxToFdi` is the data-derived slot->FDI map.
// Returns undefined when neither range is present/valid (from-scratch designs).
function majorSpanFdisFromParsed(other, idxToFdi) {
  if (!other || !idxToFdi) return undefined;
  const ranges = [
    [other["Major Connector 1 Start"], other["Major Connector 1 End"]],
    [other["Major Connector 2 Start"], other["Major Connector 2 End"]],
  ];
  const slots = new Set();
  let sawRange = false;
  for (const [s, e] of ranges) {
    const start = Number(s);
    const end = Number(e);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    // [0,0] is the desktop's "no connector" sentinel (unused 2nd connector), NOT a
    // real span over slot 0 (the 3rd molar 18/38). Treating it as real drew a
    // spurious connector arm onto the 3rd molar.
    if (start === 0 && end === 0) continue;
    sawRange = true;
    for (let i = Math.min(start, end); i <= Math.max(start, end); i += 1) {
      slots.add(String(i));
    }
  }
  if (!sawRange) return undefined;
  const fdis = [];
  for (const slot of slots) if (idxToFdi[slot]) fdis.push(idxToFdi[slot]);
  return fdis.length ? fdis : undefined;
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
    // Jaw-level loaded values (Minor Connector grid, Ball Connector flags, etc.)
    // the web doesn't model — preserved so Save can re-emit them.
    rawOther: parsed?.other || {},
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
    // placements: rests/clasps with their anchor surface; bars: shape ids whose
    // surface is computed from arch geometry at apply time.
    const entry = { present, placements: [], bars: [] };
    design.teeth[fdi] = entry;
    if (!present) continue; // components live on present (abutment) teeth only

    // Posterior rest — surface from Pr Config (mesial/distal/lingual).
    const prCode = Number(f[POSTERIOR_REST_FIELD]);
    if (Number.isFinite(prCode) && prCode > 0) {
      const id = POSTERIOR_REST_TYPE.get(prCode);
      if (id) entry.placements.push({ componentId: id, surface: restSurfaceFromConfig(f) });
      else reportUnmapped(POSTERIOR_REST_FIELD, prCode);
    }

    // Anterior rest (cingulum/incisal) — rendered as rest-seat on a cingulum/incisal surface.
    const arSurface = anteriorRestSurface(f);
    if (arSurface) entry.placements.push({ componentId: "rest-seat", surface: arSurface });

    // Retainer (composite): clasp/ring carry an orientation surface; bar shape
    // comes from Retainer Bar Category.
    const retCode = Number(f[RETAINER_TYPE_FIELD]);
    if (Number.isFinite(retCode) && retCode > 0) {
      if (retCode === 3) {
        const barCode = Number(f[RETAINER_BAR_CATEGORY_FIELD]);
        const barId = RETAINER_BAR_CATEGORY.get(barCode);
        if (barId) entry.bars.push(barId);
        else reportUnmapped(RETAINER_BAR_CATEGORY_FIELD, barCode);
      } else {
        const id = RETAINER_TYPE.get(retCode);
        if (id) {
          const orientField = retCode === 2 ? RETAINER_RING_TYPE_FIELD : RETAINER_CLASP_TYPE_FIELD;
          entry.placements.push({ componentId: id, surface: claspSurfaceFromField(f, orientField) });
        } else reportUnmapped(RETAINER_TYPE_FIELD, retCode);
      }
    }

    // Reciprocating element (Reciprocating.Tooth Type): 1=reciprocating-clasp,
    // 2=plate-prox, 3=plate-crossmesh. DATA-DRIVEN: every value becomes a real
    // component so it round-trips and is erasable. A plating major stamps =2 on every
    // present tooth ("implied plating") → a real plate-prox each; the renderer gates
    // plate-fill on plate-prox (one plate per tooth), and removing it drops the plate.
    const recipId = RECIPROCATING_TYPE.get(Number(f[RECIPROCATING_FIELD]));
    if (recipId) {
      // Derive the reci clasp surface from the retentive clasp (see reciprocalClaspSurface)
      // rather than hardcoding mesial_lingual, which made every loaded reci clasp read
      // linguo-mesial. A plate keeps a null surface.
      let surface = null;
      if (recipId === "reciprocating-clasp") {
        const orientField =
          Number(f[RETAINER_TYPE_FIELD]) === 2 ? RETAINER_RING_TYPE_FIELD : RETAINER_CLASP_TYPE_FIELD;
        surface = reciprocalClaspSurface(claspSurfaceFromField(f, orientField));
      }
      entry.placements.push({ componentId: recipId, surface });
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

  // Exact major coverage from the saved span: the desktop writes the extent as
  // array-slot ranges (Major Connector 1/2 Start/End); map both to FDIs and union.
  // Apply then places the major on exactly these teeth. Absent → undefined, so
  // from-scratch designs fall back to the arch-fill rule.
  if (design.major) {
    design.majorSpanFdis = majorSpanFdisFromParsed(parsed?.other, idxToFdi);
  }

  return design;
}

// ---- Encode: web state -> complete jaw-struct text -----------------------
// HYBRID encoder. Emits the full desktop field set (26 fields/tooth + Mesh/Major/
// Minor/Ball tail). Web-owned fields are derived live from placed components
// (presence, condition, mesh, rests, retainer + bar shape, mesh spans, major) so
// edits flow through; fields the web can't model are PRESERVED from loaded data via
// `rawOr` (positions, Pr Config, bar side, clasp/ring orientation, reciprocating
// flag, the Minor Connector grid + Ball connectors). With loaded raw, a load→Save
// round-trips byte-identical except the re-stamped time line (validated in
// __tests__/jawStructRoundTrip.test.mjs); from-scratch has no raw → desktop defaults.

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

// Connector-1/2 array-slot spans from the teeth carrying a major-* component.
// Contiguous slot runs become the two connectors so the loader reads back exactly
// the placed teeth. No major → 0/0.
function majorConnectorSpans(state, fdiOrder) {
  const slots = [];
  fdiOrder.forEach((fdi, idx) => {
    if (componentList(state.teeth?.[fdi]).some((id) => String(id).startsWith("major-"))) {
      slots.push(idx);
    }
  });
  if (!slots.length) return { c1: [0, 0], c2: [0, 0] };
  const runs = [];
  for (const s of slots) {
    const last = runs[runs.length - 1];
    if (last && s === last[1] + 1) last[1] = s;
    else runs.push([s, s]);
  }
  if (runs.length === 1) return { c1: runs[0], c2: runs[0] };
  if (runs.length === 2) return { c1: runs[0], c2: runs[1] };
  // >2 runs: can't represent exactly in two connectors — use the overall span.
  const bound = [slots[0], slots[slots.length - 1]];
  return { c1: bound, c2: bound };
}

// The lower lingual connector's plate-vs-bar SHAPE lives in the 16x16 Minor Connector
// grid, not just "Major Connector Type": the desktop routes a PLATE through Path D
// (index 6=distal/7=mesial) and a BAR through Path G (12/13). The web only preserves
// the loaded grid, so switching type used to keep the old shape — here we re-route the
// active path to match. Verified byte-exact vs case 1923 both ways; idempotent. Only
// lower lingual bar(6)/plate(7); other connectors pass through untouched.
function normalizeLingualGridForType(tail, mcCode) {
  if (mcCode !== 6 && mcCode !== 7) return tail;
  const out = { ...tail };
  const key = (n, p) => `Minor Connector ${n} Path Index ${p}`;
  const active = (n, p) => String(out[key(n, p)]) === "0";
  const reroute = (n, fromD, fromM, toD, toM) => {
    if (active(n, fromD)) { out[key(n, fromD)] = 1; out[key(n, toD)] = 0; }
    if (active(n, fromM)) { out[key(n, fromM)] = 1; out[key(n, toM)] = 0; }
  };
  for (let n = 0; n < 16; n += 1) {
    if (mcCode === 7) reroute(n, 12, 13, 6, 7);   // Path G -> Path D (plate)
    else reroute(n, 6, 7, 12, 13);                 // Path D -> Path G (bar)
  }
  return out;
}

function encodeToothLines(arrayIdx, fdi, rec, hasMesh) {
  // Loaded per-tooth fields (set on load). The web doesn't carry positions, Pr Config,
  // bar side, clasp/ring orientation or the reciprocating flag, so fall back to loaded
  // values; web-owned fields below are derived live. From-scratch has no raw → defaults.
  const raw = rec?.rawJawStructFields || {};
  const rawOr = (field, fallback) => (field in raw ? raw[field] : fallback);

  const maj = Math.floor(fdi / 10);
  const min = fdi % 10;
  const toothType = min < 4 ? 1 : 0;       // Tooth_Type: anterior=1, posterior=0
  const present = rec?.isPresent ? 0 : 1;  // Tooth_Presence: present=0, missing=1
  const condition = rec?.status === "abutment" ? 1 : rec?.status === "compromised" ? 2 : 0;
  const comps = componentList(rec);
  const placements = Array.isArray(rec?.componentPlacements) ? rec.componentPlacements : [];

  // Rest: a rest-seat is anterior or posterior depending on its placement
  // surface + tooth type (the web uses rest-seat for both; the desktop splits
  // them into Anterior Rest vs Posterior Rest Type).
  let posteriorRest = 0;
  let anteriorRest = 0;
  let antCingulum = Number(rawOr(ANTERIOR_CINGULUM_FIELD, 0));
  let antIncisal = Number(rawOr(ANTERIOR_INCISAL_FIELD, 0));
  const restPl = placements.find(
    (p) => p.componentId === "rest-seat" || p.componentId === "rest-onlay"
  );
  if (restPl) {
    const s = String(restPl.surface || "");
    if (restPl.componentId === "rest-onlay") {
      posteriorRest = 1; // pr_full
    } else if (min < 4 && (s === "lingual" || s === "lingual_mesial" || s === "lingual_distal" || s === "lingual_both")) {
      anteriorRest = 1; // cingulum (full / mesial / distal / both — anterior teeth only)
      if (!(ANTERIOR_CINGULUM_FIELD in raw)) {
        antCingulum = s === "lingual_distal" ? 2 : s === "lingual_mesial" ? 1 : s === "lingual_both" ? 3 : 0; // "lingual" -> full
      }
    } else if (min < 4) {
      anteriorRest = 2; // incisal (mesial/distal on an anterior tooth)
      if (!(ANTERIOR_INCISAL_FIELD in raw)) antIncisal = s === "distal" ? 1 : 0;
    } else {
      posteriorRest = 2; // pr_non_full (posterior mesial/distal/lingual rest)
    }
  }

  // Pr Config (rest position flags). For a posterior non-full rest the surface is
  // web-owned, so derive the triple live from the placement surface; otherwise keep
  // the loaded raw value (or the from-scratch default) for round-trip fidelity.
  const prConfig =
    posteriorRest === 2 && restPl
      ? prConfigFromSurface(restPl.surface)
      : [
          rawOr("Tooth Main.Tooth Rest.Pr Config 0", posteriorRest === 2 ? 0 : 1),
          rawOr("Tooth Main.Tooth Rest.Pr Config 1", 1),
          rawOr("Tooth Main.Tooth Rest.Pr Config 2", 1),
        ];

  // Retainer: type + bar shape (category) are web-owned (derived live). The bar
  // mesial/distal side, clasp/ring orientation come from the loaded data.
  let retainerType = 0;
  let barCategory = Number(rawOr(RETAINER_BAR_CATEGORY_FIELD, 0));
  const barId = comps.find((id) => String(id).startsWith("bar-"));
  if (comps.includes("retainer-clasp")) retainerType = 1;
  else if (comps.includes("ring-clasp")) retainerType = 2;
  else if (barId) {
    retainerType = 3;
    barCategory = inverseOf(RETAINER_BAR_CATEGORY).get(barId) ?? barCategory;
  }
  // Clasp/ring orientation is web-owned: derive the Retainer Clasp/Ring Type code
  // live from the retentive clasp's placement surface so a mesial↔distal (or
  // buccal↔lingual) edit persists; fall back to the loaded raw (or default 0 =
  // mesial_buccal) only when there's no clasp/ring placed. Uses the RETAINER clasp,
  // not the reciprocating one (whose surface is derived from this on decode).
  const retainerClaspPl = placements.find((p) => p.componentId === "retainer-clasp");
  const ringClaspPl = placements.find((p) => p.componentId === "ring-clasp");
  const claspType = retainerClaspPl
    ? claspFieldFromSurface(retainerClaspPl.surface)
    : rawOr(RETAINER_CLASP_TYPE_FIELD, 0);
  const ringType = ringClaspPl
    ? claspFieldFromSurface(ringClaspPl.surface)
    : rawOr(RETAINER_RING_TYPE_FIELD, 0);

  // Bar side: loaded value wins; else derive from the placement surface.
  let barType = Number(rawOr(RETAINER_BAR_TYPE_FIELD, 0));
  if (!(RETAINER_BAR_TYPE_FIELD in raw) && barId) {
    const barPl = placements.find((p) => p.componentId === barId);
    barType = barPl && String(barPl.surface || "").includes("distal") ? 1 : 0;
  }

  // Reciprocating element (single slot): derived PURELY from the placed component so the
  // per-tooth plate is data-driven and removals persist. 1=reciprocating-clasp,
  // 2=plate-prox, 3=plate-crossmesh, 0=none. So a loaded design round-trips byte-for-byte;
  // removing a plate-prox encodes 0. The major-connector switch keeps components in step
  // (plating adds plate-prox, bar removes them — see annotationCatalog.js).
  let reciprocatingType;
  if (comps.includes("reciprocating-clasp")) reciprocatingType = 1;
  else if (comps.includes("plate-crossmesh")) reciprocatingType = 3;
  else if (comps.includes("plate-prox")) reciprocatingType = 2;
  else reciprocatingType = 0;

  const fields = [
    ["Tooth Main.Tooth Index.Major Index", maj],
    ["Tooth Main.Tooth Index.Minor Index", min],
    ["Tooth Main.Tooth Index.Tooth Type", toothType],
    ["Tooth Main.Tooth Index.Tooth Presence", present],
    ["Tooth Main.Tooth Index.Tooth Condition", condition],
    ["Tooth Main.Tooth Index.Mesh Presence", hasMesh ? 0 : 1], // 0 = mesh present
    ["Tooth Main.Tooth Index.Array Index", arrayIdx],
    ["Tooth Main.Tooth Index.Tissue Stop Presence", rawOr("Tooth Main.Tooth Index.Tissue Stop Presence", 0)],
    ["Tooth Main.Tooth Index.Retention Pin Presence", rawOr("Tooth Main.Tooth Index.Retention Pin Presence", 0)],
    ["Tooth Main.Tooth Index.Tooth Position X", rawOr("Tooth Main.Tooth Index.Tooth Position X", 0)],
    ["Tooth Main.Tooth Index.Tooth Position Y", rawOr("Tooth Main.Tooth Index.Tooth Position Y", 0)],
    ["Tooth Main.Tooth Index.Tooth Position Z", rawOr("Tooth Main.Tooth Index.Tooth Position Z", 0)],
    ["Tooth Main.Tooth Rest.Tooth Type", toothType],
    ["Tooth Main.Tooth Rest.Anterior Rest", anteriorRest],
    ["Tooth Main.Tooth Rest.Anterior Cingulum Rest Type", antCingulum],
    ["Tooth Main.Tooth Rest.Anterior Incisal Rest Type", antIncisal],
    ["Tooth Main.Tooth Rest.Posterior Rest Type", posteriorRest],
    ["Tooth Main.Tooth Rest.Pr Config 0", prConfig[0]],
    ["Tooth Main.Tooth Rest.Pr Config 1", prConfig[1]],
    ["Tooth Main.Tooth Rest.Pr Config 2", prConfig[2]],
    ["Tooth Main.Tooth Retainer.Retainer Type", retainerType],
    ["Tooth Main.Tooth Retainer.Retainer Clasp Type", claspType],
    ["Tooth Main.Tooth Retainer.Retainer Ring Type", ringType],
    ["Tooth Main.Tooth Retainer.Retainer Bar Type", barType],
    ["Tooth Main.Tooth Retainer.Retainer Bar Category", barCategory],
    ["Tooth Main.Tooth Reciprocating.Tooth Type", reciprocatingType],
    // Native emits a Pattern Type after the reciprocating Tooth Type. The web
    // doesn't model it, so preserve the loaded value (round-trips for free) and
    // default 0 for from-scratch. Omitting it desynced the per-tooth parse.
    ["Tooth Main.Tooth Reciprocating.Tooth Pattern Type", rawOr("Tooth Main.Tooth Reciprocating.Tooth Pattern Type", 0)],
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
  const mcCode = majorConnectorCode(state, fdiOrder);

  const lines = [];
  lines.push("");
  lines.push(`Start of Jaw Struct yr.mth.day.hr.min.sec: ${stampNow()}`);
  lines.push(`Jaw Type: ${isUpper ? 0 : 1}`);
  lines.push("Jaw Material: 0");

  // Header pattern types (after Jaw Material). The native parser is positional, so
  // omitting these desynced the parse (desktop loaded blank). Preserve loaded values;
  // default 0 from scratch.
  const header = state?.jawStructTail?.[jawSide] || {};
  lines.push(`Palatal Pattern Type: ${header["Palatal Pattern Type"] ?? 0}`);
  lines.push(`Arch Ridge Pattern Type: ${header["Arch Ridge Pattern Type"] ?? 0}`);

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

  lines.push(`Major Connector Type: ${mcCode}`);
  // Major connector span indices (after the type), COMPUTED from the teeth carrying
  // the major component so a web edit round-trips. Contiguous slot runs → connector 1
  // and 2 (a single run duplicates into both); >2 runs fall back to [min,max] bounds.
  const span = majorConnectorSpans(state, fdiOrder);
  lines.push(`Major Connector 1 Start: ${span.c1[0]}`);
  lines.push(`Major Connector 1 End: ${span.c1[1]}`);
  lines.push(`Major Connector 2 Start: ${span.c2[0]}`);
  lines.push(`Major Connector 2 End: ${span.c2[1]}`);
  // Minor-connector grid + ball connectors aren't modeled: emit loaded values
  // (state.jawStructTail) or desktop defaults (paths 1, balls 0). For a lower lingual
  // bar/plate, re-route the active path to match the type (normalizeLingualGridForType).
  const tail = normalizeLingualGridForType(state?.jawStructTail?.[jawSide] || {}, mcCode);
  for (let c = 0; c < 16; c += 1) {
    for (let p = 0; p < 16; p += 1) {
      const key = `Minor Connector ${c} Path Index ${p}`;
      lines.push(`${key}: ${key in tail ? tail[key] : 1}`);
    }
  }
  for (let b = 0; b < 17; b += 1) {
    const key = `Ball Connector ${b}`;
    lines.push(`${key}: ${key in tail ? tail[key] : 0}`);
  }

  lines.push("End of Jaw Struct");
  // Desktop terminates the file with a trailing CRLF after "End of Jaw Struct".
  // Without it a no-edit load->Save differs from the loaded file by one byte-run.
  return lines.join("\r\n") + "\r\n";
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

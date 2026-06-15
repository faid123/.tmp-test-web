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

// Rests and clasps only render when their placement carries a surface the
// renderer can anchor to (annotationVisuals skips null-surface markers). These
// map the desktop's position/orientation fields to that surface vocabulary.
// Pr Config index (value "0" = that position is present) -> rest anchor surface.
const REST_POSITION_SURFACE = ["mesial", "distal", "lingual"];
// Retainer_Clasp_type / Retainer_Ring_type (0..3) -> clasp anchor surface.
const CLASP_ORIENT_SURFACE = ["mesial_buccal", "mesial_lingual", "distal_buccal", "distal_lingual"];

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

/** Clasp anchor surface from a Retainer Clasp/Ring Type field (default mesial_buccal). */
function claspSurfaceFromField(f, field) {
  return CLASP_ORIENT_SURFACE[Number(f[field])] || "mesial_buccal";
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

  // Jaw major connector type, read up-front so per-tooth decode can reference it.
  const jawMcCode = Number(parsed?.other?.[MAJOR_CONNECTOR_KEY]);

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

    // Reciprocating element (Reciprocating.Tooth Type): 1=reciprocating-clasp, 2=plate-prox,
    // 3=plate-crossmesh. Plate uses a null surface; a reciprocating clasp gets a lingual anchor.
    // EXCEPTION: under a lower lingual PLATE (mc 7) the desktop stamps reciprocating=2 on every
    // present tooth as implied plating — decoding each into a plate-prox draws proximal plates
    // that overlap the plate body. Skip those (the plate already represents the plating); real
    // reciprocating clasps (1) and crossmesh plates (3) are still kept. The encoder re-derives
    // reciprocating=2 for a lingual plate from the connector type, so this round-trips.
    const recipId = RECIPROCATING_TYPE.get(Number(f[RECIPROCATING_FIELD]));
    if (recipId && !(jawMcCode === 7 && recipId === "plate-prox")) {
      const surface = recipId === "reciprocating-clasp" ? "mesial_lingual" : null;
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

  return design;
}

// ---- Encode: web state -> complete jaw-struct text -----------------------
// HYBRID encoder. Emits the full desktop field set (26 fields/tooth + the Mesh /
// Major / Minor / Ball tail). Fields the web 2D model owns are derived live from
// the placed components (presence, condition, mesh presence, tooth type, rests,
// retainer type + bar shape, mesh spans, major connector) so edits flow through.
// Fields the web can't model are PRESERVED from the loaded data via `rawOr`
// (tooth positions, Pr Config, bar mesial/distal side, clasp/ring orientation,
// the reciprocating framework flag, and the jaw-level Minor Connector grid + Ball
// connectors on state.jawStructTail). When a tooth has loaded raw, a load->Save
// round-trips byte-identical except the re-stamped "Start of Jaw Struct" time
// line (validated end-to-end in __tests__/jawStructRoundTrip.test.mjs); a from-scratch
// web design has no raw and falls back to the desktop defaults the samples use
// (positions 0, tissue stop / retention pin 0, orientation 0, paths 1, balls 0).

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

// The lower lingual connector's plate-vs-bar SHAPE lives in the 16x16 Minor
// Connector grid, not just the "Major Connector Type" label: the desktop routes
// a PLATE through Path D (StructData.cs Path index 6=distal / 7=mesial) and a BAR
// through Path G (12=distal / 13=mesial). The web doesn't model the grid (it only
// preserves what was loaded), so switching the type used to leave the desktop
// drawing the old shape. Here we re-route the active path segments to match the
// chosen type. Verified byte-exact against desktop case 1923 in both directions;
// idempotent, so a loaded design that already matches its type round-trips
// unchanged. Only applies to lower lingual bar(6) / plate(7); other connectors
// (and from-scratch designs with no active grid) pass through untouched.
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

function encodeToothLines(arrayIdx, fdi, rec, hasMesh, jawMajorCode) {
  // Loaded per-tooth fields (set on load by applyJawStructDesign). The web 2D
  // model doesn't carry tooth positions, Pr Config, bar mesial/distal side,
  // clasp/ring orientation or the reciprocating framework flag, so for those we
  // fall back to the loaded value; web-owned fields below are derived live so
  // edits flow through. A from-scratch web design has no raw -> uses defaults.
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
  // Bar side: loaded value wins; else derive from the placement surface.
  let barType = Number(rawOr(RETAINER_BAR_TYPE_FIELD, 0));
  if (!(RETAINER_BAR_TYPE_FIELD in raw) && barId) {
    const barPl = placements.find((p) => p.componentId === barId);
    barType = barPl && String(barPl.surface || "").includes("distal") ? 1 : 0;
  }

  // Reciprocating: web-owned, derived from the placed reciprocating clasp / plate so it
  // round-trips on save (previously only preserved from raw, so web-placed reciprocating
  // clasps and plates were lost). Falls back to the loaded value / desktop default when no
  // reciprocating component is placed. Decode pairs this with a retainer on the same tooth.
  // Explicit reciprocating-clasp / plate-crossmesh placements are distinct user
  // intent and win first. Then the LOWER lingual connector decides proximal
  // plating: a PLATE plates every present tooth (=2), a BAR plates none (=0) —
  // verified vs desktop case 1923. Deriving this from the connector TYPE (rather
  // than a placed plate-prox component) is what lets a plate->bar switch drop the
  // plate's per-tooth plating: loading a lingual plate decodes reciprocating=2
  // into plate-prox components, and without this they'd survive the switch and
  // reopen as a plate. Otherwise fall back to a placed plate-prox, then raw, else 0.
  let reciprocatingType;
  if (comps.includes("reciprocating-clasp")) reciprocatingType = 1;
  else if (comps.includes("plate-crossmesh")) reciprocatingType = 3;
  else if (jawMajorCode === 7 && rec?.isPresent) reciprocatingType = 2;
  else if (jawMajorCode === 6 && rec?.isPresent) reciprocatingType = 0;
  else if (comps.includes("plate-prox")) reciprocatingType = 2;
  else reciprocatingType = Number(rawOr(RECIPROCATING_FIELD, 0));

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
    ["Tooth Main.Tooth Rest.Pr Config 0", rawOr("Tooth Main.Tooth Rest.Pr Config 0", posteriorRest === 2 ? 0 : 1)],
    ["Tooth Main.Tooth Rest.Pr Config 1", rawOr("Tooth Main.Tooth Rest.Pr Config 1", 1)],
    ["Tooth Main.Tooth Rest.Pr Config 2", rawOr("Tooth Main.Tooth Rest.Pr Config 2", 1)],
    ["Tooth Main.Tooth Retainer.Retainer Type", retainerType],
    ["Tooth Main.Tooth Retainer.Retainer Clasp Type", rawOr(RETAINER_CLASP_TYPE_FIELD, 0)],
    ["Tooth Main.Tooth Retainer.Retainer Ring Type", rawOr(RETAINER_RING_TYPE_FIELD, 0)],
    ["Tooth Main.Tooth Retainer.Retainer Bar Type", barType],
    ["Tooth Main.Tooth Retainer.Retainer Bar Category", barCategory],
    ["Tooth Main.Tooth Reciprocating.Tooth Type", reciprocatingType],
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

  fdiOrder.forEach((fdi, arrayIdx) => {
    lines.push(...encodeToothLines(arrayIdx, fdi, state.teeth?.[fdi], meshFdi.has(fdi), mcCode));
  });

  lines.push(`Mesh Number: ${meshSpans.length}`);
  for (let i = 0; i < 8; i += 1) {
    const span = meshSpans[i];
    lines.push(`Tooth Mesh ${i}: Mesh Type: ${span ? span.meshType : 0}`);
    lines.push(`Tooth Mesh ${i}: Start Index: ${span ? span.start : -1}`);
    lines.push(`Tooth Mesh ${i}: End Index: ${span ? span.end : -1}`);
  }

  lines.push(`Major Connector Type: ${mcCode}`);
  // Minor-connector path grid + ball connectors aren't modeled by the web, so
  // emit the loaded values when available (preserved on state.jawStructTail),
  // falling back to the desktop init defaults (paths 1, balls 0). For a lower
  // lingual bar/plate we re-route the grid's active path to match the chosen
  // type so the desktop renders the right shape (see normalizeLingualGridForType).
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

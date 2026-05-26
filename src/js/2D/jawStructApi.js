/**
 * Jaw-struct fetch/save wrappers — mirrors the shape of clinicalInfo.js
 * and noticeboard.js: same API base, same MACHINE_ID, same
 * [{machine_id, uuid, caseIntID}, {case_id, ...}] payload envelope.
 *
 * The fetch endpoint is already in use in 2DAnnotation.js.
 * The save endpoint name + record shape is NOT confirmed with the backend.
 * See OPEN ITEM #1 in the plan. Until confirmed, saveJawStruct() will POST
 * with the most likely shape and log the result; callers are gated by
 * `enableJawStructAutosave` flag in 2DAnnotation.js.
 */
import { encodeJawStructBase64 } from "./jawStructCodec.js";

const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

function buildPayload(caseIntID, uuid, extra = {}) {
  return [
    { machine_id: MACHINE_ID, uuid, caseIntID },
    { case_id: caseIntID, ...extra },
  ];
}

async function postJson(path, payload) {
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const dt = Math.round(performance.now() - t0);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    console.warn(
      `[jawStructApi] ✕ POST ${path} status=${res.status} ${dt}ms ${body.slice(0, 200)}`
    );
    return { ok: false, status: res.status, body: null };
  }
  let body = null;
  try { body = await res.json(); } catch {}
  console.log(`[jawStructApi] ✓ POST ${path} status=${res.status} ${dt}ms`);
  return { ok: true, status: res.status, body };
}

/**
 * Fetch the jaw struct (upper + lower) for a case.
 * Returns the raw API array (or null on failure). Use decodeJawStructResponse
 * from jawStructCodec.js to parse it.
 */
export async function fetchJawStruct(caseIntID, uuid) {
  const { body } = await postJson("/jawstruct/l2/getall", buildPayload(caseIntID, uuid));
  return body;
}

/**
 * Save one jaw's struct text (already base64-encoded) back to the backend.
 * Endpoint + payload shape is unconfirmed — see file-level note.
 */
export async function saveJawStructJaw(caseIntID, uuid, type, base64Data, filename) {
  const payload = buildPayload(caseIntID, uuid, {
    type,                                  // "upper_jaw" | "lower_jaw"
    filename: filename || (type === "upper_jaw" ? "JawUpper_Struct_L2.txt" : "JawLower_Struct_L2.txt"),
    data: base64Data,
  });
  // Save path mirrors the GET path. Backend hasn't been verified for this — see file header.
  return postJson("/jawstruct/l2", payload);
}

/**
 * Convenience: encode both jaws from `state` and save them.
 * Returns { upper: {ok, status}, lower: {ok, status} }.
 */
export async function saveJawStructFromState(caseIntID, uuid, state) {
  const upperB64 = encodeJawStructBase64(state, "upper");
  const lowerB64 = encodeJawStructBase64(state, "lower");
  const [upperRes, lowerRes] = await Promise.all([
    saveJawStructJaw(caseIntID, uuid, "upper_jaw", upperB64),
    saveJawStructJaw(caseIntID, uuid, "lower_jaw", lowerB64),
  ]);
  return { upper: upperRes, lower: lowerRes };
}

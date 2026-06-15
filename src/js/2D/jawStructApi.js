/**
 * Jaw-struct fetch/save wrappers — mirrors the shape of clinicalInfo.js
 * and noticeboard.js: same API base, same MACHINE_ID, same
 * [{machine_id, uuid, caseIntID}, {case_id, ...}] payload envelope.
 *
 * Both endpoints are live: fetch via POST /jawstruct/l2/getall, save via
 * POST /jawstruct/l2 (returns {"successful":true}, upsert per case+type).
 * The save endpoint + payload shape were verified against the backend with
 * put_jawstruct_debug.sh. The Save button (saveAnnotation) drives the write.
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
 * Returns the raw API body on success (which the caller decodes), or null when
 * the request *fails* after retries.
 *
 * The first cross-origin POST on a freshly opened tab (cold TLS + CORS preflight,
 * no warm connection) can fail transiently. Callers treat a null/empty result as
 * "no server design" and reset to a clean arch, so a single transient failure
 * would silently blank a real design until the user refreshes. Retry the read so
 * that doesn't happen. A *successful* response (even an empty design) is returned
 * as-is and never retried — a genuinely empty case must stay empty.
 */
export async function fetchJawStruct(caseIntID, uuid, { retries = 2, retryDelayMs = 600 } = {}) {
  const payload = buildPayload(caseIntID, uuid);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await postJson("/jawstruct/l2/getall", payload);
    } catch (err) {
      // Network-level failure (fetch threw) — treat as a non-ok attempt.
      console.warn(`[jawStructApi] getall attempt ${attempt + 1} threw:`, err);
      res = { ok: false, status: 0, body: null };
    }
    if (res.ok) return res.body;
    if (attempt < retries) {
      console.warn(
        `[jawStructApi] getall attempt ${attempt + 1} failed (status=${res.status}); retrying in ${retryDelayMs}ms…`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  console.warn("[jawStructApi] getall failed after retries — no design loaded for this case");
  return null;
}

/**
 * Save one jaw's struct text (already base64-encoded) back to the backend.
 * POST /jawstruct/l2 upserts on (case_id, type) — see file-level note.
 */
export async function saveJawStructJaw(caseIntID, uuid, type, base64Data, filename) {
  const payload = buildPayload(caseIntID, uuid, {
    type,                                  // "upper_jaw" | "lower_jaw"
    filename: filename || (type === "upper_jaw" ? "JawUpper_Struct_L2.txt" : "JawLower_Struct_L2.txt"),
    data: base64Data,
  });
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

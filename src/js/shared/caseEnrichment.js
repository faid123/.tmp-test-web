// Per-case data the case-list row doesn't carry: the lazy-enrichment wire
// contract (details + co-owner roles), and the case's reference images.
// The queue/observer/breaker machinery and all DOM row-patching stay in
// caseManagement.js, which feeds resilientFetch(...) into
// applyEnrichmentResponses(). Both halves are covered by
// __tests__/caseEnrichment.test.mjs.

// uuid is passed in by the caller (the enrich queue already has the session
// user), so this module takes the constants only — not callerIdentity().
import { API_BASE, MACHINE_ID } from "./api.js";
import { logApi } from "./apiLog.js";

// Deliberately small: the backend 403-throttles request bursts (that's why the
// eager all-cases fan-out was removed). Bump only with backend coordination.
export const ENRICH_CONCURRENCY = 3;

// Case rows may carry the numeric UID as case_int_id or id depending on which
// endpoint produced them.
export function caseIntIdOf(caseObj) {
  return caseObj?.case_int_id ?? caseObj?.id;
}

// The two per-case requests, as [url, fetchOptions] pairs ready for
// resilientFetch/fetch. Body shapes must match the desktop app's calls.
export function buildEnrichRequests(caseIntID, uuid) {
  return [
    [
      `${API_BASE}/additionalcasedetails/getall`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ machine_id: MACHINE_ID, uuid, caseIntID }]),
      },
    ],
    [
      `${API_BASE}/role/all/get`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { machine_id: MACHINE_ID, uuid, caseIntID },
          { case_int_id: caseIntID },
        ]),
      },
    ],
  ];
}

// Fold the two responses into the case object. Returns false when BOTH are
// null — the backend refused (throttle/outage → resilientFetch null) — so the
// caller parks the case and retries after the breaker cooldown. A response
// that is merely !ok (a real 4xx answer) is terminal — retrying wouldn't
// change it — so it still returns true with the base fields kept.
export async function applyEnrichmentResponses(caseObj, detailRes, rolesRes, logApi = () => {}) {
  if (!detailRes && !rolesRes) return false;

  if (detailRes) {
    logApi(detailRes, "POST /additionalcasedetails/getall");
    if (detailRes.ok) {
      try {
        const item = (await detailRes.json()).at(-1); // 接口返回 [ {...} ]
        if (item && item.case_int_id) {
          Object.assign(caseObj, {
            expected_date: item.due_date,
            new_status: item.new_status,
            assigned_to: item.assigned_to,
            comments: item.comments,
          });
        }
      } catch {
        /* malformed body — keep base fields */
      }
    }
  }

  if (rolesRes) {
    logApi(rolesRes, "POST /role/all/get");
    if (rolesRes.ok) {
      try {
        const rows = await rolesRes.json();
        if (Array.isArray(rows)) {
          caseObj.co_owners = rows
            .filter((r) => r && r.role === "coowner" && r.username)
            .map((r) => r.username);
          // The role table is authoritative for ownership. Some cases (e.g.
          // SwiftRPD/3D-upload created) store a placeholder like "nobody" or a
          // raw uuid in `assigned_to`, so the desktop app shows the owner from
          // the `owner` role row instead. Match that: prefer the owner role's
          // username, then fall back to the uuid→username remap.
          const ownerRow = rows.find(
            (r) => r && String(r.role).toLowerCase() === "owner" && r.username
          );
          if (ownerRow?.username) {
            caseObj.assigned_to = ownerRow.username;
          } else {
            const match = rows.find((r) => r && r.uuid && r.uuid === caseObj.assigned_to);
            if (match?.username) caseObj.assigned_to = match.username;
          }
        }
      } catch {
        /* malformed body — keep base fields */
      }
    }
  }

  return true;
}

// --- Reference images -----------------------------------------------------
// The referenceImages table first, mirrored thumbnail slots as fallback (0-2
// are the 2D composite and the jaw renders, so 3+ are the references).

function refImagesCaller(caseIntID, uuid) {
  return { machine_id: MACHINE_ID, uuid, caseIntID };
}

// Rows are { image_name, image_data }, the data a data URL or bare base64.
export async function fetchCaseReferenceImages(caseIntID, uuid) {
  const res = await fetch(`${API_BASE}/referenceImages/getall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([refImagesCaller(caseIntID, uuid), { case_id: caseIntID }]),
  });
  logApi(res, "POST /referenceImages/getall");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : [data]).filter((row) => row?.image_data || row?.data);
}

function thumbnailSlot(row) {
  const v = row?.slot ?? row?.slot_index ?? row?.slot_id;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Fallback source, used only when the table has no rows for the case — which is
// every desktop-created case.
export async function fetchReferenceThumbnails(caseIntID, uuid) {
  try {
    const res = await fetch(`${API_BASE}/thumbnails/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([refImagesCaller(caseIntID, uuid), { case_int_id: caseIntID }]),
    });
    logApi(res, "POST /thumbnails/get");
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => r?.data && (thumbnailSlot(r) ?? -1) >= 3);
  } catch (err) {
    console.warn("[referenceImages] thumbnail fallback failed", err);
    return [];
  }
}

// Both sources merged. Rethrows a failed primary fetch only when the fallback
// found nothing either, so callers can tell "no images" from "lookup broke".
export async function fetchReferenceImageRows(caseIntID, uuid) {
  let rows = [];
  let primaryErr = null;
  try {
    rows = await fetchCaseReferenceImages(caseIntID, uuid);
  } catch (err) {
    primaryErr = err;
  }
  if (!rows.length) rows = await fetchReferenceThumbnails(caseIntID, uuid);
  if (!rows.length && primaryErr) throw primaryErr;
  return rows;
}

// Stored payloads carry no content type, so it comes from the base64 signature.
// PNG is the last resort — every image the web app writes back is one.
export function referenceImageMime(base64) {
  const head = String(base64 || "").slice(0, 12);
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lGOD")) return "image/gif";
  if (head.startsWith("Qk")) return "image/bmp";
  if (head.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

// A row as something an <img> can show; an existing data URL passes through.
export function referenceImageSrc(row) {
  const raw = String(row?.image_data ?? row?.data ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  const base64 = raw.replace(/\s+/g, "");
  return `data:${referenceImageMime(base64)};base64,${base64}`;
}

// Display name, falling back to a 1-based position — every thumbnail-slot row
// is stored without a name.
export function referenceImageTitle(row, index) {
  const raw = String(row?.image_name || row?.filename || row?.name || "").trim();
  return raw || `Reference ${index + 1}`;
}

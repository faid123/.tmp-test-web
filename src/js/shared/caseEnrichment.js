// Pure request/fold layer for the case-list lazy enrichment (details +
// co-owner roles for ONE visible case). Extracted from caseManagement.js's
// enrichOneCase so the wire contract is importable by both the app and
// __tests__/caseEnrichment.test.mjs — the queue/observer/breaker machinery and
// all DOM row-patching stay in caseManagement.js, which feeds the responses of
// resilientFetch(...) into applyEnrichmentResponses().

// uuid is passed in by the caller (the enrich queue already has the session
// user), so this module takes the constants only — not callerIdentity().
import { API_BASE, MACHINE_ID } from "./api.js";

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

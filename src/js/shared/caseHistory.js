import { apiUrl, callerIdentity, getLoggedInUser } from "./api.js";
import { logApi } from "./apiLog.js";

// Case history is an audit side-write. A failed history request must never turn
// a successful case/status operation into a user-visible failure.
export async function createCaseHistory(caseIntID, action, options = {}) {
  const user = getLoggedInUser();
  const actorId = options.userId ?? user?.uuid;
  const normalizedCaseId = Number(caseIntID);
  const normalizedAction = String(action ?? "").trim();

  if (!Number.isFinite(normalizedCaseId) || normalizedCaseId <= 0 || !actorId || !normalizedAction) {
    return false;
  }

  try {
    const res = await fetch(apiUrl("casehistory"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        callerIdentity({ caseIntID: normalizedCaseId }),
        {
          case_int_id: normalizedCaseId,
          user_id: actorId,
          action: normalizedAction,
          datetime: Math.floor(Date.now() / 1000),
        },
      ]),
    });
    logApi(res, "POST /casehistory");
    if (!res.ok) {
      console.warn(`[casehistory] failed to record "${normalizedAction}" (HTTP ${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[casehistory] failed to record "${normalizedAction}"`, err);
    return false;
  }
}


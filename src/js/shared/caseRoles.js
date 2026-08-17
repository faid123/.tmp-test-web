// Case role membership. The delete endpoint keys on case_int_id, NOT case_id —
// passing the case name silently removes nobody.

import { API_BASE } from "./api.js";
import { logApi } from "./apiLog.js";
import { confirmModal, toast } from "./toast.js";

// Confirms, then drops `user` from the case in window._inviteContext. Returns
// true only when the row was actually removed; callers own the UI that follows.
export async function confirmRemoveUserFromCase(user) {
  const confirmed = await confirmModal({
    title: "Remove user?",
    message: `Remove ${user.username} from this case? They'll lose access immediately.`,
    confirmText: "Remove",
    cancelText: "Cancel",
    variant: "danger",
  });
  if (!confirmed) return false;

  try {
    const { caseIntID, uuid, machine_id } = window._inviteContext;
    const res = await fetch(`${API_BASE}/role/delete`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id, uuid, caseIntID },
        { case_int_id: caseIntID, uuid: user.uuid },
      ]),
    });
    logApi(res, "PUT /role/delete");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error("Failed to remove user:", err);
    toast.error("Failed to remove user.");
    return false;
  }
}

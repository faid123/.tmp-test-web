import { lol } from "../../crypt.js";
import { state } from "./annotationState.js";

export function initializeCaseIds() {
  const params = new URLSearchParams(window.location.search);
  state.encryptedCaseId = params.get("id") || "";
  let parsedCaseId = null;

  if (state.encryptedCaseId) {
    try {
      const decrypted = Number(lol(state.encryptedCaseId));
      if (Number.isFinite(decrypted)) {
        parsedCaseId = decrypted;
      }
    } catch {
      parsedCaseId = null;
    }
  }

  state.caseIntID = parsedCaseId;
  const label = document.getElementById("caseLabel");
  if (label) {
    label.textContent = `Case: ${state.caseIntID ?? "Unknown"}`;
  }
}

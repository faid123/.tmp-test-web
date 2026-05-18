// Shared helpers for the per-case "Case Note" data (owner, date required, tooth shade,
// work category, comment). Persisted in localStorage under `caseNote:<caseIntID>`.
// TODO: swap localStorage for a server endpoint once the API is ready.

export const WORK_CATEGORY_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "metal", label: "Metal" },
  { value: "full-acrylic", label: "Full Acrylic" },
];

export const WORK_CATEGORY_LABELS = Object.fromEntries(
  WORK_CATEGORY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

const STORAGE_PREFIX = "caseNote:";

export function caseNoteStorageKey(caseIntID) {
  return `${STORAGE_PREFIX}${caseIntID ?? "unknown"}`;
}

export function loadCaseNote(caseIntID) {
  try {
    const raw = localStorage.getItem(caseNoteStorageKey(caseIntID));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCaseNote(caseIntID, note) {
  try {
    localStorage.setItem(caseNoteStorageKey(caseIntID), JSON.stringify(note));
    return true;
  } catch {
    return false;
  }
}

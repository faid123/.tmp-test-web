// Shared helpers for the per-case "Case Note" data (owner, date required, tooth shade,
// work category, comment). Most fields are persisted in localStorage under
// `caseNote:<caseIntID>` (no API for them yet). The "Date Required" field is the
// exception: it is the case's request/due date, whose source of truth is the
// backend (additionalcasedetails.due_date — the same value the case list "Due"
// column reads), so it is written through to the API by updateCaseDueDate below.

import { MACHINE_ID } from "../../config.js";

// API_BASE and getLoggedInUser are kept local to match the sibling 2D modules
// (noticeboard.js, clinicalInfo.js, jawStructApi.js): there's no shared export
// for either, and ApiClient.js can't be reused — it authenticates as the shared
// VIEWER_UUID for 3D downloads, whereas these case endpoints need the logged-in
// user's uuid. MACHINE_ID, however, is centralized in config.js, so import it.
const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

// POST `body` as JSON to `${API_BASE}/${path}`. Returns the Response, or null if
// the request itself throws (offline / CORS). Callers check `res?.ok`.
async function postJson(path, body) {
  try {
    return await fetch(`${API_BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export const WORK_CATEGORY_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "metal", label: "Metal" },
  { value: "full-acrylic", label: "Full Acrylic" },
];

export const WORK_CATEGORY_LABELS = Object.fromEntries(
  WORK_CATEGORY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

const STORAGE_PREFIX = "caseNote:";
const DUE_DATE_PREFIX = "caseDueDate:";

const storageKey = (prefix, caseIntID) => `${prefix}${caseIntID ?? "unknown"}`;

// localStorage wrappers that degrade gracefully when the store is unavailable
// (private mode / quota). lsSet removes the key for a null/empty value.
function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// Convert a case "Due Date" (Unix seconds/ms, or a date string) into the
// `YYYY-MM-DD` value an <input type="date"> expects. Mirrors the timestamp
// handling in caseManagement.js / dashboard.js `formatDateTime`. Returns "" for
// missing / invalid / pre-2000 values (the API sometimes returns "0").
export function toDateInputValue(ts) {
  if (ts == null || ts === "" || ts === 0 || ts === "0") return "";
  const n = Number(ts);
  let ms;
  if (Number.isFinite(n)) {
    if (n <= 0) return "";
    ms = String(n).length >= 13 ? n : n * 1000;
  } else {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    ms = d.getTime();
  }
  if (ms < 946684800000) return "";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Persist the case's Due Date (the case-list "Due" column) so the 2D design's
// Case Note can default its "Date Required" to it. The 2D page opens in a
// separate tab that can't read window.selectedCaseStub, but localStorage is
// shared same-origin. Stored already-normalized to `YYYY-MM-DD`.
export function saveCaseDueDate(caseIntID, isoDate) {
  return lsSet(storageKey(DUE_DATE_PREFIX, caseIntID), isoDate);
}

export function loadCaseDueDate(caseIntID) {
  return lsGet(storageKey(DUE_DATE_PREFIX, caseIntID)) || "";
}

// Convert an <input type="date"> value (`YYYY-MM-DD`) to the Unix *seconds*
// timestamp the additionalcasedetails `due_date` field uses (parsed in local
// time so the displayed day round-trips). Returns null for empty/invalid.
function dateInputToEpochSeconds(isoDate) {
  if (!isoDate) return null;
  const ms = Date.parse(`${isoDate}T00:00:00`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// Read the case's "additional details" row (status / assignee / comments / due
// date). POST /additionalcasedetails is a full upsert, so an update has to read
// these first to avoid clobbering the fields it isn't changing. Returns
// { ok, detail }: ok=false means the request itself failed (caller should NOT
// proceed with a write); detail=null with ok=true means no row exists yet.
export async function fetchAdditionalCaseDetails(caseIntID) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntID == null) return { ok: false, detail: null };
  const res = await postJson("additionalcasedetails/getall", [
    { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID },
  ]);
  if (!res?.ok) return { ok: false, detail: null };
  try {
    const arr = await res.json();
    const detail = Array.isArray(arr) ? arr.at(-1) ?? null : null;
    return { ok: true, detail };
  } catch {
    return { ok: false, detail: null };
  }
}

// Update the case's request/due date on the backend (the case-list "Due" column),
// and optionally its comment. additional_case_details is append-only (POST/create
// INSERTs a new row) and the frontend treats the latest row as current, so we read
// that row and re-post it with the changed fields — carrying assigned_to /
// new_status forward so they aren't lost. Bails out if the read fails, rather than
// risk nulling the other fields. `comment`: pass a string to write it through to
// additional_case_details.comments (shared with the case-level comment); omit
// (undefined) to preserve the existing comment. Returns true on success.
export async function updateCaseDueDate(caseIntID, isoDate, comment) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntID == null) return false;
  const { ok, detail } = await fetchAdditionalCaseDetails(caseIntID);
  if (!ok) return false;
  const comments =
    comment !== undefined ? (comment?.trim() ? comment : null) : detail?.comments ?? null;
  const res = await postJson("additionalcasedetails", [
    { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID },
    {
      assigned_to: detail?.assigned_to ?? null,
      due_date: dateInputToEpochSeconds(isoDate),
      comments,
      new_status: detail?.new_status ?? null,
    },
  ]);
  return res?.ok ?? false;
}

export function loadCaseNote(caseIntID) {
  const raw = lsGet(storageKey(STORAGE_PREFIX, caseIntID));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCaseNote(caseIntID, note) {
  return lsSet(storageKey(STORAGE_PREFIX, caseIntID), JSON.stringify(note));
}

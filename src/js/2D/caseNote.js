// Shared helpers for per-case "Case Note" data (owner, date required, shade, work
// category, comment). Most fields live in localStorage under `caseNote:<caseIntID>`
// (no API yet). Exception: "Date Required" is the case's due date, whose source of
// truth is the backend (additionalcasedetails.due_date, same as the case-list "Due"
// column), written through via updateCaseDueDate below.
//
// The Approve button's confirmation dialog lives at the bottom of this file
// (confirmCaseNoteApproval) along with the case-users/email calls it needs.

import { confirmModal, toast } from "../shared/toast.js";
import { API_BASE, MACHINE_ID, getLoggedInUser, apiPost } from "../shared/api.js";
import { buildThreeDViewerUrl } from "../shared/caseLinks.js";

// getLoggedInUser rather than ApiClient.js's shared VIEWER_UUID: these case
// endpoints authenticate as the signed-in user.

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

// Work Category mirrors the case's denture-base material (state.jawMaterial:
// 0 = metal, 2 = full acrylic, null = not chosen yet). "" when unset.
export const WORK_CATEGORY_JAW_MATERIAL = {
  0: "metal",
  2: "full-acrylic",
};

export function workCategoryForJawMaterial(material) {
  return WORK_CATEGORY_JAW_MATERIAL[material] ?? "";
}

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

// Convert a case Due Date (Unix sec/ms or date string) to the `YYYY-MM-DD` an
// <input type="date"> expects. Returns "" for missing/invalid/pre-2000 (the API
// sometimes returns "0").
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

// Persist the case Due Date so the 2D Case Note can default "Date Required" to it.
// The 2D tab can't read window.selectedCaseStub, but localStorage is shared
// same-origin. Stored already-normalized to `YYYY-MM-DD`.
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

// Read the case's "additional details" row (status/assignee/comments/due date).
// POST /additionalcasedetails is a full upsert, so an update must read first to
// avoid clobbering unchanged fields. Returns { ok, detail }: ok=false = request
// failed (don't write); detail=null with ok=true = no row yet.
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

// Update the case's due date (and optionally its comment) on the backend.
// additional_case_details is append-only and the latest row is current, so read
// that row and re-post with changed fields, carrying assigned_to/new_status
// forward. Bails if the read fails (rather than null the other fields). `comment`:
// string writes it through; undefined preserves the existing one. Returns true on success.
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
// The status strings the backend stores for an approved design. Both are values
// the case list already filters on (see its status <select>) — not new labels.
export const STATUS_2D_DESIGN_APPROVED = "2D design approved";
export const STATUS_3D_DESIGN_APPROVED = "3D design approved";

// Set the case's status. Same full-upsert rule as updateCaseDueDate: read the
// current row and carry assigned_to/due_date/comments forward, or they come back
// null. Bails without writing if the read fails. Returns true on success.
export async function updateCaseStatus(caseIntID, newStatus) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntID == null) return false;
  const { ok, detail } = await fetchAdditionalCaseDetails(caseIntID);
  if (!ok) return false;
  const res = await postJson("additionalcasedetails", [
    { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID },
    {
      assigned_to: detail?.assigned_to ?? null,
      due_date: detail?.due_date ?? null,
      comments: detail?.comments ?? null,
      new_status: newStatus,
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

// ---------------------------------------------------------------------------
// Case users + email. Used by the Approve confirmation dialog below to show who
// is on the case and notify them.
// ---------------------------------------------------------------------------

// Loose on purpose: the backend is the real validator. This only catches the
// obvious typo before spending a request.
export const EMAIL_RE = /^\S+@\S+\.\S+$/;

// The people attached to a case, from the role table — the same source the
// dashboard's Access panel and the case list's co-owner column use.
//
// Returns { ok, users } where users is [{ username, role, uuid, email }].
// ok=false means the request failed (offline / refused), which the caller shows
// differently from a case that genuinely has no rows.
//
// `email` is unreliable — role rows generally don't carry one. Sharing a case
// never captures an address either: it resolves a typed username to a uuid and
// writes a role row, and the invite is an in-app /alerts row, not mail. See
// fetchCaseUsersWithEmails for the two lookups that fill the gaps. Per-case
// addresses do exist server-side via POST /mailinglist/add, but that endpoint is
// write-only — a mailinglist read would make recipients reliable.
export async function fetchCaseUsers(caseIntID) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntID == null) return { ok: false, users: [] };
  const res = await postJson("role/all/get", [
    { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID },
    { case_int_id: caseIntID },
  ]);
  if (!res?.ok) return { ok: false, users: [] };
  try {
    const rows = await res.json();
    if (!Array.isArray(rows)) return { ok: true, users: [] };
    // The role table can hold more than one row per person (a re-share writes
    // another), so collapse on uuid, falling back to the username.
    const byKey = new Map();
    for (const row of rows) {
      if (!row) continue;
      const username = row.username || "";
      const email = row.email || "";
      if (!username && !email) continue;
      const key = row.uuid || username.toLowerCase();
      const existing = byKey.get(key);
      // Prefer whichever duplicate actually carries an address.
      if (existing && (existing.email || !email)) continue;
      byKey.set(key, {
        username: username || email.split("@")[0],
        role: row.role || "",
        uuid: row.uuid || "",
        email,
      });
    }
    // Owner first, then co-owners, then anything else — matches the reading
    // order of the dashboard's Access table.
    const rank = (r) => (r === "owner" ? 0 : r === "coowner" ? 1 : 2);
    const users = [...byKey.values()].sort(
      (a, b) =>
        rank(String(a.role).toLowerCase()) - rank(String(b.role).toLowerCase()) ||
        a.username.localeCompare(b.username)
    );
    return { ok: true, users };
  } catch {
    return { ok: false, users: [] };
  }
}

// Human-readable role for the UI ("coowner" reads better hyphenated, same call
// the dashboard's Access panel makes).
export function roleLabel(role) {
  const r = String(role || "").toLowerCase();
  if (r === "coowner") return "co-owner";
  return role || "—";
}

// Join an email's lines into its wire form. The mailer renders /sendCustomEmail's
// message as HTML, where a "\n" is just whitespace — a body joined with newlines
// arrives as one long run-on line — so the breaks have to be <br>. Text is escaped
// first or a case name carrying & or < would break the markup, and the trailing
// "\n" keeps the raw source readable. Every custom email this app sends goes
// through here; pass "" for a blank line.
export function emailBodyHtml(lines) {
  return lines
    .map((line) =>
      String(line).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]))
    )
    .join("<br>\n");
}

// Send one message to one address via POST /sendCustomEmail. Unlike the
// case endpoints above this takes a FLAT body — no [{auth}, {payload}] wrapper —
// and no uuid, matching the 3D viewer's existing call. The endpoint sends to a
// single address, so a multi-recipient send is one request per person.
//
// `images` are [{ src, alt }] with src a data URL; the mailer renders them under
// the message. Omitted from the payload when empty, so a text-only send stays the
// exact request it has always been.
// Returns true on success.
export async function sendCustomEmail({ email, subject, message, images }) {
  if (!email || !EMAIL_RE.test(email)) return false;
  const res = await postJson("sendCustomEmail", {
    customEmail: email,
    subject: subject || "SmartRPD notification",
    message: message || "",
    ...(images?.length ? { images } : {}),
  });
  return res?.ok ?? false;
}

// The backend renders this verbatim on the email's "Action:" line and derives
// the subject from it, so the wording is part of the email's format — changing
// it changes the subject line too. Only reaches the fallback path below.
const ACTION_2D_APPROVED = "Your 2D Design has been APPROVED.";

// user/getall is the only endpoint that maps a username to an email address —
// role rows don't carry one — and it is admin-gated, answering 401 for everyone
// else. Filter mirrors adminUsers.js: no date bounds, no search, and
// limitStartIndex/limitAmount both 0 so the model omits its LIMIT clause and
// returns every user in one call.
const ALL_USERS_FILTER = {
  fromDate: 0,
  toDate: 0,
  search: "",
  sortBy: 1,
  sortByAscending: true,
  limitStartIndex: 0,
  limitAmount: 0,
};

// Per-user lookup by username — the same call the case-share box makes to turn a
// typed name into a user before writing its role row. Unlike user/getall it takes
// no uuid and is not is_admin-gated, so it is the only address source a non-admin
// has. Whether the row it returns carries an `email` at all is the backend's
// call; "" here means it didn't, which is not an error.
async function lookupUserEmail(username) {
  if (!username) return "";
  const res = await postJson("user/checkifusernameexists/get", [
    { machine_id: MACHINE_ID },
    { username },
  ]);
  if (!res?.ok) return "";
  try {
    const body = await res.json();
    const email = (Array.isArray(body) ? body[0] : body)?.email || "";
    return EMAIL_RE.test(email) ? email : "";
  } catch {
    return "";
  }
}

// fetchCaseUsers plus each user's address where one can be resolved. Three
// sources, cheapest first, each only covering what the previous left missing:
// the roster row itself, then user/getall (one call, admins only), then a
// per-username lookup (one call each). `email` is "" for anyone still
// unresolved. Used by the notification below and by the 3D approval dialog's
// recipient checkboxes.
export async function fetchCaseUsersWithEmails(caseIntID) {
  const { ok, users } = await fetchCaseUsers(caseIntID);
  if (!ok || !users.length) return { ok, users };

  // Whatever addresses the roster already carries win; the admin call is only
  // needed for the rest, and is skipped entirely when nothing is missing.
  const byName = new Map(
    users.filter((u) => u.email).map((u) => [u.username.toLowerCase(), u.email])
  );
  if (byName.size < users.length) {
    try {
      const rows = await apiPost("user/getall", ALL_USERS_FILTER);
      for (const row of Array.isArray(rows) ? rows : []) {
        const name = String(row?.username || "").toLowerCase();
        if (name && row?.email && !byName.has(name)) byName.set(name, row.email);
      }
    } catch {
      /* 401 for non-admins, or offline — keep whatever the roster gave us */
    }
  }

  // Still missing: ask per username. Bounded by the case's user count (a handful)
  // and skipped entirely when the steps above already resolved everyone, so this
  // never becomes a burst against the throttler.
  const unresolved = users.filter((u) => !byName.has(u.username.toLowerCase()));
  if (unresolved.length) {
    const found = await Promise.all(unresolved.map((u) => lookupUserEmail(u.username)));
    unresolved.forEach((u, i) => {
      if (found[i]) byName.set(u.username.toLowerCase(), found[i]);
    });
  }

  return {
    ok,
    users: users.map((u) => ({ ...u, email: byName.get(u.username.toLowerCase()) || "" })),
  };
}

// Addresses for the people attached to the case, as [{ username, email }].
// Returns [] when the caller isn't an admin or the lookup fails, which is the
// signal to fall back to the server-templated /sendEmail broadcast rather than
// drop the notification.
async function fetchCaseUserEmails(caseIntID) {
  const { users } = await fetchCaseUsersWithEmails(caseIntID);
  return users
    .map((u) => ({ username: u.username, email: u.email }))
    .filter((u) => EMAIL_RE.test(u.email));
}

// The approval notification, composed in full here. /sendCustomEmail takes a
// literal subject and message, where /sendEmail renders a server-side template
// (a "SmartRPD Viewer Notification" heading plus Action/Last Edited/Edited By
// rows) that no field in its payload can change.
function approvalBroadcast(caseLabel, viewerUrl) {
  return {
    subject: `CASE ${caseLabel} 3D Ready`,
    message: emailBodyHtml([`Case ID: ${caseLabel}`, "", "Case Link:", viewerUrl]),
  };
}

// Notify everyone attached to the case. POST /sendEmail takes the CASE, not a
// recipient — the backend resolves who to mail from case_int_id — so this is the
// only call that reaches all the case's users without needing an address for
// each of them (there is no non-admin endpoint that would give us those; see
// fetchCaseUsers).
//
// Flat body, no [{auth}, {payload}] wrapper and no uuid. Every field maps to one
// labelled line of the backend's "SmartRPD Viewer Notification" template:
// action → Action, case_id → Case ID, last_edited → Last Edited, username →
// Edited By, viewer_url → Case Link, thumbnail → 2D Preview. The template itself
// is server-side; this payload is the whole of what the web app controls.
//
// The report page rides along in `thumbnail` as a PNG data URL — the only slot
// in this payload that takes a file. Even downscaled it is much larger than a
// real thumbnail, so a send that fails is retried once without it: a
// notification that arrives without the report beats no notification.
export async function sendCaseApprovalEmail(
  caseIntID,
  { caseName = "", caseOwner = "" } = {}
) {
  const caseLabel = caseName || resolveCaseLabel(caseIntID);
  const viewerUrl = buildThreeDViewerUrl(caseIntID, { forShare: true });

  // Preferred path: one message per person, with the subject and the whole body
  // written here. Needs an address for each recipient, so it only runs when the
  // approver is an admin (see fetchCaseUserEmails). One failed recipient doesn't
  // sink the rest — any success counts as sent.
  const recipients = await fetchCaseUserEmails(caseIntID);
  if (recipients.length) {
    const { subject, message } = approvalBroadcast(caseLabel, viewerUrl);
    const sent = await Promise.all(
      recipients.map((r) => sendCustomEmail({ email: r.email, subject, message }))
    );
    if (sent.some(Boolean)) return true;
    console.warn("[API] ✗ POST /sendCustomEmail failed for every recipient");
  }

  // Fallback: the server-templated broadcast. Its layout and subject are not
  // ours to set, but it needs no addresses — so it is what reaches the case's
  // users when the approver isn't an admin — and it carries the report image.
  const body = {
    action: ACTION_2D_APPROVED,
    case_id: caseLabel,
    case_int_id: caseIntID,
    // We have just edited the design, so "now" is the truthful last-edited
    // stamp; the 3D viewer read its own from /case/get.
    last_edited: new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 19),
    // Required: /sendEmail 400s with "Missing action, case_id, or username" if
    // this is absent or empty, so it falls back to the signed-in user rather
    // than sending "".
    username: caseOwner || getLoggedInUser()?.username || "Unknown",
    viewer_url: viewerUrl,
    thumbnail: await cachedReportPng(),
  };

  let res = await postJson("sendEmail", body);
  if (!res?.ok && body.thumbnail) {
    res = await postJson("sendEmail", { ...body, thumbnail: null });
  }
  // A failed send is otherwise silent apart from a generic toast, and the
  // payload is the only part of this email the web app controls — so log what
  // the server actually said about it.
  if (!res?.ok) {
    console.warn(
      `[API] ✗ POST /sendEmail status=${res?.status ?? "network error"}`,
      res ? await res.text().catch(() => "") : ""
    );
  }
  return res?.ok ?? false;
}

// In-app notifications for everyone else on the case — the bell on the
// notifications page — mirroring the case list's status-change alerts
// (caseManagement.js createStatusAlerts).
//
// Unlike email this IS per-individual and needs no address: /alerts is keyed by
// `to_user`, a username, which role rows do reliably carry. So it reaches people
// the mail can't, and is the channel that actually guarantees delivery.
//
// notifications.js renders "<from_user> has updated the status of <case> to
// <new_status>, with message “<alert_message>”" — so the message should add to
// the status line, not repeat it.
//
// Returns how many alerts were written; 0 on any failure. Never throws: a
// notification problem must not read as an approval problem.
export async function sendCaseApprovalAlerts(
  caseIntID,
  { statusLabel = "", alertMessage = "" } = {}
) {
  const me = getLoggedInUser();
  if (!me?.uuid || caseIntID == null) return 0;
  const fromUser = me.username || "";

  const { ok, users } = await fetchCaseUsers(caseIntID);
  if (!ok) return 0;

  // Same role filter the case list uses, minus yourself — you don't need to be
  // told about your own approval.
  const recipients = users
    .filter((u) => ["owner", "coowner", "lab"].includes(String(u.role).toLowerCase()))
    .map((u) => u.username)
    .filter((name) => name && name.toLowerCase() !== fromUser.toLowerCase());
  if (!recipients.length) return 0;

  const results = await Promise.all(
    recipients.map((toUser) =>
      postJson("alerts", [
        { machine_id: MACHINE_ID, uuid: me.uuid, caseIntID },
        {
          case_int_id: caseIntID,
          to_user: toUser,
          from_user: fromUser,
          new_status: statusLabel,
          alert_message: alertMessage,
          read_status: 0,
          deleted: 0,
        },
      ]).then((res) => Boolean(res?.ok))
    )
  );
  return results.filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// The confirmation step behind the Case Note's "Approve" button.
//
// Approving is case-level and visible to everyone on the case, so instead of a
// bare "are you sure?" this shows what is about to be approved and who it
// affects, in one dialog:
//
//   • a live preview of the generated report (the same document "Generate
//     Report" produces) with a Download PDF link.
//   • a read-only roster of the users attached to the case.
//   • a typed email address + Send Email, so the notification can go out before
//     the status flips rather than as a separate errand afterwards. Typed rather
//     than picked because no non-admin endpoint returns other users' addresses.
//   • Approve / Cancel, which resolve the returned promise.
//
// Sending email is deliberately independent of the Approve/Cancel result: the
// notification is its own action with its own feedback, and cancelling after
// sending must not pretend the mail was unsent.
//
// noticeboard.js is imported dynamically — it pulls in the whole report/
// clinical-info graph, which is dead weight until someone actually opens this
// dialog. (It also keeps this module out of a static import cycle, since
// noticeboard.js imports both 2DAnnotation.js and this file.)
// ---------------------------------------------------------------------------

// The topbar label ("Case: UID 12 : name") is what the user sees on screen, so
// the report should carry the same string. Falls back to the numeric id.
export function resolveCaseLabel(caseIntID) {
  const topbarLabel = (document.getElementById("caseLabel")?.textContent || "")
    .replace(/^Case:\s*/i, "")
    .trim();
  return topbarLabel || String(caseIntID ?? "Unknown");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ── report, built ahead of the dialog ───────────────────────────────────────

// Building the report takes seconds — it gathers thumbnails, clinical notes and
// the 2D preview over the network, then rasterizes the result — so it is built
// BEFORE the dialog opens and cached here. The dialog then mounts a document
// that already exists, instead of showing a "generating…" placeholder.
//
// One render yields two things: the page as an image (what the dialog shows) and
// the same page as an A4 PDF (what the Download button saves).
//
// The cache key carries a design signature as well as the case, so editing the
// design after a warm-up invalidates it and the approver is never shown a report
// that no longer matches the screen.
let approvalReport = null; // { key, promise, pdfUrl }

// Build (or reuse) the approval report, resolving to { imageUrl, pdfUrl }. Safe
// to call speculatively: a repeat call with the same case + signature returns
// the in-flight or finished promise rather than starting another render.
export function prepareApprovalReport(caseIntID, { caseOwner = "", signature = "" } = {}) {
  const key = `${caseIntID}::${signature}`;
  if (approvalReport?.key === key) return approvalReport.promise;
  releaseApprovalReport();

  const promise = (async () => {
    const [{ buildReportHtml }, { reportHtmlToPreview }] = await Promise.all([
      import("./noticeboard.js"),
      import("../shared/accessibility.js"),
    ]);
    // twoDPreviewSrc omitted on purpose: buildReportHtml then fetches the latest
    // 2D instruction preview itself, so the report matches what is saved on the
    // server rather than whatever this tab happens to hold.
    const html = await buildReportHtml(caseIntID, {
      caseLabel: resolveCaseLabel(caseIntID),
      caseOwner,
      autoPrint: false,
    });
    const { imageUrl, pngUrl, pdfBlob } = await reportHtmlToPreview(html);
    const pdfUrl = URL.createObjectURL(pdfBlob);
    // The design may have changed while this was rendering, in which case a
    // newer build already owns the cache — drop this one rather than leak it.
    if (approvalReport?.key === key) approvalReport.pdfUrl = pdfUrl;
    else URL.revokeObjectURL(pdfUrl);
    return { imageUrl, pngUrl, pdfUrl };
  })();

  approvalReport = { key, promise, pdfUrl: "" };
  // Warm-ups are fired without awaiting, so swallow the rejection here to keep
  // it off the console as "unhandled"; the awaiting caller still sees it.
  promise.catch(() => {});
  return promise;
}

// Drop the cached report and release the PDF's object URL. Called when the cache
// is superseded; exported so a case teardown can reclaim the memory. (imageUrl
// is a data URL, so it needs no revoking.)
export function releaseApprovalReport() {
  if (approvalReport?.pdfUrl) URL.revokeObjectURL(approvalReport.pdfUrl);
  approvalReport = null;
}

// The report page as a PNG data URL from the cache, or null. Deliberately never
// starts a build: a notification must not wait on one, and by the time this is
// called the dialog has already forced the build anyway.
async function cachedReportPng() {
  if (!approvalReport) return null;
  try {
    return (await approvalReport.promise).pngUrl || null;
  } catch {
    return null;
  }
}

// ── report preview ──────────────────────────────────────────────────────────

// Shows the rendered report on an A4 portrait sheet — the same page the
// Download button saves, laid out the same way (see jpegToPdfBlob: fit inside
// the margins preserving aspect ratio, then centre). The sheet's proportions and
// margin live in CSS so the preview stays a true A4 at any panel width.
//
// Deliberately NOT an <iframe> at the PDF: that hands the panel to the browser's
// PDF viewer, which wraps the document in its own toolbar, zoom control,
// thumbnail rail and a blob UUID where a filename should be.
//
// `report` is already resolved by the time this runs, so there is no loading
// state. A null `report` means the build failed, which is shown in place of the
// page: a broken report must not block approving.
function buildPreviewSection(caseIntID, report) {
  const section = el("section", "cn-approve-section cn-approve-section--preview");

  const head = el("div", "cn-approve-section-head");
  head.appendChild(el("h4", "cn-approve-section-title", "Report preview"));
  const wrap = el("div", "cn-approve-preview");

  if (!report?.imageUrl) {
    section.appendChild(head);
    wrap.appendChild(
      el("div", "cn-approve-preview-state is-error", "Couldn't generate the report.")
    );
    section.appendChild(wrap);
    return section;
  }

  // An <a download> rather than a button: the PDF already exists, so saving it
  // is a plain link, not a print round-trip.
  const downloadLink = el("a", "cn-approve-print-btn", "Download PDF");
  downloadLink.href = report.pdfUrl;
  downloadLink.download = `case_${caseIntID ?? "report"}_report.pdf`;
  head.appendChild(downloadLink);
  section.appendChild(head);

  const sheet = el("div", "cn-approve-page");
  const page = document.createElement("img");
  page.className = "cn-approve-page-img";
  page.src = report.imageUrl;
  page.alt = "Generated case report";
  sheet.appendChild(page);
  wrap.appendChild(sheet);
  section.appendChild(wrap);

  return section;
}

// ── who is on the case ──────────────────────────────────────────────────────

// A read-only roster: who is attached to the case, by username and role. It is
// NOT a recipient picker — this dialog reads the plain /role/all/get rows, which
// mostly carry no address. Mail goes to an address typed by hand below, plus the
// broadcast approving fires. (The 3D approval dialog does pick recipients, off
// fetchCaseUsersWithEmails — switch this list to that if the same is wanted here.)
function buildRecipientsSection(caseIntID) {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", "Users on this case"));

  const list = el("div", "cn-approve-users");
  list.appendChild(el("p", "cn-approve-users-state", "Loading users…"));
  section.appendChild(list);

  (async () => {
    const { ok, users } = await fetchCaseUsers(caseIntID);
    list.innerHTML = "";
    if (!ok) {
      list.appendChild(
        el("p", "cn-approve-users-state is-error", "Couldn't load the users on this case.")
      );
      return;
    }
    if (!users.length) {
      list.appendChild(el("p", "cn-approve-users-state", "No users found on this case."));
      return;
    }
    for (const user of users) {
      const row = el("div", "cn-approve-user");

      const icon = el("span", "cn-approve-user-icon");
      icon.innerHTML = '<i class="fa-regular fa-user" aria-hidden="true"></i>';
      row.appendChild(icon);

      const nameRow = el("span", "cn-approve-user-name");
      nameRow.appendChild(el("span", "cn-approve-user-username", user.username));
      const role = String(user.role || "").toLowerCase();
      const badge = el("span", "cn-approve-user-role", roleLabel(user.role));
      if (role === "owner") badge.classList.add("is-owner");
      nameRow.appendChild(badge);
      row.appendChild(nameRow);

      list.appendChild(row);
    }
  })();

  return section;
}

// ── custom email + send ─────────────────────────────────────────────────────

// THE email this app sends — both Send Email buttons (the 2D Case Note dialog and
// the 3D Request dialog) use this one body, so the wording is edited here and
// nowhere else. Composed rather than typed because /sendCustomEmail carries no
// case context of its own: everything the recipient needs has to be in the text.
//
//   recipient — a case user, so the mail can open with their name. The one
//               hand-typed address in each dialog has no user behind it, and is
//               sent the same body without the greeting.
//   link      — where to go: the 2D dialog sends this page's own URL, the 3D one
//               the viewer's.
export function caseEmailBody(caseIntID, { recipient, link } = {}) {
  const sender = getLoggedInUser()?.username || "";
  const lines = [];
  if (recipient?.username) lines.push(`Hi ${recipient.username}`, "");
  lines.push(
    `Case: ${resolveCaseLabel(caseIntID)}`,
    "",
    `Here is the: ${link}`,
    "",
    "Please confirm if it is ok to go on?",
    "Thanks"
  );
  if (sender) lines.push("", `Sent by ${sender}.`);
  return emailBodyHtml(lines);
}

// One typed address, since the roster above this is read-only.
function buildEmailSection(caseIntID) {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", "Send email"));

  const row = el("div", "cn-approve-message-row");

  const input = document.createElement("input");
  input.type = "email";
  input.className = "cn-approve-email-input";
  input.placeholder = "Enter email address";
  input.autocomplete = "email";
  input.setAttribute("aria-label", "Email address");
  row.appendChild(input);

  const side = el("div", "cn-approve-message-side");
  const sendBtn = el("button", "cn-approve-send-btn", "Send Email");
  sendBtn.type = "button";
  const status = el("span", "cn-approve-send-status");
  status.setAttribute("aria-live", "polite");
  side.appendChild(sendBtn);
  side.appendChild(status);
  row.appendChild(side);
  section.appendChild(row);

  const setStatus = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  };

  const send = async () => {
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      setStatus("Enter a valid email address.", true);
      input.focus();
      return;
    }

    sendBtn.disabled = true;
    setStatus("Sending…");
    const ok = await sendCustomEmail({
      email,
      subject: `${resolveCaseLabel(caseIntID)} 3D Ready`,
      // This dialog only ever runs on the 2D annotation page, so the page's own
      // URL already carries the right host and the encrypted `id` param.
      message: caseEmailBody(caseIntID, { link: window.location.href }),
    });
    sendBtn.disabled = false;

    if (ok) {
      // Short inline status, address in the toast — the status sits beside the
      // button in a narrow column and a full address there wraps over 3 lines.
      setStatus("Sent.");
      toast.success(`Email sent to ${email}.`);
      input.value = "";
    } else {
      setStatus("Send failed.", true);
      toast.error("Couldn't send the email.");
    }
  };

  sendBtn.addEventListener("click", send);
  // Enter in the field sends, but must not reach the dialog's Approve button.
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    send();
  });

  return section;
}

// ── entry point ─────────────────────────────────────────────────────────────

// Show the approval dialog. Resolves true when the user presses Approve, false
// on Cancel / Esc / backdrop click — same contract as confirmModal, so the
// caller's commit chain is unchanged.
//
// Awaits the report PDF before opening, so the dialog appears with the finished
// document already in it. Callers should warm the build with
// prepareApprovalReport() so that await is usually instant, and should show
// their own progress while this is pending.
export async function confirmCaseNoteApproval({
  caseIntID,
  caseNumber,
  caseOwner,
  statusLabel,
  signature = "",
} = {}) {
  let report = null;
  try {
    report = await prepareApprovalReport(caseIntID, { caseOwner, signature });
  } catch (err) {
    // A report that won't build is shown as such inside the dialog rather than
    // blocking the approval it is only there to inform.
    console.warn("[caseNote] approval report failed", err);
  }

  const content = el("div", "cn-approve");

  content.appendChild(
    el(
      "p",
      "cn-approve-lede",
      `Approving saves the case note and sets case ${caseNumber ?? caseIntID ?? "—"} to "${statusLabel}". Everyone on the case sees the new status.`
    )
  );

  // Two columns: what you review on the left, what you act on (recipients, the
  // message, Send) on the right — so the report stays in view while the
  // notification is written, instead of scrolling out from under it. The grid
  // collapses back to one column when the dialog is too narrow to split.
  const cols = el("div", "cn-approve-cols");
  cols.appendChild(buildPreviewSection(caseIntID, report));

  const side = el("div", "cn-approve-side");
  side.appendChild(buildRecipientsSection(caseIntID));
  side.appendChild(buildEmailSection(caseIntID));
  cols.appendChild(side);

  content.appendChild(cols);

  // No revoke on close: the cache owns the object URL, so reopening the dialog
  // reuses the same PDF instead of rebuilding it.
  return confirmModal({
    title: "Approve 2D design?",
    confirmText: "Approve",
    cancelText: "Cancel",
    variant: "warning",
    size: "lg",
    content,
  });
}

// Shared helpers for per-case "Case Note" data (owner, date required, shade, work
// category, comment). Most fields live in localStorage under `caseNote:<caseIntID>`
// (no API yet). Exception: "Date Required" is the case's due date, whose source of
// truth is the backend (additionalcasedetails.due_date, same as the case-list "Due"
// column), written through via updateCaseDueDate below.
//
// The Approve button's confirmation dialog lives at the bottom of this file
// (confirmCaseNoteApproval) along with the case-users/email calls it needs.

import { confirmModal, toast } from "../shared/toast.js";
import { API_BASE, MACHINE_ID, getLoggedInUser } from "../shared/api.js";

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
// The status string the backend stores for an approved 2D design.
export const STATUS_2D_DESIGN_APPROVED = "2D design approved";

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
// `email` is unreliable — role rows generally don't carry one, and there is no
// non-admin endpoint that maps a username to an address (user/getall is
// is_admin-gated). So this is a roster, NOT a recipient list: the approval
// dialog shows the names and takes the address by hand. Per-case addresses do
// exist server-side via POST /mailinglist/add, but that endpoint is write-only —
// a mailinglist read would be what makes automatic recipients possible.
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

// Send one message to one address via POST /sendCustomEmail. Unlike the
// case endpoints above this takes a FLAT body — no [{auth}, {payload}] wrapper —
// and no uuid, matching the 3D viewer's existing call. The endpoint sends to a
// single address, so a multi-recipient send is one request per person.
// Returns true on success.
export async function sendCustomEmail({ email, subject, message }) {
  if (!email || !EMAIL_RE.test(email)) return false;
  const res = await postJson("sendCustomEmail", {
    customEmail: email,
    subject: subject || "SmartRPD notification",
    message: message || "",
  });
  return res?.ok ?? false;
}

// Notify everyone attached to the case, the way the 3D viewer's Approve/Edit
// buttons do. POST /sendEmail takes the CASE, not a recipient — the backend
// resolves who to mail from case_int_id — so this is the only call that reaches
// all the case's users without needing an address for each of them (there is no
// non-admin endpoint that would give us those; see fetchCaseUsers).
//
// Flat body, no [{auth}, {payload}] wrapper and no uuid, matching
// viewer3d/index.js sendEmail(). `action` is the message text despite its name.
//
// The generated report page rides along in `thumbnail` as a PNG data URL — the
// same form the 3D viewer sends, and the only slot in this payload that takes a
// file. Even downscaled it is much larger than a real thumbnail, so a send that
// fails is retried once without it: a notification that arrives without the
// report beats no notification.
export async function sendCaseApprovalEmail(
  caseIntID,
  { caseName = "", caseOwner = "", statusLabel = "", viewerUrl = "" } = {}
) {
  const body = {
    action: `Your 2D Design has been APPROVED. Status: ${statusLabel}.`,
    case_id: caseName,
    case_int_id: caseIntID,
    // We have just written the note and flipped the status, so "now" is the
    // truthful last-edited stamp; the 3D viewer reads its own from /case/get.
    last_edited: new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 19),
    username: caseOwner,
    viewer_url: viewerUrl || window.location.href,
    thumbnail: await cachedReportPng(),
  };

  let res = await postJson("sendEmail", body);
  if (!res?.ok && body.thumbnail) {
    res = await postJson("sendEmail", { ...body, thumbnail: null });
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
function resolveCaseLabel(caseIntID) {
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
// NOT a recipient picker — /role/all/get carries no usable email address, so
// there is nothing to select. Mail goes to an address typed by hand below.
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

// The body is composed here rather than typed: /sendCustomEmail carries no case
// context of its own, so everything the recipient needs has to be in the text.
//
// The 2D link is this page's own URL — the dialog only ever runs on the 2D
// annotation page, so window.location.href already carries the right host and
// the encrypted `id` query param, with no need to re-encrypt the case id.
//
// Due date is read live from additionalcasedetails (the source of truth for the
// case-list "Due" column), falling back to the localStorage stash the Case Note
// form keeps, so a throttled request still yields the date on screen.
async function approvalEmailBody(caseIntID, { caseOwner, statusLabel }) {
  const { ok, detail } = await fetchAdditionalCaseDetails(caseIntID);
  const dueDate =
    (ok && toDateInputValue(detail?.due_date)) || loadCaseDueDate(caseIntID) || "Not set";
  const sender = getLoggedInUser()?.username || "";

  const lines = [
    `Case: ${resolveCaseLabel(caseIntID)}`,
    `Due date: ${dueDate}`,
    `User: ${caseOwner || "—"}`,
    `Status: ${statusLabel}`,
    "",
    "Open the 2D design:",
    window.location.href,
    "",
    "The generated design report is available from this case in SmartRPD.",
  ];
  if (sender) lines.push("", `Sent by ${sender}.`);
  return lines.join("\n");
}

// One typed address. Not a recipient picker: /role/all/get gives no addresses,
// so there is nothing to pick from.
function buildEmailSection(caseIntID, { caseOwner, statusLabel }) {
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
      subject: `SmartRPD — Case ${resolveCaseLabel(caseIntID)}`,
      message: await approvalEmailBody(caseIntID, { caseOwner, statusLabel }),
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
  side.appendChild(buildEmailSection(caseIntID, { caseOwner, statusLabel }));
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

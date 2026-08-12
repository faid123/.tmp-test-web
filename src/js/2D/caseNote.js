// Shared helpers for per-case "Case Note" data (owner, date required, shade, work
// category, comment). Most fields live in localStorage under `caseNote:<caseIntID>`
// (no API yet). Exception: "Date Required" is the case's due date, whose source of
// truth is the backend (additionalcasedetails.due_date, same as the case-list "Due"
// column), written through via updateCaseDueDate below.
//
// The Approve button's confirmation dialog lives at the bottom of this file
// (confirmCaseNoteApproval) along with the case-users/email calls it needs. Most
// of that dialog is shared with the 3D one, which imports its pieces from here
// (see preview3DApproval.js).

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
// `email` is mostly absent here — role rows generally don't carry one. Sharing a
// case never captures an address either: it resolves a typed username to a uuid
// and writes a role row, and the invite is an in-app /alerts row, not mail. Use
// fetchCaseUsersWithEmails when addresses are wanted; it fills the gaps.
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

// Address lookup by username — the same call the case-share box makes to turn a
// typed name into a user before writing its role row. It answers with the user's
// email, and takes only a machine_id, so it is NOT is_admin-gated: admins and
// non-admins resolve addresses through the identical path. (This replaced a first
// pass through the admin-only user/getall, which bought one batched request for
// admins and a 401 for everyone else.) "" means no usable address came back.
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

// fetchCaseUsers plus each user's address. Role rows rarely carry an email, so
// whoever is missing one is looked up by username — bounded by the case's user
// count (a handful), and skipped entirely when the roster already had them, so it
// never becomes a burst against the throttler. `email` is "" for anyone the
// lookup couldn't place. Used by the notification below and by the 3D approval
// dialog's recipient checkboxes.
export async function fetchCaseUsersWithEmails(caseIntID) {
  const { ok, users } = await fetchCaseUsers(caseIntID);
  if (!ok || !users.length) return { ok, users };

  const byName = new Map(
    users.filter((u) => u.email).map((u) => [u.username.toLowerCase(), u.email])
  );
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
//   • left: the case's two arches as they currently look, captured by the
//     caller. Each carries a checkbox — the ticked ones ride along on the email.
//   • left, below: an upload tile, for any other image the recipients should see
//     (a photo, a scan, a marked-up screenshot). Those are attached too.
//   • right: the case's owner / co-owners, each with a checkbox. These ARE the
//     recipients: fetchCaseUsersWithEmails resolves an address for each of them,
//     and a user it can't place is still listed, with the box disabled.
//   • right, below: a typed address + Send Email, so a recipient who isn't on
//     the case (or whose address didn't resolve) can still be notified.
//   • Approve / Cancel, which resolve the returned promise.
//
// The three right-hand pieces and the shots panel are SHARED with the 3D
// approval dialog (preview3DApproval.js imports them from here), so the two read
// as one flow. They differ only in what is being reviewed and where the email's
// link points — this one at the 2D page itself, that one at the 3D viewer.
//
// Sending email is deliberately independent of the Approve/Cancel result: the
// notification is its own action with its own feedback, and cancelling after
// sending must not pretend the mail was unsent.
// ---------------------------------------------------------------------------

// The topbar label ("Case: UID 12 : name") is what the user sees on screen, so
// the email should carry the same string. Falls back to the numeric id.
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

// ── what is being approved ──────────────────────────────────────────────────

// One panel per arch, upper above lower. `shots` holds PNG data URLs captured by
// the caller — the 2D dialog's arch renders, the 3D dialog's model renders; a
// null means that arch has nothing to show, which is said in place of the image
// rather than left as an empty frame.
//
// Each render carries a checkbox: ticked ones are attached to the email. Returns
// { section, selectedShots() } — the same { upper, lower } shape as `shots`, with
// an unticked arch nulled out, so the send path needs no other change.
//
// `noun` names what the panels hold ("2D design", "3D file"), and is what the
// empty state and the images' alt text are written from.
export function buildShotsSection(shots, { title = "Files", noun = "file" } = {}) {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", title));

  const boxes = {};
  const wrap = el("div", "cn-approve-shots");
  for (const [jaw, label] of [["upper", "Upper"], ["lower", "Lower"]]) {
    const figure = el("figure", "cn-approve-shot");

    // The caption is the checkbox's label, so the whole "Upper"/"Lower" line
    // toggles whether that render is sent.
    const caption = el("label", "cn-approve-shot-label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cn-approve-shot-check";
    // An arch with no render has nothing to attach, so its box is inert.
    box.checked = !!shots?.[jaw];
    box.disabled = !shots?.[jaw];
    box.setAttribute("aria-label", `Attach the ${label.toLowerCase()} render to the email`);
    boxes[jaw] = box;
    caption.appendChild(box);
    caption.appendChild(el("span", null, label));
    figure.appendChild(caption);

    const frame = el("div", "cn-approve-shot-frame");
    if (shots?.[jaw]) {
      const img = document.createElement("img");
      img.className = "cn-approve-shot-img";
      img.src = shots[jaw];
      img.alt = `${label} ${noun}`;
      frame.appendChild(img);
    } else {
      frame.appendChild(
        el("p", "cn-approve-shot-empty", `No ${label.toLowerCase()} ${noun}.`)
      );
    }
    figure.appendChild(frame);
    wrap.appendChild(figure);
  }

  section.appendChild(wrap);
  return {
    section,
    selectedShots: () => ({
      upper: boxes.upper.checked ? shots?.upper || null : null,
      lower: boxes.lower.checked ? shots?.lower || null : null,
    }),
  };
}

// ── uploaded attachments ────────────────────────────────────────────────────

// Anything wider than this is re-encoded before being attached. A photo off a
// phone is several thousand pixels across and travels as base64 in the request
// body, where one of them alone outweighs the whole rest of the message.
const ATTACHMENT_MAX_WIDTH = 1200;

// /sendCustomEmail's `images` is the only slot in the payload that takes a file,
// and the mailer renders each one under the message — so an attachment has to be
// an image. Anything else is refused with a reason rather than dropped.
const ATTACHMENT_ACCEPT = "image/*";

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

// One picked file as an { src, alt } attachment. Wide images are redrawn at
// ATTACHMENT_MAX_WIDTH as JPEG on a white ground — white because a transparent
// PNG renders black in some mail clients.
async function fileToAttachment(file) {
  const src = await readFileDataUrl(file);
  const img = await loadImage(src);
  if (img.naturalWidth <= ATTACHMENT_MAX_WIDTH) return { src, alt: file.name };

  const canvas = document.createElement("canvas");
  canvas.width = ATTACHMENT_MAX_WIDTH;
  canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * ATTACHMENT_MAX_WIDTH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL("image/jpeg", 0.9), alt: file.name };
}

// The upload tile under the renders, plus a strip of what has been added. Files
// arrive by click or by drop, and each tile can be removed again before sending.
//
// Returns { section, attachments() } — [{ src, alt }], ready for
// sendCustomEmail's `images`, read at send time so a file can be added or pulled
// without reopening the dialog.
export function buildAttachmentsSection() {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", "Attach files"));

  const items = [];

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ATTACHMENT_ACCEPT;
  input.multiple = true;
  input.className = "cn-approve-attach-input";

  const drop = el("button", "cn-approve-attach-drop");
  drop.type = "button";
  drop.innerHTML = '<i class="fa fa-cloud-arrow-up" aria-hidden="true"></i>';
  drop.appendChild(el("span", "cn-approve-attach-drop-text", "Upload files"));
  drop.appendChild(el("span", "cn-approve-attach-drop-hint", "Drag & drop or click to browse"));

  const list = el("div", "cn-approve-attach-list");
  const status = el("p", "cn-approve-attach-status");
  status.setAttribute("aria-live", "polite");

  const setStatus = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  };

  const renderList = () => {
    list.innerHTML = "";
    for (const item of items) {
      const tile = el("figure", "cn-approve-attach-tile");
      const img = document.createElement("img");
      img.className = "cn-approve-attach-thumb";
      img.src = item.src;
      img.alt = item.alt;
      tile.appendChild(img);

      const remove = el("button", "cn-approve-attach-remove", "×");
      remove.type = "button";
      remove.title = `Remove ${item.alt}`;
      remove.setAttribute("aria-label", `Remove ${item.alt}`);
      remove.addEventListener("click", () => {
        items.splice(items.indexOf(item), 1);
        renderList();
        setStatus(items.length ? `${items.length} file(s) attached.` : "");
      });
      tile.appendChild(remove);

      tile.appendChild(el("figcaption", "cn-approve-attach-name", item.alt));
      list.appendChild(tile);
    }
  };

  const add = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    setStatus("Reading…");

    const read = await Promise.all(
      images.map((file) =>
        fileToAttachment(file).catch((err) => {
          console.warn("[caseNote] attachment failed", file.name, err);
          return null;
        })
      )
    );
    items.push(...read.filter(Boolean));
    renderList();
    // The dialog body scrolls, and in the two-column layout the strip sits below
    // the fold — so a file added from the tile above would otherwise land out of
    // sight and read as nothing having happened.
    status.scrollIntoView({ block: "nearest" });

    // Says what was left out and why, rather than silently attaching fewer files
    // than were picked. The two reasons are counted apart: one is the file being
    // the wrong kind, the other the image not decoding.
    const notes = [];
    const rejected = files.length - images.length;
    const failed = images.length - read.filter(Boolean).length;
    if (rejected) notes.push(`${rejected} skipped — images only`);
    if (failed) notes.push(`${failed} couldn't be read`);
    const attached = `${items.length} file(s) attached.`;
    setStatus(notes.length ? `${attached} ${notes.join("; ")}.` : attached, notes.length > 0);
  };

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    add(input.files);
    // Cleared so picking the same file twice in a row still fires `change`.
    input.value = "";
  });

  // Drag & drop, matching the 3D preview's slot rows. dragover must be cancelled
  // or the browser navigates to the dropped file instead.
  drop.addEventListener("dragover", (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    add(e.dataTransfer?.files);
  });

  section.appendChild(drop);
  section.appendChild(input);
  section.appendChild(list);
  section.appendChild(status);

  return { section, attachments: () => items.map((i) => ({ src: i.src, alt: i.alt })) };
}

// ── who is on the case ──────────────────────────────────────────────────────

// The roster as checkboxes — this IS the recipient picker, since
// fetchCaseUsersWithEmails resolves an address for each user. Returns
// { section, selectedRecipients() }; the getter is what the email section reads
// at send time, so the two stay decoupled.
export function buildRecipientsSection(caseIntID) {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", "Users on this case"));

  const list = el("div", "cn-approve-users");
  list.appendChild(el("p", "cn-approve-users-state", "Loading users…"));
  section.appendChild(list);

  const boxes = [];

  (async () => {
    const { ok, users } = await fetchCaseUsersWithEmails(caseIntID);
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
      const hasEmail = EMAIL_RE.test(user.email);
      const row = el("label", "cn-approve-user is-pick");

      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "cn-approve-user-check";
      // Pre-selected when reachable: the point of the list is to notify the case,
      // so opting someone out should be the deliberate action.
      box.checked = hasEmail;
      box.disabled = !hasEmail;
      box.dataset.email = user.email || "";
      // Carried so the email can open with this user's name.
      box.dataset.username = user.username || "";
      box.setAttribute("aria-label", `Email ${user.username}`);
      row.appendChild(box);
      boxes.push(box);

      // Name + role on top, address underneath: side by side they fight over a
      // 280px column and both end up ellipsed.
      const text = el("span", "cn-approve-user-text");
      const nameRow = el("span", "cn-approve-user-name");
      nameRow.appendChild(el("span", "cn-approve-user-username", user.username));
      const badge = el("span", "cn-approve-user-role", roleLabel(user.role));
      if (String(user.role || "").toLowerCase() === "owner") badge.classList.add("is-owner");
      nameRow.appendChild(badge);
      text.appendChild(nameRow);
      // Says why a box is disabled, rather than leaving it looking broken: the
      // username lookup found no address for this user.
      text.appendChild(
        el("span", "cn-approve-user-email", hasEmail ? user.email : "no address available")
      );
      row.appendChild(text);
      if (!hasEmail) row.classList.add("is-unreachable");

      list.appendChild(row);
    }
  })();

  return {
    section,
    // { email, username } per tick — the username is what the mail greets.
    selectedRecipients: () =>
      boxes
        .filter((b) => b.checked && !b.disabled)
        .map((b) => ({ email: b.dataset.email, username: b.dataset.username })),
  };
}

// ── custom email + send ─────────────────────────────────────────────────────

// THE email this app sends — both approval dialogs use this one body, so the
// wording is edited here and nowhere else. Composed rather than typed because
// /sendCustomEmail carries no case context of its own: everything the recipient
// needs has to be in the text.
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
    "Here is the:",
    `${link}`,
    "",
    "Please confirm if it is ok to go on?",
    "",
    "Thanks"
  );
  if (sender) lines.push("", `Sent by ${sender}.`);
  return emailBodyHtml(lines);
}

// Custom-email send, used by both dialogs' Send Email button and by the approval
// itself. `recipients` are { email, username } — one request per address
// (/sendCustomEmail takes a single recipient), each greeted by name and carrying
// the same images. A failed address doesn't sink the rest. Returns the sent count.
//
// `link` is what the body points at; `images` are [{ src, alt }] data URLs.
// `subject` defaults to the case on its own — nothing else, which is what the 2D
// approval sends. The 3D dialog passes its own.
export async function sendCaseEmails(
  caseIntID,
  recipients,
  { link, images = [], subject = resolveCaseLabel(caseIntID) } = {}
) {
  if (!recipients?.length) return 0;

  const sendOne = async (recipient) => {
    const message = caseEmailBody(caseIntID, { recipient, link });
    const email = recipient.email;
    if (await sendCustomEmail({ email, subject, message, images })) return true;
    // The images make the request many times larger, so a failure is retried
    // without them: a notification that arrives without the renders beats no
    // notification.
    return images.length ? sendCustomEmail({ email, subject, message }) : false;
  };

  const results = await Promise.all(recipients.map(sendOne));
  return results.filter(Boolean).length;
}

// Send goes to the checked users AND the typed address, so a one-off recipient
// doesn't mean giving up the roster selection.
//
// Returns { section, pendingRecipients }: the addresses that have NOT already
// been sent to from here. Approving mails those, so ticking a user is enough —
// pressing Send Email first is optional, and doesn't cause a second copy.
//
// `images()` and `link()` are read at send time, so a render can be ticked or an
// attachment added without reopening the dialog. `subject` is passed through to
// sendCaseEmails, whose default (the case on its own) is what the 2D dialog uses.
//
// `sendButton` false leaves the section as just the address field: the 3D dialog
// confirms with "Send", which mails the same people, so a Send Email button
// beside it would be the same action twice.
export function buildEmailSection({
  caseIntID,
  selectedRecipients,
  images,
  link,
  subject,
  sendButton = true,
}) {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", "Send email"));

  const row = el("div", "cn-approve-message-row");

  const input = document.createElement("input");
  input.type = "email";
  input.className = "cn-approve-email-input";
  input.placeholder = "Add another email address";
  input.autocomplete = "email";
  input.setAttribute("aria-label", "Email address");
  row.appendChild(input);
  section.appendChild(row);

  // Addresses this dialog has already mailed, so approving afterwards doesn't
  // send the same person a second copy. Stays empty without the Send button.
  const alreadySent = new Set();

  // Deduped BY ADDRESS: the typed address is often someone already ticked in the
  // list, and the ticked copy is the one to keep — it carries the username the
  // mail greets, where the typed one is just an address.
  const chosen = () => {
    const typed = input.value.trim();
    const byEmail = new Map(selectedRecipients().map((r) => [r.email, r]));
    if (typed && EMAIL_RE.test(typed) && !byEmail.has(typed)) {
      byEmail.set(typed, { email: typed, username: "" });
    }
    return [...byEmail.values()];
  };

  if (sendButton) {
    const side = el("div", "cn-approve-message-side");
    const sendBtn = el("button", "cn-approve-send-btn", "Send Email");
    sendBtn.type = "button";
    const status = el("span", "cn-approve-send-status");
    status.setAttribute("aria-live", "polite");
    side.appendChild(sendBtn);
    side.appendChild(status);
    row.appendChild(side);

    const setStatus = (text, isError = false) => {
      status.textContent = text;
      status.classList.toggle("is-error", isError);
    };

    const send = async () => {
      const typed = input.value.trim();
      if (typed && !EMAIL_RE.test(typed)) {
        setStatus("Enter a valid email address.", true);
        input.focus();
        return;
      }
      const recipients = chosen();
      if (!recipients.length) {
        setStatus("Pick a user or enter an address.", true);
        return;
      }

      sendBtn.disabled = true;
      setStatus("Sending…");
      const sent = await sendCaseEmails(caseIntID, recipients, {
        link: link(),
        images: images(),
        subject,
      });
      sendBtn.disabled = false;

      if (sent === recipients.length) {
        for (const r of recipients) alreadySent.add(r.email);
        setStatus(`Sent to ${sent}.`);
        toast.success(`Email sent to ${recipients.map((r) => r.email).join(", ")}.`);
        input.value = "";
      } else if (sent) {
        // Which of them succeeded isn't reported per address, so none are marked
        // sent: approving may re-send, which beats silently dropping a recipient.
        setStatus(`Sent to ${sent} of ${recipients.length}.`, true);
        toast.warning(`Email failed for ${recipients.length - sent} recipient(s).`);
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
  } else {
    // Nothing to send from here, but Enter must still be swallowed — otherwise
    // it reaches the dialog and confirms from inside the address field.
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  return {
    section,
    pendingRecipients: () => chosen().filter((r) => !alreadySent.has(r.email)),
  };
}

// ── entry point ─────────────────────────────────────────────────────────────

// Show the 2D approval dialog. Resolves { confirmed, recipients, images }:
// `confirmed` is the Approve/Cancel answer, `recipients` the ticked (and typed)
// addresses still waiting to be mailed, `images` the ticked arch renders plus
// whatever was uploaded. NOT a boolean like confirmModal — the caller sends to
// those addresses, but only once the note and status writes have actually
// landed, so an approval that failed is never announced.
//
// `shots` are the two arch captures ({ upper, lower } PNG data URLs), taken by
// the caller from the live page — see captureArchThumbnails in annotationLocks.js.
export async function confirmCaseNoteApproval({
  caseIntID,
  caseNumber,
  statusLabel,
  shots = null,
} = {}) {
  const content = el("div", "cn-approve");

  content.appendChild(
    el(
      "p",
      "cn-approve-lede",
      `Approving saves the case note, sets case ${caseNumber ?? caseIntID ?? "—"} to "${statusLabel}" and emails the ticked users. Everyone on the case sees the new status.`
    )
  );

  // Design reviewed on the left, who to tell on the right — so the arches stay
  // in view while the notification is written. The grid collapses back to one
  // column when the dialog is too narrow to split.
  const cols = el("div", "cn-approve-cols");
  const renders = buildShotsSection(shots, { title: "2D design", noun: "arch design" });
  const uploads = buildAttachmentsSection();
  const main = el("div", "cn-approve-main");
  main.appendChild(renders.section);
  main.appendChild(uploads.section);
  cols.appendChild(main);

  // Everything that goes out with the mail: the ticked arches first, then the
  // uploads, in the order they were added.
  const images = () => [
    { src: renders.selectedShots().upper, alt: "Upper arch design" },
    { src: renders.selectedShots().lower, alt: "Lower arch design" },
    ...uploads.attachments(),
  ].filter((image) => !!image.src);

  const recipients = buildRecipientsSection(caseIntID);
  const email = buildEmailSection({
    caseIntID,
    selectedRecipients: recipients.selectedRecipients,
    images,
    // This dialog only ever runs on the 2D annotation page, so the page's own
    // URL already carries the right host and the encrypted `id` param.
    link: () => window.location.href,
  });
  const side = el("div", "cn-approve-side");
  side.appendChild(recipients.section);
  side.appendChild(email.section);
  cols.appendChild(side);

  content.appendChild(cols);

  const confirmed = await confirmModal({
    title: "Approve 2D design?",
    confirmText: "Approve",
    cancelText: "Cancel",
    variant: "warning",
    size: "lg",
    content,
  });

  // Read the ticks before the dialog's DOM goes away, and only when approving —
  // cancelling sends nothing.
  return {
    confirmed,
    recipients: confirmed ? email.pendingRecipients() : [],
    images: confirmed ? images() : [],
  };
}

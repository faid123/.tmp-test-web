// The confirmation step behind the "Other 3D files" panel's Request button.
//
// Same shape as the 2D Case Note's approval dialog (confirmCaseNoteApproval in
// caseNote.js) so the two read as one flow, but what is being reviewed differs:
// here it is the uploaded 3D files, shown as one render per arch, captured from
// the live preview by the caller.
//
//   • left: the upper and lower 3D files as they currently look.
//   • right: the case's owner / co-owners, each with a checkbox — unlike the 2D
//     dialog's read-only roster, these ARE recipients, because
//     fetchCaseUsersWithEmails resolves addresses when the caller is an admin.
//     A user whose address can't be resolved is listed with the box disabled.
//   • right, below: a typed address + Send Email, so a recipient who isn't on
//     the case (or whose address didn't resolve) can still be notified.
//
// Sending is independent of Approve/Cancel, as in the 2D dialog: cancelling
// after sending must not pretend the mail was unsent.

import { confirmModal, toast } from "../shared/toast.js";
import { buildThreeDViewerUrl } from "../shared/caseLinks.js";
import {
  EMAIL_RE,
  caseEmailBody,
  fetchCaseUsersWithEmails,
  resolveCaseLabel,
  roleLabel,
  sendCustomEmail,
} from "./caseNote.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ── the two captures ────────────────────────────────────────────────────────

// One panel per arch, upper above lower. `shots` holds PNG data URLs rendered
// from the live preview; a null means that arch has no 3D file loaded, which is
// shown in place of the image rather than as an empty frame.
//
// Each render carries a checkbox: ticked ones are attached to the email. Returns
// { section, selectedShots() } — the same { upper, lower } shape as `shots`, with
// an unticked arch nulled out, so the send path needs no other change.
function buildShotsSection(shots) {
  const section = el("section", "cn-approve-section");
  section.appendChild(el("h4", "cn-approve-section-title", "3D files"));

  const boxes = {};
  const wrap = el("div", "p3da-shots");
  for (const [jaw, label] of [["upper", "Upper"], ["lower", "Lower"]]) {
    const figure = el("figure", "p3da-shot");

    // The caption is the checkbox's label, so the whole "Upper"/"Lower" line
    // toggles whether that render is sent.
    const caption = el("label", "p3da-shot-label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "p3da-shot-check";
    // An arch with no render has nothing to attach, so its box is inert.
    box.checked = !!shots?.[jaw];
    box.disabled = !shots?.[jaw];
    box.setAttribute("aria-label", `Attach the ${label.toLowerCase()} render to the email`);
    boxes[jaw] = box;
    caption.appendChild(box);
    caption.appendChild(el("span", null, label));
    figure.appendChild(caption);

    const frame = el("div", "p3da-shot-frame");
    if (shots?.[jaw]) {
      const img = document.createElement("img");
      img.className = "p3da-shot-img";
      img.src = shots[jaw];
      img.alt = `${label} 3D files`;
      frame.appendChild(img);
    } else {
      frame.appendChild(el("p", "p3da-shot-empty", `No ${label.toLowerCase()} 3D file.`));
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

// ── recipients ──────────────────────────────────────────────────────────────

// The roster as checkboxes. Returns { section, selectedRecipients() }; the getter
// is what the email section reads at send time, so the two stay decoupled.
function buildRecipientsSection(caseIntID) {
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
      const row = el("label", "cn-approve-user p3da-user");

      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "p3da-user-check";
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
      const text = el("span", "p3da-user-text");
      const nameRow = el("span", "cn-approve-user-name");
      nameRow.appendChild(el("span", "cn-approve-user-username", user.username));
      const badge = el("span", "cn-approve-user-role", roleLabel(user.role));
      if (String(user.role || "").toLowerCase() === "owner") badge.classList.add("is-owner");
      nameRow.appendChild(badge);
      text.appendChild(nameRow);
      // Why a box is disabled, rather than leaving it looking broken: role rows
      // carry no address and user/getall is is_admin-gated.
      text.appendChild(
        el("span", "p3da-user-email", hasEmail ? user.email : "no address available")
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

// ── email ───────────────────────────────────────────────────────────────────

// The dialog's two renders as mail attachments. An arch with no 3D file has no
// capture, and is simply left out rather than sent as an empty image.
function shotAttachments(shots) {
  return [
    { src: shots?.upper, alt: "Upper jaw thumbnail" },
    { src: shots?.lower, alt: "Lower jaw thumbnail" },
  ].filter((image) => !!image.src);
}

// Custom-email send, used by both the Send Email button and the approval itself.
// `recipients` are { email, username } — one request per address
// (/sendCustomEmail takes a single recipient), each greeted by name and carrying
// the same two renders. A failed address doesn't sink the rest. Returns the sent
// count.
//
// The body is caseNote.js's caseEmailBody, the one this app sends everywhere;
// only the link differs — the 3D viewer's, `forShare` so a localhost dev URL is
// rewritten to the live host.
export async function sendApprovalEmails(caseIntID, recipients, shots) {
  if (!recipients?.length) return 0;
  const subject = `${resolveCaseLabel(caseIntID)} 3D Ready`;
  const link = buildThreeDViewerUrl(caseIntID, { forShare: true });
  const images = shotAttachments(shots);

  const sendOne = async (recipient) => {
    const message = caseEmailBody(caseIntID, { recipient, link });
    const email = recipient.email;
    if (await sendCustomEmail({ email, subject, message, images })) return true;
    // The images make the request many times larger, so a failure is retried
    // without them: a notification that arrives without the renders beats no
    // notification (the 2D report notification follows the same rule).
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
function buildEmailSection(caseIntID, selectedRecipients, selectedShots) {
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

  // Addresses this dialog has already mailed, so approving afterwards doesn't
  // send the same person a second copy.
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
    // Read the ticks at send time, so a render can be added or dropped without
    // reopening the dialog.
    const sent = await sendApprovalEmails(caseIntID, recipients, selectedShots());
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

  return {
    section,
    pendingRecipients: () => chosen().filter((r) => !alreadySent.has(r.email)),
  };
}

// ── entry point ─────────────────────────────────────────────────────────────

// Show the 3D approval dialog. Resolves { confirmed, recipients }: `confirmed` is
// the Approve/Cancel answer, `recipients` the ticked (and typed) addresses still
// waiting to be mailed. NOT a boolean like confirmModal — the caller sends to
// those addresses, but only once the status write has actually landed, so an
// approval that failed is never announced.
export async function confirmPreview3DApproval({
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
      `Approving sets case ${caseNumber ?? caseIntID ?? "—"} to "${statusLabel}" and emails the ticked users. Everyone on the case sees the new status.`
    )
  );

  // Files reviewed on the left, who to tell on the right — the same split the 2D
  // dialog uses, so the render stays in view while the notification is written.
  const cols = el("div", "cn-approve-cols");
  const renders = buildShotsSection(shots);
  cols.appendChild(renders.section);

  const recipients = buildRecipientsSection(caseIntID);
  const email = buildEmailSection(caseIntID, recipients.selectedRecipients, renders.selectedShots);
  const side = el("div", "cn-approve-side");
  side.appendChild(recipients.section);
  side.appendChild(email.section);
  cols.appendChild(side);

  content.appendChild(cols);

  const confirmed = await confirmModal({
    title: "Approve 3D design?",
    confirmText: "Send",
    cancelText: "Cancel",
    variant: "warning",
    size: "lg",
    content,
  });

  // Read the ticks before the dialog's DOM goes away, and only when approving —
  // cancelling sends nothing. `shots` comes back filtered to the ticked renders.
  return {
    confirmed,
    recipients: confirmed ? email.pendingRecipients() : [],
    shots: confirmed ? renders.selectedShots() : null,
  };
}

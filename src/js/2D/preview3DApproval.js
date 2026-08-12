// The confirmation step behind the "Other 3D files" panel's Request button.
//
// Almost all of it is the 2D Case Note's approval dialog (confirmCaseNoteApproval
// in caseNote.js), imported from there so the two read as one flow: the renders
// panel, the recipient checkboxes, the send box and the sender are the same code.
//
// What differs is only what is being reviewed and where the mail points:
//
//   • left: the uploaded 3D files, one render per arch, captured from the live
//     preview by the caller, with the same upload tile under them for anything
//     else worth sending.
//   • the email links to the 3D viewer rather than the 2D page.
//   • the email section has no Send button of its own — this dialog confirms with
//     "Send", which mails the same people, so the two would be one action twice.

import { confirmModal } from "../shared/toast.js";
import { buildThreeDViewerUrl } from "../shared/caseLinks.js";
import {
  buildAttachmentsSection,
  buildEmailSection,
  buildRecipientsSection,
  buildShotsSection,
  resolveCaseLabel,
  sendCaseEmails,
} from "./caseNote.js";

// This dialog's subject line. The 2D approval sends the case on its own (see
// sendCaseEmails' default); here the case is 3D-ready, and the mail says so.
const subjectFor = (caseIntID) => `${resolveCaseLabel(caseIntID)} 3D Ready`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// The dialog's two renders as mail attachments. An arch with no 3D file has no
// capture, and is simply left out rather than sent as an empty image.
function shotAttachments(shots) {
  return [
    { src: shots?.upper, alt: "Upper jaw thumbnail" },
    { src: shots?.lower, alt: "Lower jaw thumbnail" },
  ].filter((image) => !!image.src);
}

// The 3D approval's send: caseNote's shared sender, pointed at the 3D viewer.
// `forShare` so a localhost dev URL is rewritten to the live host. `images` are
// what the dialog handed back — the ticked renders plus any uploads. Returns the
// sent count.
export async function sendApprovalEmails(caseIntID, recipients, images) {
  return sendCaseEmails(caseIntID, recipients, {
    link: buildThreeDViewerUrl(caseIntID, { forShare: true }),
    images,
    subject: subjectFor(caseIntID),
  });
}

// Show the 3D approval dialog. Resolves { confirmed, recipients, images }:
// `confirmed` is the Send/Cancel answer, `recipients` the ticked (and typed)
// addresses, `images` the ticked renders plus whatever was uploaded. NOT a
// boolean like confirmModal — the caller sends to those addresses, but only once
// the status write has actually landed, so a request that failed is never sent.
export async function confirmPreview3DApproval({ caseIntID, shots = null } = {}) {
  const content = el("div", "cn-approve");

  // Files reviewed on the left, who to tell on the right — the same split the 2D
  // dialog uses, so the render stays in view while the notification is written.
  const cols = el("div", "cn-approve-cols");
  const renders = buildShotsSection(shots, { title: "3D files", noun: "3D file" });
  const uploads = buildAttachmentsSection();
  const main = el("div", "cn-approve-main");
  main.appendChild(renders.section);
  main.appendChild(uploads.section);
  cols.appendChild(main);

  // Everything that goes out with the mail: the ticked renders first, then the
  // uploads, in the order they were added. Read at send time, so a render can be
  // ticked or a file added without reopening the dialog.
  const images = () => [...shotAttachments(renders.selectedShots()), ...uploads.attachments()];

  const recipients = buildRecipientsSection(caseIntID);
  const email = buildEmailSection({
    caseIntID,
    selectedRecipients: recipients.selectedRecipients,
    images,
    link: () => buildThreeDViewerUrl(caseIntID, { forShare: true }),
    subject: subjectFor(caseIntID),
    // Confirming with "Send" already mails these people.
    sendButton: false,
  });
  const side = el("div", "cn-approve-side");
  side.appendChild(recipients.section);
  side.appendChild(email.section);
  cols.appendChild(side);

  content.appendChild(cols);

  // The qualifier is red and reads as an aside, because it is who the dialog is
  // for rather than part of what it does — a lab user requests the approval, the
  // clinician gives it.
  const title = el("span", null, "Request 3D Approval ");
  title.appendChild(el("span", "cn-approve-title-note", "[For Lab Only]"));

  const confirmed = await confirmModal({
    title,
    confirmText: "Send",
    cancelText: "Cancel",
    variant: "warning",
    size: "lg",
    content,
  });

  // Read the ticks and uploads before the dialog's DOM goes away, and only when
  // confirming — cancelling sends nothing.
  return {
    confirmed,
    recipients: confirmed ? email.pendingRecipients() : [],
    images: confirmed ? images() : [],
  };
}

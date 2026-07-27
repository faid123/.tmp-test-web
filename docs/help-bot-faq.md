# SmartRPD Help Bot — FAQ Reference

Source material for `src/js/shared/helpTopics.js`. Every answer below was checked
against the current codebase before being written down — nothing here is
guessed. Items the code doesn't support yet are marked **Not applicable** with
the reason, rather than being answered as if they worked.

Legend:
- ✅ **Already in helpTopics.js** — topic id given, no action needed.
- 🆕 **Confirmed, not yet in helpTopics.js** — real feature, verified in code, safe to add.
- ⚠️ **Not applicable / unconfirmed** — either the feature is disabled, doesn't exist as described, or nothing in the frontend confirms it. Answered honestly instead of guessed.

---

## Login & Access

**"I didn't get my OTP, what do I do?"**
⚠️ Not applicable right now. `login.js` has a full OTP view (boxes, resend, verify)
but it's wrapped in a `TEMP-OTP-DISABLED` block — login currently goes straight
from password to the app with no OTP step. Adding a resend-OTP FAQ today would
tell users to expect a screen they'll never see. Revisit if/when OTP is
re-enabled.

**"Why was I logged out automatically?"**
⚠️ Unconfirmed. No idle-timeout or session-expiry code was found in
`src/js/shared` — the only 401 handling is on the *admin* pages, for
non-admins hitting admin-only endpoints. Nothing to answer safely yet.

**"Can I stay logged in without OTP every time?"**
⚠️ Moot — see above; OTP isn't in the active login path at all right now.

---

## Case Management

**"How do I find a case I created last month?"**
✅ `find-case`, `sort-cases`, `filter-by-stage`

**"Can I recover a deleted case?"**
🆕 Yes, via an admin. Deletes are soft deletes (`POST /case/delete/:id`); the
admin case list shows deleted cases struck through and offers a **Retrieve the
Case** button (`#retrieveCaseBtn` in `admin_case_list.html`, wired to
`POST /case/undelete/:id`). Not self-service for a regular user — they'd need
to ask an administrator.

**"Why can't I see a case my colleague created?"**
🆕 (grounded, but keep it general) Cases have one owner and a `co_owners` list,
shown as **SHARED WITH** in the detail panel. If you're not the owner or in
that list, the case won't show up for you — ask whoever owns it to add you via
Edit User Access. (The exact server-side filtering wasn't traced beyond this;
the answer should stay at this level rather than claim more.)

**"How do I change a case's status?"**
✅ `case-status`

---

## Case Creation & Uploads

**"What file formats can I upload for jaw scans?"**
⚠️ Correction to the draft: **STL only.** The upload input is
`accept=".stl"` and the code rejects anything else ("Please drop a .stl
file."). There's no OFF support anywhere in `createCase.js` or the jaw
preview — that assumption in the original list was wrong.

**"My STL upload failed, why?"**
🆕 (narrow answer) The only confirmed validation is the file extension — a
non-`.stl` file is rejected immediately. No file-size limit or network-retry
logic was found in the frontend, so an answer shouldn't claim one exists;
safest FAQ is "check it's a valid `.stl` file and try again."

**"How do I invite a teammate to a case?"**
✅ *partially* — `user-access` covers sharing an **existing** case via the
case-actions menu. 🆕 There's a second path not yet documented: the
create-case form itself has an inline invite list (`pendingInvites` in
`createCase.js`) — you can add usernames while creating the case, before it
even exists, and they're invited as part of case creation.

---

## 2D Annotation & Design

**"Why can't I place this component here?"**
⚠️ No explicit placement-legality error text exists in `2DAnnotation.js` to
quote. The only grounded, non-speculative answer is procedural: components go
on teeth marked appropriately in Select Teeth, and the arch must be locked
into design mode first (`select-teeth`, `design-mode`). Anything more specific
about per-component eligibility rules isn't confirmed in the frontend.

**"How do I undo a design change?"**
✅ *partially* — `remove-component` mentions the undo button beside the
padlock. Could be split into its own topic if undo turns out to be a common
question on its own.

**"Where is my saved design — did it save?"**
✅ `save-2d`, `changes-not-saving`

**"What do the clinical info icons mean?"**
✅ `tooth-conditions`, `clinical-info`

---

## 3D Viewer

**"Why does the mesh look blocky / low quality?"**
✅ `mesh-quality`

**"What does the undercut heatmap color mean?"**
✅ `undercut-heatmap`, `heatmap-viewer`

**"How do I add extra reference STL files?"**
🆕 Confirmed. The jaw preview supports extra STL slots beyond the main upper/
lower jaw — `preview3D.js` references `jaw_stls_extra_slot_1..4`, loaded in the
background alongside the main jaws. This isn't documented anywhere in the help
bot yet and is a good candidate to add.

**"Why don't my artificial teeth look aligned?"**
⚠️ Not surfaced. `artificialTeeth.js` has internal logic that auto-detects
coordinate spaces and flags `likelyMisaligned` rows — but that reads as
internal robustness handling, not a documented user-facing caveat. Writing a
support FAQ around it would mean presenting unverified internals as known
behavior, so it's left out. If this is a real recurring support question, it
needs an answer from whoever owns that code, not an inference from it.

---

## Collaboration

**"How do I chat with my team about a case?"**
✅ `case-chat`

**"Why am I not getting notifications?"**
✅ *partially* — `notifications` explains the bell/badge. Note: these are
in-app only, not browser push notifications, so there's no OS-level permission
to check — the original framing ("permissions check") doesn't apply here.

**"How do I see previous design versions?"**
✅ `version-history`

---

## Export & Sharing

**"How do I share a 3D view with someone outside the team?"**
✅ `share-3d-link`, `qr-code`, `open-3d-viewer`

**"Is the shared link safe / does it expose patient info?"**
🆕 Confirmed and worth adding — this is a good trust-building FAQ. The case ID
in the 3D Viewer URL is encrypted (`getEncryptedCaseId` / `getDecodedCaseId` in
`viewerShell.js`), not a plain sequential ID, and the viewer needs no sign-in
identity beyond that link.

**"How do I download the raw files for fabrication?"**
✅ *as far as confirmed* — `download-2d` covers **Download 2D Design L2**, the
one export path found in the case-actions menu. No separate "raw STL for
fabrication" export was found, so don't imply one exists beyond that.

---

## Troubleshooting / Meta

**"The page won't load / is frozen"**
✅ *partially* — `list-slow` is scoped to the case list specifically. A
general "app feels stuck" topic (refresh, check connection, supported
browsers) doesn't exist yet and would be a reasonable addition given
troubleshooting is typically the highest-traffic category.

**"Who do I contact for a bug or access issue?"**
⚠️ **Important correction, not just a missing topic.** The footer menu has
both a **Report Issue** button and a **Feedback** button. Report Issue
currently just shows `toast.info("Report Issue — coming soon.")` — it isn't
wired to anything. Feedback is the one that works: it opens a Microsoft Forms
link. Meanwhile `helpBot.js`'s own "I don't know that one" message
(`renderUnsure`) tells users to *"use Report Issue in the menu to reach the
team"* — which is currently a dead end. That line should probably point at
Feedback instead, or Report Issue should be finished. Worth a decision before
writing an FAQ answer here, since either way the current help bot's fallback
text is telling users something that doesn't work.

**"Is my data backed up?"**
⚠️ No frontend evidence either way — this is an infrastructure/ops question,
not something to answer from client-side code. Needs input from whoever owns
the backend, not a guess dressed up as reassurance.

---

## Summary of recommended next additions to `helpTopics.js`

Confirmed real, safe to write as proper topics:
1. Recover a deleted case (admin-only retrieve)
2. Invite a teammate while creating a case (distinct from Edit User Access)
3. Extra reference STL slots in the jaw preview
4. Shared 3D link privacy (encrypted case ID)
5. A general "page frozen / won't load" troubleshooting topic

Needs a product decision before it can be answered correctly:
- Report Issue vs. Feedback — fix the dead-end reference in `helpBot.js`'s
  fallback message, or wire up Report Issue, before FAQ-ing "who do I
  contact."

Left out entirely (not misleading, not guessed):
- OTP resend/troubleshooting (OTP disabled)
- Auto-logout / session expiry (no such mechanism found)
- STL size limits (unconfirmed)
- Artificial-teeth alignment caveat (internal logic, not a documented behavior)
- Data backup reassurance (backend question)

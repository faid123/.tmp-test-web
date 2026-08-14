// Guided start-up tours — the step scripts behind the About button.
//
// Pure data, no DOM and no imports, so pageTour.js and its tests can load it
// anywhere. One entry per page id (the ids in helpTopics.js PAGE_LABELS), each
// a short walk through the controls a first-time user needs on that screen.
//
// Fields:
//   title     the step heading
//   text      one or two sentences — what the control is for, not how it looks
//   bullets   optional "LABEL — what it does" lines, listed under the prose for
//             a step that covers several things at once (the Components tabs)
//   selector  optional CSS selector for the control to spotlight. A step with
//             no selector is a centred card (the welcome and sign-off steps).
//             May be an array, in preference order — the first one actually on
//             screen is spotlighted, so a step can prefer a real data row and
//             fall back to the header when the table is empty
//   reveal    optional selector for the control that opens the view `selector`
//             lives in, same contract as helpTopics.js — the tour clicks it,
//             waits for the target, then spotlights the target. May be an array
//             of alternatives when a control has more than one way in; the
//             first one that is actually on screen is the one clicked
//   dismiss   optional selector for the control that closes what `reveal`
//             opened. The tour clicks it once it leaves the run of steps
//             sharing that reveal, and again when the tour ends, so a panel the
//             tour opened is never left behind. Omit it when the reveal changes
//             a mode the user keeps (the padlock) rather than opening a panel
//   optional  true when the control only exists in some states (a case must be
//             selected, the design must be unlocked). Missing targets are
//             skipped either way; this marks the ones we expect to skip
//   topic     optional help-topic id, offered as "Read more" on the step
//
// Steps whose target never appears are dropped when the tour starts, so a tour
// stays coherent on a page where half the controls are gated behind admin
// rights or a selected case.

// Bump when a tour's steps change materially — a viewer who has seen v1 is
// shown v2 once, rather than never seeing the new steps.
export const TOUR_VERSION = 1;

// The case-actions menu on the case list is closed by default, so the step
// about it points at an item inside and names the toggle as its `reveal`.
const CASE_MENU = ".cm-detail .dropdown-toggle";

// Create Case replaces the list with a pair of panes rather than opening a
// dialog, so the steps inside it are revealed by the button and put back by
// Cancel — which resets the form and restores the list without confirming.
const CREATE_CASE = "#createCaseBtn";
const CREATE_CASE_BACK = "#createCaseUpload .cancel-btn";

// The 2D design has two entirely different ways into the Case Note, chosen by a
// media query at 1200px: above it the CASE NOTE tab in the Components panel
// (`.is-form-tab`), below it the footer button that opens the bottom sheet. Each
// is display:none on the other's viewport, so the tour offers both and clicks
// whichever is real.
//
// The padlock is last and is normally never clicked — by the time these steps
// run the tour has already locked the arches, so the CASE NOTE tab is on screen
// and matches first. It is listed because the step filter runs before the tour
// starts, when the Components panel is still shut and neither of the first two
// is visible: without it, every Case Note step would be dropped on a desktop.
const CASE_NOTE_WAYS_IN = [
  "#componentTabs .component-tab.is-form-tab",
  "#footerCaseNoteBtn",
  "#jawLockToggleBtn",
];

export const PAGE_TOURS = {
  // ------------------------------------------------------------- case list
  case_list: [
    {
      title: "Welcome to SmartRPD",
      text: "This is the Case List — every case you own or have been given access to. Here's a quick pass over the controls; you can leave at any point with Skip.",
    },
    {
      title: "The case table",
      text: "Every case you can open, one per row — here's what a row tells you. Select a row to open that case's detail panel, or a column header to sort by it (again to reverse).",
      bullets: [
        "Case Name — what the case is called; rename it from the case-actions menu.",
        "Status — where the case has got to, from Draft through to Completed.",
        "Created — when the case was made.",
        "Due — the Date Required set in the 2D design's Case Note; N/A until one is set.",
        "Owner and Shared With — who made the case, and who else can open it.",
      ],
      // A real row says more than the header does, so point at the first one and
      // fall back to the header only when the list has nothing in it yet.
      selector: [".cm-table tbody tr", ".cm-table thead"],
      topic: "sort-cases",
    },
    {
      title: "Filter by stage",
      text: "These cards group your cases by how far along they are, each with a live count. Select one to filter the table to it, and select it again to clear.",
      selector: ".cm-stat-filters",
      topic: "filter-by-stage",
    },
    {
      title: "Find a case",
      text: "Search by name, date or status — pick which with the selector beside the box. The refresh button next to it re-fetches the list when a case you expect is missing.",
      selector: "#searchCaseInput",
      topic: "find-case",
    },
    {
      title: "Notifications",
      text: "The bell collects updates on your cases, with a badge for unread ones.",
      selector: "#notificationBtn",
      topic: "notifications",
    },
    {
      title: "Case actions",
      text: "The ☰ button beside the case name opens everything else you can do to a case — rename, duplicate, delete, user access, version history and the reference-image download.",
      selector: "#renameBtn",
      reveal: CASE_MENU,
      optional: true,
      topic: "case-menu",
    },
    {
      title: "Case instructions",
      text: "With a case selected, the detail panel carries its instructions for the technician, the people it's shared with, and its 3D viewer link. It saves as you type.",
      selector: "#caseInstructions",
      optional: true,
      topic: "case-instructions",
    },
    {
      title: "Create a case",
      text: "This opens the create-case form — let's go through it.",
      selector: "#createCaseBtn",
      topic: "create-case",
    },

    // ---- inside the create-case form ------------------------------------
    //
    // Create Case swaps the list out for a pair of panes, so every step here
    // names it as their `reveal` to survive the start-of-tour filter. Only the
    // first presses it: reopening the view calls resetCreateCaseForm(), which
    // would throw away anything already typed. Cancel is the `dismiss`, which
    // puts the case list back before the tour carries on with it.
    {
      title: "Name the case",
      text: "The only field that has to be filled in. Case Owner and Case Create Date beside it are filled in for you.",
      selector: "#caseName",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "create-case",
    },
    {
      title: "When you need it back",
      text: "Case Request Date is when you're asking for the case. Note that the Due column on the list is driven by Date Required in the 2D design's Case Note — set it there once the design is open, and the list picks it up.",
      selector: "#requestDate",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "due-date",
    },
    {
      title: "Invite the people working on it",
      text: "Type a username and press Enter or select Add to queue them; they're invited as the case is created. This is separate from Edit User Access, which shares a case that already exists.",
      selector: "#ccInviteInput",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "invite-during-create",
    },
    {
      title: "Instructions for the technician",
      text: "Anything the person building the case needs to know. It becomes the case's CASE INSTRUCTIONS, editable later from the detail panel.",
      selector: "#ccCaseInstructions",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "case-instructions",
    },
    {
      title: "Upload the jaw scans",
      text: "Drag the upper and lower STL files onto their tiles, or select a tile to browse. These are the scans the whole design is built on.",
      selector: "#uploadedJawModels",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "upload-jaw-scans",
    },
    {
      title: "Reference images",
      text: "Photos to go with the case — drag them on or browse. They show up in the case detail panel, where the arrows page through them.",
      selector: "#addRefImageBtn",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "reference-images",
    },
    {
      title: "Save the case",
      text: "Save creates the case and puts you back on the list, with the new case in it.",
      selector: "#createCaseUpload .save-btn",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "create-case",
    },
    {
      title: "Save & Start",
      text: "The same thing, then straight into the 2D design for the case you just made — use it when you're creating a case in order to work on it now.",
      selector: "#createCaseUpload .save-start-btn",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "start-case",
    },
    {
      title: "Back to the case list",
      text: "Cancel drops the form and puts the list back — nothing is created. We'll use it now to carry on with the tour.",
      selector: "#createCaseUpload .cancel-btn",
      reveal: CREATE_CASE,
      dismiss: CREATE_CASE_BACK,
      optional: true,
      topic: "create-case",
    },

    {
      title: "Start designing",
      text: "With a case selected, Start Case at the bottom of the detail panel opens the 2D design for it — that's where the framework is drawn.",
      selector: ".start-case-button",
      optional: true,
      topic: "start-case",
    },
    {
      title: "Share the 3D link",
      text: "The 3D link row gives you a viewer URL for the case. Copy it with the copy button, or open it with the export button — the case ID in it is encrypted, and the viewer needs no sign-in.",
      selector: "#view3dLinkRow",
      optional: true,
      topic: "share-3d-link",
    },
    {
      title: "Or scan it on a phone",
      text: "The QR button turns that same link into a code, so a phone or tablet can open the 3D Viewer by scanning it. About in the menu replays this tour whenever you want it.",
      selector: "#generateQrBtn",
      optional: true,
      topic: "qr-code",
    },
  ],

  // ------------------------------------------------------------- 2D design
  //
  // Order: the 3D preview and its per-jaw controls first, then tooth selection,
  // then the lock and the components it unlocks.
  annotation_2d: [
    {
      title: "The 2D design",
      text: "This is where the framework is drawn. We'll start with the case's 3D jaws on the left, then work through marking the teeth and placing components on them.",
    },
    {
      title: "The 3D jaw preview",
      text: "The case's scans, in 3D, beside the arches — this is where you look the jaws over while you design. Drag to rotate, scroll to zoom, and right-drag to pan.",
      selector: ".jaw-preview-shell",
      optional: true,
      topic: "jaw-preview",
    },
    {
      title: "Set the survey angle",
      text: "Each jaw row has its own SET SURVEY ANGLE. It arms that jaw and shows an arrow you aim to choose the path of insertion; the undercut heatmap is then recalculated against it and stored on the case.",
      selector: ".jaw-preview-survey-btn",
      optional: true,
      topic: "survey-angle",
    },
    {
      title: "Show or hide a jaw",
      text: "The jaw icon at the start of each row hides that jaw in the 3D view and brings it back — useful for looking at one arch without the other in the way. It changes nothing about the case.",
      selector: ".jaw-preview-row-icon",
      optional: true,
      topic: "jaw-preview",
    },
    {
      title: "Remove a jaw",
      text: "The trash button saves that jaw to closed and takes it out of the preview. It asks you to confirm first, and the row turns back into an upload button so a new scan can be put in its place.",
      selector: ".jaw-preview-delete-btn",
      optional: true,
      topic: "preview-jaw-upload",
    },
    {
      title: "Capture the view",
      text: "The camera renders the 3D view exactly as you've positioned it and saves it as the case's thumbnail. To put a view on the Noticeboard instead, use the Noticeboard's own Add Viewcapture.",
      selector: "#preview3dCaptureBtn",
      optional: true,
      topic: "preview-capture",
    },
    {
      title: "Extra 3D files",
      text: "Beyond the two jaw scans, a case has four named STL slots — an Upper jaw and Lower jaw, each with a Metal RPD beside it. This tab lists them over the 3D view: upload one and it takes the stage, a file's icon hides it in the view and the trash button removes it.",
      selector: "#previewTabExtras",
      topic: "extra-reference-stl",
    },
    {
      title: "Mark the teeth",
      text: "Now the arches. The design opens in tooth-selection mode — pick Presence, Abutment or Compromised here, then select teeth on the arch to apply it.",
      selector: "#selectTeethPanel",
      topic: "select-teeth",
    },
    {
      title: "Lock the arches",
      text: "The padlock between the arches switches from selecting teeth to placing components. Lock it once both arches are right — and unlock it here if you need to change the teeth again.",
      selector: "#jawLockToggleBtn",
      topic: "design-mode",
    },
    {
      title: "The Components panel",
      // `reveal` locks the arches for the user: the panel below is display:none
      // until then, so there is nothing to point at otherwise. Skipped when the
      // design is already locked, since the panel is on screen already.
      text: "Locking opens the Components panel — we've locked it here so you can see it. Pick a tab, pick an item from the list below it, then select the tooth to place it on.",
      bullets: [
        "MESH — the retentive mesh the acrylic and teeth are built onto.",
        "ASSEMBLY — the ready-made combinations: RPI & RPA, back-action, half-and-half, combination and continuous clasps.",
        "RESTS — occlusal, cingulum and incisal rests that stop the framework sinking into the tissue.",
        "CLASPS — the retainers that hold the denture on, with their reciprocating elements.",
        "BARS — lingual, palatal and buccal bars; placing one also adds its matching reciprocating clasp.",
        "PLATE — plating on individual teeth, over and above what the major connector already covers.",
        "MAJOR CONNECTOR — the connector spanning the arch; choosing one re-plates the teeth it crosses.",
        "CASE NOTE — the written brief and Date Required, the same note as the header button.",
      ],
      selector: "#componentTabs",
      reveal: "#jawLockToggleBtn",
      optional: true,
      topic: "component-tabs",
    },
    {
      title: "Clinical Info",
      text: "Per-tooth clinical conditions — crowns, implants, extractions, root canals and the rest — recorded on their own upper and lower rows.",
      selector: "#openClinicalInfoBtn",
      topic: "clinical-info",
    },
    {
      // Clear Top / Clear Bottom are design-mode-only buttons, and the tour is
      // in design mode from the Components step on — the select-mode pair
      // (Clear upper/lower teeth) is hidden by then.
      title: "Clear an arch",
      text: "Clear Top and Clear Bottom strip every component from one jaw and leave the teeth as they are. Before the arches are locked the same row carries Clear upper teeth and Clear lower teeth instead, which reset tooth selection rather than components.",
      // Same reveal as the Components step: these buttons are hidden while the
      // arches are unlocked, and the filter runs before the tour starts — without
      // it the step would be dropped for a design that is not locked yet. By the
      // time the tour arrives the padlock is already on, so nothing is clicked.
      selector: "#clearUpperComponentsBtn",
      reveal: "#jawLockToggleBtn",
      optional: true,
      topic: "clear-arch",
    },
    {
      title: "Start from a template, or from scratch",
      text: "Load Template Jaw fills the arch with a standard starting layout to work from. Draw from Scratch clears it so you build the design up yourself. Both sit beside the Clear buttons and, like them, only appear in design mode.",
      selector: "#loadProposalBtn",
      reveal: "#jawLockToggleBtn",
      optional: true,
      topic: "template-jaw",
    },
    {
      title: "Download the jaw profile",
      text: "Download Jaw Profile offers two things: Download STL file gives you the upper and lower jaws together as a .zip, and Download as JPEG saves the arch annotation as an image.",
      selector: "#footerDownloadJawProfileBtn",
      optional: true,
    },

    // ---- inside the Noticeboard -----------------------------------------
    //
    // The board is a modal, shut at tour start, so every step in this run names
    // the footer button as its `reveal` — otherwise the filter would drop them
    // all before it ever opens. Only the first actually clicks it; `dismiss`
    // closes the board again as the tour moves on to Save.
    {
      title: "The Noticeboard",
      text: "Everything the technician should see about this case, in two columns: 2D Setup & Design on the left and 3D Design on the right. It's also what the case report is generated from.",
      selector: ".noticeboard-panel",
      reveal: "#openNoticeboardBtn",
      dismiss: "#noticeboardCloseBtn",
      optional: true,
      topic: "noticeboard",
    },
    {
      title: "Add an instruction",
      text: "+ ADD NEW INSTRUCTION in the 2D column adds an instruction card. The cards below it are the ones already on the board for this case.",
      selector: "#addInstructionBtn",
      reveal: "#openNoticeboardBtn",
      dismiss: "#noticeboardCloseBtn",
      optional: true,
      topic: "noticeboard",
    },
    {
      title: "3D Design and other devices",
      text: "The right-hand column has its own tabs — 3D DESIGN for this case's framework, and [OTHER DEVICES] for anything else going with it.",
      selector: ".noticeboard-tabs",
      reveal: "#openNoticeboardBtn",
      dismiss: "#noticeboardCloseBtn",
      optional: true,
      topic: "noticeboard",
    },
    {
      title: "Add a view capture",
      text: "This is how a 3D view gets onto the board. It captures the model as it's currently positioned — distinct from the camera on the jaw preview, which sets the case thumbnail instead.",
      selector: "#addViewcaptureBtn",
      reveal: "#openNoticeboardBtn",
      dismiss: "#noticeboardCloseBtn",
      optional: true,
      topic: "preview-capture",
    },
    {
      title: "Generate the report",
      text: "Turns everything on the board — instruction cards and captured views alike — into the case report.",
      selector: "#noticeboardGenerateReportBtn",
      reveal: "#openNoticeboardBtn",
      dismiss: "#noticeboardCloseBtn",
      optional: true,
      topic: "noticeboard",
    },
    {
      title: "The board's own actions",
      text: "Along the bottom: DOWNLOAD JAW PROFILE, the same download you saw in the footer, and DRAW FROM SCRATCH to start the design over. Closing the board brings you back to the arches.",
      selector: "#downloadJawProfileBtn",
      reveal: "#openNoticeboardBtn",
      dismiss: "#noticeboardCloseBtn",
      optional: true,
      topic: "noticeboard",
    },

    // ---- inside the Case Note -------------------------------------------
    //
    // Same reveal/dismiss pairing as the Noticeboard — but here re-clicking the
    // reveal would rebuild the form and discard anything already typed, so it
    // matters that only the first step in the run presses it.
    {
      title: "The Case Note",
      text: "The written brief that travels with the case. Case Owner and Case Number at the top are filled in for you and can't be edited — everything below them is yours to fill in.",
      selector: ".case-note-form",
      reveal: CASE_NOTE_WAYS_IN,
      dismiss: "#caseNoteSheet .cn-sheet-close",
      optional: true,
      topic: "case-note",
    },
    {
      title: "Date Required",
      text: "The date the case is needed by — this is the case's due date, and it's what the case list shows in its Due column. A case that has never had one shows N/A there.",
      selector: "#case-note-date",
      reveal: CASE_NOTE_WAYS_IN,
      dismiss: "#caseNoteSheet .cn-sheet-close",
      optional: true,
      topic: "due-date",
    },
    {
      title: "Tooth Shade",
      text: "The shade for the case, in the usual notation — A2, B1 and so on.",
      selector: "#case-note-shade",
      reveal: CASE_NOTE_WAYS_IN,
      dismiss: "#caseNoteSheet .cn-sheet-close",
      optional: true,
      topic: "case-note",
    },
    {
      title: "Work Category",
      text: "What kind of work this is. It's picked for you from the jaw material you're designing in, and stays on your choice once you change it yourself.",
      selector: "#case-note-category",
      reveal: CASE_NOTE_WAYS_IN,
      dismiss: "#caseNoteSheet .cn-sheet-close",
      optional: true,
      topic: "case-note",
    },
    {
      title: "Special Instruction",
      text: "Free text for anything the technician needs to know. This is the same note as CASE INSTRUCTIONS on the case list — what you write here shows up there, and what was written there shows up here.",
      selector: "#case-note-comment",
      reveal: CASE_NOTE_WAYS_IN,
      dismiss: "#caseNoteSheet .cn-sheet-close",
      optional: true,
      topic: "case-instructions",
    },
    {
      title: "Approving the design",
      text: "When the dentist is happy with the design, Approve saves the note and sets the case to 2D design approved in the same action — so a design is never approved with its note unsaved. It asks you to confirm first, since the status change is case-level and everyone sees it.",
      selector: ".case-note-save-btn",
      reveal: CASE_NOTE_WAYS_IN,
      dismiss: "#caseNoteSheet .cn-sheet-close",
      optional: true,
      topic: "case-note",
    },

    // Last, and outside the note: leaving the Case Note run closes it, so the
    // tour finishes back on the design it started from.
    {
      title: "Save before you leave",
      text: "Save is in the footer menu, and it's what writes both jaws back to the server — the design does not save itself. Return is in the same menu, and offers to save on the way out.",
      selector: "#footerMenuBtn",
      topic: "save-2d",
    },
  ],

  // ------------------------------------------------------------- 3D viewer
  viewer_3d: [
    {
      title: "The 3D Viewer",
      text: "A read-only look at the case's model — this is the page behind a shared 3D link or QR code. A short tour of what you can do here.",
    },
    {
      title: "Moving around",
      text: "Drag to rotate the jaw, scroll to zoom, and right-drag or two-finger drag to pan. On a touch screen one finger rotates and a pinch zooms.",
      selector: "#container3D",
      topic: "navigate-3d",
    },
    {
      title: "Draw on the model",
      text: "The pen and eraser mark up the view, with undo and redo beside them.",
      selector: "#footerPenBtn",
      optional: true,
      topic: "annotate-3d",
    },
    {
      title: "Clinical design notes",
      text: "Written notes that stay with the case, for anyone else who opens it.",
      selector: "#footerNotesBtn",
      optional: true,
      topic: "clinical-notes-3d",
    },
    {
      title: "Case chat",
      text: "The per-case conversation — text and images, shared with everyone who has access to the case.",
      selector: "#footerChatBtn",
      optional: true,
      topic: "case-chat",
    },
  ],

  // ----------------------------------------------------------- admin pages
  admin_users: [
    {
      title: "User Management",
      text: "The administrator page for accounts. A quick pass over what's here.",
    },
    {
      title: "Who's on the system",
      text: "Live counts of total, administrator, active and deactivated accounts. The links jump the table straight to that group.",
      selector: "#userStatsBar",
      optional: true,
    },
    {
      title: "Register someone",
      text: "This is how a sign-up request is approved: register the person here and the system emails them a link to set their own password. Nothing is queued in the app — requests arrive by email.",
      selector: "#registerUserBtn",
      optional: true,
      topic: "approve-signup",
    },
    {
      title: "Find an account",
      text: "Search by username or email, filter by date, or narrow to active, pending or deactivated accounts.",
      selector: "#userSearchInput",
      optional: true,
      topic: "admin-users",
    },
    {
      title: "The account list",
      text: "Each row edits, deactivates or removes that account. Back to Cases in the header returns you to the case list.",
      selector: "#userListWrap",
      optional: true,
    },
  ],

  admin_machineid: [
    {
      title: "Machine ID Management",
      text: "The machine identifiers desktop installations register against. A quick pass over the page.",
    },
    {
      title: "Registered machines",
      text: "Counts of every machine, split by whether it has been documented. The links filter the table to each group.",
      selector: "#machineStatsBar",
      optional: true,
    },
    {
      title: "Register a machine",
      text: "Adds a new machine identifier for a desktop installation.",
      selector: "#registerMachineBtn",
      optional: true,
      topic: "admin-machine-ids",
    },
    {
      title: "Find a machine",
      text: "Search by machine ID or comment, and narrow to documented or undocumented entries.",
      selector: "#machineSearchInput",
      optional: true,
    },
  ],

  admin_case_list: [
    {
      title: "Admin Case List",
      text: "Every case on the system, not just your own — including the deleted ones.",
    },
    {
      title: "Find a case",
      text: "Search by name, date or status, exactly as on your own case list.",
      selector: "#searchCaseInput",
      optional: true,
      topic: "find-case",
    },
    {
      title: "Deleted cases",
      text: "Deleting a case hides it rather than destroying it — deleted cases show struck through here, and Retrieve the Case brings one back.",
      selector: "#retrieveCaseBtn",
      optional: true,
      topic: "recover-deleted-case",
    },
    {
      title: "Everything else lives here",
      text: "The footer menu holds the other admin pages, Help, and About — which replays this tour.",
      selector: "#footerMenuBtn",
    },
  ],
};

// Pages with no tour written yet fall back to nothing rather than an empty
// overlay, so About can say so instead of opening a blank card.
export function tourFor(pageId) {
  return PAGE_TOURS[pageId] || null;
}

// Where a page's "seen" flag lives. Keyed by page and version so a rewritten
// tour is offered again to someone who saw the old one.
export function tourStorageKey(pageId) {
  return `smartrpd.tour.${pageId}.v${TOUR_VERSION}`;
}

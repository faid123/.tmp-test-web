import { lol } from "../crypt.js";
import { setupAppSidebar } from "./appSidebar.js";
import { setupConnectivityIndicator } from "./accessibility.js";

const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const NOTES_STORAGE_KEY = "smartrpd_clinical_notes";

function getBasePath() {
  return window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";
}

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

function getEncryptedCaseId() {
  return new URLSearchParams(window.location.search).get("id") || null;
}

function getDecodedCaseId() {
  const encryptedId = getEncryptedCaseId();
  return encryptedId ? lol(encryptedId) : null;
}

async function populateCaseName() {
  const footerCaseName = document.getElementById("footerCaseName");
  if (!footerCaseName) return;

  const user = getLoggedInUser();
  const caseId = getDecodedCaseId();
  if (!caseId) {
    footerCaseName.textContent = "Viewer";
    return;
  }

  footerCaseName.textContent = `UID_${caseId}`;
  if (!user?.uuid) return;

  try {
    const response = await fetch(`${API_BASE}/case/get/${caseId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          machine_id: MACHINE_ID,
          uuid: user.uuid,
          caseIntID: caseId,
        },
      ]),
    });
    if (!response.ok) return;
    const detail = await response.json();
    const label = detail?.case_id ? `UID_${caseId} : ${detail.case_id}` : `UID_${caseId}`;
    footerCaseName.textContent = label;
  } catch (error) {
    console.warn("Failed to resolve viewer case label.", error);
  }
}

function populateUserMeta() {
  const user = getLoggedInUser();
  const footerUserName = document.getElementById("footerUserName");
  if (footerUserName) {
    footerUserName.textContent = user?.username || "Guest";
  }
  const footerConnection = document.getElementById("footerConnection");
  if (footerConnection) {
    setupConnectivityIndicator(footerConnection);
  }
}

function wireRightNavButton() {
  const btn = document.getElementById("footerRightNavBtn");
  const icon = document.getElementById("footerRightNavIcon");
  if (!btn || !icon) return;

  const basePath = getBasePath();
  let isOpen = true;
  icon.src = `${basePath}/assets/Icon_rightclose.png`;

  btn.addEventListener("click", () => {
    const rightNav = window.getViewerRightNav?.() || document.getElementById("viewer-right-nav");
    if (!rightNav) return;
    isOpen = !isOpen;
    rightNav.style.display = isOpen ? "" : "none";
    icon.src = isOpen
      ? `${basePath}/assets/Icon_rightclose.png`
      : `${basePath}/assets/Icon_rightopen.png`;
    btn.setAttribute("aria-label", isOpen ? "Close right panel" : "Open right panel");
    btn.dataset.tooltip = isOpen ? "Close right panel" : "Open right panel";
  });
}

function wireChatButton() {
  const footerChatBtn = document.getElementById("footerChatBtn");
  if (!footerChatBtn) return;
  const encryptedId = getEncryptedCaseId();
  if (encryptedId) {
    window.SMARTRPD_CHAT_CASE_ID = encryptedId;
  }
  footerChatBtn.addEventListener("click", async () => {
    const { toggleChat } = await import("./chat.js");
    toggleChat(encryptedId);
  });
}


function wireNotesPopup() {
  const notesBtn = document.getElementById("footerNotesBtn");
  const notesPopup = document.getElementById("clinicalNotesPopup");
  const notesClose = document.getElementById("clinicalNotesClose");
  const notesText = document.getElementById("clinicalNotesText");
  if (!notesBtn || !notesPopup) return;

  // Restore saved notes
  if (notesText) {
    notesText.value = localStorage.getItem(NOTES_STORAGE_KEY) || "";
    notesText.addEventListener("input", () => {
      localStorage.setItem(NOTES_STORAGE_KEY, notesText.value);
    });
  }

  function setOpen(open) {
    notesPopup.setAttribute("aria-hidden", String(!open));
    notesBtn.setAttribute("aria-pressed", String(open));
    if (open) notesText?.focus();
  }

  notesBtn.addEventListener("click", () => {
    const isOpen = notesPopup.getAttribute("aria-hidden") === "false";
    setOpen(!isOpen);
  });

  notesClose?.addEventListener("click", () => setOpen(false));

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && notesPopup.getAttribute("aria-hidden") === "false") {
      setOpen(false);
    }
  });
}

function mountViewerPopupsIntoScene() {
  const viewerMain = document.querySelector(".viewer-main");
  if (!viewerMain) return;

  const appSidebar = document.getElementById("appSidebar");
  const chatWidget = document.getElementById("chat-widget");

  if (appSidebar && appSidebar.parentElement !== viewerMain) {
    viewerMain.appendChild(appSidebar);
  }

  // Chat stays at viewer-shell level so position:fixed (from chat.css) covers
  // the full viewport — same as 2D annotation. Moving it into viewer-main would
  // clip it to the viewer-main area and push it below any top inset.
}

function wireSidebarVersionHistory() {
  const btn = document.getElementById("sidebarVersionHistoryBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const { openVersionHistory } = await import("./versionHistory.js");
    openVersionHistory();
  });
}

function wireSidebarReturn() {
  const btn = document.getElementById("sidebarReturnBtn");
  if (!btn) return;
  const isGitHubPages = window.location.hostname.includes("github.io");
  const basePath = isGitHubPages ? "/.tmp-test-web" : "";
  const caseListUrl = `${basePath}/src/pages/case_list.html`;
  btn.addEventListener("click", () => {
    // Return should always land on the MAIN case list. If this viewer was opened
    // directly from the case-list tab, hop back to it and close this one (so
    // viewer tabs don't pile up). Otherwise — a deeper chain of opened tabs, or a
    // direct load — navigate straight to the case list instead of focusing
    // whatever opened this tab.
    try {
      if (
        window.opener &&
        !window.opener.closed &&
        window.opener.location?.pathname?.includes("case_list")
      ) {
        window.opener.focus();
        window.close();
        return;
      }
    } catch (err) {
      // Cross-context access to opener.location can throw; fall through to nav.
    }
    window.location.href = caseListUrl;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  mountViewerPopupsIntoScene();
  populateUserMeta();
  populateCaseName();
  wireChatButton();
  wireRightNavButton();
  wireSidebarVersionHistory();
  wireSidebarReturn();
  setupAppSidebar({
    triggerId: "footerMenuBtn",
    indexHref: "../../index.html",
  });
});

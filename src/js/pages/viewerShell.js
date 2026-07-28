import { lol } from "../shared/crypt.js";
import { setupAppSidebar } from "../shared/appSidebar.js";
import { setupConnectivityIndicator } from "../shared/accessibility.js";

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
  let isOpen = false;
  const syncButton = (open) => {
    isOpen = Boolean(open);
    icon.src = isOpen
      ? `${basePath}/assets/Icon_rightclose.png`
      : `${basePath}/assets/Icon_rightopen.png`;
    const label = isOpen ? "Close more controls" : "Open more controls";
    btn.setAttribute("aria-label", label);
    btn.dataset.tooltip = label;
    btn.setAttribute("aria-pressed", String(isOpen));
  };
  syncButton(false);

  btn.addEventListener("click", () => {
    if (typeof window.toggleViewerAdvancedControls === "function") {
      syncButton(window.toggleViewerAdvancedControls());
      return;
    }

    // Fallback while the WebGL workspace is still loading.
    const rightNav = window.getViewerRightNav?.() || document.getElementById("viewer-right-nav");
    if (!rightNav) return;
    isOpen = !isOpen;
    rightNav.style.display = isOpen ? "" : "none";
    syncButton(isOpen);
  });

  window.addEventListener("vieweradvancedcontrolschange", (event) => {
    syncButton(Boolean(event.detail?.open));
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
    const { toggleChat } = await import("../shared/chat.js");
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

// Gate shown when a guest (not logged in) tries to return to the case list,
// which is auth-gated (authGuard bounces guests straight to login). Rather than
// that abrupt redirect, prompt them: Login -> case list after signing in;
// Cancel -> stay in the viewer. Styled inline since the viewer doesn't load the
// noticeboard/case-list CSS. Mirrors openAnnotateGate in index.js.
function openReturnGate({ onLogin }) {
  const gate = document.createElement("div");
  gate.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.78);";
  gate.innerHTML = `
    <div style="width:min(92vw,420px);background:#fff;border-radius:14px;padding:28px 26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;font-family:system-ui,-apple-system,sans-serif;">
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#0f172a;">Sign in to continue</h2>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#475569;">Log in to access the case list.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button type="button" data-gate-login style="width:100%;padding:12px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:1px solid transparent;background:#3BAE95;color:#fff;">Login</button>
        <button type="button" data-gate-cancel style="width:100%;padding:12px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(gate);
  const close = () => gate.remove();
  gate.addEventListener("click", (ev) => {
    if (ev.target === gate) close();
  });
  gate.querySelector("[data-gate-login]").addEventListener("click", () => {
    close();
    onLogin?.();
  });
  gate.querySelector("[data-gate-cancel]").addEventListener("click", close);
}

function wireSidebarReturn() {
  const btn = document.getElementById("sidebarReturnBtn");
  if (!btn) return;
  const isGitHubPages = window.location.hostname.includes("github.io");
  const basePath = isGitHubPages ? "/.tmp-test-web" : "";
  const caseListUrl = `${basePath}/src/pages/case_list.html`;

  const returnToCaseList = () => {
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
  };

  btn.addEventListener("click", () => {
    // Guests can't open the auth-gated case list — gate them to login instead of
    // letting authGuard bounce them there abruptly.
    if (!getLoggedInUser()?.uuid) {
      openReturnGate({
        onLogin: () => {
          try {
            // Return to the case list after a successful sign-in.
            localStorage.setItem(
              "postLoginRedirect",
              `${window.location.origin}${caseListUrl}`
            );
          } catch (_) {}
          window.location.href = `${window.location.origin}${basePath}/index.html`;
        },
      });
      return;
    }
    returnToCaseList();
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

// Shared slide-in sidebar wiring. Both case_list and 2DAnnotation embed the
// same #appSidebar markup; this module handles open/close + the items that
// behave identically on both pages (logout, quit, change password, help,
// report issue, feedback, about, language). Page-specific items (Save,
// Return, etc.) are wired by the calling page directly.

import { confirmModal } from "./confirmModal.js";
import { toast } from "./toast.js";

export function setupAppSidebar({ triggerId = "footerMenuBtn", indexHref = "../../index.html" } = {}) {
  const sidebar = document.getElementById("appSidebar");
  const trigger = document.getElementById(triggerId);
  if (!sidebar) return { open() {}, close() {} };

  const open = () => {
    sidebar.classList.remove("is-hidden");
    requestAnimationFrame(() => sidebar.classList.add("is-open"));
    sidebar.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    sidebar.classList.remove("is-open");
    sidebar.setAttribute("aria-hidden", "true");
    setTimeout(() => sidebar.classList.add("is-hidden"), 220);
  };

  trigger?.addEventListener("click", () => {
    if (sidebar.classList.contains("is-open")) close();
    else open();
  });
  sidebar.querySelectorAll("[data-sidebar-close]").forEach((el) => {
    el.addEventListener("click", close);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("is-open")) close();
  });

  // ----- common items -----
  document.getElementById("sidebarLogoutBtn")?.addEventListener("click", async () => {
    close();
    const ok = await confirmModal({
      title: "Log out?",
      message: "You'll need to sign in again to access your cases.",
      confirmText: "Log out",
      cancelText: "Cancel",
      variant: "info",
    });
    if (!ok) return;
    localStorage.removeItem("loggedInUser");
    window.location.href = indexHref;
  });

  document.getElementById("sidebarQuitBtn")?.addEventListener("click", async () => {
    close();
    const ok = await confirmModal({
      title: "Quit SmartRPD?",
      message: "This will sign you out and close the workspace.",
      confirmText: "Quit",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    localStorage.removeItem("loggedInUser");
    // window.close() only works for script-opened windows; fall back to
    // navigating to the login screen so the user always lands somewhere safe.
    window.close();
    window.location.href = indexHref;
  });

  document.getElementById("sidebarChangePasswordBtn")?.addEventListener("click", () => {
    close();
    toast.info("Change password — coming soon.");
  });
  document.getElementById("sidebarHelpBtn")?.addEventListener("click", () => {
    close();
    toast.info("Help — coming soon.");
  });
  document.getElementById("sidebarReportIssueBtn")?.addEventListener("click", () => {
    close();
    toast.info("Report Issue — coming soon.");
  });
  document.getElementById("sidebarFeedbackBtn")?.addEventListener("click", () => {
    close();
    toast.info("Feedback — coming soon.");
  });
  document.getElementById("sidebarAboutBtn")?.addEventListener("click", () => {
    close();
    toast.info("About — coming soon.");
  });

  return { open, close };
}

// Chrome common to every admin page: the header user chip, its logout dropdown,
// the Back-to-cases buttons, the slide-in sidebar, and the admin gate.

import { getLoggedInUser } from "../shared/api.js";
import { confirmModal } from "../shared/toast.js";
import { setupAppSidebar } from "../shared/appSidebar.js";

// Admin pages live in src/pages/admin/, so the app root is three levels up.
const INDEX_HREF = "../../../index.html";
const CASE_LIST_HREF = "./admin_case_list.html";

function wireUserChip(username) {
  const nameEl = document.getElementById("adminUserName");
  const avatarEl = document.getElementById("adminUserAvatar");
  if (nameEl) nameEl.textContent = username;
  if (avatarEl) avatarEl.textContent = username.charAt(0);
  const footerUser = document.getElementById("footerUserName");
  if (footerUser) footerUser.textContent = username;

  const chip = document.getElementById("adminUserChip");
  const chipMenu = document.getElementById("adminUserDropdown");
  if (chip && chipMenu) {
    const toggleChip = (e) => {
      e.stopPropagation();
      const open = chipMenu.classList.toggle("hidden") === false;
      chip.setAttribute("aria-expanded", String(open));
    };
    chip.addEventListener("click", toggleChip);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") toggleChip(e);
    });
    document.addEventListener("click", (e) => {
      if (chipMenu.classList.contains("hidden")) return;
      if (!chipMenu.contains(e.target) && !chip.contains(e.target)) {
        chipMenu.classList.add("hidden");
        chip.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.getElementById("userChipLogout")?.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Log out?",
      message: "You'll need to sign in again to access the admin tools.",
      confirmText: "Log out",
      cancelText: "Cancel",
      variant: "info",
    });
    if (!ok) return;
    try { localStorage.removeItem("loggedInUser"); } catch { /* ignore */ }
    window.location.href = INDEX_HREF;
  });
}

// The signed-in account, or null when the page must stop — no session, or not an
// admin (`onDenied`). UI-only: the server re-checks is_admin on every call.
export function initAdminShell({ onDenied } = {}) {
  const me = getLoggedInUser();
  if (!me?.uuid) {
    window.location.href = INDEX_HREF;
    return null;
  }

  wireUserChip(me.username || "User");

  const goBack = () => (window.location.href = CASE_LIST_HREF);
  document.getElementById("backToCasesBtn")?.addEventListener("click", goBack);
  document.getElementById("gateBackBtn")?.addEventListener("click", goBack);

  setupAppSidebar({ indexHref: INDEX_HREF });

  if (Number(me.isAdmin) !== 1) {
    onDenied?.();
    return null;
  }
  return me;
}

// A stat-card "View" link's label + icon, in place. The links carry an <i> and a
// .cm-stat-link-text span, so setting textContent directly drops the icon.
export function setStatLinkState(link, text, active) {
  if (!link) return;
  const label = link.querySelector(".cm-stat-link-text");
  if (label) label.textContent = text;
  else link.textContent = text;
  const icon = link.querySelector("i");
  if (icon) icon.className = active ? "fa fa-arrow-left" : "fa fa-eye";
  link.classList.toggle("is-active", active);
}

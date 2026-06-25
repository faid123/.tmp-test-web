// Lightweight in-page toast/popup notifications. Drop-in replacement for
// browser alert() — non-blocking, auto-dismissing, and styled to match the
// rest of the case-management UI. Use the variant helpers (toast.success,
// toast.error, toast.warning, toast.info) at call sites for readability.

const DEFAULT_DURATION = 3800;

function getContainer() {
  let el = document.getElementById("appToastContainer");
  if (!el) {
    el = document.createElement("div");
    el.id = "appToastContainer";
    el.className = "app-toast-container";
    document.body.appendChild(el);
  }
  return el;
}

function iconFor(type) {
  switch (type) {
    case "success": return "fa-circle-check";
    case "error":   return "fa-circle-exclamation";
    case "warning": return "fa-triangle-exclamation";
    default:        return "fa-circle-info";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

export function showToast(message, type = "info", duration = DEFAULT_DURATION) {
  const container = getContainer();
  const el = document.createElement("div");
  el.className = `app-toast app-toast-${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `
    <i class="fa ${iconFor(type)} app-toast-icon" aria-hidden="true"></i>
    <span class="app-toast-msg">${escapeHtml(message)}</span>
    <button type="button" class="app-toast-close" aria-label="Dismiss">
      <i class="fa fa-xmark" aria-hidden="true"></i>
    </button>
  `;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove("is-visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };

  el.querySelector(".app-toast-close")?.addEventListener("click", dismiss);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 1500); });
  timer = setTimeout(dismiss, duration);

  return dismiss;
}

export const toast = {
  info:    (msg, dur) => showToast(msg, "info", dur),
  success: (msg, dur) => showToast(msg, "success", dur),
  warning: (msg, dur) => showToast(msg, "warning", dur),
  error:   (msg, dur) => showToast(msg, "error", dur),
};

// Queue a toast to appear on the next page load. Useful when an action
// triggers a navigation/reload before a normal toast would be visible.
const FLASH_KEY = "appToastFlash";

export function flashToast(message, type = "info") {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type }));
  } catch {}
}

function consumeFlash() {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    const { message, type } = JSON.parse(raw);
    if (message) showToast(message, type || "info");
  } catch {}
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", consumeFlash, { once: true });
  } else {
    consumeFlash();
  }
}

// ---------------------------------------------------------------------------
// Confirmation modal (formerly src/js/confirmModal.js). Promise-based, drop-in
// replacement for window.confirm(): non-blocking, styled to match the app, with
// a "danger" variant for destructive actions. Lazily injects its own DOM.
// Lives here so confirm-dialogs and toasts share one module (reusing escapeHtml).
// ---------------------------------------------------------------------------

const CONFIRM_ICONS = {
  danger:  "fa-triangle-exclamation",
  warning: "fa-triangle-exclamation",
  info:    "fa-circle-question",
};

let activeConfirmOverlay = null;

function buildConfirmOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "app-confirm-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="app-confirm-box">
      <div class="app-confirm-head">
        <span class="app-confirm-icon"><i class="fa" aria-hidden="true"></i></span>
        <h3 class="app-confirm-title"></h3>
      </div>
      <p class="app-confirm-message"></p>
      <div class="app-confirm-actions">
        <button type="button" class="app-confirm-btn app-confirm-cancel"></button>
        <button type="button" class="app-confirm-btn app-confirm-ok"></button>
      </div>
    </div>
  `;
  return overlay;
}

export function confirmModal({
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info", // "info" | "warning" | "danger"
} = {}) {
  return new Promise((resolve) => {
    // If a previous prompt is still open, dismiss it so the new one isn't
    // hidden behind the old overlay.
    if (activeConfirmOverlay) {
      activeConfirmOverlay.remove();
      activeConfirmOverlay = null;
    }

    const overlay = buildConfirmOverlay();
    const box = overlay.querySelector(".app-confirm-box");
    const iconEl = overlay.querySelector(".app-confirm-icon i");
    const titleEl = overlay.querySelector(".app-confirm-title");
    const msgEl = overlay.querySelector(".app-confirm-message");
    const okBtn = overlay.querySelector(".app-confirm-ok");
    const cancelBtn = overlay.querySelector(".app-confirm-cancel");

    box.classList.add(`app-confirm-${variant}`);
    iconEl.classList.add(CONFIRM_ICONS[variant] || CONFIRM_ICONS.info);
    titleEl.textContent = title;
    // Support a multi-line message via plain text (escape for safety).
    msgEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    document.body.appendChild(overlay);
    activeConfirmOverlay = overlay;
    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    // Confirm button gets focus so Enter/Space activates it for keyboard users.
    setTimeout(() => okBtn.focus(), 0);

    const cleanup = (result) => {
      overlay.classList.remove("is-visible");
      const remove = () => {
        overlay.remove();
        if (activeConfirmOverlay === overlay) activeConfirmOverlay = null;
        document.removeEventListener("keydown", onKey, true);
      };
      overlay.addEventListener("transitionend", remove, { once: true });
      setTimeout(remove, 250);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        cleanup(true);
      }
    };

    okBtn.addEventListener("click", () => cleanup(true));
    cancelBtn.addEventListener("click", () => cleanup(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
    document.addEventListener("keydown", onKey, true);
  });
}

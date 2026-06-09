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

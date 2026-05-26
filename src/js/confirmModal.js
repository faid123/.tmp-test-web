// Promise-based confirmation modal — drop-in replacement for window.confirm().
// Non-blocking, styled to match the app, supports a "danger" variant for
// destructive actions. Lazily injects its own DOM so no HTML changes needed.

const ICONS = {
  danger:  "fa-triangle-exclamation",
  warning: "fa-triangle-exclamation",
  info:    "fa-circle-question",
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

let activeOverlay = null;

function buildOverlay() {
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
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }

    const overlay = buildOverlay();
    const box = overlay.querySelector(".app-confirm-box");
    const iconEl = overlay.querySelector(".app-confirm-icon i");
    const titleEl = overlay.querySelector(".app-confirm-title");
    const msgEl = overlay.querySelector(".app-confirm-message");
    const okBtn = overlay.querySelector(".app-confirm-ok");
    const cancelBtn = overlay.querySelector(".app-confirm-cancel");

    box.classList.add(`app-confirm-${variant}`);
    iconEl.classList.add(ICONS[variant] || ICONS.info);
    titleEl.textContent = title;
    // Support a multi-line message via plain text (escape for safety).
    msgEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    document.body.appendChild(overlay);
    activeOverlay = overlay;
    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    // Confirm button gets focus so Enter/Space activates it for keyboard users.
    setTimeout(() => okBtn.focus(), 0);

    const cleanup = (result) => {
      overlay.classList.remove("is-visible");
      const remove = () => {
        overlay.remove();
        if (activeOverlay === overlay) activeOverlay = null;
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

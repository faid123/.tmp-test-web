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
      <div class="app-confirm-content"></div>
      <div class="app-confirm-actions">
        <button type="button" class="app-confirm-btn app-confirm-cancel"></button>
        <button type="button" class="app-confirm-btn app-confirm-ok"></button>
      </div>
    </div>
  `;
  return overlay;
}

// `content` lets a caller mount its own DOM between the message and the
// action row (the 2D case-note approval dialog puts a report preview, the
// case's user list and a message box there). Passing it also switches Enter
// off as a confirm shortcut — a rich dialog contains text fields, and Enter
// inside one must not commit the action. `size: "lg"` widens the box.
export function confirmModal({
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info", // "info" | "warning" | "danger"
  content = null, // HTMLElement mounted above the buttons
  size = "", // "" | "lg"
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
    const contentEl = overlay.querySelector(".app-confirm-content");
    const okBtn = overlay.querySelector(".app-confirm-ok");
    const cancelBtn = overlay.querySelector(".app-confirm-cancel");

    box.classList.add(`app-confirm-${variant}`);
    if (size) box.classList.add(`app-confirm-box--${size}`);
    iconEl.classList.add(CONFIRM_ICONS[variant] || CONFIRM_ICONS.info);
    titleEl.textContent = title;
    // Support a multi-line message via plain text (escape for safety).
    msgEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
    // An empty <p> would still contribute its bottom margin, which looks like a
    // stray gap in a content-only dialog.
    if (!message) msgEl.remove();
    if (content) contentEl.appendChild(content);
    else contentEl.remove();
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    document.body.appendChild(overlay);
    activeConfirmOverlay = overlay;
    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    // Confirm button gets focus so Enter/Space activates it for keyboard users.
    // Not for a content dialog: focusing the commit button there invites an
    // accidental Enter, and the content's own first field is the better target.
    if (!content) setTimeout(() => okBtn.focus(), 0);

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
      } else if (e.key === "Enter" && !content) {
        // Enter-to-confirm only on the plain text dialog. With mounted content
        // the user is typing, and the buttons handle their own Enter natively.
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

// ===========================================================================
// Shared themed calendar (merged here to keep the shared-utility file count
// low). On-brand date picker used by the case list (due date + search-by-date),
// create case (request date) and the 2D case note. Styles live in toast.css.
// ===========================================================================

let openCalPop = null;

const CAL_DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function closeThemedCalendar() {
  if (!openCalPop) return;
  openCalPop.remove();
  openCalPop = null;
  document.removeEventListener("mousedown", onCalDocClick, true);
  document.removeEventListener("keydown", onCalKeydown, true);
  window.removeEventListener("resize", closeThemedCalendar);
  window.removeEventListener("scroll", closeThemedCalendar, true);
}

function onCalDocClick(e) {
  if (openCalPop && !openCalPop.contains(e.target) && e.target !== openCalPop._anchor) {
    closeThemedCalendar();
  }
}

function onCalKeydown(e) {
  if (e.key === "Escape") closeThemedCalendar();
}

// Local-time YYYY-MM-DD (avoids the UTC off-by-one of toISOString()).
function calIsoFromDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function calSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function calEscape(s) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

function positionCalPop(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth || 268;
  const ph = pop.offsetHeight || 300;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
  if (left < 8) left = 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

// Open the calendar anchored to `anchor` (any element). `value` is the current
// `YYYY-MM-DD` (or ""). onPick(iso|null) fires after the popup closes.
export function openThemedCalendar(anchor, { value = "", onPick, allowClear = true } = {}) {
  closeThemedCalendar();
  if (!anchor) return;

  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const view = selected ? new Date(selected) : new Date();
  view.setDate(1);

  const pop = document.createElement("div");
  pop.className = "tcal-pop";
  pop._anchor = anchor;
  pop.addEventListener("mousedown", (e) => e.stopPropagation());

  const pick = (iso) => {
    closeThemedCalendar();
    onPick?.(iso);
  };

  const render = () => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const today = new Date();
    const monthLabel = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const first = new Date(y, m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back up to the Sunday of the first row

    let cells = "";
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const cls = [
        "tcal-day",
        d.getMonth() === m ? "" : "is-muted",
        calSameDay(d, today) ? "is-today" : "",
        selected && calSameDay(d, selected) ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells += `<button type="button" class="${cls}" data-iso="${calIsoFromDate(d)}">${d.getDate()}</button>`;
    }

    pop.innerHTML =
      '<div class="tcal-head">' +
      '<button type="button" class="tcal-nav" data-nav="-1" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>' +
      `<span class="tcal-title">${calEscape(monthLabel)}</span>` +
      '<button type="button" class="tcal-nav" data-nav="1" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button>' +
      "</div>" +
      '<div class="tcal-dow">' +
      CAL_DOW.map((d) => `<span>${d}</span>`).join("") +
      "</div>" +
      `<div class="tcal-grid">${cells}</div>` +
      '<div class="tcal-foot">' +
      (allowClear ? '<button type="button" class="tcal-link" data-act="clear">Clear</button>' : "<span></span>") +
      '<button type="button" class="tcal-link tcal-today" data-act="today">Today</button>' +
      "</div>";
  };

  pop.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      view.setMonth(view.getMonth() + Number(nav.dataset.nav));
      render();
      return;
    }
    const act = e.target.closest("[data-act]");
    if (act) {
      if (act.dataset.act === "clear") pick(null);
      else pick(calIsoFromDate(new Date()));
      return;
    }
    const day = e.target.closest(".tcal-day");
    if (day) pick(day.dataset.iso);
  });

  render();
  document.body.appendChild(pop);
  positionCalPop(pop, anchor);

  openCalPop = pop;
  setTimeout(() => {
    document.addEventListener("mousedown", onCalDocClick, true);
    document.addEventListener("keydown", onCalKeydown, true);
    window.addEventListener("resize", closeThemedCalendar);
    window.addEventListener("scroll", closeThemedCalendar, true);
  }, 0);
}

// Enhance a native <input type="date">: suppress the native picker and open the
// themed calendar instead, writing the chosen value back and firing input/change
// so existing listeners keep working. `onPick(iso|null)` is an optional extra.
export function attachThemedCalendar(input, { allowClear = true, onPick } = {}) {
  if (!input || input.dataset.tcal === "1") return;
  input.dataset.tcal = "1";
  input.readOnly = true;
  input.classList.add("tcal-input");

  const open = (e) => {
    e?.preventDefault?.();
    // Toggle: clicking the field again while its popup is open closes it.
    if (openCalPop && openCalPop._anchor === input) {
      closeThemedCalendar();
      return;
    }
    openThemedCalendar(input, {
      value: input.value,
      allowClear,
      onPick: (iso) => {
        input.value = iso || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        onPick?.(iso);
      },
    });
  };

  input.addEventListener("mousedown", open);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") open(e);
  });
}

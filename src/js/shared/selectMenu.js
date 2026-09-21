// Themed listbox popover — the stand-in for a native <select>'s dropdown. It
// opens on the trigger's first click, anchored below it (above when there is no
// room), and closes on pick, Escape, Tab, an outside pointer, scroll or resize.
// Keyboard: arrows/Home/End move, Enter/Space pick, typing jumps to a label.
// Styles: the .tsel-* rules in css/toast.css, beside the themed calendar's.

let openPop = null;

export function closeSelectMenu({ refocus = false } = {}) {
  if (!openPop) return;
  const { anchor } = openPop;
  openPop.remove();
  openPop = null;
  anchor.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("keydown", onDocKeydown, true);
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
  if (refocus) anchor.focus?.({ preventScroll: true });
}

export function isSelectMenuOpenFor(anchor) {
  return !!openPop && openPop.anchor === anchor;
}

// The anchor is left to its own click handler, so a second click can toggle.
function onDocPointerDown(e) {
  if (!openPop || openPop.contains(e.target) || openPop.anchor.contains(e.target)) return;
  closeSelectMenu();
}

function onDocKeydown(e) {
  if (!openPop) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeSelectMenu({ refocus: true });
  } else if (e.key === "Tab") {
    // Not prevented: focus is back on the anchor, so the Tab moves on from it.
    closeSelectMenu({ refocus: true });
  }
}

function onViewportChange(e) {
  // The list's own scrollbar must not dismiss it.
  if (e.type === "scroll" && openPop?.contains(e.target)) return;
  closeSelectMenu();
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

const MARGIN = 8;
const GAP = 6;

// Below the anchor when it fits (or there is more room below than above),
// otherwise above; the list caps its height to that room and scrolls inside.
function positionPop(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  pop.style.maxHeight = "";
  const ph = pop.offsetHeight;
  const pw = pop.offsetWidth;
  const below = vh - MARGIN - (r.bottom + GAP);
  const above = r.top - GAP - MARGIN;
  const openBelow = ph <= below || below >= above;
  const h = Math.min(ph, Math.max(openBelow ? below : above, 0));
  pop.style.maxHeight = `${Math.floor(h)}px`;
  const top = openBelow ? r.bottom + GAP : r.top - GAP - h;
  let left = r.left;
  if (left + pw > vw - MARGIN) left = vw - MARGIN - pw;
  if (left < MARGIN) left = MARGIN;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

// Open the menu anchored to `anchor` (any element). `items` are
// { value, label, tone? } — `tone` is a class put on the item's swatch, which
// paints in that class's `color`. `value` marks the current item; onPick(value)
// fires after the popup closes, and only for a different value (as a native
// select's change would).
export function openSelectMenu(anchor, { items = [], value = null, onPick, label = "Options" } = {}) {
  closeSelectMenu();
  if (!anchor) return;

  const pop = document.createElement("div");
  pop.className = "tsel-pop";
  pop.setAttribute("role", "listbox");
  pop.setAttribute("aria-label", label);
  pop.tabIndex = -1;
  pop.anchor = anchor;

  pop.innerHTML = items
    .map((item) => {
      const selected = item.value === value;
      return (
        `<button type="button" class="tsel-item${selected ? " is-selected" : ""}" role="option"` +
        ` aria-selected="${selected}" tabindex="-1" data-value="${escapeHtml(item.value)}">` +
        `<span class="tsel-dot${item.tone ? ` ${escapeHtml(item.tone)}` : ""}" aria-hidden="true"></span>` +
        `<span class="tsel-label">${escapeHtml(item.label)}</span>` +
        '<i class="fa-solid fa-check tsel-check" aria-hidden="true"></i>' +
        "</button>"
      );
    })
    .join("");

  const options = Array.from(pop.querySelectorAll(".tsel-item"));
  const focusOption = (i) => {
    if (!options.length) return;
    const idx = ((i % options.length) + options.length) % options.length;
    options[idx].focus({ preventScroll: true });
    options[idx].scrollIntoView?.({ block: "nearest" });
  };
  const focusedIndex = () => options.indexOf(document.activeElement);

  const pick = (btn) => {
    const picked = btn.dataset.value;
    closeSelectMenu({ refocus: true });
    if (picked !== String(value ?? "")) onPick?.(picked);
  };

  pop.addEventListener("click", (e) => {
    const btn = e.target.closest(".tsel-item");
    if (btn) pick(btn);
  });

  let typed = "";
  let typedTimer = 0;
  pop.addEventListener("keydown", (e) => {
    const i = focusedIndex();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusOption(i + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusOption(i - 1);
        return;
      case "Home":
        e.preventDefault();
        focusOption(0);
        return;
      case "End":
        e.preventDefault();
        focusOption(options.length - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (i >= 0) pick(options[i]);
        return;
      default:
    }
    // Type-ahead: the letters typed within half a second pick the next label
    // starting with them, wrapping past the end.
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    clearTimeout(typedTimer);
    typed += e.key.toLowerCase();
    typedTimer = setTimeout(() => { typed = ""; }, 500);
    const start = typed.length === 1 ? i + 1 : Math.max(i, 0);
    for (let k = 0; k < options.length; k += 1) {
      const idx = (start + k) % options.length;
      const text = options[idx].querySelector(".tsel-label")?.textContent.toLowerCase() || "";
      if (text.startsWith(typed)) {
        focusOption(idx);
        return;
      }
    }
  });

  document.body.appendChild(pop);
  positionPop(pop, anchor);
  anchor.setAttribute("aria-expanded", "true");
  openPop = pop;

  const current = options.findIndex((o) => o.classList.contains("is-selected"));
  focusOption(current >= 0 ? current : 0);

  // Safe to add now: the click that opened us comes after its pointerdown, and
  // a capture listener added mid-dispatch does not see the opening keydown.
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("keydown", onDocKeydown, true);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
}

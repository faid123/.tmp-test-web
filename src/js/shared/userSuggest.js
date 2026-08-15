// The invite box: a roster of usernames this account shares cases with, ranked
// by count, plus the combobox that suggests from it.

import { getLoggedInUser } from "./api.js";

const STORAGE_PREFIX = "smartrpd.collaborators";
// Pre-uuid key, blended across every account that used this browser.
const LEGACY_STORAGE_KEY = STORAGE_PREFIX;
const NAME_LIMIT = 200;
const CASES_PER_NAME_LIMIT = 500;
const DEFAULT_LIMIT = 6;

// key (lowercased name) -> { name, cases: Set<string> }
let cache = null;
// Two comboboxes on one page must not share an aria-activedescendant id.
let boxSeq = 0;

// Per-uuid: one browser is shared between accounts, and an unscoped roster
// counts another account's cases as shared with you.
function storageKey() {
  const uuid = getLoggedInUser()?.uuid;
  return uuid ? `${STORAGE_PREFIX}_${uuid}` : null;
}

function load() {
  if (cache) return cache;
  cache = new Map();
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // No storage — the in-memory map still serves this session.
  }
  const key = storageKey();
  if (!key) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    for (const row of Array.isArray(raw) ? raw : []) {
      const name = String(row?.name ?? "").trim();
      if (!name) continue;
      const cases = Array.isArray(row?.cases) ? row.cases.map(String) : [];
      cache.set(name.toLowerCase(), { name, cases: new Set(cases) });
    }
  } catch {
    cache = new Map(); // corrupt entry — start over rather than break the box
  }
  return cache;
}

function persist(map) {
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify([...map.values()].map((r) => ({ name: r.name, cases: [...r.cases] })))
    );
  } catch {
    // Quota or private mode — the in-memory map still serves this session.
  }
}

// Every known collaborator as { name, shared }, most-shared first, ties
// alphabetical so the order is stable between renders.
export function getCollaborators() {
  return [...load().values()]
    .map((r) => ({ name: r.name, shared: r.cases.size }))
    .sort(
      (a, b) =>
        b.shared - a.shared || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
}

// Fold `{ name, caseId }` pairs in. A case counts once per person however often
// the list repaints; returns true when anything changed.
export function recordCollaborators(entries) {
  const map = load();
  const self = String(getLoggedInUser()?.username ?? "").trim().toLowerCase();
  let changed = false;

  for (const entry of entries || []) {
    const name = String(entry?.name ?? "").trim();
    const key = name.toLowerCase();
    // "N/A" is the case list's placeholder for an unset owner, not a person.
    if (!name || key === "n/a") continue;
    // You are on every case in your own list, and can never be invited.
    if (self && key === self) continue;

    let row = map.get(key);
    if (!row) {
      row = { name, cases: new Set() };
      map.set(key, row);
      changed = true;
    }

    const caseId = entry?.caseId == null ? "" : String(entry.caseId);
    if (caseId && !row.cases.has(caseId) && row.cases.size < CASES_PER_NAME_LIMIT) {
      row.cases.add(caseId);
      changed = true;
    }
  }
  if (!changed) return false;

  if (map.size > NAME_LIMIT) {
    const ranked = [...map.entries()].sort((a, b) => b[1].cases.size - a[1].cases.size);
    for (const [key] of ranked.slice(NAME_LIMIT)) map.delete(key);
  }
  persist(map);
  return true;
}

// Restrict the counts to `caseIds` — the list the server just returned — so a
// deleted, unshared or other-account case stops counting. Recording only adds.
export function reconcileCollaborators(caseIds) {
  const keep = new Set((caseIds || []).filter((id) => id != null).map(String));
  const map = load();
  let changed = false;

  for (const row of map.values()) {
    for (const caseId of row.cases) {
      if (keep.has(caseId)) continue;
      row.cases.delete(caseId);
      changed = true;
    }
  }
  if (changed) persist(map);
  return changed;
}

// Two initials for a row avatar: first + last where the name splits.
export function initialsFor(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Name with the typed part marked, so it is obvious why a row matched.
function highlightMatch(name, query) {
  const frag = document.createDocumentFragment();
  const at = query ? name.toLowerCase().indexOf(query) : -1;
  if (at < 0) {
    frag.append(name);
    return frag;
  }
  const mark = document.createElement("mark");
  mark.textContent = name.slice(at, at + query.length);
  frag.append(name.slice(0, at), mark, name.slice(at + query.length));
  return frag;
}

// Wires `input` (role="combobox") to `listEl` (role="listbox" <ul>) with
// { excluded, onPick, onSubmit, onInput, limit }. Returns { refresh, close }.
export function attachUserSuggest(input, listEl, options = {}) {
  const {
    excluded = () => [],
    onPick,
    onSubmit,
    onInput,
    limit = DEFAULT_LIMIT,
  } = options;
  if (!input || !listEl) return { refresh() {}, close() {} };

  const idPrefix = `userSuggest${++boxSeq}`;
  let items = [];
  let activeIndex = -1;

  const close = () => {
    activeIndex = -1;
    listEl.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const setActive = (index) => {
    activeIndex = index;
    const nodes = listEl.querySelectorAll(".user-suggest-item");
    nodes.forEach((el, i) => {
      el.classList.toggle("is-active", i === index);
      el.setAttribute("aria-selected", String(i === index));
    });
    if (index >= 0 && nodes[index]) {
      input.setAttribute("aria-activedescendant", nodes[index].id);
      nodes[index].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  // A known collaborator commits straight away — no second press of Add.
  const pick = (index) => {
    const choice = items[index];
    if (!choice) return;
    input.value = choice.name;
    close();
    onPick?.(choice.name);
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    const skip = new Set(
      (excluded() || []).map((n) => String(n ?? "").trim().toLowerCase()).filter(Boolean)
    );

    items = getCollaborators()
      .filter(({ name }) => {
        const key = name.toLowerCase();
        return !skip.has(key) && (!query || key.includes(query));
      })
      .slice(0, limit);

    if (!items.length) {
      close();
      return;
    }

    listEl.textContent = "";
    items.forEach(({ name, shared }, i) => {
      const li = document.createElement("li");
      li.className = "user-suggest-item";
      li.id = `${idPrefix}-${i}`;
      li.dataset.index = String(i);
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");

      const avatar = document.createElement("span");
      avatar.className = "user-suggest-avatar";
      avatar.textContent = initialsFor(name);

      const body = document.createElement("span");
      body.className = "user-suggest-body";
      const nameEl = document.createElement("span");
      nameEl.className = "user-suggest-name";
      nameEl.appendChild(highlightMatch(name, query));
      const metaEl = document.createElement("span");
      metaEl.className = "user-suggest-meta";
      metaEl.textContent = shared
        ? `${shared} shared case${shared === 1 ? "" : "s"}`
        : "Worked with before";
      body.append(nameEl, metaEl);

      li.append(avatar, body);
      listEl.appendChild(li);
    });

    listEl.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
    setActive(-1);
  };

  const refresh = () => {
    if (!listEl.classList.contains("hidden") || document.activeElement === input) render();
  };

  input.addEventListener("keydown", (e) => {
    const open = !listEl.classList.contains("hidden");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        render();
        return;
      }
      const count = items.length;
      const down = e.key === "ArrowDown";
      // From "nothing highlighted", Down opens at the top and Up at the bottom.
      if (activeIndex < 0) setActive(down ? 0 : count - 1);
      else setActive((activeIndex + (down ? 1 : -1) + count) % count);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // A highlighted suggestion wins; otherwise commit what was typed.
      if (open && activeIndex >= 0) pick(activeIndex);
      else onSubmit?.();
    }
  });

  // Rebuilt whenever the box is used: the case list keeps discovering
  // collaborators as rows enrich.
  input.addEventListener("focus", render);
  input.addEventListener("input", () => {
    onInput?.();
    render();
  });
  // Late enough for a click on a suggestion to land first.
  input.addEventListener("blur", () => setTimeout(close, 120));

  // mousedown, not click: clicking must not blur the input out from under the
  // list before the pick is read.
  listEl.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".user-suggest-item");
    if (!item) return;
    e.preventDefault();
    pick(Number(item.dataset.index));
  });
  listEl.addEventListener("mousemove", (e) => {
    const item = e.target.closest(".user-suggest-item");
    if (item) setActive(Number(item.dataset.index));
  });

  return { refresh, close };
}

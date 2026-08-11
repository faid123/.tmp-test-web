// Username suggestions for an invite field: the people this account already
// shares cases with (see shared/collaborators.js), most-shared first, filtered
// by what has been typed.
//
// Two fields use it — the create-case Invite Users box and the case list's User
// Access modal — and they differ only in who is already spoken for (names queued
// for invite vs. users already on the case), which the caller supplies as
// `excluded`.
//
// A custom listbox rather than a native <datalist>: a datalist can't be styled,
// so the shared-case count that justifies the ordering had to ride in an option
// label that only some browsers render.

import { getCollaborators } from "./collaborators.js";

const DEFAULT_LIMIT = 6;

// Bumped per attached box: two comboboxes on one page must not hand their
// inputs the same aria-activedescendant id.
let boxSeq = 0;

// Two initials for a row avatar: first + last where the name splits, otherwise
// the first two characters.
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

// Wire `input` (a role="combobox" text field) to `listEl` (an empty
// role="listbox" <ul> inside a positioned wrapper).
//
//   excluded  () => string[]  — names to leave out, matched case-insensitively
//   onPick    (name) => void  — a suggestion was chosen; the input already holds it
//   onSubmit  () => void      — Enter with nothing highlighted: commit what was typed
//   onInput   () => void      — the text changed (used to clear a stale error)
//
// Returns { refresh, close }: `refresh` re-renders when the list is open or the
// input has focus, for when the exclusions change under it.
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

  // Choosing a suggestion commits it straight away — they are a known
  // collaborator, so making the user press Add as well is a wasted step.
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

  // The case list keeps discovering collaborators as rows enrich, so the list is
  // rebuilt whenever the box is about to be used, not once at startup.
  input.addEventListener("focus", render);
  input.addEventListener("input", () => {
    onInput?.();
    render();
  });
  // Late enough for a click on a suggestion to land first (that handler runs on
  // mousedown and keeps focus, so this only fires on a real focus loss).
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

// Known collaborators: the usernames this account already shares cases with,
// ranked by how many cases they share.
//
// This is the only user list a non-admin account can build — user/getall is
// admin-gated, so there is no "all users" lookup to filter against. The case
// list feeds this as rows load (owner + co-owners), and the create-case invite
// box offers the result as suggestions, most-shared first.
//
// Cached in localStorage because the create-case pane is often opened before the
// list has finished enriching, and a suggestion box that starts empty every
// session is not much of a suggestion box.

const STORAGE_KEY = "smartrpd.collaborators";
// Enough to cover a clinic's real roster without letting a stale cache grow
// without bound. Trimming drops the least-shared names first.
const NAME_LIMIT = 200;
// Per name, the case ids are only kept to make counting idempotent (the list
// repaints on every filter/sort). Past this many the count saturates, which
// still ranks that person at the top where they belong.
const CASES_PER_NAME_LIMIT = 500;

// key (lowercased name) -> { name, cases: Set<string> }
let cache = null;

function load() {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    for (const row of Array.isArray(raw) ? raw : []) {
      const name = String(row?.name ?? "").trim();
      if (!name) continue;
      const cases = Array.isArray(row?.cases) ? row.cases.map(String) : [];
      cache.set(name.toLowerCase(), { name, cases: new Set(cases) });
    }
  } catch {
    // Corrupt or superseded entry — start over rather than break the invite box.
    cache = new Map();
  }
  return cache;
}

function persist(map) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...map.values()].map((r) => ({ name: r.name, cases: [...r.cases] })))
    );
  } catch {
    // Quota or private mode — the in-memory map still serves this session.
  }
}

// Every known collaborator as { name, shared }, most-shared first, ties broken
// alphabetically so the order is stable between renders.
export function getCollaborators() {
  return [...load().values()]
    .map((r) => ({ name: r.name, shared: r.cases.size }))
    .sort(
      (a, b) =>
        b.shared - a.shared || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
}

// Fold `{ name, caseId }` pairs in, keeping the first spelling seen for each
// name. A case counts once per person however often the list repaints, so this
// is safe to call on every paint. Returns true when anything changed, so callers
// can skip a needless re-render.
export function recordCollaborators(entries) {
  const map = load();
  let changed = false;

  for (const entry of entries || []) {
    const name = String(entry?.name ?? "").trim();
    const key = name.toLowerCase();
    // "N/A" is the case list's placeholder for an unset owner, not a person.
    if (!name || key === "n/a") continue;

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

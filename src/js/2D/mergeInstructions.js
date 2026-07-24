// Dedupe local + server noticeboard items by a stable key (title -> id ->
// preview). On a key collision the server fields win, but local-only fields on
// the matching item survive (shallow merge). Pure (no DOM) so the app and its
// unit test share it.
export function mergeInstructions(localItems, serverItems) {
  const map = new Map();
  const keyOf = (item) => {
    if (item.title) return `title:${item.title}`;
    if (item.id) return `id:${item.id}`;
    return `preview:${item.preview || ""}`;
  };
  for (const it of localItems || []) map.set(keyOf(it), it);
  for (const it of serverItems || []) {
    const key = keyOf(it);
    map.set(key, { ...(map.get(key) || {}), ...it });
  }
  return Array.from(map.values());
}

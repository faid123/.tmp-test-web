const seen = new Set();

export function logApi(res, label) {
  if (!res.ok) {
    console.warn(`[API] ✗ ${label} status=${res.status}`);
    return;
  }
  if (seen.has(label)) return;
  seen.add(label);
  console.log(`[API] ✓ ${label} status=${res.status}`);
}

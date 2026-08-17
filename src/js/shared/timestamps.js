// One normalization for every case timestamp the backend returns: Unix seconds,
// Unix milliseconds, or a date string. Formatting is left to each caller.

// Anything before 2000-01-01 is an unset value, not a date — the API returns "0"
// for a missing due_date, and 0 seconds is 1970.
const MIN_VALID_MS = 946684800000;

// Milliseconds, or null when the value is missing, unparseable or unset.
export function timestampToMs(ts) {
  if (ts == null || ts === "" || ts === 0 || ts === "0") return null;
  const n = Number(ts);
  let ms;
  if (Number.isFinite(n)) {
    if (n <= 0) return null;
    ms = String(n).length >= 13 ? n : n * 1000;
  } else {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    ms = d.getTime();
  }
  return ms < MIN_VALID_MS ? null : ms;
}

// Local calendar-day midnight, so "due today" compares equal whatever the time.
export function toDayMidnight(ts) {
  const ms = timestampToMs(ts);
  if (ms == null) return null;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const pad2 = (x) => String(x).padStart(2, "0");

// `YYYY-MM-DD`, the form an <input type="date"> wants.
export function toDateInputValue(ts, fallback = "") {
  const ms = timestampToMs(ts);
  if (ms == null) return fallback;
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// `YYYY-MM-DD HH:MM:SS`, matching the desktop dashboard.
export function toDateTimeText(ts, fallback = "N/A") {
  const ms = timestampToMs(ts);
  if (ms == null) return fallback;
  const d = new Date(ms);
  return `${toDateInputValue(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

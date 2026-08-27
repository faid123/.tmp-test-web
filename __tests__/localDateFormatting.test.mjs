/**
 * @jest-environment jsdom
 *
 * calIsoFromDate (src/js/shared/toast.js) is the local-calendar-day formatter
 * the themed calendar widget uses, now also reused by createCase.js's Request
 * Date default. It exists specifically to avoid `date.toISOString().slice(0, 10)`,
 * which converts to UTC first and silently shows the wrong day for anyone east
 * of UTC (e.g. Singapore, UTC+8) during the early hours of the local day.
 *
 * The two toISOString() assertions below only hold east of UTC. The zone cannot
 * be pinned from here — V8 caches it before a test body (or setupFiles) runs —
 * so CI sets TZ=Asia/Singapore on the test step in .github/workflows/deploy.yml.
 * Running locally from a UTC machine needs the same: TZ=Asia/Singapore npm test.
 */
import { calIsoFromDate } from "../src/js/shared/toast.js";

test("formats a plain local date as YYYY-MM-DD", () => {
  expect(calIsoFromDate(new Date(2026, 7, 18))).toBe("2026-08-18"); // month is 0-indexed
});

test("zero-pads single-digit months and days", () => {
  expect(calIsoFromDate(new Date(2026, 2, 5))).toBe("2026-03-05");
});

// The actual bug: 2026-08-18 02:00 in Singapore (UTC+8) is 2026-08-17 18:00 in
// UTC. toISOString() reports the UTC day — the wrong one for a local-date field.
test("stays on the local day where toISOString() would report the day before", () => {
  const localMidnightish = new Date(2026, 7, 18, 2, 0, 0); // Aug 18, 02:00 local

  expect(localMidnightish.toISOString().slice(0, 10)).toBe("2026-08-17"); // documents the bug this guards against
  expect(calIsoFromDate(localMidnightish)).toBe("2026-08-18"); // the fix: stays local
});

// Same shape, crossing a year boundary — the highest-risk case for an off-by-one
// this heuristic could produce (Dec 31 -> Jan 1).
test("crossing a year boundary still reports the local day", () => {
  const nearMidnight = new Date(2026, 11, 31, 1, 0, 0); // Dec 31, 01:00 local

  expect(nearMidnight.toISOString().slice(0, 10)).toBe("2026-12-30"); // documents the bug this guards against
  expect(calIsoFromDate(nearMidnight)).toBe("2026-12-31");
});

test("late-evening local time does not roll forward under UTC either", () => {
  const lateEvening = new Date(2026, 7, 18, 23, 30, 0); // Aug 18, 23:30 local -> Aug 18 15:30 UTC, same day

  expect(calIsoFromDate(lateEvening)).toBe("2026-08-18");
});

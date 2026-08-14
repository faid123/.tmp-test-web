/**
 * @jest-environment jsdom
 *
 * Cross-tab sync for the case comment — the one field the case list (CASE
 * INSTRUCTIONS) and the 2D Case Note (Special Instruction) both edit. They are
 * separate documents, so a save is announced through localStorage and picked up
 * by a `storage` event in the other tab.
 */
import { publishCaseComment, watchCaseComments } from "../src/js/2D/caseNote.js";

const KEY = (id) => `caseComment:${id}`;

// A `storage` event never fires in the tab that wrote the key, so the listener
// side is driven with the event the browser would have delivered.
function deliver(key, newValue) {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
}

beforeEach(() => {
  localStorage.clear();
});

test("a published comment is readable as the announced text", () => {
  publishCaseComment(2967, "cast in cobalt chrome");
  expect(JSON.parse(localStorage.getItem(KEY(2967))).text).toBe("cast in cobalt chrome");
});

test("the same text published twice still announces — the timestamp changes the value", () => {
  publishCaseComment(2967, "same note");
  const first = localStorage.getItem(KEY(2967));
  jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-14T10:00:00Z"));
  publishCaseComment(2967, "same note");
  expect(localStorage.getItem(KEY(2967))).not.toBe(first);
  Date.now.mockRestore();
});

test("the watcher reports the case as a number, so it can be POSTed as caseIntID", () => {
  const seen = [];
  watchCaseComments((id, text) => seen.push([id, text]));
  deliver(KEY(2967), JSON.stringify({ text: "note", at: 1 }));
  expect(seen).toEqual([[2967, "note"]]);
});

test("an empty comment is delivered as an empty string — clearing must propagate", () => {
  const seen = [];
  watchCaseComments((id, text) => seen.push([id, text]));
  deliver(KEY(2967), JSON.stringify({ text: "", at: 1 }));
  expect(seen).toEqual([[2967, ""]]);
});

test("unrelated keys and malformed payloads are ignored, not thrown on", () => {
  const seen = [];
  watchCaseComments((id, text) => seen.push([id, text]));
  deliver("caseDueDate:2967", "2026-08-14");
  deliver("someOtherApp", "x");
  deliver(KEY(2967), "not json");
  deliver(KEY(2967), null); // the key being removed
  expect(seen).toEqual([]);
});

test("unsubscribing stops delivery", () => {
  const seen = [];
  const stop = watchCaseComments((id, text) => seen.push([id, text]));
  stop();
  deliver(KEY(2967), JSON.stringify({ text: "note", at: 1 }));
  expect(seen).toEqual([]);
});

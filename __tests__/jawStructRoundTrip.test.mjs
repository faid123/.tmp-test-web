/**
 * @jest-environment jsdom
 *
 * End-to-end round-trip test for the jaw-struct (2D design) load/save pipeline.
 *
 * Mirrors exactly what 2DAnnotation.js does on open and on save:
 *
 *   FETCH  ->  decodeJawStructResponse(records)        (jawStructCodec.js)
 *          ->  resolveJawStructDesign(parsed)          (jawStructCodec.js)
 *   APPLY  ->  applyJawStructDesign(design, state)     (jawStructApply.js)  == "display in 2D Annotation"
 *   SAVE   ->  encodeJawStructText(state, jawSide)     (jawStructCodec.js)
 *
 * Invariant under test: with NO edits between load and save, the encoded text
 * (the "output save file") must equal the fetched text (the "loaded data"),
 * byte-for-byte, except for the single intentionally non-deterministic line:
 *   "Start of Jaw Struct yr.mth.day.hr.min.sec: <now>"
 * which is re-stamped with the current time on every save. We normalize that
 * line on both sides before comparing.
 *
 * Fixture: 03_jawstruct_l2_getall.json — the real array returned by
 * POST /jawstruct/l2/getall (upper_jaw + lower_jaw records, base64 `data`).
 *
 * annotationTeethModel.js (pulled in transitively by jawStructApply.js) imports
 * the live `state` from the DOM-heavy 2DAnnotation.js entry point. We jest.mock
 * that single module to a bare { state } so the real apply/codec/components code
 * runs without booting the whole 2D UI.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// annotationTeethModel.js -> `import { state } from "./2DAnnotation.js"`. Cut the
// DOM-heavy entry point; the apply path only needs tooth records we pass in.
// (babel-jest hoists jest.mock above the imports below.)
jest.mock("../src/js/2D/2DAnnotation.js", () => ({ state: { teeth: {} } }));

import {
  safeAtob,
  decodeJawStructResponse,
  resolveJawStructDesign,
  encodeJawStructText,
} from "../src/js/2D/jawStructCodec.js";
import { applyJawStructDesign } from "../src/js/2D/jawStructApply.js";

// Jest runs with rootDir = repo root, where the fixture lives.
const REPO_ROOT = process.cwd();

// Array-slot order per jaw, matching the codec's UPPER_/LOWER_FDI_ORDER.
const UPPER_FDI_ORDER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER_FDI_ORDER = ["38", "37", "36", "35", "34", "33", "32", "31", "41", "42", "43", "44", "45", "46", "47", "48"];

/** Fresh annotation state: 32 default tooth records, same shape as initializeTeethState(). */
function buildFreshState() {
  const teeth = {};
  for (const fdi of UPPER_FDI_ORDER) {
    teeth[fdi] = { tooth_id: fdi, jaw: "upper", status: "presence", isPresent: true, components: [], componentPlacements: [], center: [0, 0] };
  }
  for (const fdi of LOWER_FDI_ORDER) {
    teeth[fdi] = { tooth_id: fdi, jaw: "lower", status: "presence", isPresent: true, components: [], componentPlacements: [], center: [0, 0] };
  }
  return { teeth };
}

/** Replace the non-deterministic save timestamp so equality reflects design content only. */
function normalizeStamp(text) {
  return String(text).replace(
    /(Start of Jaw Struct yr\.mth\.day\.hr\.min\.sec: ).*/,
    "$1<STAMP>"
  );
}

/** First N differing lines, with index, for a readable failure message. */
function firstLineDiffs(expected, actual, limit = 40) {
  const e = expected.split(/\r?\n/);
  const a = actual.split(/\r?\n/);
  const diffs = [];
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n && diffs.length < limit; i += 1) {
    if (e[i] !== a[i]) {
      diffs.push(`  line ${i}:\n    loaded: ${e[i] ?? "<none>"}\n    saved : ${a[i] ?? "<none>"}`);
    }
  }
  return { count: diffs.length, text: diffs.join("\n") };
}

const records = JSON.parse(readFileSync(join(REPO_ROOT, "03_jawstruct_l2_getall.json"), "utf8"));
const recordByType = Object.fromEntries(records.map((r) => [r.type, r]));

describe("jaw-struct load -> save round-trip (no edits)", () => {
  // One shared state, both jaws applied — exactly like the real fetchJawStruct().
  const state = buildFreshState();
  const decoded = decodeJawStructResponse(records);

  beforeAll(() => {
    if (decoded.upper) applyJawStructDesign(resolveJawStructDesign(decoded.upper), state);
    if (decoded.lower) applyJawStructDesign(resolveJawStructDesign(decoded.lower), state);
  });

  it.each([
    ["upper_jaw", "upper"],
    ["lower_jaw", "lower"],
  ])("%s: saved text equals loaded text", (recordType, jawSide) => {
    const record = recordByType[recordType];
    expect(record).toBeTruthy();

    const loadedText = normalizeStamp(safeAtob(record.data));
    const savedText = normalizeStamp(encodeJawStructText(state, jawSide));

    if (loadedText !== savedText) {
      const { count, text } = firstLineDiffs(loadedText, savedText);
      // Surface the exact field-level drift so the mismatch is actionable.
      // eslint-disable-next-line no-console
      console.error(`\n[round-trip] ${recordType}: ${count} differing line(s):\n${text}\n`);
    }

    expect(savedText).toBe(loadedText);
  });
});

/**
 * Pr Config is a per-position flag triple (mesial/distal/lingual, 0 = present), not a
 * single-value enum, which is what lets a Half & Half tooth carry two rest seats.
 * Encoding only the first placement would silently drop one rest on save.
 */
describe("a double-rested tooth (Half & Half) survives save -> load", () => {
  const jawSide = "lower";
  const fdi = "36";

  function stateWithRests(...surfaces) {
    const state = buildFreshState();
    const decoded = decodeJawStructResponse(records);
    if (decoded.lower) applyJawStructDesign(resolveJawStructDesign(decoded.lower), state);
    const rec = state.teeth[fdi];
    rec.isPresent = true;
    rec.componentPlacements = surfaces.map((surface) => ({ componentId: "rest-seat", surface }));
    rec.components = ["rest-seat"];
    return state;
  }

  /** Save, then read back through the real decode + apply path. */
  function saveAndReload(state) {
    const text = encodeJawStructText(state, jawSide);
    const reloaded = buildFreshState();
    const parsed = decodeJawStructResponse([
      { type: "lower_jaw", data: Buffer.from(text, "utf8").toString("base64") },
    ]);
    applyJawStructDesign(resolveJawStructDesign(parsed.lower), reloaded);
    return reloaded.teeth[fdi].componentPlacements
      .filter((p) => p.componentId === "rest-seat")
      .map((p) => p.surface)
      .sort();
  }

  it("keeps BOTH rests through a save/load cycle", () => {
    expect(saveAndReload(stateWithRests("mesial", "distal"))).toEqual(["distal", "mesial"]);
  });

  it("still keeps a single rest single (no phantom second seat)", () => {
    expect(saveAndReload(stateWithRests("distal"))).toEqual(["distal"]);
    expect(saveAndReload(stateWithRests("mesial"))).toEqual(["mesial"]);
  });
});

/**
 * @jest-environment jsdom
 *
 * The jaw-struct (2D design) load/save pipeline, driven exactly as 2DAnnotation.js does:
 *
 *   FETCH  ->  decodeJawStructResponse(records)   ->  resolveJawStructDesign(parsed)
 *   APPLY  ->  applyJawStructDesign(design, state)          ("display in 2D Annotation")
 *   SAVE   ->  encodeJawStructText(state, jawSide)
 *
 * Covers: byte-exact round-trip of a real case, the lower major connector bar <-> plate
 * switch (label AND geometry), and two-rest fidelity.
 *
 * annotationTeethModel.js (pulled in transitively) imports the live `state` from the
 * DOM-heavy 2DAnnotation.js entry point, so that one module is mocked to a bare
 * { state }: the real apply/codec/components code runs without booting the 2D UI.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("../src/js/2D/2DAnnotation.js", () => ({ state: { teeth: {} } }));

import { safeAtob } from "../src/js/2D/dotnetBinaryFormatter.js";
import {
  parseJawStructText,
  decodeJawStructResponse,
  resolveJawStructDesign,
  encodeJawStructText,
} from "../src/js/2D/jawStructCodec.js";
import { applyJawStructDesign } from "../src/js/2D/jawStructApply.js";
import {
  COMPONENT_BY_ID,
  isMajorConnectorComponent,
  pruneInvalidMajorConnectorPlacementsInJaw,
} from "../src/js/2D/components.js";
import { syncToothComponentsFromPlacements } from "../src/js/2D/annotationTeethModel.js";
import { TOOTH_ORDER } from "../src/js/2D/constants.js";
import { buildFreshState } from "./helpers/teeth.mjs";
import {
  lineDiffs,
  loadInto,
  normalizeStamp,
  saveAndReload,
  switchMajorIn,
} from "./helpers/jawStructIO.mjs";

// Jest runs with rootDir = repo root, where the fixtures live.
const ROOT = process.cwd();
const records = JSON.parse(readFileSync(join(ROOT, "03_jawstruct_l2_getall.json"), "utf8"));
const recordByType = Object.fromEntries(records.map((r) => [r.type, r]));
// The SAME case (1923) saved from the desktop once as a lingual bar, once as a plate.
const barText = readFileSync(join(ROOT, "__tests__/fixtures/case_1923_bar_lower.txt"), "utf8");
const plateText = readFileSync(join(ROOT, "__tests__/fixtures/case_1923_plate_lower.txt"), "utf8");

const lowerSpan = (state) =>
  TOOTH_ORDER.lower.filter((toothId) =>
    (state.teeth[toothId]?.componentPlacements || []).some((e) => isMajorConnectorComponent(e.componentId))
  );

const switchLowerMajor = (state, componentId) => switchMajorIn(state.teeth, componentId, "lower");

const majorConnectorLine = (state) =>
  encodeJawStructText(state, "lower")
    .split(/\r?\n/)
    .find((l) => l.startsWith("Major Connector Type:"));

/**
 * With NO edits between load and save, the encoded text must equal the fetched text
 * byte-for-byte, apart from the re-stamped save timestamp normalized above.
 */
describe("load -> save round-trip (no edits)", () => {
  const state = buildFreshState();

  beforeAll(() => {
    const decoded = decodeJawStructResponse(records);
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
      // Surface the exact field-level drift so the mismatch is actionable.
      // eslint-disable-next-line no-console
      console.error(`\n[round-trip] ${recordType}:\n${lineDiffs(loadedText, savedText).join("\n")}\n`);
    }
    expect(savedText).toBe(loadedText);
  });
});

/**
 * Repro for "web changes lower major connector to lingual plate but the desktop shows
 * lingual bar": 6 = lingual bar, 7 = lingual plate.
 */
describe("lower major connector bar <-> plate switch", () => {
  it("follows the switch through the encoded type label", () => {
    const state = buildFreshState();
    const decoded = decodeJawStructResponse(records);
    if (decoded.upper) applyJawStructDesign(resolveJawStructDesign(decoded.upper), state);
    if (decoded.lower) applyJawStructDesign(resolveJawStructDesign(decoded.lower), state);

    expect(majorConnectorLine(state)).toBe("Major Connector Type: 7"); // as loaded
    switchLowerMajor(state, "major-lower-lingual-bar");
    expect(majorConnectorLine(state)).toBe("Major Connector Type: 6");
    switchLowerMajor(state, "major-lower-lingual-plate");
    expect(majorConnectorLine(state)).toBe("Major Connector Type: 7");
  });

  // The fix: switching the lower major TYPE also re-routes the Minor Connector grid
  // (Path G<->D) and the per-tooth reciprocating flag, so the desktop renders the right
  // shape — not just a relabelled bar.
  it("changes the type label AND the connector geometry grid", () => {
    const state = buildFreshState();
    applyJawStructDesign(resolveJawStructDesign(decodeJawStructResponse(records).lower), state);

    switchLowerMajor(state, "major-lower-lingual-bar");
    const bar = encodeJawStructText(state, "lower").split(/\r?\n/);
    switchLowerMajor(state, "major-lower-lingual-plate");
    const plate = encodeJawStructText(state, "lower").split(/\r?\n/);

    const diffs = [];
    for (let i = 0; i < Math.max(bar.length, plate.length); i += 1) {
      if (bar[i] !== plate[i]) diffs.push({ bar: bar[i], plate: plate[i] });
    }
    expect(diffs).toContainEqual({ bar: "Major Connector Type: 6", plate: "Major Connector Type: 7" });
    expect(diffs.filter((d) => /Minor Connector/.test(d.bar)).length).toBeGreaterThan(0);
  });
});

/**
 * A lingual BAR carries no plating, so switching to one strips every plate-prox in the
 * jaw. On a design whose abutments were plated rather than clasped, that removed the very
 * anchors the span fill and the render-time prune read: the bar deleted itself on the next
 * paint, switching back to the plate re-derived nothing, and the connector could no longer
 * be placed by hand either ("the plate from 35 to 45 is missing... can't place the MJ").
 */
describe("plate -> bar -> plate keeps its coverage", () => {
  /** A loaded lingual-plate design: every present lower tooth is plated, nothing else. */
  function platedArch() {
    const state = buildFreshState();
    for (const toothId of TOOTH_ORDER.lower) {
      state.teeth[toothId].componentPlacements.push({ componentId: "plate-prox", surface: null });
      syncToothComponentsFromPlacements(state.teeth[toothId]);
    }
    return state;
  }

  const platedTeeth = (state) =>
    TOOTH_ORDER.lower.filter((toothId) =>
      (state.teeth[toothId]?.componentPlacements || []).some((e) => e.componentId === "plate-prox")
    );
  /** What renderJaw does on every paint. */
  const paint = (state) => pruneInvalidMajorConnectorPlacementsInJaw(state.teeth, COMPONENT_BY_ID, "lower");

  it("the bar survives its own plate-stripping", () => {
    const state = platedArch();
    switchLowerMajor(state, "major-lower-lingual-plate");
    const span = lowerSpan(state);
    expect(span.length).toBeGreaterThan(0);

    switchLowerMajor(state, "major-lower-lingual-bar");
    paint(state);
    expect(platedTeeth(state)).toEqual([]); // a bar plates nothing
    expect(lowerSpan(state)).toEqual(span); // ...but it is still there
  });

  it("switching back restores the span, the plating, and the ability to re-place by hand", () => {
    const state = platedArch();
    switchLowerMajor(state, "major-lower-lingual-plate");
    paint(state);
    const span = lowerSpan(state);
    const plated = platedTeeth(state);

    switchLowerMajor(state, "major-lower-lingual-bar");
    paint(state);
    switchLowerMajor(state, "major-lower-lingual-plate");
    paint(state);

    expect(lowerSpan(state)).toEqual(span);
    expect(platedTeeth(state)).toEqual(plated);

    // The click gate needs a plate or clasp on a present tooth (toothSupportsMajorConnectorOverlay).
    for (const toothId of ["35", "45"]) {
      const anchored = (state.teeth[toothId].componentPlacements || []).some(
        (e) => String(e.componentId).startsWith("plate-") || String(e.componentId).endsWith("-clasp")
      );
      expect([toothId, anchored]).toEqual([toothId, true]);
    }
  });

  it("still keeps the clasp/mesh-anchored design intact through the round trip", () => {
    const state = buildFreshState();
    for (const toothId of ["33", "32", "31", "41", "42", "43"]) {
      Object.assign(state.teeth[toothId], { isPresent: false, status: "missing" });
      state.teeth[toothId].componentPlacements.push({ componentId: "mesh-flange", surface: null });
    }
    for (const toothId of ["36", "46"]) {
      state.teeth[toothId].componentPlacements.push({ componentId: "retainer-clasp", surface: "mesial_buccal" });
    }
    for (const toothId of TOOTH_ORDER.lower) syncToothComponentsFromPlacements(state.teeth[toothId]);

    switchLowerMajor(state, "major-lower-lingual-plate");
    paint(state);
    const span = lowerSpan(state);
    const plated = platedTeeth(state);

    switchLowerMajor(state, "major-lower-lingual-bar");
    paint(state);
    switchLowerMajor(state, "major-lower-lingual-plate");
    paint(state);

    expect(lowerSpan(state)).toEqual(span);
    expect(platedTeeth(state)).toEqual(plated);
  });
});

/** Byte-exact proof against desktop output for the same case saved both ways. */
describe("lower lingual plate: web reproduces desktop geometry", () => {
  it("loaded BAR round-trips to the desktop bar file", () => {
    const state = buildFreshState();
    loadInto(state, barText);
    expect(lineDiffs(barText, encodeJawStructText(state, "lower"))).toEqual([]);
  });

  it("BAR -> switch to PLATE encodes the desktop plate file", () => {
    const state = buildFreshState();
    loadInto(state, barText);
    switchLowerMajor(state, "major-lower-lingual-plate");
    expect(lineDiffs(plateText, encodeJawStructText(state, "lower"))).toEqual([]);
  });

  // Data-driven plating: a loaded lingual plate stamps reciprocating=2 on every present
  // tooth, and each decodes into a real, per-tooth (erasable) plate-prox.
  it("loading a lingual PLATE creates one plate-prox per present tooth", () => {
    const design = resolveJawStructDesign(parseJawStructText(plateText));
    expect(design.major).toBe("major-lower-lingual-plate");

    const teeth = Object.values(design.teeth);
    const presentCount = teeth.filter((t) => t.present).length;
    const plateProxTeeth = teeth.filter((t) =>
      (t.placements || []).some((p) => p.componentId === "plate-prox")
    );
    expect(presentCount).toBeGreaterThan(0);
    expect(plateProxTeeth.length).toBe(presentCount);
    expect(plateProxTeeth.every((t) => t.present)).toBe(true);
  });

  // Regression: a bar must not reopen as a plate — no stray plate-prox may survive.
  it("PLATE -> switch to BAR -> reopen stays a clean bar (no leftover plate-prox)", () => {
    const state = buildFreshState();
    loadInto(state, plateText);
    switchLowerMajor(state, "major-lower-lingual-bar");

    const reopened = resolveJawStructDesign(parseJawStructText(encodeJawStructText(state, "lower")));
    expect(reopened.major).toBe("major-lower-lingual-bar");
    const plateProx = Object.values(reopened.teeth)
      .flatMap((t) => t.placements || [])
      .filter((p) => p.componentId === "plate-prox").length;
    expect(plateProx).toBe(0);
  });
});

/**
 * Pr Config is a per-position flag triple (mesial/distal/lingual, 0 = present), not a
 * single-value enum, which is what lets a Half & Half tooth carry two rest seats.
 * Encoding only the first placement would silently drop one rest on save.
 */
describe("a double-rested tooth (Half & Half) survives save -> load", () => {
  /** Load the real lower design, force `surfaces` rests on 36, save, read back. */
  function restsAfterReload(...surfaces) {
    const state = buildFreshState();
    applyJawStructDesign(resolveJawStructDesign(decodeJawStructResponse(records).lower), state);
    Object.assign(state.teeth["36"], {
      isPresent: true,
      components: ["rest-seat"],
      componentPlacements: surfaces.map((surface) => ({ componentId: "rest-seat", surface })),
    });

    return saveAndReload(state)["36"].componentPlacements
      .filter((p) => p.componentId === "rest-seat")
      .map((p) => p.surface)
      .sort();
  }

  it("keeps BOTH rests, and keeps a single rest single (no phantom second seat)", () => {
    expect(restsAfterReload("mesial", "distal")).toEqual(["distal", "mesial"]);
    expect(restsAfterReload("distal")).toEqual(["distal"]);
    expect(restsAfterReload("mesial")).toEqual(["mesial"]);
  });
});

/**
 * Tooth Condition (Select Teeth status) used to be encode-only: save wrote 1/2, but
 * resolve read Tooth Presence alone, so every abutment/compromised tooth reopened as
 * plain "presence".
 */
describe("tooth condition (abutment / compromised) survives save -> load", () => {
  const statusesAfterReload = (byTooth) => {
    const state = buildFreshState();
    applyJawStructDesign(resolveJawStructDesign(decodeJawStructResponse(records).lower), state);
    for (const [toothId, status] of Object.entries(byTooth)) {
      Object.assign(state.teeth[toothId], { isPresent: true, status });
    }
    const teeth = saveAndReload(state);
    return Object.fromEntries(Object.keys(byTooth).map((id) => [id, teeth[id].status]));
  };

  it("round-trips each status, and leaves untouched teeth on presence", () => {
    expect(statusesAfterReload({ 36: "abutment", 37: "compromised", 35: "presence" })).toEqual({
      36: "abutment",
      37: "compromised",
      35: "presence",
    });
  });

  it("encodes the desktop enum (abutment = 1, compromised = 2, presence = 0)", () => {
    const state = buildFreshState();
    applyJawStructDesign(resolveJawStructDesign(decodeJawStructResponse(records).lower), state);
    Object.assign(state.teeth["36"], { isPresent: true, status: "abutment" });
    Object.assign(state.teeth["37"], { isPresent: true, status: "compromised" });

    const conditions = encodeJawStructText(state, "lower")
      .split(/\r?\n/)
      .filter((l) => l.includes("Tooth Main.Tooth Index.Tooth Condition"))
      .map((l) => l.trim().split(": ").pop());
    expect(conditions.filter((v) => v === "1").length).toBe(1);
    expect(conditions.filter((v) => v === "2").length).toBe(1);
  });

  // Backend wins on open: a design saved elsewhere with the abutment cleared must not
  // leave the local status behind.
  it("clears a stale local abutment when the loaded design says normal", () => {
    const state = buildFreshState();
    state.teeth["36"].status = "abutment";
    applyJawStructDesign(resolveJawStructDesign(decodeJawStructResponse(records).lower), state);
    expect(state.teeth["36"].status).toBe("presence");
  });
});

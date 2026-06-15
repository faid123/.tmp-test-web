/**
 * @jest-environment jsdom
 *
 * Verifies the fix for "web sets lower lingual plate but desktop shows bar".
 * Fixtures are the SAME case (1923) saved from the desktop once as a lingual
 * bar and once as a lingual plate (decoded from case_1923/*.rtf). We load the
 * BAR, switch the major connector to PLATE the way the catalog does, encode,
 * and assert the output matches the desktop PLATE file — proving the web now
 * writes real plate geometry (the Minor Connector grid), not just the label.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("../src/js/2D/2DAnnotation.js", () => ({ state: { teeth: {} } }));

import {
  parseJawStructText,
  resolveJawStructDesign,
  encodeJawStructText,
} from "../src/js/2D/jawStructCodec.js";
import { applyJawStructDesign } from "../src/js/2D/jawStructApply.js";
import {
  COMPONENT_BY_ID,
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws,
  isMajorConnectorComponent,
} from "../src/js/2D/components.js";
import { syncToothComponentsFromPlacements } from "../src/js/2D/annotationTeethModel.js";
import { TOOTH_ORDER } from "../src/js/2D/constants.js";

const ROOT = process.cwd();
const barText = readFileSync(join(ROOT, "__tests__/fixtures/case_1923_bar_lower.txt"), "utf8");
const plateText = readFileSync(join(ROOT, "__tests__/fixtures/case_1923_plate_lower.txt"), "utf8");

const LOWER = ["38","37","36","35","34","33","32","31","41","42","43","44","45","46","47","48"];
function freshState() {
  const teeth = {};
  for (const fdi of ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"]) teeth[fdi] = { tooth_id: fdi, jaw: "upper", status: "presence", isPresent: true, components: [], componentPlacements: [], center: [0,0] };
  for (const fdi of LOWER) teeth[fdi] = { tooth_id: fdi, jaw: "lower", status: "presence", isPresent: true, components: [], componentPlacements: [], center: [0,0] };
  return { teeth };
}
const norm = (t) => String(t).replace(/(Start of Jaw Struct yr\.mth\.day\.hr\.min\.sec: ).*/, "$1<STAMP>").replace(/\r\n/g, "\n").trimEnd();
function diffs(expected, actual) {
  const e = norm(expected).split("\n"), a = norm(actual).split("\n");
  const out = [];
  for (let i = 0; i < Math.max(e.length, a.length); i += 1) if (e[i] !== a[i]) out.push(`  line ${i}: desktop=${JSON.stringify(e[i])} web=${JSON.stringify(a[i])}`);
  return out;
}
function switchLowerMajor(state, componentId) {
  for (const t of TOOTH_ORDER.lower) {
    const rec = state.teeth[t];
    if (rec?.componentPlacements) rec.componentPlacements = rec.componentPlacements.filter((e) => !isMajorConnectorComponent(e.componentId));
  }
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws(state.teeth, componentId, COMPONENT_BY_ID, ["lower"]);
  for (const t of TOOTH_ORDER.lower) if (state.teeth[t]) syncToothComponentsFromPlacements(state.teeth[t]);
}

describe("lower lingual plate: web reproduces desktop geometry", () => {
  it("loaded BAR round-trips to the desktop bar file", () => {
    const s = freshState();
    applyJawStructDesign(resolveJawStructDesign(parseJawStructText(barText)), s);
    const d = diffs(barText, encodeJawStructText(s, "lower"));
    if (d.length) console.error("\n[bar round-trip] diffs:\n" + d.join("\n"));
    expect(d).toEqual([]);
  });

  it("BAR -> switch to PLATE encodes the desktop plate file", () => {
    const s = freshState();
    applyJawStructDesign(resolveJawStructDesign(parseJawStructText(barText)), s);
    switchLowerMajor(s, "major-lower-lingual-plate");
    const d = diffs(plateText, encodeJawStructText(s, "lower"));
    if (d.length) console.error(`\n[bar->plate] ${d.length} diffs vs desktop plate:\n` + d.join("\n"));
    expect(d).toEqual([]);
  });

  // Regression: a loaded lingual plate must not spawn per-tooth plate-prox
  // (reciprocating=2 noise) that renders as proximal plates overlapping the plate.
  it("loading a lingual PLATE creates no overlapping reciprocating plate-prox", () => {
    const design = resolveJawStructDesign(parseJawStructText(plateText));
    expect(design.major).toBe("major-lower-lingual-plate");
    const plateProx = Object.values(design.teeth)
      .flatMap((t) => t.placements || [])
      .filter((p) => p.componentId === "plate-prox").length;
    expect(plateProx).toBe(0);
  });

  // Regression: load a PLATE (decodes reciprocating=2 into plate-prox on teeth),
  // switch to lingual BAR, save, reopen. The bar must NOT reopen as a plate —
  // i.e. no stray plate-prox should survive the round-trip.
  it("PLATE -> switch to BAR -> reopen stays a clean bar (no leftover plate-prox)", () => {
    const s = freshState();
    applyJawStructDesign(resolveJawStructDesign(parseJawStructText(plateText)), s);
    switchLowerMajor(s, "major-lower-lingual-bar");
    const reopened = resolveJawStructDesign(parseJawStructText(encodeJawStructText(s, "lower")));
    expect(reopened.major).toBe("major-lower-lingual-bar");
    const plateProx = Object.values(reopened.teeth)
      .flatMap((t) => t.placements || [])
      .filter((p) => p.componentId === "plate-prox").length;
    expect(plateProx).toBe(0);
  });
});

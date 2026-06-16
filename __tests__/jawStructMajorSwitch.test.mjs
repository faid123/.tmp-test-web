/**
 * @jest-environment jsdom
 *
 * Repro for "web changes lower major connector to lingual plate but the desktop
 * shows lingual bar". Loads the real lower-jaw design, then drives the SAME
 * placement primitive the catalog uses (clear lower majors -> ensure new major
 * on supported teeth -> sync) to switch bar<->plate, and checks the encoded
 * "Major Connector Type" line (6 = lingual bar, 7 = lingual plate).
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("../src/js/2D/2DAnnotation.js", () => ({ state: { teeth: {} } }));

import {
  decodeJawStructResponse,
  resolveJawStructDesign,
  encodeJawStructText,
} from "../src/js/2D/jawStructCodec.js";
import { applyJawStructDesign } from "../src/js/2D/jawStructApply.js";
import {
  COMPONENT_BY_ID,
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws,
  isMajorConnectorComponent,
  syncReciprocatingPlatesToMajorConnector,
} from "../src/js/2D/components.js";
import { syncToothComponentsFromPlacements } from "../src/js/2D/annotationTeethModel.js";
import { TOOTH_ORDER } from "../src/js/2D/constants.js";

const REPO_ROOT = process.cwd();
const records = JSON.parse(readFileSync(join(REPO_ROOT, "03_jawstruct_l2_getall.json"), "utf8"));

const UPPER = ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"];
const LOWER = ["38","37","36","35","34","33","32","31","41","42","43","44","45","46","47","48"];
function buildFreshState() {
  const teeth = {};
  for (const fdi of UPPER) teeth[fdi] = { tooth_id: fdi, jaw: "upper", status: "presence", isPresent: true, components: [], componentPlacements: [], center: [0,0] };
  for (const fdi of LOWER) teeth[fdi] = { tooth_id: fdi, jaw: "lower", status: "presence", isPresent: true, components: [], componentPlacements: [], center: [0,0] };
  return { teeth };
}

function mcLine(state) {
  const line = encodeJawStructText(state, "lower").split(/\r?\n/).find((l) => l.startsWith("Major Connector Type:"));
  return line;
}

// Mirror the catalog's major switch (annotationCatalog.handleDesignComponentSelect,
// the non-palatal-bar branch): clear lower majors, place the new one, sync.
function switchLowerMajor(state, componentId) {
  for (const toothId of TOOTH_ORDER.lower) {
    const tooth = state.teeth[toothId];
    if (!tooth || !Array.isArray(tooth.componentPlacements)) continue;
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (e) => !isMajorConnectorComponent(e.componentId)
    );
  }
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws(state.teeth, componentId, COMPONENT_BY_ID, ["lower"]);
  // Mirror the catalog handler: keep per-tooth plate-prox in step with the connector type.
  syncReciprocatingPlatesToMajorConnector(state.teeth, componentId, ["lower"]);
  for (const toothId of TOOTH_ORDER.lower) {
    if (state.teeth[toothId]) syncToothComponentsFromPlacements(state.teeth[toothId]);
  }
}

describe("lower major connector bar <-> plate switch", () => {
  const state = buildFreshState();
  beforeAll(() => {
    const decoded = decodeJawStructResponse(records);
    if (decoded.upper) applyJawStructDesign(resolveJawStructDesign(decoded.upper), state);
    if (decoded.lower) applyJawStructDesign(resolveJawStructDesign(decoded.lower), state);
  });

  it("loaded design encodes lingual plate (7)", () => {
    expect(mcLine(state)).toBe("Major Connector Type: 7");
  });

  it("switch to lingual bar encodes 6", () => {
    switchLowerMajor(state, "major-lower-lingual-bar");
    const lowerHasBar = LOWER.some((f) => (state.teeth[f].components || []).includes("major-lower-lingual-bar"));
    console.log("after->bar: lowerHasBar=", lowerHasBar, "mc=", mcLine(state));
    expect(mcLine(state)).toBe("Major Connector Type: 6");
  });

  it("switch back to lingual plate encodes 7", () => {
    switchLowerMajor(state, "major-lower-lingual-plate");
    const placed = {};
    LOWER.forEach((f) => (state.teeth[f].components || []).forEach((c) => { if (c.startsWith("major-")) placed[c] = (placed[c]||0)+1; }));
    console.log("after->plate: placed majors=", placed, "mc=", mcLine(state));
    expect(mcLine(state)).toBe("Major Connector Type: 7");
  });

  // Regression guard for the fix: switching the lower major TYPE now also
  // re-routes the Minor Connector grid (Path G<->D) and the per-tooth
  // reciprocating flag, so the desktop renders the right shape — not just a
  // relabelled bar. (Byte-exact reproduction is covered by jawStructLingualPlate.)
  it("bar->plate now changes the type label AND the connector geometry grid", () => {
    const s = buildFreshState();
    const decoded = decodeJawStructResponse(records);
    applyJawStructDesign(resolveJawStructDesign(decoded.lower), s);
    switchLowerMajor(s, "major-lower-lingual-bar");
    const barText = encodeJawStructText(s, "lower").split(/\r?\n/);
    switchLowerMajor(s, "major-lower-lingual-plate");
    const plateText = encodeJawStructText(s, "lower").split(/\r?\n/);
    const diffs = [];
    for (let i = 0; i < Math.max(barText.length, plateText.length); i += 1) {
      if (barText[i] !== plateText[i]) diffs.push({ bar: barText[i], plate: plateText[i] });
    }
    expect(diffs).toContainEqual({ bar: "Major Connector Type: 6", plate: "Major Connector Type: 7" });
    expect(diffs.filter((d) => /Minor Connector/.test(d.bar)).length).toBeGreaterThan(0);
  });
});

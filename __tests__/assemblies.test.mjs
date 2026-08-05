/**
 * @jest-environment jsdom
 *
 * ASSEMBLY tab macros: the layout each one places, and whether it survives save -> load.
 * Assemblies place through their own placeXAssemblyOnTooth (driven by a rest-seat dot),
 * never the generic engine — see placementRules.test.mjs for that boundary.
 */
import { jest } from "@jest/globals";

jest.mock("../src/js/2D/2DAnnotation.js", () => ({
  state: { teeth: {} },
  setMessage: () => {},
  getHistoryStateSignature: () => "",
  recordHistoryIfChanged: () => {},
}));
jest.mock("../src/js/2D/annotationCatalog.js", () => ({
  ensureMajorCatalogPickForTooth: () => {},
  isComponentBlockedByMaterial: () => false,
}));

import { state } from "../src/js/2D/2DAnnotation.js";
import {
  getContinuousClaspRestSurfaces,
  getGapFacingRestSurfaces,
  hasMeshedDistalSaddle,
  hasMissingDistalNeighbour,
  placeAssemblyRpaOnTooth,
  placeAssemblyRpiOnTooth,
  placeBackActionAssemblyOnTooth,
  placeEmbrasureCircumAssemblyOnTooth,
  placeHalfAndHalfAssemblyOnTooth,
  placeMultiCircumAssemblyOnTooth,
  placeSimpleCircumAssemblyOnTooth,
} from "../src/js/2D/annotationPlacement.js";
import { pruneInvalidBarPlacementsInJaw } from "../src/js/2D/components.bar.js";
import {
  ASSEMBLY_REST_SUGGESTION_IDS,
  COMPONENT_CATALOG,
  getMinorConnectorSupportSides,
} from "../src/js/2D/components.js";
import { encodeJawStructText } from "../src/js/2D/jawStructCodec.js";
import { getNeighborToothIds, TOOTH_ORDER } from "../src/js/2D/constants.js";
import { freshTeeth, rowsOn } from "./helpers/teeth.mjs";
import { saveAndReload } from "./helpers/jawStructIO.mjs";

/** Both arches present except `missing`, then per-tooth patches (e.g. a meshed saddle). */
function setupArches(missing = [], overrides = {}) {
  state.teeth = freshTeeth(missing);
  for (const [toothId, patch] of Object.entries(overrides)) {
    Object.assign(state.teeth[toothId], patch);
  }
}

/** A saddle the bar rules recognise — RPI needs one to base its I-bar from. */
const meshed = {
  components: ["mesh-flange"],
  componentPlacements: [{ componentId: "mesh-flange", surface: null }],
};

const placementsOn = (id) => rowsOn(state.teeth, id);
const idsOn = (id) => state.teeth[id].componentPlacements.map((p) => p.componentId).sort();
const surfaceOf = (id, componentId) =>
  state.teeth[id].componentPlacements.find((p) => p.componentId === componentId)?.surface;
const restsOn = (id) =>
  state.teeth[id].componentPlacements
    .filter((p) => p.componentId === "rest-seat")
    .map((p) => p.surface)
    .sort();
const minorConnectorSides = (id) => getMinorConnectorSupportSides(state.teeth[id]);
/** Same, with the neighbours the mesh rule needs (arch-order mesial/distal records). */
const minorConnectorSidesInArch = (id, jaw) => {
  const ids = getNeighborToothIds(id, jaw);
  return getMinorConnectorSupportSides(state.teeth[id], {
    mesial: state.teeth[ids.mesial] || null,
    distal: state.teeth[ids.distal] || null,
  });
};

/**
 * Back-action once shipped invisible because its id was missing from a hand-written
 * suggestion set: an assembly id is not an isRestComponent, so the jaw drew no dots at
 * all. The set is derived from the catalog now; this keeps it that way.
 */
describe("every assembly can draw its rest-seat dots", () => {
  it("covers all visible ASSEMBLY-tab components, Back-action included", () => {
    const visibleAssemblyIds = COMPONENT_CATALOG.filter(
      (entry) => entry.tab === "assembly" && entry.hidden !== true
    ).map((entry) => entry.id);

    expect(visibleAssemblyIds).toContain("assembly-circ-ring-support"); // the one that shipped invisible
    for (const id of visibleAssemblyIds) {
      expect(ASSEMBLY_REST_SUGGESTION_IDS.has(id)).toBe(true);
    }
  });

  it("does not sweep in non-assembly components", () => {
    for (const id of ["rest-seat", "retainer-clasp", "bar-i", "plate-prox", "mesh-flange"]) {
      expect(ASSEMBLY_REST_SUGGESTION_IDS.has(id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- RPI / RPA
/**
 * Both are distal-extension designs: mesial rest + proximal (reciprocal) plate + one
 * distal retentive element — an I-bar for RPI, a buccal circumferential clasp for RPA.
 */
describe("distal-extension eligibility", () => {
  it("is true only when the tooth AWAY from the midline is missing", () => {
    setupArches(["36", "44"]);
    expect(hasMissingDistalNeighbour("35", "lower")).toBe(true); // 36 is distal to 35
    expect(hasMissingDistalNeighbour("37", "lower")).toBe(false); // 36 is mesial to 37
    expect(hasMissingDistalNeighbour("45", "lower")).toBe(false); // 44 is mesial to 45
    expect(hasMissingDistalNeighbour("43", "lower")).toBe(true); // 44 is distal to 43
  });

  it("mirrors correctly across quadrants", () => {
    setupArches(["26", "16"]);
    expect(hasMissingDistalNeighbour("25", "upper")).toBe(true);
    expect(hasMissingDistalNeighbour("27", "upper")).toBe(false);
    expect(hasMissingDistalNeighbour("15", "upper")).toBe(true);
    expect(hasMissingDistalNeighbour("17", "upper")).toBe(false);
  });

  it("separates 'missing' from 'meshed' — RPI needs a saddle to base the bar from", () => {
    setupArches(["36"]);
    expect(hasMissingDistalNeighbour("35", "lower")).toBe(true);
    expect(hasMeshedDistalSaddle("35", "lower")).toBe(false);

    setupArches(["36"], { 36: meshed });
    expect(hasMeshedDistalSaddle("35", "lower")).toBe(true);
  });
});

describe("RPI = mesial rest + proximal plate + distal I-bar", () => {
  const withSaddle = () =>
    setupArches(["36", "37", "38"], { 36: meshed, 37: meshed, 38: meshed });

  it("places all three, with the rest on the mesial", () => {
    withSaddle();
    expect(placeAssemblyRpiOnTooth("35", "lower", "mesial")).toBe(true);

    expect(idsOn("35")).toEqual(["bar-i", "plate-prox", "rest-seat"]);
    expect(surfaceOf("35", "rest-seat")).toBe("mesial");
    expect(surfaceOf("35", "plate-prox")).toBe(null);
  });

  it("uses a bar surface the render-time prune accepts (the label is not the anatomical side)", () => {
    withSaddle();
    placeAssemblyRpiOnTooth("35", "lower", "mesial");

    // Counter-intuitive but load-bearing: a DISTAL saddle yields the `_mesial` label,
    // matching getBarPlacementSurfaceForTooth. Hardcoding `bar_d1_distal` here would
    // pass placement and then be silently pruned on the next render.
    expect(surfaceOf("35", "bar-i")).toBe("bar_d1_mesial");

    pruneInvalidBarPlacementsInJaw(state.teeth, "lower");
    expect(surfaceOf("35", "bar-i")).toBe("bar_d1_mesial");
  });

  it.each([
    ["a mesial rest on a non-distal-extension abutment", ["34"], { 34: meshed }, "mesial"],
    ["a distal saddle with no mesh (the bar would be pruned away)", ["36"], {}, "mesial"],
    ["a distal rest — RPI is mesial-rest only", ["36"], { 36: meshed }, "distal"],
  ])("refuses %s", (_name, missing, overrides, surface) => {
    setupArches(missing, overrides);
    expect(placeAssemblyRpiOnTooth("35", "lower", surface)).toBe(false);
    expect(idsOn("35")).toEqual([]);
  });
});

describe("RPA = mesial rest + proximal plate + mesial buccal clasp", () => {
  // The Akers arm faces the rest, so RPA keeps the clasp on the SAME side as the rest —
  // the opposite of Simple Circum, where a mesial rest pairs with a distal_buccal retainer.
  it("places all three, clasp on the same side as the rest, and needs no meshed saddle", () => {
    setupArches(["36"]);
    expect(placeAssemblyRpaOnTooth("35", "lower", "mesial")).toBe(true);

    expect(idsOn("35")).toEqual(["plate-prox", "rest-seat", "retainer-clasp"]);
    expect(surfaceOf("35", "rest-seat")).toBe("mesial");
    expect(surfaceOf("35", "retainer-clasp")).toBe("mesial_buccal");
  });

  it("reciprocates with the plate, never a reciprocating clasp", () => {
    setupArches(["36"]);
    placeAssemblyRpaOnTooth("35", "lower", "mesial");
    expect(idsOn("35")).not.toContain("reciprocating-clasp");
  });

  it("replaces a previously placed assembly on the same tooth", () => {
    setupArches(["36"], { 36: meshed });
    placeAssemblyRpiOnTooth("35", "lower", "mesial");
    expect(idsOn("35")).toContain("bar-i");

    placeAssemblyRpaOnTooth("35", "lower", "mesial");
    expect(idsOn("35")).toEqual(["plate-prox", "rest-seat", "retainer-clasp"]);
  });
});

// ------------------------------------------------------------- Back-action
/**
 * Reference layout, dictated by the user for "45 missing":
 *
 *          44                        46
 *   rest   distal                    mesial
 *   clasp  mesio_buccal              disto_buccal
 *   recip  disto_lingual             mesio_lingual
 *
 * i.e. clasp on the corner OPPOSITE the rest, reciprocal on the rest's own corner.
 */
describe("Back-action Clasps — the reference layout", () => {
  it.each([
    ["44", "distal", ["reciprocating-clasp:distal_lingual", "rest-seat:distal", "retainer-clasp:mesial_buccal"]],
    ["46", "mesial", ["reciprocating-clasp:mesial_lingual", "rest-seat:mesial", "retainer-clasp:distal_buccal"]],
  ])("%s with a %s rest: clasp on the opposite corner, reciprocal on the rest's own", (toothId, rest, rows) => {
    setupArches(["45"]);
    expect(placeBackActionAssemblyOnTooth(toothId, rest)).toBe(true);
    expect(placementsOn(toothId)).toEqual(rows);
  });

  it("offers both rest surfaces, unlike the mesial-pinned assemblies", () => {
    setupArches();
    expect(placeBackActionAssemblyOnTooth("16", "mesial")).toBe(true);
    expect(placeBackActionAssemblyOnTooth("16", "distal")).toBe(true);
    expect(placeBackActionAssemblyOnTooth("16", "lingual")).toBe(false);
  });

  it("refuses a missing tooth", () => {
    setupArches(["16"]);
    expect(placeBackActionAssemblyOnTooth("16", "mesial")).toBe(false);
    expect(placementsOn("16")).toEqual([]);
  });

  it("replaces whatever circum bundle was already on the tooth", () => {
    setupArches();
    placeSimpleCircumAssemblyOnTooth("16", "distal");
    placeBackActionAssemblyOnTooth("16", "mesial");
    expect(placementsOn("16")).toEqual([
      "reciprocating-clasp:mesial_lingual",
      "rest-seat:mesial",
      "retainer-clasp:distal_buccal",
    ]);
  });
});

/**
 * The whole point of the component: Simple keeps the reciprocal at the SAME corner as
 * the retainer (the app-wide arch-flip rule), Back-action moves it to the rest's corner.
 * Only the reciprocal differs — if this stops failing, Back-action has become Simple.
 */
describe("Back-action is distinguishable from Simple", () => {
  it.each([["mesial"], ["distal"]])("differs on a %s rest, and only in the reciprocal", (rest) => {
    setupArches();
    placeBackActionAssemblyOnTooth("16", rest);
    const backAction = placementsOn("16");

    setupArches();
    placeSimpleCircumAssemblyOnTooth("16", rest);
    const simple = placementsOn("16");

    expect(backAction).not.toEqual(simple);
    const strip = (rows) => rows.filter((r) => !r.startsWith("reciprocating-clasp"));
    expect(strip(backAction)).toEqual(strip(simple));
  });
});

/**
 * The minor-connector side is derived, not stored. A wrapped arm (retentive clasp and
 * reciprocal at OPPOSITE corners) joins at the clasp's own side, replacing the usual
 * rest+clasp derivation — that special case is what puts 44 on the mesial and 46 on the
 * distal as requested, instead of the inverse the general rule would give.
 */
describe("derived minor-connector side", () => {
  it("attaches on the clasp's side for back-action (44 mesial, 46 distal)", () => {
    setupArches(["45"]);
    placeBackActionAssemblyOnTooth("44", "distal");
    expect(minorConnectorSides("44")).toEqual({ mesial: true, distal: false });

    setupArches(["45"]);
    placeBackActionAssemblyOnTooth("46", "mesial");
    expect(minorConnectorSides("46")).toEqual({ mesial: false, distal: true });
  });

  it("leaves Simple on the general rule — its arms share a corner", () => {
    setupArches();
    placeSimpleCircumAssemblyOnTooth("16", "mesial");
    expect(minorConnectorSides("16")).toEqual({ mesial: true, distal: false });

    setupArches();
    placeSimpleCircumAssemblyOnTooth("16", "distal");
    expect(minorConnectorSides("16")).toEqual({ mesial: false, distal: true });
  });

  it("needs BOTH a retentive and a reciprocating clasp to take the exception", () => {
    setupArches();
    state.teeth["16"].componentPlacements = [
      { componentId: "rest-seat", surface: "mesial" },
      { componentId: "retainer-clasp", surface: "mesial_buccal" },
    ];
    // No reciprocal: general rule, so the mesial-tip clasp anchors distally.
    expect(minorConnectorSides("16")).toEqual({ mesial: true, distal: true });
  });
});

/**
 * The mesh rule: a meshed saddle reaches the major connector through an adjacent
 * reciprocating element (plate / reciprocating clasp) or a continuing mesh. Where an
 * embrasure has neither, the saddle bridges it with its own minor connector.
 */
describe("mesh minor-connector sides", () => {
  const plated = {
    components: ["plate-prox"],
    componentPlacements: [{ componentId: "plate-prox", surface: null }],
  };

  it("bridges both sides when neither neighbour reciprocates or meshes", () => {
    setupArches(["36"], { "36": meshed });
    expect(minorConnectorSidesInArch("36", "lower")).toEqual({ mesial: true, distal: true });
  });

  it("skips the side already carried by a neighbouring plate", () => {
    setupArches(["36"], { "36": meshed, "35": plated });
    // 35 is mesial of 36, so its plate covers the mesh's mesial embrasure.
    expect(minorConnectorSidesInArch("36", "lower")).toEqual({ mesial: false, distal: true });
  });

  it("skips the side where the saddle continues into another mesh", () => {
    setupArches(["36", "37"], { "36": meshed, "37": meshed });
    expect(minorConnectorSidesInArch("36", "lower")).toEqual({ mesial: true, distal: false });
    expect(minorConnectorSidesInArch("37", "lower")).toEqual({ mesial: false, distal: true });
  });

  it("has nothing to bridge to across a missing, unmeshed neighbour or the arch end", () => {
    setupArches(["36", "37"], { "36": meshed });
    expect(minorConnectorSidesInArch("36", "lower")).toEqual({ mesial: true, distal: false });

    setupArches(["38"], { "38": meshed });
    expect(minorConnectorSidesInArch("38", "lower")).toEqual({ mesial: true, distal: false });
  });

  it("mirrors across quadrants and the midline", () => {
    setupArches(["26"], { "26": meshed });
    expect(minorConnectorSidesInArch("26", "upper")).toEqual({ mesial: true, distal: true });

    setupArches(["41"], { "41": meshed, "31": plated });
    // 31 sits across the midline from 41 — mesial to it.
    expect(minorConnectorSidesInArch("41", "lower")).toEqual({ mesial: false, distal: true });
  });

  it("leaves an unmeshed missing site alone", () => {
    setupArches(["36"]);
    expect(minorConnectorSidesInArch("36", "lower")).toEqual({ mesial: false, distal: false });
  });
});

// ---------------------------------------------------------- Combine Clasps
/**
 * Combine brackets an EDENTULOUS AREA rather than a shared embrasure: the rest seats sit
 * on the abutment surfaces that FACE the gap. With 23 missing that is 22-distal and
 * 24-mesial, so it reaches anterior teeth and is exempt from the posterior-only gate the
 * other circum assemblies share.
 */
describe("Combine Clasps — suggestion surfaces face the missing area", () => {
  it("23 missing -> 22 offers distal, 24 offers mesial (the user's example)", () => {
    setupArches(["23"]);
    expect(getGapFacingRestSurfaces("22", "upper")).toEqual(["distal"]);
    expect(getGapFacingRestSurfaces("24", "upper")).toEqual(["mesial"]);
  });

  it("offers nothing on teeth away from the gap, or on the missing tooth itself", () => {
    setupArches(["23"]);
    expect(getGapFacingRestSurfaces("21", "upper")).toEqual([]);
    expect(getGapFacingRestSurfaces("25", "upper")).toEqual([]);
    expect(getGapFacingRestSurfaces("23", "upper")).toEqual([]);
  });

  it("mirrors across quadrants and arches", () => {
    setupArches(["13", "36", "46"]);
    expect(getGapFacingRestSurfaces("12", "upper")).toEqual(["distal"]);
    expect(getGapFacingRestSurfaces("14", "upper")).toEqual(["mesial"]);
    expect(getGapFacingRestSurfaces("35", "lower")).toEqual(["distal"]);
    expect(getGapFacingRestSurfaces("37", "lower")).toEqual(["mesial"]);
    expect(getGapFacingRestSurfaces("45", "lower")).toEqual(["distal"]);
    expect(getGapFacingRestSurfaces("47", "lower")).toEqual(["mesial"]);
  });

  it("offers both surfaces on a lone tooth standing between two gaps", () => {
    setupArches(["22", "24"]);
    expect(getGapFacingRestSurfaces("23", "upper").sort()).toEqual(["distal", "mesial"]);
  });
});

/**
 * Reference layout for "15 missing":
 *
 *        13            14          [15]      16            17
 *  rest  distal        mesial            gap mesial        mesial
 *                      distal                distal
 *  clasp mesio_buccal  disto_buccal          mesio_buccal  disto_buccal
 *  recip mesio_lingual disto_lingual         mesio_lingual disto_lingual
 *        └── outward ──┴─ abutment ─┘        └ abutment ─┴── outward ──┘
 *
 * The abutment is double-rested with both arms on its gap-facing corner; the outward
 * tooth is single-rested with both arms on the corner away from its abutment. In both
 * tiers the reciprocal is the retainer arch-flipped at the same corner.
 */
describe("Combine Clasps — 15 missing reference layout", () => {
  beforeEach(() => {
    setupArches(["15"]);
    placeEmbrasureCircumAssemblyOnTooth("14", "upper", "distal");
  });

  it("double-rests the abutments, single-rests the outward pair, and stops there", () => {
    // 14 and 16 are the abutments, 13 and 17 the outward tier.
    expect(placementsOn("14")).toEqual([
      "reciprocating-clasp:distal_lingual",
      "rest-seat:distal",
      "rest-seat:mesial",
      "retainer-clasp:distal_buccal",
    ]);
    expect(placementsOn("16")).toEqual([
      "reciprocating-clasp:mesial_lingual",
      "rest-seat:distal",
      "rest-seat:mesial",
      "retainer-clasp:mesial_buccal",
    ]);
    expect(placementsOn("13")).toEqual([
      "reciprocating-clasp:mesial_lingual",
      "rest-seat:distal",
      "retainer-clasp:mesial_buccal",
    ]);
    expect(placementsOn("17")).toEqual([
      "reciprocating-clasp:distal_lingual",
      "rest-seat:mesial",
      "retainer-clasp:distal_buccal",
    ]);
    expect(placementsOn("12")).toEqual([]);
    expect(placementsOn("18")).toEqual([]);
  });

  it("produces the identical four-tooth result from the far dot (16-mesial)", () => {
    const before = ["13", "14", "16", "17"].map(placementsOn);
    setupArches(["15"]);
    placeEmbrasureCircumAssemblyOnTooth("16", "upper", "mesial");
    expect(["13", "14", "16", "17"].map(placementsOn)).toEqual(before);
  });
});

describe("Combine Clasps — gap shapes", () => {
  it("spans a multi-tooth gap (23 + 24 missing -> 22 pairs with 25)", () => {
    setupArches(["23", "24"]);
    expect(placeEmbrasureCircumAssemblyOnTooth("22", "upper", "distal")).toBe(true);
    expect(restsOn("22")).toEqual(["distal", "mesial"]);
    expect(restsOn("25")).toEqual(["distal", "mesial"]);
    expect(placementsOn("23")).toEqual([]);
    expect(placementsOn("24")).toEqual([]);
  });

  it("places on the single abutment when the gap runs off the arch (free-end saddle)", () => {
    setupArches(["26", "27", "28"]);
    expect(placeEmbrasureCircumAssemblyOnTooth("25", "upper", "distal")).toBe(true);
    expect(restsOn("25")).toEqual(["distal", "mesial"]);
    expect(surfaceOf("24", "rest-seat")).toBe("distal"); // outward tooth
  });

  it("skips an outward neighbour that is missing", () => {
    setupArches(["13", "15"]);
    placeEmbrasureCircumAssemblyOnTooth("14", "upper", "distal");
    expect(placementsOn("13")).toEqual([]);
    expect(restsOn("14")).toEqual(["distal", "mesial"]);
    expect(restsOn("16")).toEqual(["distal", "mesial"]);
  });

  it("refuses a surface that does not face a gap", () => {
    setupArches(["23"]);
    expect(placeEmbrasureCircumAssemblyOnTooth("22", "upper", "mesial")).toBe(false);
    expect(placementsOn("22")).toEqual([]);
    expect(placeEmbrasureCircumAssemblyOnTooth("26", "upper", "distal")).toBe(false);
    expect(placementsOn("26")).toEqual([]);
  });
});

// ------------------------------------------------------- Continuous Clasps
/**
 * Like RPI/RPA, Continuous suggests on whichever abutment surfaces face the gap.
 * Clicking one splints that abutment to the next tooth AWAY from the gap, so 25 missing
 * offers 24-distal (pairing 23) and 26-mesial (pairing 27). The two rests land at the
 * outer ends of the splinted pair; both clasps meet in the shared embrasure between them.
 */
describe("Continuous Clasps — suggestion surfaces sit beside the missing tooth", () => {
  it("25 missing -> 24 offers distal and 26 offers mesial (the user's example)", () => {
    setupArches(["25"]);
    expect(getContinuousClaspRestSurfaces("24", "upper")).toEqual(["distal"]);
    expect(getContinuousClaspRestSurfaces("26", "upper")).toEqual(["mesial"]);
  });

  it("offers nothing away from a gap, on a complete arch, or on a lone pier abutment", () => {
    setupArches(["25"]);
    for (const id of ["23", "27", "16"]) {
      expect(getContinuousClaspRestSurfaces(id, "upper")).toEqual([]);
    }

    setupArches();
    for (const id of TOOTH_ORDER.upper) {
      expect(getContinuousClaspRestSurfaces(id, "upper")).toEqual([]);
    }

    // A lone pier abutment can never qualify: the tooth it would splint to is on the far
    // side of the other gap, so each surface's partner is itself missing.
    setupArches(["24", "26"]);
    expect(getContinuousClaspRestSurfaces("25", "upper")).toEqual([]);
  });

  it("withholds a surface with no present tooth to splint back to", () => {
    // 23 gone too, so 24-distal has nothing on its mesial side to pair with.
    setupArches(["25", "23"]);
    expect(getContinuousClaspRestSurfaces("24", "upper")).toEqual([]);
    expect(getContinuousClaspRestSurfaces("26", "upper")).toEqual(["mesial"]);
  });

  it("mirrors into the lower arch", () => {
    setupArches(["35"]);
    expect(getContinuousClaspRestSurfaces("34", "lower")).toEqual(["distal"]);
    expect(getContinuousClaspRestSurfaces("36", "lower")).toEqual(["mesial"]);
  });
});

describe("Continuous Clasps — a click splints the abutment to the tooth away from the gap", () => {
  it("25 missing, click 24 distal -> builds 24 + 23", () => {
    setupArches(["25"]);
    expect(placeMultiCircumAssemblyOnTooth("24", "upper", "distal")).toBe(true);

    expect(placementsOn("24")).toEqual([
      "reciprocating-clasp:mesial_lingual",
      "rest-seat:distal",
      "retainer-clasp:mesial_buccal",
    ]);
    expect(placementsOn("23")).toEqual([
      "reciprocating-clasp:distal_lingual",
      "rest-seat:mesial",
      "retainer-clasp:distal_buccal",
    ]);
    // Nothing spills onto the far abutment.
    expect(placementsOn("26")).toEqual([]);

    // Rests point away from each other; clasps face each other across the 23/24 contact.
    expect(surfaceOf("24", "rest-seat")).toBe("distal");
    expect(surfaceOf("23", "rest-seat")).toBe("mesial");
    expect(surfaceOf("24", "retainer-clasp")).toBe("mesial_buccal");
    expect(surfaceOf("23", "retainer-clasp")).toBe("distal_buccal");
  });

  const MESIAL_TIP = ["reciprocating-clasp:mesial_lingual", "rest-seat:distal", "retainer-clasp:mesial_buccal"];
  const DISTAL_TIP = ["reciprocating-clasp:distal_lingual", "rest-seat:mesial", "retainer-clasp:distal_buccal"];

  it.each([
    ["25 missing, click 26 mesial -> builds 26 + 27", "upper", ["25"], "26", "mesial", DISTAL_TIP, "27", MESIAL_TIP],
    ["mirrors into the lower arch", "lower", ["35"], "34", "distal", MESIAL_TIP, "33", DISTAL_TIP],
  ])("%s", (_name, jaw, missing, clicked, surface, clickedRows, partner, partnerRows) => {
    setupArches(missing);
    expect(placeMultiCircumAssemblyOnTooth(clicked, jaw, surface)).toBe(true);
    expect(placementsOn(clicked)).toEqual(clickedRows);
    expect(placementsOn(partner)).toEqual(partnerRows);
  });

  it("replaces whatever the two teeth were carrying", () => {
    setupArches(["25"]);
    state.teeth["24"].componentPlacements = [{ componentId: "rest-seat", surface: "mesial" }];
    state.teeth["23"].componentPlacements = [{ componentId: "plate-prox", surface: "distal" }];

    placeMultiCircumAssemblyOnTooth("24", "upper", "distal");
    expect(placementsOn("24")).not.toContain("rest-seat:mesial");
    expect(placementsOn("23")).not.toContain("plate-prox:distal");
  });
});

describe("Continuous Clasps — clicks that are not beside a gap are refused", () => {
  it("rejects a surface facing a present tooth, and an unknown tooth", () => {
    setupArches(["25"]);
    expect(placeMultiCircumAssemblyOnTooth("24", "upper", "mesial")).toBe(false);
    expect(placementsOn("24")).toEqual([]);
    expect(placeMultiCircumAssemblyOnTooth("99", "upper", "distal")).toBe(false);

    setupArches();
    expect(placeMultiCircumAssemblyOnTooth("24", "upper", "distal")).toBe(false);
    expect(placeMultiCircumAssemblyOnTooth("24", "upper", "mesial")).toBe(false);
  });

  it("rejects a gap-facing click with no partner beyond the abutment", () => {
    setupArches(["25", "23"]);
    expect(placeMultiCircumAssemblyOnTooth("24", "upper", "distal")).toBe(false);
    expect(placementsOn("24")).toEqual([]);
  });
});

// ------------------------------------------------------------- Half & Half
/**
 * The retentive and reciprocal arms arise from OPPOSITE mesial/distal directions, so the
 * tooth is double-rested and the reciprocal arm sits lingual while the retentive arm
 * stays buccal. Two rests on one tooth only survive a save because Pr Config is a
 * per-position flag triple, not an enum — the round-trip block below pins that.
 */
describe("Half & Half places two rests and a lingual reciprocal arm", () => {
  it.each([
    ["mesial", "reciprocating-clasp:mesial_lingual", "retainer-clasp:distal_buccal"],
    ["distal", "reciprocating-clasp:distal_lingual", "retainer-clasp:mesial_buccal"],
  ])("seats both rests from the %s dot, reciprocal lingual at the clicked corner", (clicked, reci, retainer) => {
    setupArches();
    expect(placeHalfAndHalfAssemblyOnTooth("36", clicked)).toBe(true);
    expect(placementsOn("36")).toEqual([reci, "rest-seat:distal", "rest-seat:mesial", retainer].sort());
  });

  it("replaces a previous Half & Half rather than stacking rests", () => {
    setupArches();
    placeHalfAndHalfAssemblyOnTooth("36", "mesial");
    placeHalfAndHalfAssemblyOnTooth("36", "distal");
    expect(placementsOn("36")).toEqual([
      "reciprocating-clasp:distal_lingual",
      "rest-seat:distal",
      "rest-seat:mesial",
      "retainer-clasp:mesial_buccal",
    ]);
  });

  it("rejects a lingual rest-seat pick", () => {
    setupArches();
    expect(placeHalfAndHalfAssemblyOnTooth("36", "lingual")).toBe(false);
    expect(placementsOn("36")).toEqual([]);
  });
});

// ------------------------------------------------------- save -> load fidelity
/**
 * Assemblies are macros: nothing records that a bundle came from RPI or Back-action, so
 * fidelity depends entirely on each individual placement being representable.
 */
/** mesh-stripe carries a real Mesh_Type code, which the bar/mesh rules require. */
function meshStripeOn(toothId) {
  state.teeth[toothId].componentPlacements = [{ componentId: "mesh-stripe", surface: null }];
  state.teeth[toothId].components = ["mesh-stripe"];
}

const ROUND_TRIP_CASES = [
  ["Simple (mesial rest)", ["36"], () => placeSimpleCircumAssemblyOnTooth("35", "mesial")],
  ["Simple (distal rest)", ["36"], () => placeSimpleCircumAssemblyOnTooth("35", "distal")],
  ["Continuous Clasps", ["36"], () => placeMultiCircumAssemblyOnTooth("35", "lower", "distal")],
  ["Combine Clasps", ["35"], () => placeEmbrasureCircumAssemblyOnTooth("34", "lower", "distal")],
  ["RPA", ["36"], () => placeAssemblyRpaOnTooth("35", "lower", "mesial")],
  [
    "RPI",
    ["36"],
    () => {
      meshStripeOn("36");
      return placeAssemblyRpiOnTooth("35", "lower", "mesial");
    },
  ],
];

/** Whichever lower teeth the assembly touched — no assumption about which it picks. */
const touchedLowerTeeth = () =>
  TOOTH_ORDER.lower.filter((id) => (state.teeth[id].componentPlacements || []).length > 0);

describe("assemblies survive save -> load", () => {
  it.each(ROUND_TRIP_CASES)("%s", (_name, missing, place) => {
    setupArches(missing);
    expect(place()).toBe(true);

    const inspect = touchedLowerTeeth();
    expect(inspect.length).toBeGreaterThan(0);
    const before = Object.fromEntries(inspect.map((id) => [id, rowsOn(state.teeth, id)]));

    const after = saveAndReload(state);
    for (const id of inspect) {
      expect(rowsOn(after, id)).toEqual(before[id]);
    }
  });
});

/**
 * Documented gap, not an aspiration. Back-action and Half & Half put the reciprocal at
 * the corner opposite the retainer, which the format cannot express (the neighbouring
 * reciprocating_patterntype is the DLL's crossmesh perforation shape, not a spare slot),
 * so it reopens arch-flipped. If these ever start failing, somewhere to persist the
 * corner has been found — update the docs with it.
 */
describe("KNOWN LOSS: an opposite-corner reciprocal reopens arch-flipped", () => {
  it.each([
    ["Back-action (mesial rest)", () => placeBackActionAssemblyOnTooth("35", "mesial"), "mesial_lingual", "distal_lingual"],
    ["Back-action (distal rest)", () => placeBackActionAssemblyOnTooth("35", "distal"), "distal_lingual", "mesial_lingual"],
    ["Half & Half (mesial click)", () => placeHalfAndHalfAssemblyOnTooth("35", "mesial"), "mesial_lingual", "distal_lingual"],
  ])("%s", (_name, place, authored, reopened) => {
    setupArches();
    expect(place()).toBe(true);

    const reciprocalOf = (teeth) =>
      teeth["35"].componentPlacements.find((p) => p.componentId === "reciprocating-clasp")?.surface;
    expect(reciprocalOf(state.teeth)).toBe(authored);

    const after = saveAndReload(state);
    expect(reciprocalOf(after)).toBe(reopened);

    // The loss is confined to the reciprocal — rests and retentive clasp come back intact.
    const withoutReciprocal = (rows) => rows.filter((r) => !r.startsWith("reciprocating-clasp"));
    expect(withoutReciprocal(rowsOn(after, "35"))).toEqual(withoutReciprocal(rowsOn(state.teeth, "35")));
  });
});

/**
 * reciprocating_patterntype is only read when reciprocating_type is 3. The web must
 * never author a value into it.
 */
describe("the reciprocating Pattern Type is never written by the web", () => {
  const patternTypesIn = (text) =>
    text
      .split(/\r?\n/)
      .filter((l) => l.includes("Reciprocating.Tooth Pattern Type"))
      .map((l) => l.split(": ").pop());

  const patternTypesAfter = (missing, place) => {
    setupArches(missing);
    place();
    return new Set(patternTypesIn(encodeJawStructText(state, "lower")));
  };

  it.each([
    ...ROUND_TRIP_CASES,
    ["Back-action", [], () => placeBackActionAssemblyOnTooth("35", "mesial")],
    ["Half & Half", [], () => placeHalfAndHalfAssemblyOnTooth("35", "mesial")],
  ])("stays 0 for %s", (_name, missing, place) => {
    expect(patternTypesAfter(missing, place)).toEqual(new Set(["0"]));
  });
});

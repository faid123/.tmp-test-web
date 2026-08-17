/**
 * Kennedy class -> major connector, and what placing that proposal puts on the arch.
 * JawDesignProposal.js reaches components.js but never the DOM entry, so no mocks here.
 */
import {
  applyDesignProposal,
  buildDesignProposal,
  chooseMajorConnector,
} from "../src/js/2D/JawDesignProposal.js";
import { classifyArch } from "../src/js/2D/JawDesign.js";
import { TOOTH_ORDER } from "../src/js/2D/constants.js";
import { freshTeeth, rowsOn } from "./helpers/teeth.mjs";

const FULL_ACRYLIC = 2;

/** The connector chosen for one arch of an otherwise-intact mouth. */
function connectorFor(jaw, missing, { material = null, compromised = [] } = {}) {
  const teeth = freshTeeth(missing);
  for (const fdi of compromised) teeth[fdi].status = "compromised";
  return chooseMajorConnector(classifyArch(teeth, jaw), teeth, { material });
}

const CLASS_I_LOWER = ["36", "37", "38", "46", "47", "48"];
const CLASS_I_UPPER = ["16", "17", "18", "26", "27", "28"];
const CLASS_II_UPPER = ["25", "26", "27", "28"];
const CLASS_III_UPPER = ["15"];
const CLASS_IV_UPPER = ["12", "11", "21", "22"];
const CLASS_IV_LOWER = ["42", "41", "31", "32"];

describe("chooseMajorConnector", () => {
  const cases = [
    ["Class I upper", "upper", CLASS_I_UPPER, "major-upper-palatal-hole"],
    ["Class II upper", "upper", CLASS_II_UPPER, "major-upper-palatal-hole"],
    ["Class III upper", "upper", CLASS_III_UPPER, "major-upper-palatal-strap"],
    ["Class IV upper", "upper", CLASS_IV_UPPER, "major-upper-palatal-hole"],
    ["Class I lower", "lower", CLASS_I_LOWER, "major-lower-lingual-bar"],
    ["Class II lower", "lower", ["35", "36", "37", "38"], "major-lower-lingual-bar"],
    ["Class III lower", "lower", ["45"], "major-lower-lingual-bar"],
    ["Class IV lower", "lower", CLASS_IV_LOWER, "major-lower-lingual-plate"],
  ];

  it.each(cases)("%s -> %s", (_name, jaw, missing, componentId) => {
    expect(connectorFor(jaw, missing)).toMatchObject({ componentId });
  });

  it("gives no connector to an arch Kennedy does not classify", () => {
    expect(connectorFor("upper", [])).toBeNull();
    expect(connectorFor("upper", TOOTH_ORDER.upper)).toBeNull();
  });

  it("only Class III needs no indirect retention", () => {
    expect(connectorFor("upper", CLASS_I_UPPER).needsIndirectRetention).toBe(true);
    expect(connectorFor("upper", CLASS_II_UPPER).needsIndirectRetention).toBe(true);
    expect(connectorFor("upper", CLASS_IV_UPPER).needsIndirectRetention).toBe(true);
    expect(connectorFor("upper", CLASS_III_UPPER).needsIndirectRetention).toBe(false);
  });

  it("upgrades an upper arch with a compromised abutment to full palatal coverage", () => {
    // 15 abuts the 16-18 distal extension.
    expect(connectorFor("upper", CLASS_I_UPPER, { compromised: ["15"] })).toMatchObject({
      componentId: "major-upper-palatal-plate",
    });
  });

  it("leaves the upper alone when the compromised tooth abuts nothing", () => {
    expect(connectorFor("upper", CLASS_I_UPPER, { compromised: ["11"] })).toMatchObject({
      componentId: "major-upper-palatal-hole",
    });
  });

  it("swaps the lingual bar for a plate when the anteriors need splinting", () => {
    expect(connectorFor("lower", CLASS_I_LOWER, { compromised: ["31"] })).toMatchObject({
      componentId: "major-lower-lingual-plate",
    });
  });

  it("plates both arches for a full-acrylic free-end case", () => {
    expect(connectorFor("upper", CLASS_I_UPPER, { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-upper-palatal-plate",
    });
    expect(connectorFor("lower", CLASS_I_LOWER, { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-lower-lingual-plate",
    });
    expect(connectorFor("upper", CLASS_II_UPPER, { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-upper-palatal-plate",
    });
  });

  it("gives a short bounded acrylic upper the horseshoe instead of the plate", () => {
    // Not free-end, and under five teeth to replace.
    expect(connectorFor("upper", CLASS_III_UPPER, { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-upper-horseshoe",
    });
    expect(connectorFor("upper", ["15", "25", "12"], { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-upper-horseshoe",
    });
    expect(connectorFor("upper", CLASS_IV_UPPER, { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-upper-horseshoe",
    });
  });

  it("plates a bounded acrylic upper once five or more teeth are missing", () => {
    // Two bounded spans, five teeth: 14-16 and 24-25.
    expect(
      connectorFor("upper", ["14", "15", "16", "24", "25"], { material: FULL_ACRYLIC })
    ).toMatchObject({ componentId: "major-upper-palatal-plate" });
    // Four is still a horseshoe — the threshold is exclusive.
    expect(
      connectorFor("upper", ["14", "15", "16", "24"], { material: FULL_ACRYLIC })
    ).toMatchObject({ componentId: "major-upper-horseshoe" });
  });

  it("does not count a dropped third molar against the acrylic threshold", () => {
    // 18 and 28 are missing but excluded by Applegate rule 2, so four teeth are replaced.
    expect(
      connectorFor("upper", ["18", "28", "14", "15", "16", "24"], { material: FULL_ACRYLIC })
    ).toMatchObject({ componentId: "major-upper-horseshoe" });
  });

  it("has no horseshoe below, so the lower acrylic arch always plates", () => {
    expect(connectorFor("lower", ["45"], { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-lower-lingual-plate",
    });
    expect(connectorFor("lower", CLASS_IV_LOWER, { material: FULL_ACRYLIC })).toMatchObject({
      componentId: "major-lower-lingual-plate",
    });
  });

  it("still gives an acrylic arch with no class no connector", () => {
    expect(connectorFor("upper", [], { material: FULL_ACRYLIC })).toBeNull();
    expect(connectorFor("upper", TOOTH_ORDER.upper, { material: FULL_ACRYLIC })).toBeNull();
  });
});

describe("buildDesignProposal", () => {
  it("classifies and picks for both arches independently", () => {
    const proposal = buildDesignProposal(freshTeeth([...CLASS_I_LOWER, "15"]), {
      meshId: "mesh-hole",
    });
    expect(proposal.jaws.upper.classification.label).toBe("Class III");
    expect(proposal.jaws.upper.connector.componentId).toBe("major-upper-palatal-strap");
    expect(proposal.jaws.lower.classification.label).toBe("Class I");
    expect(proposal.jaws.lower.connector.componentId).toBe("major-lower-lingual-bar");
  });

  it("uses the one mesh a full-acrylic case allows", () => {
    expect(buildDesignProposal(freshTeeth(CLASS_I_LOWER), { material: FULL_ACRYLIC }).meshId)
      .toBe("mesh-flange");
    expect(buildDesignProposal(freshTeeth(CLASS_I_LOWER), { meshId: "mesh-hole" }).meshId)
      .toBe("mesh-hole");
  });
});

describe("rest seats", () => {
  const restsFor = (jaw, missing) =>
    buildDesignProposal(freshTeeth(missing), { meshId: "mesh-hole" }).jaws[jaw].rests;

  it("seats a bounded span's rests against the space on both boundary teeth", () => {
    // Rule A: 16 is the posterior boundary (mesial rest), 14 the anterior one (distal rest).
    expect(restsFor("upper", CLASS_III_UPPER)).toEqual([
      { fdi: "16", surface: "mesial", role: "primary" },
      { fdi: "14", surface: "distal", role: "primary" },
    ]);
  });

  it("seats a free-end terminal abutment on the mesial, away from the saddle", () => {
    // Rule B on both terminals, then rule C on the first premolars behind them.
    expect(restsFor("lower", CLASS_I_LOWER)).toEqual([
      { fdi: "35", surface: "mesial", role: "terminal" },
      { fdi: "45", surface: "mesial", role: "terminal" },
      { fdi: "34", surface: "mesial", role: "indirect" },
      { fdi: "44", surface: "mesial", role: "indirect" },
    ]);
  });

  it("puts a Class II indirect rest on the side without the extension", () => {
    // The unmodified quadrant also carries the embrasure pair's own rests.
    expect(restsFor("lower", ["35", "36", "37", "38"])).toEqual([
      { fdi: "34", surface: "mesial", role: "terminal" },
      { fdi: "46", surface: "distal", role: "bracing" },
      { fdi: "47", surface: "mesial", role: "bracing" },
      { fdi: "44", surface: "mesial", role: "indirect" },
    ]);
  });

  it("uses the cingulum on an anterior abutment, and goes posterior for Class IV", () => {
    // 18/28 are skipped as chosen sites, so the second molars take the indirect rests.
    expect(restsFor("upper", CLASS_IV_UPPER)).toEqual([
      { fdi: "13", surface: "lingual_mesial", role: "primary" },
      { fdi: "23", surface: "lingual_mesial", role: "primary" },
      { fdi: "17", surface: "mesial", role: "indirect" },
      { fdi: "27", surface: "mesial", role: "indirect" },
    ]);
  });

  it("gives a tooth between two spans a rest on each side", () => {
    const rests = restsFor("upper", ["15", "13"]);
    expect(rests.filter((rest) => rest.fdi === "14")).toEqual([
      { fdi: "14", surface: "distal", role: "primary" },
      { fdi: "14", surface: "mesial", role: "primary" },
    ]);
  });

  it("leaves a tooth-borne arch without indirect rests", () => {
    expect(restsFor("upper", CLASS_III_UPPER).some((rest) => rest.role === "indirect")).toBe(false);
  });

  it("plans no rests for an arch with no class", () => {
    expect(restsFor("upper", [])).toEqual([]);
    expect(restsFor("upper", TOOTH_ORDER.upper)).toEqual([]);
  });
});

describe("clasps", () => {
  const claspsFor = (jaw, missing) =>
    buildDesignProposal(freshTeeth(missing), { meshId: "mesh-hole" }).jaws[jaw].clasps;
  const asRows = (clasps) =>
    clasps.map((clasp) => [
      clasp.fdi,
      clasp.type,
      clasp.placements.map((p) => `${p.componentId}:${p.surface}`).join(" "),
    ]);

  it("runs a bounded molar's retentive arm away from the space, reciprocated across it", () => {
    // 16 is a molar, outside the aesthetic zone, so it keeps the suprabulge circlet;
    // 14 is a premolar, where visible metal is the deciding factor.
    expect(asRows(claspsFor("upper", CLASS_III_UPPER))).toEqual([
      ["16", "circlet", "retainer-clasp:distal_buccal reciprocating-clasp:distal_lingual"],
      ["14", "ibar", "bar-i:bar_d1_mesial plate-prox:null"],
    ]);
  });

  it("prefers a bar clasp on a bounded anterior or premolar, for aesthetics", () => {
    expect(claspsFor("upper", CLASS_IV_UPPER).map((clasp) => [clasp.fdi, clasp.type])).toEqual([
      ["13", "ibar"],
      ["23", "ibar"],
    ]);
    // A molar abutment of the same span type still takes the circlet; the premolar
    // on the other side of the very same gap does not.
    expect(claspsFor("upper", ["16"]).map((clasp) => [clasp.fdi, clasp.type])).toEqual([
      ["17", "circlet"],
      ["15", "ibar"],
    ]);
  });

  it("gives a free-end premolar abutment the stress-releasing RPI", () => {
    // The bar surface resolves against the saddle the proposal is about to mesh.
    expect(asRows(claspsFor("lower", CLASS_I_LOWER))).toEqual([
      ["35", "rpi", "bar-i:bar_d1_mesial plate-prox:null"],
      ["45", "rpi", "bar-i:bar_d1_mesial plate-prox:null"],
    ]);
  });

  it("takes the I-bar on a canine but not on a molar", () => {
    // The bar clasp is indicated on canines and premolars; a molar terminal takes RPA.
    expect(claspsFor("lower", ["34", "35", "36", "37", "38"])[0]).toMatchObject({
      fdi: "33",
      type: "rpi",
    });
    expect(asRows(claspsFor("lower", ["37", "38", "47", "48"]))).toEqual([
      ["36", "rpa", "retainer-clasp:mesial_buccal plate-prox:null"],
      ["46", "rpa", "retainer-clasp:mesial_buccal plate-prox:null"],
    ]);
  });

  it("never proposes a T-bar or Y-bar", () => {
    // Their indications are undercut position and survey-line shape, which the model
    // does not record — they stay manual picks from the BARS tab.
    const everyClasp = [
      ...claspsFor("lower", CLASS_I_LOWER),
      ...claspsFor("lower", ["37", "38", "47", "48"]),
      ...claspsFor("upper", CLASS_III_UPPER),
      ...claspsFor("upper", CLASS_IV_UPPER),
    ];
    const placed = everyClasp.flatMap((clasp) => clasp.placements.map((p) => p.componentId));
    expect(placed).not.toContain("bar-t");
    expect(placed).not.toContain("bar-y");
  });

  it("treats a span closed by a present third molar as bounded, not free-end", () => {
    // 26-27 missing with 28 standing: Applegate rule 3 keeps 28 in, so no RPI is called for.
    expect(asRows(claspsFor("upper", ["26", "27"]))).toEqual([
      ["25", "ibar", "bar-i:bar_d1_mesial plate-prox:null"],
      // 28 is left isolated behind the saddle, which is the ring clasp's own indication.
      ["28", "ring", "ring-clasp:mesial_buccal plate-prox:null"],
    ]);
  });

  it("braces a Class II unmodified quadrant with an embrasure pair", () => {
    expect(asRows(claspsFor("lower", ["35", "36", "37", "38"]))).toEqual([
      ["34", "rpi", "bar-i:bar_d1_mesial plate-prox:null"],
      ["46", "embrasure", "retainer-clasp:distal_buccal reciprocating-clasp:distal_lingual"],
      ["47", "embrasure", "retainer-clasp:mesial_buccal reciprocating-clasp:mesial_lingual"],
    ]);
  });

  it("rings an isolated molar, engaging the mesial side its jaw tips toward", () => {
    // 36 is left with a gap on either side.
    expect(claspsFor("lower", ["35", "37"]).find((clasp) => clasp.fdi === "36")).toMatchObject({
      type: "ring",
      placements: [
        { componentId: "ring-clasp", surface: "mesial_lingual" },
        { componentId: "plate-prox", surface: null },
      ],
    });
    expect(claspsFor("upper", ["15", "17"]).find((clasp) => clasp.fdi === "16")).toMatchObject({
      type: "ring",
      placements: [{ componentId: "ring-clasp", surface: "mesial_buccal" }, expect.anything()],
    });
  });

  it("gives each abutment one retentive assembly, even when two spans meet on it", () => {
    const clasps = claspsFor("upper", ["15", "13"]);
    expect(clasps.filter((clasp) => clasp.fdi === "14")).toHaveLength(1);
  });

  it("plans no clasps for an arch with no class", () => {
    expect(claspsFor("upper", [])).toEqual([]);
    expect(claspsFor("upper", TOOTH_ORDER.upper)).toEqual([]);
  });
});

describe("acrylic clasps", () => {
  const planFor = (jaw, missing) =>
    buildDesignProposal(freshTeeth(missing), { material: FULL_ACRYLIC }).jaws[jaw];
  const asRows = (clasps) =>
    clasps.map((clasp) => [
      clasp.fdi,
      clasp.placements.map((p) => `${p.componentId}:${p.surface}`).join(" "),
    ]);

  // The arm engages the corner away from the space, so a tooth standing mesial to the space
  // takes it on the mesial and one standing distal to it takes it on the distal.
  const MESIAL_ARM = "retainer-clasp:mesial_buccal plate-prox:null";
  const DISTAL_ARM = "retainer-clasp:distal_buccal plate-prox:null";

  it("clasps only the most posterior space on a side", () => {
    // 24 and 26 missing: the 26 space takes the clasp, on 25. The 24 space gets none.
    expect(asRows(planFor("upper", ["24", "26"]).clasps)).toEqual([["25", MESIAL_ARM]]);
  });

  it("clasps each side independently", () => {
    expect(asRows(planFor("upper", ["16", "26"]).clasps)).toEqual([
      ["15", MESIAL_ARM],
      ["25", MESIAL_ARM],
    ]);
  });

  it("holds a long space at both ends when teeth still stand behind it", () => {
    expect(asRows(planFor("upper", ["23", "24", "25", "26"]).clasps)).toEqual([
      ["22", MESIAL_ARM],
      ["27", DISTAL_ARM],
    ]);
  });

  it("clasps a long free-end space at its mesial end only", () => {
    // Nothing is left distal to hold: 28 is dropped by rule 2, so there is no far abutment.
    expect(asRows(planFor("upper", ["25", "26", "27", "28"]).clasps)).toEqual([
      ["24", MESIAL_ARM],
    ]);
  });

  it("still clasps a short space that reaches the back of the arch", () => {
    expect(asRows(planFor("lower", ["37", "38"]).clasps)).toEqual([["36", MESIAL_ARM]]);
  });

  it("gives an anterior space its distal neighbour, having no mesial one", () => {
    expect(asRows(planFor("upper", CLASS_IV_UPPER).clasps)).toEqual([
      ["13", DISTAL_ARM],
      ["23", DISTAL_ARM],
    ]);
  });

  it("plans no rests and no bars at all", () => {
    for (const missing of [CLASS_I_LOWER, CLASS_II_UPPER, CLASS_III_UPPER, CLASS_IV_UPPER]) {
      const jaw = missing === CLASS_I_LOWER ? "lower" : "upper";
      const plan = planFor(jaw, missing);
      expect(plan.rests).toEqual([]);
      const ids = plan.clasps.flatMap((clasp) => clasp.placements.map((p) => p.componentId));
      expect(ids.some((id) => id.startsWith("bar-"))).toBe(false);
      expect(ids.some((id) => id === "reciprocating-clasp" || id === "ring-clasp")).toBe(false);
    }
  });

  it("places the retainer and its plate, and nothing else, on the arch", () => {
    const teeth = freshTeeth(["24", "26"]);
    const proposal = buildDesignProposal(teeth, { material: FULL_ACRYLIC });
    applyDesignProposal(teeth, proposal);

    expect(rowsOn(teeth, "25")).toEqual(
      expect.arrayContaining(["retainer-clasp:mesial_buccal", "plate-prox:null"])
    );
    for (const fdi of TOOTH_ORDER.upper) {
      const ids = (teeth[fdi].componentPlacements || []).map((p) => p.componentId);
      expect(ids).not.toContain("rest-seat");
      expect(ids.some((id) => id.startsWith("bar-"))).toBe(false);
    }
  });
});

describe("applyDesignProposal", () => {
  /** Apply the proposal for `missing` and return the resulting teeth map. */
  function place(missing, options = {}) {
    const teeth = freshTeeth(missing);
    for (const fdi of options.compromised || []) teeth[fdi].status = "compromised";
    const proposal = buildDesignProposal(teeth, { meshId: "mesh-hole", ...options });
    const flags = applyDesignProposal(teeth, proposal);
    return { teeth, flags, proposal };
  }

  const idsOn = (teeth, fdi) => (teeth[fdi].componentPlacements || []).map((p) => p.componentId);

  it("meshes the saddle and carries the connector across the arch", () => {
    const { teeth } = place(CLASS_I_LOWER);
    // 38/48 are excluded from the auto mesh, as everywhere else in the arch.
    expect(idsOn(teeth, "36")).toContain("mesh-hole");
    expect(idsOn(teeth, "37")).toContain("mesh-hole");
    expect(idsOn(teeth, "38")).not.toContain("mesh-hole");
    expect(idsOn(teeth, "35")).toContain("major-lower-lingual-bar");
    expect(idsOn(teeth, "31")).toContain("major-lower-lingual-bar");
  });

  it("keeps tooth.components in step with the placements", () => {
    const { teeth } = place(CLASS_I_LOWER);
    expect(teeth["35"].components).toEqual(idsOn(teeth, "35"));
  });

  it("leaves no plating under a lingual bar, but plates what a lingual plate covers", () => {
    const bar = place(CLASS_I_LOWER).teeth;
    // 33 carries no clasp, so the bar's plating sweep is the only thing that could plate it.
    expect(rowsOn(bar, "33")).not.toContain("plate-prox:null");
    // 35 keeps one: it is the terminal abutment, and its RPI needs a proximal plate.
    expect(rowsOn(bar, "35")).toContain("plate-prox:null");

    const plate = place(CLASS_I_LOWER, { compromised: ["31"] }).teeth;
    expect(idsOn(plate, "33")).toEqual(
      expect.arrayContaining(["plate-prox", "major-lower-lingual-plate"])
    );
  });

  it("does not touch an arch with no class", () => {
    const { teeth } = place(CLASS_I_LOWER);
    // The upper is fully dentate here, so it gets no connector and no plating.
    for (const fdi of TOOTH_ORDER.upper) {
      expect(teeth[fdi].componentPlacements).toEqual([]);
    }
  });

  it("meshes a full-acrylic case with the flange and plates the lower arch", () => {
    const { teeth, flags } = place(CLASS_I_LOWER, { material: FULL_ACRYLIC });
    expect(idsOn(teeth, "36")).toContain("mesh-flange");
    expect(idsOn(teeth, "36")).not.toContain("mesh-hole");
    expect(idsOn(teeth, "35")).toEqual(
      expect.arrayContaining(["plate-prox", "major-lower-lingual-plate"])
    );
    // A plate connector keeps its plating on screen, unlike the lingual bar.
    expect(flags.hideLowerPlateVisuals).toBe(false);
  });

  it("places each planned rest as a rest-seat on its surface", () => {
    const { teeth } = place(CLASS_I_LOWER);
    expect(rowsOn(teeth, "35")).toContain("rest-seat:mesial");
    expect(rowsOn(teeth, "34")).toContain("rest-seat:mesial");
    // The saddle itself carries no rest.
    expect(rowsOn(teeth, "36").some((row) => row.startsWith("rest-seat"))).toBe(false);
  });

  it("places each clasp, and never both reciprocating elements on one tooth", () => {
    const { teeth } = place(CLASS_III_UPPER);
    expect(rowsOn(teeth, "16")).toEqual(
      expect.arrayContaining(["retainer-clasp:distal_buccal", "reciprocating-clasp:distal_lingual"])
    );
    // The plating pass had already given 16 a plate-prox; the reciprocal clasp takes the slot.
    expect(rowsOn(teeth, "16")).not.toContain("plate-prox:null");
  });

  it("replaces the design already on the arch instead of drawing over it", () => {
    const teeth = freshTeeth(CLASS_I_LOWER);
    // A design already on the lower arch: another connector, and a clasp nothing plans for 33.
    teeth["33"].componentPlacements = [
      { componentId: "major-lower-lingual-plate", surface: null },
      { componentId: "retainer-clasp", surface: "distal_buccal" },
    ];
    teeth["33"].components = ["major-lower-lingual-plate", "retainer-clasp"];

    const proposal = buildDesignProposal(teeth, { meshId: "mesh-hole" });
    applyDesignProposal(teeth, proposal);

    expect(idsOn(teeth, "33")).not.toContain("major-lower-lingual-plate");
    expect(idsOn(teeth, "33")).not.toContain("retainer-clasp");
    expect(idsOn(teeth, "33")).toContain("major-lower-lingual-bar");
    expect(teeth["33"].components).toEqual(idsOn(teeth, "33"));
  });

  it("keeps the design on an arch it has nothing to propose for", () => {
    const teeth = freshTeeth(CLASS_I_LOWER);
    // The upper is dentate, so wiping it would erase the designer's work for nothing.
    teeth["16"].componentPlacements = [{ componentId: "retainer-clasp", surface: "mesial_buccal" }];
    teeth["16"].components = ["retainer-clasp"];

    applyDesignProposal(teeth, buildDesignProposal(teeth, { meshId: "mesh-hole" }));

    expect(rowsOn(teeth, "16")).toEqual(["retainer-clasp:mesial_buccal"]);
  });

  it("leaves the other arch completely alone when only one jaw is placed", () => {
    const teeth = freshTeeth([...CLASS_I_LOWER, ...CLASS_III_UPPER]);
    const proposal = buildDesignProposal(teeth, { meshId: "mesh-hole" });
    // The caller narrows the proposal to the jaws whose checkbox is ticked.
    applyDesignProposal(teeth, { ...proposal, jaws: { lower: proposal.jaws.lower } });

    for (const fdi of TOOTH_ORDER.upper) {
      expect(teeth[fdi].componentPlacements).toEqual([]);
    }
    // ...including the upper saddle, which the arch-wide mesh pass would otherwise fill.
    expect(idsOn(teeth, "15")).toEqual([]);
    expect(idsOn(teeth, "36")).toContain("mesh-hole");
  });

  it("reports the render flags the two special-cased connectors need", () => {
    expect(place(CLASS_I_UPPER).flags.archOverlayPalatalHoleActive).toBe(true);
    expect(place(CLASS_I_LOWER).flags.hideLowerPlateVisuals).toBe(true);
    expect(place(CLASS_IV_LOWER).flags.hideLowerPlateVisuals).toBe(false);
  });
});

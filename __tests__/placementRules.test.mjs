/**
 * Rules the generic placement engine enforces for every catalog pick:
 *   - one reciprocating element per tooth (clasp XOR plate),
 *   - a clasp/bar/rest auto-adds the default reciprocating plate,
 *   - assembly ids are never stored as placements,
 *   - a major connector is only offered where its span would actually reach.
 * Assembly layouts themselves live in assemblies.test.mjs.
 */
import { jest } from "@jest/globals";

const state = { teeth: {}, selectedComponentId: null, designMode: false };
jest.mock("../src/js/2D/2DAnnotation.js", () => ({
  state,
  setMessage: () => {},
  getHistoryStateSignature: () => "",
  recordHistoryIfChanged: () => {},
}));

import {
  placeSelectedComponentOnTooth,
  toothSupportsMajorConnectorOverlay,
} from "../src/js/2D/annotationPlacement.js";
import {
  addPlacement,
  removePlacement,
  syncToothComponentsFromPlacements,
} from "../src/js/2D/annotationTeethModel.js";
import { assessPlacementCriteria } from "../src/js/2D/criteria.js";
import {
  ACTION_UPON_FAILURE,
  ASSEMBLY_REST_SUGGESTION_IDS,
  COMPONENT_BY_ID,
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws,
  isMajorConnectorComponent,
} from "../src/js/2D/components.js";
import { TOOTH_ORDER } from "../src/js/2D/constants.js";
import { switchMajorIn } from "./helpers/jawStructIO.mjs";

const RECIP = ["reciprocating-clasp", "plate-prox", "plate-crossmesh"];

function tooth(componentIds = [], { isPresent = true, toothId = "36" } = {}) {
  return {
    tooth_id: toothId,
    isPresent,
    components: [...componentIds],
    componentPlacements: componentIds.map((componentId) => ({ componentId, surface: null })),
  };
}

/** Install one tooth as the whole arch and return it. */
function toothAt(toothId, componentIds = [], isPresent = true) {
  const t = tooth(componentIds, { isPresent, toothId });
  state.teeth = { [toothId]: t };
  return t;
}

function place(componentId, toothId, surface) {
  state.selectedComponentId = componentId;
  placeSelectedComponentOnTooth(toothId, surface ? { surface } : null);
}

const idsOn = (t) => t.componentPlacements.map((p) => p.componentId);
const recipOn = (t) => idsOn(t).filter((id) => RECIP.includes(id));

/**
 * A tooth's reciprocating element is a single slot (Reciprocating.Tooth Type): a
 * reciprocating clasp OR a proximal/mesh plate — never both (e.g. at 37/47 under a
 * lingual plate).
 */
describe("reciprocating element is mutually exclusive (clasp XOR plate)", () => {
  it.each([
    ["plate-prox", "reciprocating-clasp"],
    ["plate-crossmesh", "reciprocating-clasp"],
    ["reciprocating-clasp", "plate-prox"],
    ["reciprocating-clasp", "plate-crossmesh"],
    ["plate-prox", "plate-crossmesh"],
    ["plate-crossmesh", "plate-prox"],
  ])("placing %s when the tooth already has ... conflicts", (existingId, placeId) => {
    const res = assessPlacementCriteria(tooth([existingId]), COMPONENT_BY_ID.get(placeId), COMPONENT_BY_ID);
    expect(res.pass).toBe(false);
    expect(res.failureData.conflictingComponents).toContain(existingId);
    expect(res.failureData.actionUponFailure).toBe(ACTION_UPON_FAILURE.REMOVE_THEN_PLACE);
  });

  it("a retainer clasp may coexist with a reciprocal plate (valid clasp assembly)", () => {
    const res = assessPlacementCriteria(tooth(["retainer-clasp"]), COMPONENT_BY_ID.get("plate-prox"), COMPONENT_BY_ID);
    expect(res.pass).toBe(true);
  });

  // addPlacement is the choke point used by compound assembly placements (which bypass
  // the catalog's conflictsWith), so it must enforce the single slot too.
  it("addPlacement drops a pre-existing reciprocating element", () => {
    const t = tooth();
    addPlacement(t, "plate-prox", null);
    addPlacement(t, "reciprocating-clasp", "mesial_lingual");
    expect(recipOn(t)).toEqual(["reciprocating-clasp"]);
    addPlacement(t, "plate-crossmesh", null);
    expect(recipOn(t)).toEqual(["plate-crossmesh"]);
  });

  it("addPlacement keeps a retainer clasp + reciprocal plate (different slot)", () => {
    const t = tooth();
    addPlacement(t, "retainer-clasp", "mesial_buccal");
    addPlacement(t, "plate-prox", null);
    expect(t.components).toEqual(expect.arrayContaining(["retainer-clasp", "plate-prox"]));
  });
});

describe("auto default reciprocating plate", () => {
  it.each([
    ["retainer-clasp", "mesial_buccal"],
    ["ring-clasp", "mesial_buccal"],
    ["bar-i", "bar_d1_distal"],
    ["rest-seat", "mesial"],
    ["rest-onlay", "mesial"],
  ])("placing %s adds plate-prox", (componentId, surface) => {
    const t = toothAt("36");
    place(componentId, "36", surface);
    expect(idsOn(t)).toEqual(expect.arrayContaining([componentId, "plate-prox"]));
  });

  it.each([
    ["a reciprocating clasp", "reciprocating-clasp", "retainer-clasp", "mesial_buccal"],
    ["a mesh plate", "plate-crossmesh", "bar-i", "bar_d1_distal"],
  ])("keeps %s the tooth already carries", (_name, existing, placeId, surface) => {
    const t = toothAt("36", [existing]);
    place(placeId, "36", surface);
    expect(idsOn(t)).toEqual(expect.arrayContaining([placeId, existing]));
    expect(idsOn(t)).not.toContain("plate-prox");
  });

  it("placing a reciprocating clasp itself is not overwritten by the default plate", () => {
    const t = toothAt("36");
    place("reciprocating-clasp", "36", "mesial_lingual");
    expect(idsOn(t)).toEqual(["reciprocating-clasp"]);
  });

  it("adds only one plate across repeated placements on the same tooth", () => {
    const t = toothAt("36");
    place("rest-seat", "36", "mesial");
    place("retainer-clasp", "36", "distal_buccal");
    expect(idsOn(t).filter((id) => id === "plate-prox")).toHaveLength(1);
  });
});

/**
 * Assemblies are macros placed from a rest-seat suggestion dot by their own
 * placeXAssemblyOnTooth. They need no surface, so a tap on the tooth body used to fall
 * through and store the assembly id itself — not a real component, and it then showed up
 * in the tooth's remove list.
 */
describe("assembly ids never become placements", () => {
  it.each([...ASSEMBLY_REST_SUGGESTION_IDS])("%s places nothing on a present tooth", (id) => {
    const t = toothAt("36");
    place(id, "36", null);
    expect(t.componentPlacements).toEqual([]);
    expect(t.components).toEqual([]);
  });

  it("also places nothing on a missing tooth (REMOVE_THEN_PLACE would otherwise force it)", () => {
    const t = toothAt("36", [], false);
    place("assembly-circ", "36", null);
    expect(t.componentPlacements).toEqual([]);
  });

  it("does not clear components a tooth already carries", () => {
    const t = toothAt("36");
    t.components = ["rest-seat"];
    t.componentPlacements = [{ componentId: "rest-seat", surface: "mesial" }];
    place("assembly-rpi", "36", null);
    expect(t.componentPlacements).toEqual([{ componentId: "rest-seat", surface: "mesial" }]);
  });
});

/**
 * toothSupportsMajorConnectorOverlay gates BOTH the ghost the arch draws while a major is
 * selected and the click that places it, so it must not be looser than the placement rules:
 * a tooth it accepts but the design never covers renders a connector stub hanging off the
 * arch — the terminal molars 18/28 under A-P Strap / Palatal Bar.
 */
describe("a major connector is only offered where its span reaches", () => {
  const UPPER_MAJORS = [...COMPONENT_BY_ID.values()]
    .filter((d) => isMajorConnectorComponent(d) && d.section === "upper")
    .map((d) => d.id);

  /** Bilateral posterior saddles meshed, abutments plated + clasped, anteriors bare. */
  function upperArch(terminalMolars = []) {
    const teeth = {};
    for (const id of TOOTH_ORDER.upper) teeth[id] = tooth([], { toothId: id });
    for (const id of ["16", "26"]) teeth[id] = tooth(["mesh-hole"], { isPresent: false, toothId: id });
    for (const id of ["15", "17", "25", "27"]) {
      teeth[id] = tooth(["plate-prox", "retainer-clasp"], { toothId: id });
    }
    for (const id of ["18", "28"]) teeth[id] = tooth(terminalMolars, { toothId: id });
    state.teeth = teeth;
    return teeth;
  }

  const hasMajor = (t) =>
    Boolean(t?.componentPlacements.some((e) => isMajorConnectorComponent(e.componentId)));

  it.each(UPPER_MAJORS)("%s: every offered tooth is one the design covers, bare 18/28 least of all", (majorId) => {
    const teeth = upperArch();
    ensureMajorConnectorPlacementsOnSupportedTeethInJaws(teeth, majorId, COMPONENT_BY_ID, ["upper"]);
    const offeredButBare = TOOTH_ORDER.upper.filter(
      (id) =>
        !hasMajor(teeth[id]) && toothSupportsMajorConnectorOverlay(teeth[id], id, majorId, teeth)
    );
    expect(offeredButBare).toEqual([]);

    // The terminal molars sit distal of every anchor, so no run reaches them. A-P Strap
    // (palatal hole) and Palatal Bar used to accept them unconditionally.
    for (const id of ["18", "28"]) {
      expect(toothSupportsMajorConnectorOverlay(teeth[id], id, majorId, teeth)).toBe(false);
    }
  });

  it("bare anteriors between the anchors and the midline stay offered (span carries them)", () => {
    const teeth = upperArch();
    for (const id of ["14", "13", "12", "11", "21", "22", "23", "24"]) {
      expect(toothSupportsMajorConnectorOverlay(teeth[id], id, "major-upper-palatal-hole", teeth)).toBe(true);
    }
  });

  it("a meshed 18/28 anchors the connector itself and is offered", () => {
    const teeth = upperArch(["mesh-hole"]);
    for (const id of ["18", "28"]) {
      teeth[id].isPresent = false;
      expect(toothSupportsMajorConnectorOverlay(teeth[id], id, "major-upper-palatal-hole", teeth)).toBe(true);
      expect(toothSupportsMajorConnectorOverlay(teeth[id], id, "major-upper-palatal-bar", teeth)).toBe(true);
    }
  });

  /**
   * The lower arch had the same hole, wider: the lingual bar accepted ANY lower tooth with
   * connector art. It cannot simply be anchor-gated, though — a bar plates nothing, so
   * picking one strips the plate-prox that anchored the run, and gating on anchors alone
   * would declare the bar's own arch unplaceable ("can't place the MJ again").
   */
  describe("lower: the lingual bar's run, not the whole arch", () => {
    const LOWER_MAJORS = ["major-lower-lingual-bar", "major-lower-lingual-plate", "major-lower-lingual-kennedy"];

    /** Anterior saddle meshed, 34/37/44/47 plated (NO clasps), 38/48 present and bare. */
    function lowerArch() {
      const teeth = {};
      for (const id of TOOTH_ORDER.lower) teeth[id] = tooth([], { toothId: id });
      for (const id of ["33", "32", "31", "41", "42", "43"]) {
        teeth[id] = tooth(["mesh-hole"], { isPresent: false, toothId: id });
      }
      for (const id of ["34", "37", "44", "47"]) teeth[id] = tooth(["plate-prox"], { toothId: id });
      state.teeth = teeth;
      return teeth;
    }

    it.each(LOWER_MAJORS)("%s: every offered tooth is one the design covers, bare 38/48 least of all", (majorId) => {
      const teeth = lowerArch();
      ensureMajorConnectorPlacementsOnSupportedTeethInJaws(teeth, majorId, COMPONENT_BY_ID, ["lower"]);
      const offeredButBare = TOOTH_ORDER.lower.filter(
        (id) => !hasMajor(teeth[id]) && toothSupportsMajorConnectorOverlay(teeth[id], id, majorId, teeth)
      );
      expect(offeredButBare).toEqual([]);
      for (const id of ["38", "48"]) {
        expect(toothSupportsMajorConnectorOverlay(teeth[id], id, majorId, teeth)).toBe(false);
      }
    });

    /** Pick a bar the way the catalog does, so the plate-stripping really happens. */
    const switchToBar = (teeth) => switchMajorIn(teeth, "major-lower-lingual-bar", "lower");

    // What the old blanket rule was really guarding: a bar plates nothing, so after the
    // switch NOTHING in the run anchors it any more. The run must survive that on its own.
    it("a bar that stripped its own plate anchors keeps its whole run", () => {
      const teeth = lowerArch();
      switchToBar(teeth);
      expect(TOOTH_ORDER.lower.filter((id) => teeth[id].components.includes("plate-prox"))).toEqual([]);
      expect(TOOTH_ORDER.lower.filter((id) => hasMajor(teeth[id]))).toEqual([
        "37", "36", "35", "34", "33", "32", "31", "41", "42", "43", "44", "45", "46", "47",
      ]);
      // ...and 38/48 stay out of it, which is the bug this describe block is about.
      for (const id of ["38", "48"]) {
        expect(toothSupportsMajorConnectorOverlay(teeth[id], id, "major-lower-lingual-bar", teeth)).toBe(false);
      }
    });

    /**
     * The one behaviour the span gate takes away. Removing the DISTAL END of a run (the only
     * end removal allows — shouldBlockMajorConnectorRemoval protects interior teeth) leaves a
     * tooth that anchors nothing, because the bar already stripped its plate. It is then
     * outside the run and cannot be clicked back: re-anchor it, or switch back to the plate.
     * The alternative — letting a run grow one tooth distally — is exactly what drew the
     * 18/28/38/48 stubs, since those teeth are always the next one out.
     */
    it("removing a run's end tooth under a bar needs a re-anchor to undo", () => {
      const teeth = lowerArch();
      switchToBar(teeth);
      removePlacement(teeth["37"], "major-lower-lingual-bar", null);
      syncToothComponentsFromPlacements(teeth["37"]);

      expect(toothSupportsMajorConnectorOverlay(teeth["37"], "37", "major-lower-lingual-bar", teeth)).toBe(false);

      addPlacement(teeth["37"], "plate-prox", null);
      syncToothComponentsFromPlacements(teeth["37"]);
      expect(toothSupportsMajorConnectorOverlay(teeth["37"], "37", "major-lower-lingual-bar", teeth)).toBe(true);
    });
  });
});

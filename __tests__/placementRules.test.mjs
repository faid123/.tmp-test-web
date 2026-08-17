/**
 * Rules the generic placement engine enforces for every catalog pick:
 *   - one reciprocating element per tooth (clasp XOR plate),
 *   - a clasp/bar/rest auto-adds the default reciprocating plate,
 *   - assembly ids are never stored as placements,
 *   - a major connector is only offered where its span would actually reach.
 * Assembly layouts themselves live in assemblies.test.mjs.
 */
import { jest } from "@jest/globals";

const state = { teeth: {}, selectedComponentId: null, designMode: false, jawMaterial: null };
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
  pruneInvalidMajorConnectorPlacementsInJaw,
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

/**
 * Full acrylic (jawMaterial 2) changes which components the catalog offers and how they are
 * tinted — NOT how a major connector is placed. It used to span 7-to-7 anchor-free, which
 * put the horseshoe on 17/27 with no plate under them, and it skipped the plating sync so
 * the anteriors it covered never got their plate-prox.
 */
describe("full acrylic places a major exactly as metal does", () => {
  /** The reported case: plates on 16/26 only, 17/27 and the anteriors bare. */
  function acrylicUpperArch() {
    const teeth = {};
    for (const id of TOOTH_ORDER.upper) teeth[id] = tooth([], { toothId: id });
    for (const id of ["16", "26"]) teeth[id] = tooth(["plate-prox"], { toothId: id });
    state.teeth = teeth;
    state.jawMaterial = 2;
    return teeth;
  }

  const upperWith = (teeth, componentId) =>
    TOOTH_ORDER.upper.filter((id) => teeth[id].componentPlacements.some((e) => e.componentId === componentId));

  afterEach(() => {
    state.jawMaterial = null;
  });

  it("stops the span at the anchor: no connector on the plateless 17/27", () => {
    const teeth = acrylicUpperArch();
    switchMajorIn(teeth, "major-upper-horseshoe", "upper");
    expect(upperWith(teeth, "major-upper-horseshoe").sort()).toEqual(
      ["11", "12", "13", "14", "15", "16", "21", "22", "23", "24", "25", "26"]
    );
    for (const id of ["17", "18", "27", "28"]) {
      expect(toothSupportsMajorConnectorOverlay(teeth[id], id, "major-upper-horseshoe", teeth)).toBe(false);
    }
  });

  it("auto-fills plate-prox on the anteriors it covers", () => {
    const teeth = acrylicUpperArch();
    switchMajorIn(teeth, "major-upper-horseshoe", "upper");
    expect(upperWith(teeth, "plate-prox").sort()).toEqual(
      ["11", "12", "13", "14", "15", "16", "21", "22", "23", "24", "25", "26"]
    );
  });

  it("the placed span survives the render prune", () => {
    const teeth = acrylicUpperArch();
    switchMajorIn(teeth, "major-upper-horseshoe", "upper");
    const before = upperWith(teeth, "major-upper-horseshoe");
    pruneInvalidMajorConnectorPlacementsInJaw(teeth, COMPONENT_BY_ID, "upper");
    expect(upperWith(teeth, "major-upper-horseshoe")).toEqual(before);
  });
});

/**
 * A major connector is a continuous span, so reciprocation added beside a run END pulls
 * that tooth in: a connector stopping at 16 reaches 17 the moment 17 is plated, instead of
 * making the dentist re-pick the connector to redraw the span.
 */
describe("a run grows onto a tooth that gains reciprocation", () => {
  /** Plates on 16/26, everything else bare — the connector stops at 16 and 26. */
  function archEndingAtSixes() {
    const teeth = {};
    for (const id of TOOTH_ORDER.upper) teeth[id] = tooth([], { toothId: id });
    for (const id of ["16", "26"]) teeth[id] = tooth(["plate-prox"], { toothId: id });
    state.teeth = teeth;
    switchMajorIn(teeth, "major-upper-horseshoe", "upper");
    return teeth;
  }

  const hasMajorOn = (teeth, id) =>
    teeth[id].componentPlacements.some((e) => e.componentId === "major-upper-horseshoe");

  it("plating 17 next to a run ending at 16 extends the connector to 17", () => {
    const teeth = archEndingAtSixes();
    expect(hasMajorOn(teeth, "17")).toBe(false);

    place("plate-prox", "17");
    expect(hasMajorOn(teeth, "17")).toBe(true);
  });

  it("a reciprocating clasp does it too", () => {
    const teeth = archEndingAtSixes();
    place("reciprocating-clasp", "17", "distal_lingual");
    expect(hasMajorOn(teeth, "17")).toBe(true);
  });

  it("a retainer clasp does it through the plate it auto-adds", () => {
    const teeth = archEndingAtSixes();
    place("retainer-clasp", "17", "distal_buccal");
    expect(teeth["17"].components).toContain("plate-prox");
    expect(hasMajorOn(teeth, "17")).toBe(true);
  });

  it("takes the anchored teeth beyond it in the same move", () => {
    const teeth = archEndingAtSixes();
    addPlacement(teeth["18"], "plate-prox", null);
    syncToothComponentsFromPlacements(teeth["18"]);

    place("plate-prox", "17");
    expect([hasMajorOn(teeth, "17"), hasMajorOn(teeth, "18")]).toEqual([true, true]);
  });

  it("does not jump a bare tooth: plating 18 alone leaves 17 and 18 out", () => {
    const teeth = archEndingAtSixes();
    place("plate-prox", "18");
    expect([hasMajorOn(teeth, "17"), hasMajorOn(teeth, "18")]).toEqual([false, false]);
  });

  it("leaves the other arch alone", () => {
    const teeth = archEndingAtSixes();
    for (const id of TOOTH_ORDER.lower) teeth[id] = tooth([], { toothId: id });
    place("plate-prox", "17");
    expect(TOOTH_ORDER.lower.some((id) => teeth[id].componentPlacements.length)).toBe(false);
  });
});

/**
 * Mesh is the missing tooth's anchor, so a meshed saddle beside a run pulls the connector
 * over exactly as a plate does on a present tooth.
 */
describe("a run grows onto a meshed saddle too", () => {
  /** Plates on 16/26 anchor the run; 17 is MISSING and bare, so the run stops at 16. */
  function archWithMissingSeven() {
    const teeth = {};
    for (const id of TOOTH_ORDER.upper) teeth[id] = tooth([], { toothId: id });
    for (const id of ["16", "26"]) teeth[id] = tooth(["plate-prox"], { toothId: id });
    teeth["17"] = tooth([], { isPresent: false, toothId: "17" });
    state.teeth = teeth;
    switchMajorIn(teeth, "major-upper-horseshoe", "upper");
    return teeth;
  }

  const hasMajorOn = (teeth, id) =>
    teeth[id].componentPlacements.some((e) => e.componentId === "major-upper-horseshoe");

  it("meshing the missing 17 extends the connector onto it", () => {
    const teeth = archWithMissingSeven();
    expect(hasMajorOn(teeth, "17")).toBe(false);

    place("mesh-hole", "17");
    expect(teeth["17"].components).toContain("mesh-hole");
    expect(hasMajorOn(teeth, "17")).toBe(true);
  });

  it("a bare missing tooth still holds the run back", () => {
    const teeth = archWithMissingSeven();
    expect(hasMajorOn(teeth, "17")).toBe(false);
    expect(hasMajorOn(teeth, "18")).toBe(false);
  });

  it("carries on to an already-meshed 18 in the same move", () => {
    const teeth = archWithMissingSeven();
    teeth["18"] = tooth(["mesh-hole"], { isPresent: false, toothId: "18" });

    place("mesh-hole", "17");
    expect([hasMajorOn(teeth, "17"), hasMajorOn(teeth, "18")]).toEqual([true, true]);
  });
});

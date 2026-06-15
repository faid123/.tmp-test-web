/**
 * A tooth's reciprocating element is a single slot (Reciprocating.Tooth Type):
 * a reciprocating clasp OR a proximal/mesh plate — never both. Guards that the
 * three are mutually exclusive so placing one removes the others (no overlapping
 * reciprocating clasp + plate, e.g. at 37/47 under a lingual plate).
 */
import { jest } from "@jest/globals";
jest.mock("../src/js/2D/2DAnnotation.js", () => ({ state: { teeth: {} } }));

import { assessPlacementCriteria } from "../src/js/2D/criteria.js";
import { COMPONENT_BY_ID, ACTION_UPON_FAILURE } from "../src/js/2D/components.js";
import { addPlacement } from "../src/js/2D/annotationTeethModel.js";

const RECIP = ["reciprocating-clasp", "plate-prox", "plate-crossmesh"];
const recipOn = (tooth) => tooth.componentPlacements.filter((p) => RECIP.includes(p.componentId)).map((p) => p.componentId);

function toothWith(...componentIds) {
  return { tooth_id: "37", isPresent: true, components: componentIds, componentPlacements: componentIds.map((componentId) => ({ componentId, surface: null })) };
}
function expectConflict(existingId, placeId) {
  const res = assessPlacementCriteria(toothWith(existingId), COMPONENT_BY_ID.get(placeId), COMPONENT_BY_ID);
  expect(res.pass).toBe(false);
  expect(res.failureData.conflictingComponents).toContain(existingId);
  expect(res.failureData.actionUponFailure).toBe(ACTION_UPON_FAILURE.REMOVE_THEN_PLACE);
}

describe("reciprocating element is mutually exclusive (clasp XOR plate)", () => {
  it.each([
    ["plate-prox", "reciprocating-clasp"],
    ["plate-crossmesh", "reciprocating-clasp"],
    ["reciprocating-clasp", "plate-prox"],
    ["reciprocating-clasp", "plate-crossmesh"],
    ["plate-prox", "plate-crossmesh"],
    ["plate-crossmesh", "plate-prox"],
  ])("placing %s when tooth already has ... conflicts", (existingId, placeId) => {
    expectConflict(existingId, placeId);
  });

  it("a retainer clasp may coexist with a reciprocal plate (valid clasp assembly)", () => {
    const res = assessPlacementCriteria(toothWith("retainer-clasp"), COMPONENT_BY_ID.get("plate-prox"), COMPONENT_BY_ID);
    expect(res.pass).toBe(true);
  });
});

// addPlacement is the choke point used by compound assembly placements (which
// bypass the catalog's conflictsWith), so it must enforce the single slot too.
describe("addPlacement enforces the single reciprocating slot", () => {
  it("placing a reciprocating clasp drops a pre-existing plate (and vice versa)", () => {
    const tooth = { isPresent: true, components: [], componentPlacements: [] };
    addPlacement(tooth, "plate-prox", null);
    addPlacement(tooth, "reciprocating-clasp", "mesial_lingual");
    expect(recipOn(tooth)).toEqual(["reciprocating-clasp"]);
    addPlacement(tooth, "plate-crossmesh", null);
    expect(recipOn(tooth)).toEqual(["plate-crossmesh"]);
  });

  it("a retainer clasp + reciprocal plate both survive (different slot)", () => {
    const tooth = { isPresent: true, components: [], componentPlacements: [] };
    addPlacement(tooth, "retainer-clasp", "mesial_buccal");
    addPlacement(tooth, "plate-prox", null);
    expect(tooth.components).toEqual(expect.arrayContaining(["retainer-clasp", "plate-prox"]));
  });
});

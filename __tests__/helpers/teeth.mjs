// Annotation state fixtures shared by the 2D suites (assemblies, jawStruct,
// placementRules). Pure — no jest.mock here; each test file mocks the DOM-heavy
// 2DAnnotation.js entry itself, which babel-jest hoists above every import.

import { TOOTH_ORDER } from "../../src/js/2D/constants.js";

/** 32 default tooth records, same shape as initializeTeethState(). */
export function freshTeeth(missing = []) {
  const teeth = {};
  for (const jaw of ["upper", "lower"]) {
    for (const id of TOOTH_ORDER[jaw]) {
      teeth[id] = {
        tooth_id: id,
        jaw,
        isPresent: !missing.includes(id),
        status: missing.includes(id) ? "missing" : "presence",
        components: [],
        componentPlacements: [],
        center: [0, 0],
      };
    }
  }
  return teeth;
}

export const buildFreshState = (missing = []) => ({ teeth: freshTeeth(missing) });

/** A tooth's placements as sorted "componentId:surface" rows — the comparable form. */
export const rowsOn = (teeth, id) =>
  (teeth[id].componentPlacements || []).map((p) => `${p.componentId}:${p.surface}`).sort();

/**
 * @jest-environment jsdom
 */

// Unit tests for the case dashboard's pure logic: mapping a jaw's backend
// status string to a pipeline rank (statusRank), turning two jaw statuses into
// the per-stage / per-jaw step model the UI renders (computeSteps), and mapping
// /thumbnails/get rows to their capture slots (resolveCaptureSlots).
//
// jsdom env is required only because dashboard.js registers a DOMContentLoaded
// listener at import time; these functions themselves are DOM-free.

import {
  statusRank,
  computeSteps,
  countCompletedStages,
  resolveCaptureSlots,
} from "../src/js/pages/dashboard.js";

describe("statusRank()", () => {
  test("returns 0 for absent / empty / default-0 statuses", () => {
    expect(statusRank(null)).toBe(0);
    expect(statusRank(undefined)).toBe(0);
    expect(statusRank(0)).toBe(0);
    expect(statusRank("0")).toBe(0); // backend IFNULL(status, 0) default
    expect(statusRank("")).toBe(0);
  });

  test("returns 0 for an unrecognised status with no known keyword", () => {
    expect(statusRank("stage4")).toBe(0);
    expect(statusRank("p4")).toBe(0);
    expect(statusRank("done")).toBe(0);
  });

  test("matches confirmed exact value jaw_prepared -> 1", () => {
    expect(statusRank("jaw_prepared")).toBe(1);
  });

  test("ranks the real case-1723 value 'polylines' -> 4", () => {
    expect(statusRank("polylines")).toBe(4);
  });

  test("infers rank from a keyword regardless of exact wording", () => {
    expect(statusRank("surface_generated")).toBe(5);
    expect(statusRank("3d_surface")).toBe(5);
    expect(statusRank("polyline_done")).toBe(4);
    expect(statusRank("teeth_segmented")).toBe(3);
    expect(statusRank("segmentation_complete")).toBe(3);
    expect(statusRank("six_points_placed")).toBe(2);
    expect(statusRank("archridge_placed")).toBe(2);
    expect(statusRank("stl_loaded")).toBe(1);
    expect(statusRank("undercut_done")).toBe(1);
    expect(statusRank("jaw_preparation")).toBe(1);
  });

  test("is case- and whitespace-insensitive", () => {
    expect(statusRank("  POLYLINES ")).toBe(4);
    expect(statusRank("Jaw_Prepared")).toBe(1);
  });

  test("a later-stage keyword takes precedence (checked high -> low)", () => {
    // contains both 'surface' (5) and 'polyline' (4) -> surface wins
    expect(statusRank("surface_from_polyline")).toBe(5);
  });
});

describe("computeSteps()", () => {
  test("always returns the 5 stages, each with an Upper and a Lower line", () => {
    const steps = computeSteps("0", "0");
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.lines.map((l) => l.jaw)).toEqual(["Upper", "Lower"]);
    }
  });

  test("nothing done when both jaws have the default status", () => {
    const steps = computeSteps("0", "0");
    const allDone = steps.flatMap((s) => s.lines).map((l) => l.done);
    expect(allDone.every((d) => d === false)).toBe(true);
    expect(steps[0].lines[0].text).toBe("Yet to do Upper Jaw 2D Preparation");
  });

  test("case 1723 ('polylines'/'polylines'): steps 1-4 done, step 5 pending", () => {
    const steps = computeSteps("polylines", "polylines");
    // stages 0..3 done for both jaws
    for (let i = 0; i < 4; i++) {
      expect(steps[i].lines[0].done).toBe(true);
      expect(steps[i].lines[1].done).toBe(true);
    }
    // stage 4 (3D Surface) not done
    expect(steps[4].lines[0].done).toBe(false);
    expect(steps[4].lines[1].done).toBe(false);

    expect(steps[3].lines[0].text).toBe("Upper Jaw Polylines is generated");
    expect(steps[4].lines[0].text).toBe(
      "Yet to do Upper Jaw final 3D surface generation"
    );
  });

  test("per-jaw independence: upper prepared, lower still at default", () => {
    const steps = computeSteps("jaw_prepared", 0);
    expect(steps[0].lines[0]).toEqual({
      jaw: "Upper",
      done: true,
      text: "Upper Jaw 2D Preparation is complete",
    });
    expect(steps[0].lines[1]).toEqual({
      jaw: "Lower",
      done: false,
      text: "Yet to do Lower Jaw 2D Preparation",
    });
    // a later stage is not done for either jaw
    expect(steps[1].lines[0].done).toBe(false);
  });

  test("a fully-surfaced case marks every stage done", () => {
    const steps = computeSteps("surface", "surface");
    expect(steps.flatMap((s) => s.lines).every((l) => l.done)).toBe(true);
    expect(steps[1].lines[0].text).toBe("Upper Jaw 6 points is placed");
    expect(steps[2].lines[1].text).toBe("Lower Jaw Segmentation is processed");
  });
});

describe("countCompletedStages()", () => {
  test("counts only stages where BOTH jaws are done", () => {
    // case 1723: both at 'polylines' -> stages 1-4 complete
    expect(countCompletedStages(computeSteps("polylines", "polylines"))).toBe(4);
  });

  test("a stage with only one jaw done does not count as complete", () => {
    // upper prepared (stage 1), lower at default -> 0 fully-complete stages
    expect(countCompletedStages(computeSteps("jaw_prepared", 0))).toBe(0);
  });

  test("0 when nothing is done, 5 when fully surfaced", () => {
    expect(countCompletedStages(computeSteps("0", "0"))).toBe(0);
    expect(countCompletedStages(computeSteps("surface", "surface"))).toBe(5);
  });

  test("tolerates empty / nullish input", () => {
    expect(countCompletedStages([])).toBe(0);
    expect(countCompletedStages(null)).toBe(0);
    expect(countCompletedStages(undefined)).toBe(0);
  });
});

describe("resolveCaptureSlots()", () => {
  test("maps rows to their slot (0=2D, 1=upper, 2=lower) regardless of order", () => {
    const map = resolveCaptureSlots([
      { slot: 2, data: "lower" },
      { slot: 0, data: "twoD" },
      { slot: 1, data: "upper" },
    ]);
    expect(map.get(0)).toBe("twoD");
    expect(map.get(1)).toBe("upper");
    expect(map.get(2)).toBe("lower");
  });

  test("tolerates slot_index / slot_id field-name variants", () => {
    const map = resolveCaptureSlots([
      { slot_index: 0, data: "a" },
      { slot_id: 1, data: "b" },
    ]);
    expect(map.get(0)).toBe("a");
    expect(map.get(1)).toBe("b");
  });

  test("skips rows without data and keeps the first row for a duplicate slot", () => {
    const map = resolveCaptureSlots([
      { slot: 0, data: "first" },
      { slot: 0, data: "second" },
      { slot: 1 }, // no data -> ignored
    ]);
    expect(map.get(0)).toBe("first");
    expect(map.has(1)).toBe(false);
    expect(map.size).toBe(1);
  });

  test("falls back to positional order when no rows carry a slot tag", () => {
    const map = resolveCaptureSlots([{ data: "x" }, { data: "y" }]);
    expect(map.get(0)).toBe("x");
    expect(map.get(1)).toBe("y");
  });

  test("returns an empty map for empty / nullish input", () => {
    expect(resolveCaptureSlots([]).size).toBe(0);
    expect(resolveCaptureSlots(null).size).toBe(0);
    expect(resolveCaptureSlots(undefined).size).toBe(0);
  });
});

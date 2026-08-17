/**
 * Kennedy classification of an arch from tooth presence. JawDesign.js is pure (constants
 * only), so this suite needs no module mocks — just presence maps from freshTeeth.
 */
import {
  classifyArch,
  describeArchClassification,
  getEdentulousSpans,
} from "../src/js/2D/JawDesign.js";
import { TOOTH_ORDER } from "../src/js/2D/constants.js";
import { freshTeeth } from "./helpers/teeth.mjs";

const classify = (jaw, missing) => classifyArch(freshTeeth(missing), jaw);

describe("classifyArch", () => {
  const cases = [
    ["dentate arch", "upper", [], { classNumber: null, label: "Dentate" }],
    [
      "bilateral distal extensions",
      "lower",
      ["36", "37", "38", "46", "47", "48"],
      { classNumber: 1, modifications: 0, label: "Class I" },
    ],
    [
      "one distal extension",
      "upper",
      ["25", "26", "27", "28"],
      { classNumber: 2, modifications: 0, label: "Class II" },
    ],
    [
      "distal extension plus a bounded span",
      "upper",
      ["25", "26", "27", "28", "15"],
      { classNumber: 2, modifications: 1, label: "Class II mod 1" },
    ],
    ["single bounded span", "upper", ["15"], { classNumber: 3, modifications: 0, label: "Class III" }],
    [
      "three bounded spans",
      "upper",
      ["15", "25", "12"],
      { classNumber: 3, modifications: 2, label: "Class III mod 2" },
    ],
    [
      "lone anterior span crossing the midline",
      "upper",
      ["12", "11", "21", "22"],
      { classNumber: 4, modifications: 0, label: "Class IV" },
    ],
    [
      "midline-crossing span with a posterior span (rule 8)",
      "upper",
      ["12", "11", "21", "22", "16"],
      { classNumber: 3, modifications: 1, label: "Class III mod 1" },
    ],
    [
      "only third molars missing (rule 2)",
      "upper",
      ["18", "28"],
      { classNumber: null, label: "Dentate" },
    ],
    [
      "second molar bounded by a present third molar (rule 3)",
      "upper",
      ["27"],
      { classNumber: 3, modifications: 0, label: "Class III" },
    ],
    ["whole arch missing", "upper", TOOTH_ORDER.upper, { classNumber: null, label: "Edentulous" }],
  ];

  it.each(cases)("%s -> %s %s", (_name, jaw, missing, expected) => {
    expect(classify(jaw, missing)).toMatchObject(expected);
  });

  it("flags the two arches Kennedy does not cover", () => {
    expect(classify("upper", [])).toMatchObject({ isDentate: true, isEdentulous: false });
    expect(classify("upper", TOOTH_ORDER.upper)).toMatchObject({
      isDentate: false,
      isEdentulous: true,
    });
  });

  it("reports the third molars it left out", () => {
    expect(classify("lower", ["38", "48", "36"]).excludedThirdMolars).toEqual(["38", "48"]);
  });

  it("classifies each arch independently", () => {
    const teeth = freshTeeth(["36", "37", "38", "46", "47", "48", "15"]);
    expect(classifyArch(teeth, "upper").label).toBe("Class III");
    expect(classifyArch(teeth, "lower").label).toBe("Class I");
  });
});

describe("getEdentulousSpans", () => {
  it("gives a bounded span both abutments, each with the surface facing the gap", () => {
    const spans = getEdentulousSpans(freshTeeth(["25", "26"]), "upper");
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      fdis: ["25", "26"],
      sides: ["left"],
      isDistalExtension: false,
      crossesMidline: false,
      abutments: [
        { fdi: "24", facingSurface: "distal" },
        { fdi: "27", facingSurface: "mesial" },
      ],
    });
  });

  it("gives a distal extension only its mesial abutment", () => {
    const spans = getEdentulousSpans(freshTeeth(["26", "27", "28"]), "upper");
    // 28 is missing, so rule 2 drops it from the span as well as from the class.
    expect(spans[0]).toMatchObject({
      fdis: ["26", "27"],
      isDistalExtension: true,
      abutments: [{ fdi: "25", facingSurface: "distal" }],
    });
  });

  it("marks an anterior span as crossing the midline", () => {
    const [span] = getEdentulousSpans(freshTeeth(["12", "11", "21", "22"]), "upper");
    expect(span.crossesMidline).toBe(true);
    expect(span.sides).toEqual(["right", "left"]);
    expect(span.abutments).toEqual([
      { fdi: "13", facingSurface: "mesial" },
      { fdi: "23", facingSurface: "mesial" },
    ]);
  });
});

describe("describeArchClassification", () => {
  it("lists each span behind the class label", () => {
    expect(describeArchClassification(classify("upper", ["25", "26", "27", "28", "15"]))).toEqual({
      label: "Class II mod 1",
      detail: "15 bounded · 25-27 distal extension",
    });
  });

  it("reads a range low-to-high, except across the midline", () => {
    // Arch order runs 38 -> 31, so the raw span is [37, 36].
    expect(describeArchClassification(classify("lower", ["36", "37", "38"])).detail).toBe(
      "36-37 distal extension"
    );
    expect(describeArchClassification(classify("upper", ["12", "11", "21", "22"])).detail).toBe(
      "12-22 bounded"
    );
  });

  it("explains the arches with no class", () => {
    expect(describeArchClassification(classify("upper", [])).detail).toBe(
      "No missing teeth to replace."
    );
    expect(describeArchClassification(classify("upper", ["18", "28"])).detail).toBe(
      "Only third molars missing (18, 28) - not counted."
    );
    expect(describeArchClassification(classify("upper", TOOTH_ORDER.upper)).detail).toMatch(
      /no abutments/
    );
  });
});

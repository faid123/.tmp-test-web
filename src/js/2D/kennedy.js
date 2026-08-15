/**
 * Kennedy classification from tooth presence alone. Pure, and takes any
 * `{ [fdi]: { isPresent } }` map, so state.teeth and a decoded design both work.
 *
 * Applegate rules 2/3 (third molars), 5 (most posterior area sets the class), 6-7
 * (others are counted modifications) and 8 (Class IV takes none) are applied. Rule 4
 * needs a per-tooth "will replace?" flag the model lacks, so every missing tooth counts.
 */
import { getNeighborToothIds, TOOTH_ORDER } from "./constants.js";

const THIRD_MOLAR_UNIT = 8;
const CLASS_NUMERALS = { 1: "I", 2: "II", 3: "III", 4: "IV" };

const isThirdMolarToothId = (fdi) => Number(String(fdi).slice(1)) === THIRD_MOLAR_UNIT;
const isToothPresent = (teeth, fdi) => Boolean(teeth?.[fdi]?.isPresent);

/** Patient's side, from the FDI quadrant (upper 1 / lower 4 are the right). */
function sideOfToothId(fdi) {
  const quadrant = Number(String(fdi).charAt(0));
  return quadrant === 1 || quadrant === 4 ? "right" : "left";
}

/** Arch order minus the third molars that are missing — Applegate rule 2. */
function getConsideredToothIds(teeth, jaw) {
  return (TOOTH_ORDER[jaw] || []).filter(
    (fdi) => !(isThirdMolarToothId(fdi) && !isToothPresent(teeth, fdi))
  );
}

/** The abutment's own surface facing the span, which is what placement needs. */
function buildSpanAbutment(fdi, spanEdgeToothId, jaw) {
  const { mesial, distal } = getNeighborToothIds(fdi, jaw);
  const facingSurface =
    mesial === spanEdgeToothId ? "mesial" : distal === spanEdgeToothId ? "distal" : null;
  return { fdi, facingSurface };
}

function buildSpan(run, consideredIds, jaw) {
  const { fdis, startIndex, endIndex } = run;
  const sides = [...new Set(fdis.map(sideOfToothId))];
  // The considered list runs distal -> midline -> distal, so a run touching either end
  // has no remaining tooth behind it on that side: a distal extension.
  const openAtStart = startIndex === 0;
  const openAtEnd = endIndex === consideredIds.length - 1;

  const abutments = [];
  if (!openAtStart) {
    abutments.push(buildSpanAbutment(consideredIds[startIndex - 1], fdis[0], jaw));
  }
  if (!openAtEnd) {
    abutments.push(
      buildSpanAbutment(consideredIds[endIndex + 1], fdis[fdis.length - 1], jaw)
    );
  }

  return {
    fdis,
    sides,
    isDistalExtension: openAtStart || openAtEnd,
    crossesMidline: sides.length > 1,
    abutments,
  };
}

/** Maximal runs of missing teeth across the considered slots, in arch order. */
export function getEdentulousSpans(teeth, jaw) {
  const consideredIds = getConsideredToothIds(teeth, jaw);
  const runs = [];
  let run = null;

  consideredIds.forEach((fdi, index) => {
    if (!isToothPresent(teeth, fdi)) {
      if (!run) {
        run = { fdis: [], startIndex: index, endIndex: index };
        runs.push(run);
      }
      run.fdis.push(fdi);
      run.endIndex = index;
      return;
    }
    run = null;
  });

  return runs.map((entry) => buildSpan(entry, consideredIds, jaw));
}

function formatClassLabel(classNumber, modifications) {
  const numeral = CLASS_NUMERALS[classNumber];
  return modifications > 0 ? `Class ${numeral} mod ${modifications}` : `Class ${numeral}`;
}

/**
 * Classify one arch. `classNumber` is null for the two arches Kennedy doesn't cover:
 * a dentate arch (nothing to replace) and a fully edentulous one (no abutments).
 */
export function classifyArch(teeth, jaw) {
  const consideredIds = getConsideredToothIds(teeth, jaw);
  const spans = getEdentulousSpans(teeth, jaw);
  const excludedThirdMolars = (TOOTH_ORDER[jaw] || []).filter(
    (fdi) => isThirdMolarToothId(fdi) && !isToothPresent(teeth, fdi)
  );
  const base = {
    jaw,
    spans,
    excludedThirdMolars,
    classNumber: null,
    modifications: 0,
    isDentate: false,
    isEdentulous: false,
  };

  if (!spans.length) {
    return { ...base, label: "Dentate", isDentate: true };
  }
  if (spans.length === 1 && spans[0].fdis.length === consideredIds.length) {
    return { ...base, label: "Edentulous", isEdentulous: true };
  }

  // Only the two ends of the arch can be open, so there are at most two extensions.
  const distalExtensions = spans.filter((span) => span.isDistalExtension);
  let classNumber;
  let modifications;
  if (distalExtensions.length === 2) {
    classNumber = 1;
    modifications = spans.length - 2;
  } else if (distalExtensions.length === 1) {
    classNumber = 2;
    modifications = spans.length - 1;
  } else if (spans.length === 1 && spans[0].crossesMidline) {
    classNumber = 4;
    modifications = 0;
  } else {
    classNumber = 3;
    modifications = spans.length - 1;
  }

  return { ...base, classNumber, modifications, label: formatClassLabel(classNumber, modifications) };
}

function describeSpan(span) {
  // Within a quadrant a range reads low-to-high (36-37), but arch order runs distal to
  // mesial — so a span across the midline (12-22) is left in arch order.
  const fdis = span.crossesMidline ? span.fdis : [...span.fdis].sort();
  const range = fdis.length > 1 ? `${fdis[0]}-${fdis[fdis.length - 1]}` : fdis[0];
  return `${range} ${span.isDistalExtension ? "distal extension" : "bounded"}`;
}

/** Display strings for one arch — kept here so the dialog stays pure DOM. */
export function describeArchClassification(classification) {
  if (!classification) return { label: "-", detail: "" };
  const { label, spans, isDentate, isEdentulous, excludedThirdMolars } = classification;

  if (isEdentulous) {
    return { label, detail: "Every tooth is missing - no abutments to design on." };
  }
  if (isDentate) {
    return {
      label,
      detail: excludedThirdMolars.length
        ? `Only third molars missing (${excludedThirdMolars.join(", ")}) - not counted.`
        : "No missing teeth to replace.",
    };
  }
  return { label, detail: spans.map(describeSpan).join(" · ") };
}

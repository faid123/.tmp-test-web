// The jaw-struct save/load moves the 2D suites make, driven exactly as the app
// does. Imports the shipped functions rather than re-implementing their steps:
// the ordering inside switchMajorConnectorInJaws (snapshot the span before
// anything is cleared) is exactly what a hand-copy got wrong.
//
// Pulls in annotationTeethModel.js, which imports `state` from the DOM-heavy
// 2DAnnotation.js — the importing test file must mock that module.

import {
  decodeJawStructResponse,
  encodeJawStructText,
  parseJawStructText,
  resolveJawStructDesign,
} from "../../src/js/2D/jawStructCodec.js";
import { applyJawStructDesign } from "../../src/js/2D/jawStructApply.js";
import {
  COMPONENT_BY_ID,
  switchMajorConnectorInJaws,
  syncReciprocatingPlatesToMajorConnector,
} from "../../src/js/2D/components.js";
import { syncToothComponentsFromPlacements } from "../../src/js/2D/annotationTeethModel.js";
import { TOOTH_ORDER } from "../../src/js/2D/constants.js";
import { freshTeeth } from "./teeth.mjs";

/** Save the live state, read it back through decode + apply, return the reloaded teeth. */
export function saveAndReload(state, jawSide = "lower") {
  const text = encodeJawStructText(state, jawSide);
  const parsed = decodeJawStructResponse([
    { type: `${jawSide}_jaw`, data: Buffer.from(text, "utf8").toString("base64") },
  ]);
  const reloaded = { teeth: freshTeeth() };
  applyJawStructDesign(resolveJawStructDesign(parsed[jawSide]), reloaded);
  return reloaded.teeth;
}

/** Parse a jaw-struct text straight into `state`, as opening a case does. */
export const loadInto = (state, text) =>
  applyJawStructDesign(resolveJawStructDesign(parseJawStructText(text)), state);

/**
 * The catalog's major switch (annotationCatalog.handleDesignComponentSelect,
 * non-palatal-bar branch): the real switch primitive, then the same plate sync
 * and component re-sync the handler runs after it.
 */
export function switchMajorIn(teeth, componentId, jawSide = "lower") {
  switchMajorConnectorInJaws(teeth, componentId, COMPONENT_BY_ID, [jawSide]);
  syncReciprocatingPlatesToMajorConnector(teeth, componentId, [jawSide]);
  for (const toothId of TOOTH_ORDER[jawSide]) {
    if (teeth[toothId]) syncToothComponentsFromPlacements(teeth[toothId]);
  }
}

/** Replace the non-deterministic save timestamp so equality reflects design content only. */
export const normalizeStamp = (text) =>
  String(text)
    .replace(/(Start of Jaw Struct yr\.mth\.day\.hr\.min\.sec: ).*/, "$1<STAMP>")
    .replace(/\r\n/g, "\n")
    .trimEnd();

/** Differing lines, with index, for a readable failure message. */
export function lineDiffs(expected, actual, limit = 40) {
  const e = normalizeStamp(expected).split("\n");
  const a = normalizeStamp(actual).split("\n");
  const out = [];
  for (let i = 0; i < Math.max(e.length, a.length) && out.length < limit; i += 1) {
    if (e[i] !== a[i]) out.push(`  line ${i}: expected=${JSON.stringify(e[i])} actual=${JSON.stringify(a[i])}`);
  }
  return out;
}

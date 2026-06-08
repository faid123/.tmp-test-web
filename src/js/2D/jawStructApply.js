/**
 * Apply a normalized jaw-struct design (from jawStructCodec.resolveJawStructDesign)
 * onto the 2D annotation state. This is the browser-side half of the load path —
 * it reuses the real placement primitives so loaded designs behave exactly like
 * hand-placed ones.
 *
 * Kept separate from jawStructCodec.js so the codec stays DOM-free / testable;
 * this module pulls in the annotation + geometry helpers the codec must not.
 *
 * Apply order matters:
 *   1. presence + reset      (clears each tooth's placements)
 *   2. mesh spans            (mesh placements must exist before 3 and 4)
 *   3. present-tooth rests/clasps, then bars (bar surface is geometry-derived
 *      from nearby mesh-bearing teeth)
 *   4. major connector       (auto-places on mesh/plate-bearing supported teeth)
 */
import {
  COMPONENT_BY_ID,
  getBarPlacementSurfaceForTooth,
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws,
} from "./components.js";
import { addPlacement, hasPlacement } from "./annotationTeethModel.js";

function placeOnce(rec, componentId, surface) {
  if (!hasPlacement(rec, componentId, surface)) addPlacement(rec, componentId, surface);
}

export function applyJawStructDesign(design, state) {
  if (!design || !state?.teeth) return;
  const { jawSide } = design;

  // 1. Presence + reset. Missing teeth keep no components; present teeth start
  //    clean and get their placements rebuilt below.
  for (const [fdi, t] of Object.entries(design.teeth)) {
    const rec = state.teeth[fdi];
    if (!rec) continue;
    if (design.rawByFdi[fdi]) rec.rawJawStructFields = design.rawByFdi[fdi];
    if (t.present) {
      rec.isPresent = true;
      if (rec.status === "missing") rec.status = "presence";
    } else {
      rec.isPresent = false;
      rec.status = "missing";
    }
    rec.components = [];
    rec.componentPlacements = [];
  }

  // 2. Mesh spans land on the (missing) saddle teeth.
  for (const span of design.mesh) {
    for (const fdi of span.fdis) {
      const rec = state.teeth[fdi];
      if (rec) placeOnce(rec, span.componentId, null);
    }
  }

  // 3. Present-tooth rests/clasps (null surface), then bars (geometry surface).
  for (const [fdi, t] of Object.entries(design.teeth)) {
    const rec = state.teeth[fdi];
    if (!rec || !t.present) continue;
    for (const id of t.simple) placeOnce(rec, id, null);
    for (const barId of t.bars) {
      const jaw = rec.jaw || jawSide;
      const surface = getBarPlacementSurfaceForTooth(fdi, jaw, state.teeth);
      if (!surface) {
        console.warn(`[jawStructApply] no bar surface for ${fdi} (${barId}) — skipped`);
        continue;
      }
      placeOnce(rec, barId, surface);
    }
  }

  // 4. Major connector auto-placement (option a). Needs the mesh placements above.
  if (design.major && jawSide) {
    ensureMajorConnectorPlacementsOnSupportedTeethInJaws(
      state.teeth,
      design.major,
      COMPONENT_BY_ID,
      [jawSide]
    );
  }
}

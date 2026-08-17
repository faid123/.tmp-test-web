export function normalizeSurface(surface) {
  if (typeof surface !== "string") return null;
  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

// Picks the crown/root SVGs and the mobility tint for one tooth from its
// clinical note. Shared by the clinical-info chart and the noticeboard render.
export function resolveToothArtSources(id, note) {
  // Cracked replaces the crown; Implant > RCT > plain root.
  const crownSrc = note?.cracked ? `${id}_Cracked.svg` : `${id}_Crown.svg`;
  const rootSrc = note?.implant
    ? `${id}_Implant.svg`
    : note?.rct
    ? `${id}_RCT.svg`
    : `${id}_Root.svg`;
  // Tint only when the root isn't already a replaced (implant/RCT) graphic.
  const rootReplaced = !!(note?.implant || note?.rct);
  const mobilityTint = rootReplaced
    ? ""
    : note?.mobility === "1"
    ? "is-tint-green"
    : note?.mobility === "2"
    ? "is-tint-yellow"
    : note?.mobility === "3"
    ? "is-tint-red"
    : "";
  return { crownSrc, rootSrc, mobilityTint };
}

export function normalizeSurface(surface) {
  if (typeof surface !== "string") return null;
  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

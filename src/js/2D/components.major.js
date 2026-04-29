const MAJOR_TAB = "major";

/**
 * Page-relative href for a MajorConnector template SVG (upper arch only).
 * Quadrant 1 (11–18): file matches tooth id; quadrant 2 (21–28): maps by unit → 11–18 (e.g. 21 → 11.svg).
 */
export function getMajorConnectorAssetReference(toothId, jaw) {
  if (jaw !== "upper") return null;
  const id = String(toothId);
  if (!/^[12][1-8]$/.test(id)) return null;
  const q = Number(id[0]);
  const u = Number(id[1]);
  const file = q === 1 ? id : `1${u}`;
  return `../../assets/RPD_Component/MajorConnector/${file}.svg`;
}

export function isMajorConnectorComponent(componentOrId) {
  if (typeof componentOrId === "object" && componentOrId !== null) {
    return (
      componentOrId.tab === MAJOR_TAB || String(componentOrId.id || "").startsWith("major-")
    );
  }
  return String(componentOrId || "").startsWith("major-");
}

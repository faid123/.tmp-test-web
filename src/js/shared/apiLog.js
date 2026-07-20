const seen = new Set();

export function logApi(res, label) {
  if (!res.ok) {
    console.warn(`[API] ✗ ${label} status=${res.status}`);
    return;
  }
  if (seen.has(label)) return;
  seen.add(label);
  console.log(`[API] ✓ ${label} status=${res.status}`);
}

// --- Case-status display titles ------------------------------------------
// Single source of truth for case-status display titles, mirroring the status
// dropdown in the case detail panel. Imported by the case list, the dashboard,
// and the generated report so changing a label here updates all of them.
//
// These exports import nothing, so they're safe to use from anywhere without
// creating a cycle (caseManagement.js <-> dashboard.js <-> noticeboard.js).

export const STATUS_LABELS = {
  na: "N/A",
  draft: "Draft",
  "2d_design_pending": "2D design pending",
  "2d_design_drafted": "2D design drafted",
  "2d_design_approved": "2D design approved",
  "3d_design_pending": "3D design pending",
  "3d_design_drafted": "3D design drafted",
  "3d_design_approved": "3D design approved",
  in_production: "In production",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
};

// Normalize a backend status string ("2D design drafted", null, etc.) to the
// canonical underscore key used by STATUS_LABELS.
export function normalizeStatus(apiStatus) {
  if (!apiStatus) return "na";
  return String(apiStatus).toLowerCase().replace(/ /g, "_");
}

// The exact display title for a status, e.g. "2D design drafted". Unknown values
// fall back to a spaced version of the raw key.
export function statusLabel(apiStatus) {
  const v = normalizeStatus(apiStatus);
  if (v === "na") return "N/A";
  return STATUS_LABELS[v] || v.replace(/_/g, " ");
}

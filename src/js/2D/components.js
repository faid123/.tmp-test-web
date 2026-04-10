export const COMPONENT_TABS = [
  { id: "mesh", label: "MESH" },
  { id: "assembly", label: "ASSEMBLY" },
  { id: "rests", label: "RESTS" },
  { id: "clasps", label: "CLASPS" },
  { id: "bars", label: "BARS" },
  { id: "plate", label: "PLATE" },
  { id: "major", label: "MAJOR CONNECTOR" }
];

export const ACTION_UPON_FAILURE = {
  PREVENT_PLACEMENT: "PreventPlacement",
  REMOVE_THEN_PLACE: "RemoveThenPlace"
};

export const COMPONENT_CATALOG = [
  {
    id: "mesh-tori",
    label: "Mesh Tori",
    shortLabel: "MT",
    icon: "/assets/menu-icon/mesh/Mesh_Tori.png",
    tab: "mesh",
    requiresPresence: false,
    requiresMissing: true,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "mesh-stripe",
    label: "Mesh Stripe",
    shortLabel: "MS",
    icon: "/assets/menu-icon/mesh/Mesh_Stripe.png",
    tab: "mesh",
    requiresPresence: false,
    requiresMissing: true,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "mesh-hole",
    label: "Mesh Hole",
    shortLabel: "MH",
    icon: "/assets/menu-icon/mesh/Mesh_Hole.png",
    tab: "mesh",
    requiresPresence: false,
    requiresMissing: true,
    conflictsWith: ["rest-seat"],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "mesh-flange",
    label: "Mesh Flange",
    shortLabel: "MF",
    icon: "/assets/menu-icon/mesh/Mesh_Flange.png",
    tab: "mesh",
    requiresPresence: false,
    requiresMissing: true,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "mesh-cross",
    label: "Mesh Cross",
    shortLabel: "MC",
    icon: "/assets/menu-icon/mesh/Mesh_Cross.png",
    tab: "mesh",
    requiresPresence: false,
    requiresMissing: true,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "assembly-rpi",
    label: "RPI Assembly",
    shortLabel: "RPI",
    icon: "/assets/menu-icon/Assembly/Bars/Assembly_RPI.png",
    section: "bars",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: ["assembly-circ"],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-ibar",
    label: "I-Bar Assembly",
    shortLabel: "IBA",
    icon: "/assets/menu-icon/Assembly/Bars/Assembly_Ibar.png",
    section: "bars",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-tbar",
    label: "T-Bar Assembly",
    shortLabel: "TBA",
    icon: "/assets/menu-icon/Assembly/Bars/Assembly_Tbar.png",
    section: "bars",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-tbar-mod",
    label: "Modified T-Bar Assembly",
    shortLabel: "TBM",
    icon: "/assets/menu-icon/Assembly/Bars/Assembly_TbarMod.png",
    section: "bars",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-circ",
    label: "Simple Circum Assembly",
    shortLabel: "CIR",
    icon: "/assets/menu-icon/Assembly/Circum/Assembly_SimpleCircum.png",
    section: "circum",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: ["assembly-rpi"],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-circ-reverse",
    label: "Reverse Circum Assembly",
    shortLabel: "REV",
    icon: "/assets/menu-icon/Assembly/Circum/Assembly_Reverse.png",
    section: "circum",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-circ-ring-support",
    label: "Ring Support Assembly",
    shortLabel: "RSP",
    icon: "/assets/menu-icon/Assembly/Circum/Assembly_RingSupp.png",
    section: "circum",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-circ-embrasure",
    label: "Embrasure Assembly",
    shortLabel: "EMB",
    icon: "/assets/menu-icon/Assembly/Circum/Assembly_embrasure.png",
    section: "circum",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-circ-half-n-half",
    label: "Half and Half Assembly",
    shortLabel: "HNH",
    icon: "/assets/menu-icon/Assembly/Circum/Assembly_halfNhalf.png",
    section: "circum",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "assembly-circ-multi",
    label: "Multi Circum Assembly",
    shortLabel: "MUL",
    icon: "/assets/menu-icon/Assembly/Circum/Assembly_multiCircum.png",
    section: "circum",
    tab: "assembly",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "rest-seat",
    label: "Rest Seat",
    shortLabel: "RS",
    icon: "/assets/menu-icon/rest/Rest.png",
    tab: "rests",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: ["mesh-hole"],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "rest-onlay",
    label: "Onlay Rest",
    shortLabel: "OR",
    icon: "/assets/menu-icon/rest/Rest_Onlay.png",
    tab: "rests",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "clasp-circ",
    label: "Circumferential Clasp",
    shortLabel: "CC",
    icon: "/assets/menu-icon/clasps/Retainer_Clasp.png",
    tab: "clasps",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: ["clasp-bar"],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "clasp-bar",
    label: "Bar Clasp",
    shortLabel: "BC",
    icon: "/assets/menu-icon/clasps/Recip_Clasp.png",
    tab: "clasps",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: ["clasp-circ"],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "clasp-ring",
    label: "Ring Clasp",
    shortLabel: "RC",
    icon: "/assets/menu-icon/clasps/Retainer_Ring.png",
    tab: "clasps",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "bar-i",
    label: "I Bar",
    shortLabel: "IB",
    icon: "/assets/menu-icon/Bars/Retainer_I-Bar.png",
    tab: "bars",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "bar-s",
    label: "S Bar",
    shortLabel: "SB",
    icon: "/assets/menu-icon/Bars/Retainer_S-Bar.png",
    tab: "bars",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "bar-u",
    label: "U Bar",
    shortLabel: "UB",
    icon: "/assets/menu-icon/Bars/Retainer_U-Bar.png",
    tab: "bars",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "bar-y",
    label: "Y Bar",
    shortLabel: "YB",
    icon: "/assets/menu-icon/Bars/Retainer_Y-Bar.png",
    tab: "bars",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "plate-prox",
    label: "Proximal Plate",
    shortLabel: "PP",
    icon: "/assets/menu-icon/Plates/Recip_Plate.png",
    tab: "plate",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "plate-crossmesh",
    label: "Crossmesh Plate",
    shortLabel: "CP",
    icon: "/assets/menu-icon/Plates/Recip_Crossmesh.png",
    tab: "plate",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.PREVENT_PLACEMENT,
  },
  {
    id: "major-upper-palatal-strap",
    label: "Palatal Strap",
    shortLabel: "PS",
    icon: "/assets/menu-icon/Connectors/Upper/MC_Palatal_Strap.png",
    section: "upper",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-upper-palatal-plate",
    label: "Palatal Plate",
    shortLabel: "PP",
    icon: "/assets/menu-icon/Connectors/Upper/MC_Palatal_Plate.png",
    section: "upper",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-upper-palatal-hole",
    label: "Palatal Hole",
    shortLabel: "PH",
    icon: "/assets/menu-icon/Connectors/Upper/MC_Palatal_Hole.png",
    section: "upper",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-upper-horseshoe",
    label: "Horseshoe",
    shortLabel: "HS",
    icon: "/assets/menu-icon/Connectors/Upper/MC_Horseshoe.png",
    section: "upper",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-upper-palatal-bar",
    label: "Palatal Bar",
    shortLabel: "PB",
    icon: "/assets/menu-icon/Connectors/Upper/MC_Palatal_Bar.png",
    section: "upper",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-lower-lingual-kennedy",
    label: "Lingual Kennedy",
    shortLabel: "LK",
    icon: "/assets/menu-icon/Connectors/Lower/MC_lingual_kennedy.png",
    section: "lower",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-lower-lingual-bar",
    label: "Lingual Bar",
    shortLabel: "LB",
    icon: "/assets/menu-icon/Connectors/Lower/MC_lingual_Bar.png",
    section: "lower",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-lower-horseshoe",
    label: "Horseshoe",
    shortLabel: "HS",
    icon: "/assets/menu-icon/Connectors/Lower/MC_Horseshoe.png",
    section: "lower",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-lower-cingulum-bar",
    label: "Cingulum Bar",
    shortLabel: "CB",
    icon: "/assets/menu-icon/Connectors/Lower/MC_cingulum_bar.png",
    section: "lower",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
  {
    id: "major-lower-lingual-plate",
    label: "Lingual Plate",
    shortLabel: "LP",
    icon: "/assets/menu-icon/Connectors/Lower/MC_lingual_plate.png",
    section: "lower",
    tab: "major",
    requiresPresence: true,
    requiresMissing: false,
    conflictsWith: [],
    actionUponFailure: ACTION_UPON_FAILURE.REMOVE_THEN_PLACE,
  },
];

export const COMPONENT_BY_ID = new Map(COMPONENT_CATALOG.map((entry)=>[entry.id, entry]));

export const COMPONENT_ASSET_BASE = "../../../assets/RPD_Component";

export const COMPONENT_IMAGE_SUFFIX_BY_ID = {
  "mesh-tori": "tori_mesh.png",
  "mesh-stripe": "stripe_mesh.png",
  "mesh-hole": "hole_mesh.png",
  "mesh-cross": "cross_mesh.png",
  "mesh-flange": "flange.png"
};

// Normalize tooth id to the uploaded template tooth id used for component PNGs.
export function getComponentTemplateToothId(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) {
    return "11";
  }

  const unit = numeric % 10;
  const quadrant = Math.floor(numeric / 10);
  if (quadrant === 2) {
    return `1${unit}`;
  }
  if (quadrant === 3) {
    return `4${unit}`;
  }
  return `${quadrant}${unit}`;
}

// Resolve component image path by component id and target tooth unit.
export function getComponentAssetReference(componentId, toothId) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const suffix = COMPONENT_IMAGE_SUFFIX_BY_ID[componentId];
  const fileName = suffix ? `${templateToothId}-${suffix}` : null;
  if (!fileName) {
    return null;
  }
  return `${COMPONENT_ASSET_BASE}/${templateToothId}/${fileName}`;
}

export const REST_SURFACE = Object.freeze({
  MESIAL: "mesial",
  DISTAL: "distal",
  LINGUAL: "lingual",
});

const REST_SURFACE_ORDER = [
  REST_SURFACE.MESIAL,
  REST_SURFACE.DISTAL,
  REST_SURFACE.LINGUAL,
];

const REST_SUGGESTION_CONFIG = Object.freeze({
  radius: 8,
  defaultPoints: {
    [REST_SURFACE.MESIAL]: { x: -8.2, y: -3.2 },
    [REST_SURFACE.DISTAL]: { x: 8.2, y: -3.2 },
    [REST_SURFACE.LINGUAL]: { x: 0, y: -8.4 },
  },
});

export const REST_SUGGESTION_POINT_OVERRIDES = {
  "18": { mesial: { x: 2, y: -20 }, distal: { x: -1, y: 22 }, lingual: { x: 20, y: 8 } },
  "17": { mesial: { x: 4, y: -20 }, distal: { x: -1, y: 22 }, lingual: { x: 23, y: 8 } },
  "16": { mesial: { x: 10, y: -20 }, distal: { x: -5, y: 26 }, lingual: { x: 23, y: 10 } },
  "15": { mesial: { x: 9, y: -14 }, distal: { x: -5, y: 18 }, lingual: { x: 20, y: 7 } },
  "14": { mesial: { x: 13, y: -8 }, distal: { x: 1, y: 17 }, lingual: { x: 18, y: 11 } },
  "13": { mesial: { x: 4, y: -18 }, distal: { x: -18, y: 9 }, lingual: { x: 13, y: 15 } },
  "12": { mesial: { x: 7, y: -18 }, distal: { x: -17, y: -2 }, lingual: { x: 10, y: 19 } },
  "11": { mesial: { x: 21, y: -22 }, distal: { x: -22, y: -12 }, lingual: { x: 6, y: 25 } },
  "21": { mesial: { x: -22, y: -22 }, distal: { x: 21, y: -12 }, lingual: { x: -6, y: 25 } },
  "22": { mesial: { x: -6, y: -18 }, distal: { x: 17, y: -2 }, lingual: { x: -10, y: 19 } },
  "23": { mesial: { x: -4, y: -18 }, distal: { x: 18, y: 9 }, lingual: { x: -13, y: 15 } },
  "24": { mesial: { x: -13, y: -8 }, distal: { x: 2, y: 17 }, lingual: { x: -18, y: 12 } },
  "25": { mesial: { x: -9, y: -14 }, distal: { x: 5, y: 18 }, lingual: { x: -18, y: 9 } },
  "26": { mesial: { x: -10, y: -20 }, distal: { x: 5, y: 26 }, lingual: { x: -23, y: 10 } },
  "27": { mesial: { x: -4, y: -20 }, distal: { x: 1, y: 22 }, lingual: { x: -23, y: 8 } },
  "28": { mesial: { x: -5, y: -20 }, distal: { x: 1, y: 22 }, lingual: { x: -20, y: 8 } },

  // Lower jaw rest point calibration list (editable)
  "38": { mesial: { x: 7, y: 21 }, distal: { x: -3, y: -22 }, lingual: { x: 20, y: -5 } },
  "37": { mesial: { x: 8, y: 26 }, distal: { x: -5, y: -24 }, lingual: { x: 20, y: -3 } },
  "36": { mesial: { x: 12, y: 30 }, distal: { x: -5, y: -33 }, lingual: { x: 23, y: -4 } },
  "35": { mesial: { x: 10, y: 20 }, distal: { x: -5, y: -20 }, lingual: { x: 18, y: -4 } },
  "34": { mesial: { x: 13, y: 14 }, distal: { x: -13, y: -13 }, lingual: { x: 12, y: -12 } },
  "33": { mesial: { x: 5, y: 17 }, distal: { x: -19, y: 1 }, lingual: { x: 12, y: -15 } },
  "32": { mesial: { x: 3, y: 19 }, distal: { x: -17, y: 11 }, lingual: { x: 5, y: -17 } },
  "31": { mesial: { x: 7, y: 18 }, distal: { x: -14, y: 15 }, lingual: { x: 1, y: -15 } },
  "41": { mesial: { x: -7, y: 18 }, distal: { x: 14, y: 15 }, lingual: { x: -1, y: -15 } },
  "42": { mesial: { x: -3, y: 19 }, distal: { x: 17, y: 11 }, lingual: { x: -5, y: -17 } },
  "43": { mesial: { x: -5, y: 17 }, distal: { x: 19, y: 1 }, lingual: { x: -12, y: -15 } },
  "44": { mesial: { x: -13, y: 14 }, distal: { x: 13, y: -13 }, lingual: { x: -12, y: -12} },
  "45": { mesial: { x: -10, y: 20 }, distal: { x: 5, y: -20 }, lingual: { x: -18, y: -4 } },
  "46": { mesial: { x: -12, y: 30 }, distal: { x: 5, y: -33 }, lingual: { x: -23, y: -4 } },
  "47": { mesial: { x: -8, y: 26 }, distal: { x: 5, y: -24 }, lingual: { x: -20, y: -3 } },
  "48": { mesial: { x: -7, y: 21 }, distal: { x: 3, y: -22 }, lingual: { x: -20, y: -5 } },
};

const REST_PLACEMENT_ASSET_BASE = "../../../assets/RPD_Component";


const REST_PLACEMENT_IMAGE_SIZE_BY_TOOTH = Object.freeze({
  "11": {
    ac_mesial: { width: 33, height: 32 },
    ac_distal: { width: 32, height: 33 },
    ac_full: { width: 40, height: 57 },
    ai_mesial: { width: 32, height: 30 },
    ai_distal: { width: 33, height: 41 },
  },
  "12": {
    ac_mesial: { width: 27, height: 25 },
    ac_distal: { width: 31, height: 29 },
    ac_full: { width: 30, height: 51 },
    ai_mesial: { width: 30, height: 30 },
    ai_distal: { width: 34, height: 35 },
  },
  "13": {
    ac_mesial: { width: 30, height: 26 },
    ac_distal: { width: 27, height: 30 },
    ac_full: { width: 30, height: 61 },
    ai_mesial: { width: 39, height: 30 },
    ai_distal: { width: 36, height: 30 },
  },
  "14": {
    p_mesial: { width: 35, height: 40 },
    p_distal: { width: 35, height: 34 },
    p_lingual: { width: 38, height: 55 },
    p_full: { width: 126, height: 127 },
  },
  "15": {
    p_mesial: { width: 53, height: 42 },
    p_distal: { width: 53, height: 34 },
    p_lingual: { width: 43, height: 68 },
    p_full: { width: 130, height: 123 },
  },
  "16": {
    p_mesial: { width: 60, height: 51 },
    p_distal: { width: 63, height: 39 },
    p_lingual: { width: 99, height: 45 },
    p_full: { width: 163, height: 176 },
  },
  "17": {
    p_mesial: { width: 61, height: 40 },
    p_distal: { width: 66, height: 29 },
    p_lingual: { width: 70, height: 43 },
    p_full: { width: 152, height: 148 },
  },
  "18": {
    p_mesial: { width: 56, height: 42 },
    p_distal: { width: 58, height: 32 },
    p_lingual: { width: 70, height: 44 },
    p_full: { width: 145, height: 151 },
  },
  "41": {
    ac_mesial: { width: 30, height: 31 },
    ac_distal: { width: 29, height: 28 },
    ac_full: { width: 58, height: 58 },
    ac_both: { width: 65, height: 35 },
    ai_mesial: { width: 23, height: 38 },
    ai_distal: { width: 24, height: 41 },
  },
  "42": {
    ac_mesial: { width: 29, height: 30 },
    ac_distal: { width: 32, height: 33 },
    ac_full: { width: 51, height: 58 },
    ac_both: { width: 63, height: 54 },
    ai_mesial: { width: 32, height: 38 },
    ai_distal: { width: 34, height: 40 },
  },
  "43": {
    ac_mesial: { width: 32, height: 37 },
    ac_distal: { width: 35, height: 30 },
    ac_full: { width: 57, height: 52 },
    ac_both: { width: 67, height: 57 },
    ai_mesial: { width: 36, height: 45 },
    ai_distal: { width: 42, height: 39 },
  },
  "44": {
    p_mesial: { width: 38, height: 35 },
    p_distal: { width: 47, height: 42 },
    p_lingual: { width: 51, height: 47 },
    p_full: { width: 111, height: 107 },
  },
  "45": {
    p_mesial: { width: 61, height: 37 },
    p_distal: { width: 53, height: 42 },
    p_lingual: { width: 46, height: 80 },
    p_full: { width: 112, height: 123 },
  },
  "46": {
    p_mesial: { width: 72, height: 55 },
    p_distal: { width: 62, height: 45 },
    p_lingual: { width: 63, height: 89 },
    p_full: { width: 154, height: 181 },
  },
  "47": {
    p_mesial: { width: 69, height: 49 },
    p_distal: { width: 65, height: 43 },
    p_lingual: { width: 63, height: 71 },
    p_full: { width: 137, height: 157 },
  },
  "48": {
    p_mesial: { width: 73, height: 41 },
    p_distal: { width: 69, height: 44 },
    p_lingual: { width: 58, height: 59 },
    p_full: { width: 137, height: 147 },
  },
});

const REST_PLACEMENT_SCALE_BY_TOKEN = Object.freeze({
  ac_mesial: 0.72,
  ac_distal: 0.72,
  ac_full: 0.66,
  ai_mesial: 0.65,
  ai_distal: 0.65,
  ac_both: 0.66,
  p_mesial: 0.52,
  p_distal: 0.52,
  p_lingual: 0.52,
  p_full: 0.5,
});

const REST_PLACEMENT_SCALE_OVERRIDE_BY_TOOTH = Object.freeze({
  "11": { ac_full: 0.63 },
  "12": { ac_full: 0.64 },
  "13": { ac_full: 0.64 },
  "14": { p_lingual: 0.49 },
  "15": { p_lingual: 0.5 },
  "16": { p_lingual: 0.5 },
  "17": { p_lingual: 0.5 },
  "18": { p_lingual: 0.5 },
});

function getToothUnit(toothId) {
  const numeric = Number(toothId);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric % 10;
}

function getRestVariantForTooth(toothId) {
  const unit = getToothUnit(toothId);
  if (!Number.isFinite(unit)) {
    return "posterior";
  }
  return unit >= 1 && unit <= 3 ? "anterior" : "posterior";
}

function normalizeRestSurface(surface) {
  if (typeof surface !== "string") {
    return null;
  }

  const normalized = surface.toLowerCase();
  return normalized === "occlusal" ? "lingual" : normalized;
}

function getRestPlacementToken(componentId, toothId, surface) {
  const variant = getRestVariantForTooth(toothId);
  const templateToothId = getComponentTemplateToothId(toothId);
  const normalizedSurface = normalizeRestSurface(surface);
  if (!normalizedSurface) {
    return null;
  }

  if (variant === "anterior") {
    void componentId;
    if (normalizedSurface === "mesial") return "ai_mesial";
    if (normalizedSurface === "distal") return "ai_distal";
    if (normalizedSurface === "lingual") {
      if (templateToothId === "41" || templateToothId === "42" || templateToothId === "43") {
        return "ac_both";
      }
      return "ac_full";
    }
    return null;
  }

  if (normalizedSurface === "mesial") return "p_mesial";
  if (normalizedSurface === "distal") return "p_distal";
  if (normalizedSurface === "lingual") return "p_lingual";
  return null;
}

export function getRestPlacementAssetReference(componentId, toothId, surface) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const token = getRestPlacementToken(componentId, toothId, surface);

  if (!token) {
    return null;
  }

  if ((templateToothId === "17" || templateToothId === "18") && token === "p_mesial") {
    return `${REST_PLACEMENT_ASSET_BASE}/${templateToothId}/rest/${templateToothId}-p_meisal.svg`;
  }

  return `${REST_PLACEMENT_ASSET_BASE}/${templateToothId}/rest/${templateToothId}-${token}.svg`;
}

export function getRestPlacementImageSize(componentId, toothId, surface) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const token = getRestPlacementToken(componentId, toothId, surface);
  if (!token) {
    return null;
  }

  const byTooth = REST_PLACEMENT_IMAGE_SIZE_BY_TOOTH[templateToothId]?.[token];
  if (byTooth) {
    return byTooth;
  }

  return REST_PLACEMENT_IMAGE_SIZE[token] || null;
}

export function getRestPlacementRenderScale(componentId, toothId, surface) {
  const templateToothId = getComponentTemplateToothId(toothId);
  const token = getRestPlacementToken(componentId, toothId, surface);
  if (!token) {
    return 0.55;
  }

  const override = REST_PLACEMENT_SCALE_OVERRIDE_BY_TOOTH[templateToothId]?.[token];
  if (Number.isFinite(override)) {
    return override;
  }

  return REST_PLACEMENT_SCALE_BY_TOKEN[token] || 0.55;
}

export function getRestSuggestionSurfaces(componentId, toothId) {
  const variant = getRestVariantForTooth(toothId);
  if (variant === "anterior" && componentId === "rest-onlay") {
    return [REST_SURFACE.MESIAL, REST_SURFACE.DISTAL];
  }
  return [...REST_SURFACE_ORDER];
}

export function getRestSuggestionRadius() {
  return REST_SUGGESTION_CONFIG.radius;
}

export function isRestComponent(componentOrId) {
  const def =
    typeof componentOrId === "string"
      ? COMPONENT_BY_ID.get(componentOrId)
      : componentOrId;
  return def?.tab === "rests";
}

export function getRestSuggestionPointsForTooth(
  toothId,
  jaw,
  mirrored,
  jawFlipX = 1,
  componentId = null
) {
  void jaw;
  const direction = (mirrored ? -1 : 1) * jawFlipX;
  const override = REST_SUGGESTION_POINT_OVERRIDES[toothId] || {};
  const allowedSurfaces = new Set(getRestSuggestionSurfaces(componentId, toothId));

  return REST_SURFACE_ORDER.map((surface) => {
    const base = REST_SUGGESTION_CONFIG.defaultPoints[surface];
    const surfaceOverride = override[surface] || {};
    const x = surface === REST_SURFACE.LINGUAL ? base.x : base.x * direction;

    return {
      surface,
      x: Number.isFinite(surfaceOverride.x) ? surfaceOverride.x : x,
      y: Number.isFinite(surfaceOverride.y) ? surfaceOverride.y : base.y,
    };
  }).filter((point) => allowedSurfaces.has(point.surface));
}

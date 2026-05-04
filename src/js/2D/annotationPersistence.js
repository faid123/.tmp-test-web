import {
  COMPONENT_BY_ID,
  isBarComponent,
  isBarPlacementSurface,
} from "./components.js";
import { TOOTH_ORDER } from "./constants.js";
import { state } from "./annotationState.js";
import { setMessage, downloadJson } from "./annotationDom.js";
import {
  ensureToothPlacementState,
  normalizeSurface,
  statusJsonForToothRecord,
  syncToothComponentsFromPlacements,
} from "./annotationTeethModel.js";

export function saveAnnotation() {
  const payload = buildPayload();
  const storageKey = getStorageKey();
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
    downloadJson(`case_${state.caseIntID ?? "unknown"}_2d_annotation.json`, payload);
    setMessage(`Saved to localStorage key "${storageKey}" and downloaded JSON file.`, false);
  } catch {
    setMessage("Failed to save annotation JSON.", true);
  }
}

export function buildPayload() {
  const teeth = [...TOOTH_ORDER.upper, ...TOOTH_ORDER.lower].map((toothId) => {
    const record = state.teeth[toothId];
    ensureToothPlacementState(record);
    syncToothComponentsFromPlacements(record);

    return {
      tooth_id: record.tooth_id,
      jaw: record.jaw,
      status: statusJsonForToothRecord(record),
      isPresent: record.isPresent,
      componentPlacements: (record.componentPlacements || []).map((entry) => {
        const row = {
          componentId: entry.componentId,
          surface: normalizeSurface(entry.surface),
        };
        if (
          isBarComponent(entry.componentId) &&
          isBarPlacementSurface(normalizeSurface(entry.surface))
        ) {
          const bx = Number(entry.barOffsetX);
          const by = Number(entry.barOffsetY);
          row.barOffsetX = Number.isFinite(bx) ? bx : 0;
          row.barOffsetY = Number.isFinite(by) ? by : 0;
        }
        return row;
      }),
      components: [...record.components],
      center: record.center,
    };
  });

  return {
    schema: "smartrpd.2d-arch.v1",
    caseIntID: state.caseIntID,
    encryptedCaseId: state.encryptedCaseId || null,
    updatedAt: new Date().toISOString(),
    locks: { upper: state.locks.upper, lower: state.locks.lower },
    editMode: state.designMode,
    components: state.components,
    selectedComponentId: state.selectedComponentId,
    archOverlayPalatalHoleActive: state.archOverlayPalatalHoleActive,
    activeStatus: state.activeStatus,
    teeth,
    arches: {
      upper: TOOTH_ORDER.upper.map((id) => state.teeth[id].center),
      lower: TOOTH_ORDER.lower.map((id) => state.teeth[id].center),
    },
  };
}

export function loadPreviewImage() {
  const img = document.getElementById("previewImage");
  const fallback = document.getElementById("previewFallback");
  if (!img || !fallback) return;

  if (!state.encryptedCaseId) {
    fallback.style.display = "block";
    img.style.display = "none";
    return;
  }

  const localImage = localStorage.getItem(`annotateBackground_${state.encryptedCaseId}`);
  if (localImage) {
    img.src = localImage;
    img.style.display = "block";
    fallback.style.display = "none";
    return;
  }

  fallback.style.display = "block";
  img.style.display = "none";
}

export function getStorageKey() {
  return `dentalAnnotation_${state.encryptedCaseId || "draft"}`;
}

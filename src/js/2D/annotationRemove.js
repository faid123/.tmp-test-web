import { COMPONENT_BY_ID } from "./components.js";
import { state, ui } from "./annotationState.js";
import { setMessage, positionAnteriorRestPanel } from "./annotationDom.js";
import { renderJaws } from "./annotationRenderBridge.js";
import {
  ensureToothPlacementState,
  normalizeSurface,
  removePlacementAtIndex,
} from "./annotationTeethModel.js";
import { applyRemovalSideEffectsForTooth } from "./annotationPlacement.js";
import { closePresentToothRadialQuickPick } from "./annotationCatalog.js";

function formatPlacementSurfaceForRemoveUi(surface) {
  const s = normalizeSurface(surface);
  if (!s) return "";
  return s.replace(/_/g, " ");
}

export function closeRemoveComponentDialog() {
  if (typeof ui.removeComponentDialogCleanup === "function") {
    ui.removeComponentDialogCleanup();
    ui.removeComponentDialogCleanup = null;
  }
}

export function openRemoveComponentPicker(toothId, jaw, anchorEvent) {
  closeRemoveComponentDialog();
  closePresentToothRadialQuickPick();

  const root = document.getElementById("removeComponentDialog");
  const panel = root?.querySelector(".remove-component-dialog-panel");
  const backdrop = root?.querySelector(".remove-component-dialog-backdrop");
  const listEl = document.getElementById("removeComponentList");
  const titleEl = document.getElementById("removeComponentDialogTitle");
  const hintEl = document.getElementById("removeComponentDialogHint");
  const cancelBtn = document.getElementById("removeComponentDialogCancel");

  const tooth = state.teeth[toothId];
  if (!root || !panel || !backdrop || !listEl || !titleEl || !hintEl || !cancelBtn || !tooth) {
    setMessage("Could not open remove list for this tooth.", true);
    return;
  }

  ensureToothPlacementState(tooth);
  const placements = [...(tooth.componentPlacements || [])];

  titleEl.textContent = `Remove component — Tooth ${toothId}`;
  listEl.innerHTML = "";

  if (placements.length === 0) {
    hintEl.textContent = "This tooth has no components to remove.";
    hintEl.classList.remove("is-hidden");
  } else {
    hintEl.textContent = "";
    hintEl.classList.add("is-hidden");
  }

  const itemHandlers = [];

  const cleanup = () => {
    document.removeEventListener("keydown", onKeyDown);
    backdrop.removeEventListener("click", onBackdrop);
    cancelBtn.removeEventListener("click", onCancel);
    for (const h of itemHandlers) {
      h.btn.removeEventListener("click", h.fn);
    }
    panel.style.left = "";
    panel.style.top = "";
    panel.style.visibility = "";
    root.classList.add("is-hidden");
    root.setAttribute("aria-hidden", "true");
    ui.removeComponentDialogCleanup = null;
  };

  const finish = () => cleanup();

  const onKeyDown = (e) => {
    if (e.key === "Escape") finish();
  };
  const onBackdrop = () => finish();
  const onCancel = () => finish();

  placements.forEach((entry, index) => {
    const def = COMPONENT_BY_ID.get(entry.componentId);
    const label = def?.label || entry.componentId;
    const surf = formatPlacementSurfaceForRemoveUi(entry.surface);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "remove-component-item-btn";
    btn.textContent = surf ? `${label} (${surf})` : label;
    const fn = () => {
      const t = state.teeth[toothId];
      if (!t) {
        finish();
        return;
      }
      ensureToothPlacementState(t);
      const removed = removePlacementAtIndex(t, index);
      applyRemovalSideEffectsForTooth(t, removed);
      const defR = removed ? COMPONENT_BY_ID.get(removed.componentId) : null;
      const name = defR?.label || removed?.componentId || "item";
      setMessage(`Removed ${name} from tooth ${toothId}.`, false);
      finish();
      renderJaws();
    };
    btn.addEventListener("click", fn);
    itemHandlers.push({ btn, fn });
    listEl.appendChild(btn);
  });

  document.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", onBackdrop);
  cancelBtn.addEventListener("click", onCancel);

  ui.removeComponentDialogCleanup = cleanup;

  panel.style.visibility = "hidden";
  root.classList.remove("is-hidden");
  root.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionAnteriorRestPanel(panel, anchorEvent);
      panel.style.visibility = "";
      cancelBtn.focus();
    });
  });
}

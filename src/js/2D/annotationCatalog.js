import {
  ACTION_UPON_FAILURE,
  cancelMeshInteractionDefer,
  COMPONENT_CATALOG,
  COMPONENT_BY_ID,
  COMPONENT_TABS,
  deferMeshInteraction,
  handleMeshCatalogDoubleClickApplyAll,
  isBarComponent,
  isMajorConnectorComponent,
  isMeshComponent,
  isClaspComponent,
  isPalatalHoleMajorComponent,
  isPalatalBarMajorComponent,
  isPlateComponentId,
  ensureMajorConnectorPlacementsOnSupportedTeeth,
  ensurePalatalBarPlacementsOnConnectorTeeth,
  removeMajorPlacementsFromPalatalBarExcludedUpperTeeth,
  replaceUpperPalatalBarPlacementsWithPalatalHole,
} from "./components.js";
import { COMPONENT_GROUPS, forEachTooth } from "./constants.js";
import { state, DEFAULT_COMPONENT_ID } from "./annotationState.js";
import { setMessage } from "./annotationDom.js";
import { renderJaws } from "./annotationRenderBridge.js";
import { meshAnnotationEnv } from "./annotationMeshEnv.js";
import {
  ensureToothPlacementState,
  syncToothComponentsFromPlacements,
} from "./annotationTeethModel.js";
import { ensureMajorTabDefaultSelection } from "./annotationMajorPick.js";

// Build component tabs and initialize the first visible catalog view.
export function initComponentCatalog() {
  if (!state.selectedTab || !COMPONENT_TABS.some((t) => t.id === state.selectedTab)) {
    state.selectedTab = "mesh";
  }
  if (!state.selectedComponentId || !COMPONENT_BY_ID.has(state.selectedComponentId)) {
    state.selectedComponentId = DEFAULT_COMPONENT_ID;
  }
  const tabsEl = document.getElementById("componentTabs");
  if (tabsEl) {
    tabsEl.innerHTML = "";
    for (const tab of COMPONENT_TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `component-tab ${state.selectedTab === tab.id ? "is-active" : ""}`;
      button.textContent = tab.label;
      button.addEventListener("click", () => {
        state.selectedTab = tab.id;
        state.suppressArchPlacementSuggestions = false;
        if (tab.id === "major") {
          ensureMajorTabDefaultSelection();
        }
        renderComponentCatalog();
        renderJaws();
      });
      tabsEl.appendChild(button);
    }
  }
  renderComponentCatalog();
}

// Render component options for the selected tab and grouped sections.
export function renderComponentCatalog() {
  const tabs = document.querySelectorAll(".component-tab");
  tabs.forEach((tabBtn, index) => {
    tabBtn.classList.toggle("is-active", COMPONENT_TABS[index]?.id === state.selectedTab);
  });

  const itemsEl = document.getElementById("componentItems");
  if (!itemsEl) return;
  itemsEl.innerHTML = "";

  const tabItems = COMPONENT_CATALOG.filter((entry) => entry.tab === state.selectedTab);
  const groups = COMPONENT_GROUPS[state.selectedTab];
  if (groups) {
    const columns = document.createElement("div");
    columns.className = "major-columns";
    groups.forEach((groupMeta) => {
      const groupItems = tabItems.filter((entry) => entry.section === groupMeta.key);
      columns.appendChild(createMajorColumn(groupMeta.title, groupItems));
    });
    itemsEl.appendChild(columns);
    renderSelectedComponents();
    return;
  }

  for (const item of tabItems) {
    itemsEl.appendChild(createComponentItemButton(item));
  }

  if (state.selectedTab === "plate") {
    const clearRow = document.createElement("div");
    clearRow.className = "plate-tab-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "plate-clear-all-btn";
    clearBtn.textContent = "Clear all plates";
    clearBtn.disabled = !state.designMode;
    clearBtn.addEventListener("click", () => {
      if (!state.designMode) {
        setMessage("Lock both arches to clear plates.", true);
        return;
      }
      removeAllPlatePlacementsFromTeeth();
      state.components = state.components.filter((id) => !isPlateComponentId(id));
      state.selectedComponentId =
        state.components.find((id) => COMPONENT_BY_ID.has(id)) || DEFAULT_COMPONENT_ID;
      renderComponentCatalog();
      renderJaws();
      setMessage("All plates removed from the arch.", false);
    });
    clearRow.appendChild(clearBtn);
    itemsEl.appendChild(clearRow);
  }

  renderSelectedComponents();
}

// Create one column block for grouped component sections.
export function createMajorColumn(title, items) {
  const column = document.createElement("section");
  column.className = "major-column";

  const heading = document.createElement("h4");
  heading.className = "major-column-title";
  heading.textContent = title;
  column.appendChild(heading);

  const list = document.createElement("div");
  list.className = "major-column-items";
  for (const item of items) {
    list.appendChild(createComponentItemButton(item));
  }
  column.appendChild(list);
  return column;
}


// Create a selectable component button with icon and label tooltip.
export function createComponentItemButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `component-item ${state.selectedComponentId === item.id ? "is-active" : ""}`;
  button.title = item.label;

  const icon = document.createElement("span");
  icon.className = "component-icon";
  if (item.icon) {
    const iconImg = document.createElement("img");
    iconImg.className = "component-icon-img";
    iconImg.src = item.icon;
    iconImg.alt = item.label;
    icon.appendChild(iconImg);
  } else {
    icon.textContent = item.shortLabel;
  }

  const label = document.createElement("span");
  label.className = "component-label";
  label.textContent = item.label;

  button.appendChild(icon);
  button.appendChild(label);

  if (isMeshComponent(item.id)) {
    const deferKey = `mesh-catalog:${item.id}`;
    button.addEventListener("click", () => {
      deferMeshInteraction(deferKey, () => handleDesignComponentSelect(item.id));
    });
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      cancelMeshInteractionDefer(deferKey);
      handleMeshCatalogDoubleClickApplyAll(meshAnnotationEnv(), item.id);
    });
  } else {
    button.addEventListener("click", () => handleDesignComponentSelect(item.id));
  }
  return button;
}
export function removeAllPlatePlacementsFromTeeth() {
  forEachTooth((toothId) => {
    const tooth = state.teeth[toothId];
    if (!tooth) {
      return;
    }
    ensureToothPlacementState(tooth);
    const hadPlate = tooth.componentPlacements.some((e) => isPlateComponentId(e.componentId));
    tooth.componentPlacements = tooth.componentPlacements.filter(
      (e) => !isPlateComponentId(e.componentId) && !(hadPlate && isClaspComponent(e.componentId))
    );
    syncToothComponentsFromPlacements(tooth);
  });
}
export function handleDesignComponentSelect(componentId) {
  if (!state.designMode) {
    setMessage("Lock both arches to use the component catalog.", true);
    return;
  }
  state.suppressArchPlacementSuggestions = false;

  const selected = COMPONENT_BY_ID.get(componentId);
  if (!selected) return;

  if (isMeshComponent(componentId)) {
    const meshDeselect =
      state.selectedComponentId === componentId && state.components.includes(componentId);
    state.selectedComponentId = componentId;

    if (meshDeselect) {
      state.components = state.components.filter((id) => id !== componentId);
      state.selectedComponentId =
        state.components.find((id) => COMPONENT_BY_ID.has(id)) || DEFAULT_COMPONENT_ID;
      renderComponentCatalog();
      renderJaws();
      setMessage(`${selected.label} removed from design list.`, false);
      return;
    }

    state.components = state.components.filter((id) => !isMeshComponent(id));
    if (!state.components.includes(componentId)) {
      state.components.push(componentId);
    }
    renderComponentCatalog();
    renderJaws();
    setMessage(
      `${selected.label} selected. Single-click a missing tooth to place; double-click to change that tooth’s mesh to this type (different teeth can use different meshes).`,
      false
    );
    return;
  }

  if (isPlateComponentId(componentId)) {
    const plateDeselect =
      state.selectedComponentId === componentId && state.components.includes(componentId);
    state.selectedComponentId = componentId;

    if (plateDeselect) {
      state.components = state.components.filter((id) => id !== componentId);
      state.selectedComponentId =
        state.components.find((id) => COMPONENT_BY_ID.has(id)) || DEFAULT_COMPONENT_ID;
      renderComponentCatalog();
      renderJaws();
      setMessage(`${selected.label} deselected. Use "Clear all plates" to remove plates from teeth.`, false);
      return;
    }

    state.components = state.components.filter((id) => !isPlateComponentId(id));
    if (!state.components.includes(componentId)) {
      state.components.push(componentId);
    }
    renderComponentCatalog();
    renderJaws();
    setMessage(
      `${selected.label} selected. Click cyan suggestion markers on present teeth to toggle this plate. Use "Clear all plates" to remove all.`,
      false
    );
    return;
  }

  if (isMajorConnectorComponent(selected)) {
    state.selectedComponentId = componentId;
    state.archOverlayPalatalHoleActive = isPalatalHoleMajorComponent(componentId);

    if (isPalatalBarMajorComponent(componentId)) {
      ensurePalatalBarPlacementsOnConnectorTeeth(state.teeth, COMPONENT_BY_ID);
      removeMajorPlacementsFromPalatalBarExcludedUpperTeeth(state.teeth);
    } else {
      if (isPalatalHoleMajorComponent(componentId)) {
        replaceUpperPalatalBarPlacementsWithPalatalHole(state.teeth);
      } else {
        forEachTooth((toothId, jaw) => {
          if (jaw !== "upper") return;
          const tooth = state.teeth[toothId];
          if (!tooth || !Array.isArray(tooth.componentPlacements)) {
            return;
          }
          tooth.componentPlacements = tooth.componentPlacements.filter(
            (entry) => !isPalatalBarMajorComponent(entry.componentId)
          );
        });
      }
      ensureMajorConnectorPlacementsOnSupportedTeeth(state.teeth, componentId, COMPONENT_BY_ID);
    }

    forEachTooth((toothId) => {
      const tooth = state.teeth[toothId];
      if (!tooth) {
        return;
      }
      syncToothComponentsFromPlacements(tooth);
    });

    renderComponentCatalog();
    renderJaws();
    setMessage(
      isPalatalBarMajorComponent(componentId)
        ? `${selected.label} selected. Connector parts and P_Bar are shown; click posterior teeth to remove or add back segments.`
        : `${selected.label} selected. Click teeth with mesh or plate to place or remove this major connector.`,
      false
    );
    return;
  }

  state.selectedComponentId = componentId;
  renderJaws();

  if (state.components.includes(componentId)) {
    state.components = state.components.filter((id) => id !== componentId);
    renderComponentCatalog();
    renderJaws();
    setMessage(`${selected.label} removed from design list.`, false);
    return;
  }

  const conflicts = state.components.filter((id) => selected.conflictsWith.includes(id));
  if (conflicts.length > 0 && selected.actionUponFailure === ACTION_UPON_FAILURE.PREVENT_PLACEMENT) {
    setMessage(`Cannot add ${selected.label}. Conflicts with ${conflicts.join(", ")}.`, true);
    return;
  }

  if (conflicts.length > 0 && selected.actionUponFailure === ACTION_UPON_FAILURE.REMOVE_THEN_PLACE) {
    state.components = state.components.filter((id) => !conflicts.includes(id));
  }

  state.components.push(componentId);
  renderComponentCatalog();
  if (isBarComponent(selected)) {
    setMessage(
      `${selected.label} selected. Click a highlighted present tooth within two positions of a missing tooth to place.`,
      false
    );
    return;
  }
  setMessage(`${selected.label} added to design list.`, false);
}

// Render the selected component chips in the summary panel.
export function renderSelectedComponents() {
  const selectedEl = document.getElementById("selectedComponents");
  if (!selectedEl) return;

  selectedEl.innerHTML = "";
  for (const componentId of state.components) {
    const chip = document.createElement("span");
    chip.className = "selected-chip";
    chip.textContent = COMPONENT_BY_ID.get(componentId)?.label || componentId;
    selectedEl.appendChild(chip);
  }
}

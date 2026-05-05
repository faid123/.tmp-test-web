import {
  ACTION_UPON_FAILURE,
  cancelMeshInteractionDefer,
  COMPONENT_CATALOG,
  COMPONENT_BY_ID,
  COMPONENT_TABS,
  deferMeshInteraction,
  getDefaultMajorConnectorIdForDesignMode,
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
import { COMPONENT_GROUPS, forEachTooth, TOOTH_ORDER } from "./constants.js";
import {
  state,
  ui,
  DEFAULT_COMPONENT_ID,
  setMessage,
  renderJaws,
  meshAnnotationEnv,
} from "./2DAnnotation.js";
import {
  ensureToothPlacementState,
  syncToothComponentsFromPlacements,
} from "./annotationTeethModel.js";

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
          state.selectedComponentId = null;
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

export function getDefaultMajorConnectorIdForJaw(jaw) {
  const section = jaw === "upper" ? "upper" : "lower";
  const entry = COMPONENT_CATALOG.find((e) => e.tab === "major" && e.section === section);
  return entry?.id ?? getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
}

export function ensureMajorCatalogPickForTooth(toothId) {
  if (state.selectedTab !== "major" || !state.designMode) return;
  const jaw = TOOTH_ORDER.upper.includes(toothId)
    ? "upper"
    : TOOTH_ORDER.lower.includes(toothId)
      ? "lower"
      : null;
  if (!jaw) return;
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (sel && isMajorConnectorComponent(sel) && sel.section === jaw) return;
  const id = getDefaultMajorConnectorIdForJaw(jaw);
  if (!id || !COMPONENT_BY_ID.has(id)) return;
  state.selectedComponentId = id;
  if (isPalatalHoleMajorComponent(id)) {
    state.archOverlayPalatalHoleActive = true;
  } else if (jaw === "upper") {
    state.archOverlayPalatalHoleActive = false;
  }
}

export function ensureMajorTabDefaultSelection() {
  if (!state.designMode) return;
  const sel = COMPONENT_BY_ID.get(state.selectedComponentId || "");
  if (sel && isMajorConnectorComponent(sel)) {
    if (isPalatalHoleMajorComponent(sel.id)) state.archOverlayPalatalHoleActive = true;
    return;
  }
  const id = getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
  if (!id || !COMPONENT_BY_ID.has(id)) return;
  state.selectedComponentId = id;
  state.archOverlayPalatalHoleActive = isPalatalHoleMajorComponent(id);
}

// --- Radial quick-pick (present-tooth Rest / Clasps / Bars selector) ---

const RADIAL_SIZE = 160;
const RADIAL_VIEW = 160;
const RADIAL_CX = RADIAL_VIEW / 2;
const RADIAL_CY = RADIAL_VIEW / 2;
const RADIAL_R_OUTER = 76;
const RADIAL_R_INNER = 22;

function onPresentToothRadialKeydown(ev) {
  if (ev.key === "Escape") closePresentToothRadialQuickPick();
}

export function closePresentToothRadialQuickPick() {
  const host = ui.presentToothRadialHost;
  if (!host) return;
  host.remove();
  ui.presentToothRadialHost = null;
  document.removeEventListener("keydown", onPresentToothRadialKeydown);
}

function firstCatalogIdForTab(tabId) {
  const row = COMPONENT_CATALOG.find((e) => e.tab === tabId);
  return row?.id || null;
}

function applyRadialTab(tabId) {
  const id = firstCatalogIdForTab(tabId);
  if (!id || !COMPONENT_BY_ID.has(id)) {
    setMessage(`No component found for tab "${tabId}".`, true);
    return;
  }
  state.selectedTab = tabId;
  state.selectedComponentId = id;
  state.suppressArchPlacementSuggestions = false;
  renderComponentCatalog();
  renderJaws();
  setMessage(`${COMPONENT_BY_ID.get(id)?.label || id} selected — use suggestion markers on the arch.`, false);
}

function radialSectorPath(startDeg, endDeg) {
  const r0 = RADIAL_R_INNER, r1 = RADIAL_R_OUTER;
  const t0 = (startDeg * Math.PI) / 180, t1 = (endDeg * Math.PI) / 180;
  const x0 = RADIAL_CX + r0 * Math.cos(t0), y0 = RADIAL_CY + r0 * Math.sin(t0);
  const x1 = RADIAL_CX + r1 * Math.cos(t0), y1 = RADIAL_CY + r1 * Math.sin(t0);
  const x2 = RADIAL_CX + r1 * Math.cos(t1), y2 = RADIAL_CY + r1 * Math.sin(t1);
  const x3 = RADIAL_CX + r0 * Math.cos(t1), y3 = RADIAL_CY + r0 * Math.sin(t1);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r1} ${r1} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r0} ${r0} 0 ${large} 0 ${x0.toFixed(2)} ${y0.toFixed(2)} Z`;
}

function radialLabelPoint(angleDeg) {
  const t = (angleDeg * Math.PI) / 180;
  const r = (RADIAL_R_INNER + RADIAL_R_OUTER) / 2;
  return { x: RADIAL_CX + r * Math.cos(t), y: RADIAL_CY + r * Math.sin(t) };
}

export function showPresentToothRadialQuickPick(toothId, clientX, clientY) {
  closePresentToothRadialQuickPick();

  const backdrop = document.createElement("div");
  backdrop.className = "tooth-radial-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const panel = document.createElement("div");
  panel.className = "tooth-radial-panel";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${RADIAL_VIEW} ${RADIAL_VIEW}`);
  svg.setAttribute("class", "tooth-radial-svg");

  const sectors = [
    { label: "Rest", tab: "rests", start: 0, end: 120 },
    { label: "Clasps", tab: "clasps", start: 120, end: 240 },
    { label: "Bars", tab: "bars", start: 240, end: 360 },
  ];

  const wedgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wedgeGroup.setAttribute("transform", `rotate(-90 ${RADIAL_CX} ${RADIAL_CY})`);

  for (const s of sectors) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "tooth-radial-sector");
    g.setAttribute("tabindex", "0");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", radialSectorPath(s.start, s.end));
    g.appendChild(path);
    const mid = (s.start + s.end) / 2;
    const p = radialLabelPoint(mid);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(p.x));
    text.setAttribute("y", String(p.y));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("transform", `rotate(90 ${p.x} ${p.y})`);
    text.setAttribute("class", "tooth-radial-label");
    text.textContent = s.label;
    g.appendChild(text);
    const activate = () => { applyRadialTab(s.tab); closePresentToothRadialQuickPick(); };
    g.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); activate(); });
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
    wedgeGroup.appendChild(g);
  }
  svg.appendChild(wedgeGroup);

  const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  hole.setAttribute("cx", String(RADIAL_CX));
  hole.setAttribute("cy", String(RADIAL_CY));
  hole.setAttribute("r", String(RADIAL_R_INNER));
  hole.setAttribute("class", "tooth-radial-center-box");
  svg.appendChild(hole);

  const idText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  idText.setAttribute("x", String(RADIAL_CX));
  idText.setAttribute("y", String(RADIAL_CY));
  idText.setAttribute("text-anchor", "middle");
  idText.setAttribute("dominant-baseline", "middle");
  idText.setAttribute("class", "tooth-radial-tooth-id");
  idText.textContent = String(toothId);
  svg.appendChild(idText);

  panel.appendChild(svg);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  ui.presentToothRadialHost = backdrop;

  const left = Math.max(8, Math.min(clientX - RADIAL_SIZE / 2, window.innerWidth - RADIAL_SIZE - 8));
  const top = Math.max(8, Math.min(clientY - RADIAL_SIZE / 2, window.innerHeight - RADIAL_SIZE - 8));
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closePresentToothRadialQuickPick(); });
  document.addEventListener("keydown", onPresentToothRadialKeydown);
}

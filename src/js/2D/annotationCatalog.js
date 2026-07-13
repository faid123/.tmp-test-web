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
  isPalatalStrapMajorComponent,
  isPlateComponentId,
  ensureMajorConnectorPlacementsOnSupportedTeethInJaws,
  ensurePalatalBarPlacementsOnConnectorTeeth,
  removeMajorPlacementsFromPalatalBarExcludedUpperTeeth,
  syncReciprocatingPlatesToMajorConnector,
} from "./components.js";
import { COMPONENT_GROUPS, forEachTooth, TOOTH_ORDER } from "./constants.js";
import {
  state,
  DEFAULT_COMPONENT_ID,
  getHistoryStateSignature,
  recordHistoryIfChanged,
  setMessage,
  renderJaws,
  meshAnnotationEnv,
} from "./2DAnnotation.js";
import {
  ensureToothPlacementState,
  syncToothComponentsFromPlacements,
} from "./annotationTeethModel.js";
import {
  WORK_CATEGORY_OPTIONS,
  loadCaseNote,
  loadCaseDueDate,
  saveCaseDueDate,
  saveCaseNote,
  toDateInputValue,
  fetchAdditionalCaseDetails,
  updateCaseDueDate,
} from "./caseNote.js";
import { toast, attachThemedCalendar } from "../toast.js";

// ── Material restrictions ────────────────────────────────────────────────────
// A full-acrylic case (state.jawMaterial === 2) is an all-acrylic denture, so it
// can't carry metal-framework elements: the BARS tab is disabled wholesale, the
// metal mesh types are disabled, and the three open/metal upper palatal major
// connectors — Palatal Strap, A-P strap (aka "palatal hole",
// major-upper-palatal-hole) and Palatal Bar — are disabled (Palatal Plate +
// Horseshoe stay, being acrylic-capable). The denture flange (mesh-flange) is an
// acrylic element, so it stays available and keeps the MESH tab reachable. Metal
// (0) / unset has no restriction.
const ACRYLIC_BLOCKED_TABS = new Set(["bars"]);

/** Components that stay available in a full-acrylic case despite their tab/family. */
const ACRYLIC_ALLOWED_COMPONENT_IDS = new Set(["mesh-flange"]);

function isFullAcrylic() {
  return state.jawMaterial === 2;
}

export function isTabBlockedByMaterial(tabId) {
  return isFullAcrylic() && ACRYLIC_BLOCKED_TABS.has(tabId);
}

export function isComponentBlockedByMaterial(componentId) {
  if (!isFullAcrylic()) return false;
  if (ACRYLIC_ALLOWED_COMPONENT_IDS.has(componentId)) return false;
  return (
    isMeshComponent(componentId) ||
    isBarComponent(componentId) ||
    isPalatalStrapMajorComponent(componentId) ||
    isPalatalHoleMajorComponent(componentId) ||
    isPalatalBarMajorComponent(componentId)
  );
}

// Never leave the user parked on a tab/component the current material forbids
// (e.g. a loaded full-acrylic case defaulting to the mesh tab, or entering design
// mode with mesh-hole selected). Called at the top of every catalog render.
function healSelectionForMaterial() {
  if (!isFullAcrylic()) return;
  if (isTabBlockedByMaterial(state.selectedTab)) {
    const nextTab = COMPONENT_TABS.find(
      (t) => t.kind !== "form" && !isTabBlockedByMaterial(t.id)
    );
    if (nextTab) state.selectedTab = nextTab.id;
  }
  if (state.selectedComponentId && isComponentBlockedByMaterial(state.selectedComponentId)) {
    state.selectedComponentId = null;
  }
}

// Build component tabs and initialize the first visible catalog view.
export function initComponentCatalog() {
  state.components = Array.isArray(state.components)
    ? state.components.filter((id) => COMPONENT_BY_ID.has(id))
    : [];
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
      const kindClass = tab.kind === "form" ? " is-form-tab" : "";
      button.className = `component-tab${kindClass} ${state.selectedTab === tab.id ? "is-active" : ""}`;
      button.textContent = tab.label;
      button.addEventListener("click", () => {
        if (isTabBlockedByMaterial(tab.id)) {
          setMessage(`${tab.label} isn't available for a full acrylic case.`, true);
          return;
        }
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
  healSelectionForMaterial();
  const tabs = document.querySelectorAll(".component-tab");
  tabs.forEach((tabBtn, index) => {
    const tabId = COMPONENT_TABS[index]?.id;
    tabBtn.classList.toggle("is-active", tabId === state.selectedTab);
    const blocked = isTabBlockedByMaterial(tabId);
    tabBtn.classList.toggle("is-disabled", blocked);
    tabBtn.disabled = blocked;
    tabBtn.setAttribute("aria-disabled", blocked ? "true" : "false");
  });

  const itemsEl = document.getElementById("componentItems");
  if (!itemsEl) return;
  itemsEl.innerHTML = "";

  if (state.selectedTab === "case-note") {
    itemsEl.appendChild(createCaseNoteForm());
    const selectedEl = document.getElementById("selectedComponents");
    if (selectedEl) selectedEl.innerHTML = "";
    return;
  }

  const tabItems = COMPONENT_CATALOG.filter(
    (entry) => entry.tab === state.selectedTab && entry.hidden !== true
  );
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

  renderSelectedComponents();
}

// Create one column block for grouped component sections.
// Build one grouped major-component column.
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


// Publish a self-contained SVG filter that fills the (white) mesh catalog icons with
// the placed-mesh purple (#5b21b6). Defined once on <body> so it does not depend on an
// arch <svg> being rendered. Referenced from CSS via `filter: url(#icon-tint-mesh)`.
function ensureMeshIconTintFilter() {
  if (typeof document === "undefined" || document.getElementById("icon-tint-mesh")) {
    return;
  }
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", "icon-tint-mesh");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const matrix = document.createElementNS(NS, "feColorMatrix");
  matrix.setAttribute("type", "matrix");
  // #5b21b6 -> r 91/255=0.3569, g 33/255=0.1294, b 182/255=0.7137; alpha preserved.
  matrix.setAttribute(
    "values",
    "0 0 0 0 0.3569 0 0 0 0 0.1294 0 0 0 0 0.7137 0 0 0 1 0"
  );
  filter.appendChild(matrix);
  svg.appendChild(filter);
  document.body.appendChild(svg);
}

// Create one catalog item button and bind its click/double-click actions.
export function createComponentItemButton(item) {
  ensureMeshIconTintFilter();
  const button = document.createElement("button");
  button.type = "button";
  const blockedByMaterial = isComponentBlockedByMaterial(item.id);
  button.className = `component-item ${state.selectedComponentId === item.id ? "is-active" : ""}${blockedByMaterial ? " is-disabled" : ""}`;
  button.title = blockedByMaterial
    ? `${item.label} — not available for a full acrylic case`
    : item.label;
  if (blockedByMaterial) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  }

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
    button.classList.add("is-mesh");
    if (item.id === "mesh-flange") {
      button.classList.add("is-mesh-native");
    }
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

// Remove all plate placements across teeth (and dependent clasps when needed).
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
// Handle catalog selection logic in design mode (select/deselect/replace behaviors).
export function handleDesignComponentSelect(componentId) {
  const historyBefore = getHistoryStateSignature();
  try {
  if (!state.designMode) {
    setMessage("Lock both arches to use the component catalog.", true);
    return;
  }
  if (isComponentBlockedByMaterial(componentId)) {
    setMessage("This component isn't available for a full acrylic case.", true);
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
      setMessage(`${selected.label} deselected. Click a plated tooth to remove its plate.`, false);
      return;
    }

    state.components = state.components.filter((id) => !isPlateComponentId(id));
    if (!state.components.includes(componentId)) {
      state.components.push(componentId);
    }
    renderComponentCatalog();
    renderJaws();
    setMessage(
      `${selected.label} selected. Click cyan suggestion markers on present teeth to toggle this plate.`,
      false
    );
    return;
  }

  if (isMajorConnectorComponent(selected)) {
    state.selectedComponentId = componentId;
    state.archOverlayPalatalHoleActive = isPalatalHoleMajorComponent(componentId);
    if (componentId === "major-lower-lingual-bar") {
      state.hideLowerPlateVisuals = true;
    } else if (componentId === "major-lower-lingual-plate") {
      state.hideLowerPlateVisuals = false;
      for (const toothId of TOOTH_ORDER.lower) {
        const tooth = state.teeth[toothId];
        if (!tooth || !Array.isArray(tooth.componentPlacements)) continue;
        tooth.componentPlacements = tooth.componentPlacements.filter(
          (entry) => entry.componentId !== "major-lower-lingual-bar"
        );
      }
    }

    const jawKeys = String(componentId).startsWith("major-lower-")
      ? ["lower"]
      : String(componentId).startsWith("major-upper-")
        ? ["upper"]
        : ["upper", "lower"];

    if (isPalatalBarMajorComponent(componentId)) {
      ensurePalatalBarPlacementsOnConnectorTeeth(state.teeth, COMPONENT_BY_ID);
      removeMajorPlacementsFromPalatalBarExcludedUpperTeeth(state.teeth);
    } else {
      // Clear major connectors from the target arch only so the new connector replaces
      // whatever was there without disturbing the opposite arch.
      for (const jawKey of jawKeys) {
        forEachTooth((toothId, jaw) => {
          if (jaw !== jawKey) return;
          const tooth = state.teeth[toothId];
          if (!tooth || !Array.isArray(tooth.componentPlacements)) return;
          tooth.componentPlacements = tooth.componentPlacements.filter(
            (entry) => !isMajorConnectorComponent(entry.componentId)
          );
        });
      }
      ensureMajorConnectorPlacementsOnSupportedTeethInJaws(
        state.teeth,
        componentId,
        COMPONENT_BY_ID,
        jawKeys,
        { fullAcrylic: isFullAcrylic() }
      );
    }

    // Keep per-tooth plate-prox in step with the new connector: plate/strap/horseshoe
    // plates the teeth it covers, a bar plates none. Flips plating on a plate↔bar switch.
    // Full-acrylic cases carry no metal plating — the 7-to-7 major span IS the base — so
    // skip the plate stamping (otherwise the arch shows per-tooth mesh/plate instead).
    if (!isFullAcrylic()) {
      syncReciprocatingPlatesToMajorConnector(state.teeth, componentId, jawKeys);
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
      `${selected.label} selected. Click a highlighted present tooth within two positions of a mesh-bearing tooth to place.`,
      false
    );
    return;
  }
  if (componentId === "assembly-circ") {
    setMessage(
      "Simple Circum Assembly selected. Click a mesial or distal rest-seat suggestion on posterior teeth (14-18, 24-28, 34-38, 44-48).",
      false
    );
    return;
  }
  if (componentId === "assembly-circ-embrasure") {
    setMessage(
      "Embrasure selected. Click distal rest-seat suggestion on a posterior tooth to place components on the selected tooth and its adjacent distal tooth.",
      false
    );
    return;
  }
  if (componentId === "assembly-circ-multi") {
    setMessage(
      "Multi selected. Click mesial rest-seat suggestion on a posterior tooth to place components on the selected tooth and its adjacent distal tooth.",
      false
    );
    return;
  }
  if (componentId === "assembly-circ-half-n-half") {
    setMessage(
      "Half & Half selected. Click mesial or distal rest-seat suggestion on posterior teeth to place buccal retainer/reciprocating clasp pair.",
      false
    );
    return;
  }
  if (componentId === "assembly-tbar") {
    setMessage(
      "T-bar selected. Suggestions appear on posterior teeth adjacent to missing teeth (mesial for distal-adjacent, distal for mesial-adjacent).",
      false
    );
    return;
  }
  if (componentId === "assembly-tbar-mod") {
    setMessage(
      "Mod.T-bar selected. Suggestions appear on posterior teeth adjacent to missing teeth.",
      false
    );
    return;
  }
  if (componentId === "assembly-ibar") {
    setMessage(
      "I-bar selected. Suggestions appear on posterior teeth adjacent to missing teeth.",
      false
    );
    return;
  }
  setMessage(`${selected.label} added to design list.`, false);
  } finally {
    recordHistoryIfChanged(historyBefore);
  }
}

// Render selected component chips in the summary panel.
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

// Get default major connector pick for a specific jaw.
export function getDefaultMajorConnectorIdForJaw(jaw) {
  const section = jaw === "upper" ? "upper" : "lower";
  const entry = COMPONENT_CATALOG.find((e) => e.tab === "major" && e.section === section);
  return entry?.id ?? getDefaultMajorConnectorIdForDesignMode(COMPONENT_BY_ID);
}

// Ensure major-tab selection matches clicked tooth jaw.
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

// Build the Case Note form (renders inside the catalog area when the case-note tab is active).
export function createCaseNoteForm() {
  const saved = loadCaseNote(state.caseIntID);

  const form = document.createElement("form");
  form.className = "case-note-form";
  form.addEventListener("submit", (e) => e.preventDefault());

  const ownerName = state.caseOwner || saved.caseOwner || "—";
  const caseNumber = state.caseIntID ?? "—";

  form.appendChild(buildReadonlyRow("Case Owner", ownerName));
  form.appendChild(buildReadonlyRow("Case Number", String(caseNumber)));

  // "Date Required" IS the case's due date (case-list "Due" column); source of truth is
  // additionalcasedetails.due_date. Seed instantly from the localStorage stash, then
  // replace with the live server value once loaded — unless the user is already editing.
  const dueDateDefault = loadCaseDueDate(state.caseIntID);
  const dateInput = buildInputRow(
    "Date Required",
    "date",
    "case-note-date",
    saved.dateRequired || dueDateDefault || ""
  );
  form.appendChild(dateInput.row);
  // Themed calendar for the "Date Required" field.
  attachThemedCalendar(dateInput.input, { allowClear: true });

  let userTouchedDate = false;
  dateInput.input.addEventListener("input", () => {
    userTouchedDate = true;
  });
  fetchAdditionalCaseDetails(state.caseIntID).then(({ ok, detail }) => {
    if (!ok || userTouchedDate) return;
    const live = toDateInputValue(detail?.due_date);
    if (live && live !== dateInput.input.value) {
      dateInput.input.value = live;
      saveCaseDueDate(state.caseIntID, live);
    }
  });

  const shadeInput = buildInputRow("Tooth Shade", "text", "case-note-shade", saved.toothShade || "", {
    placeholder: "e.g. A2",
  });
  form.appendChild(shadeInput.row);

  const categorySelect = buildSelectRow(
    "Work Category",
    "case-note-category",
    WORK_CATEGORY_OPTIONS,
    saved.workCategory || ""
  );
  form.appendChild(categorySelect.row);

  const commentField = buildTextareaRow("Comment", "case-note-comment", saved.comment || "");
  form.appendChild(commentField.row);

  const actions = document.createElement("div");
  actions.className = "case-note-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "case-note-save-btn";
  saveBtn.textContent = "Save";
  const status = document.createElement("span");
  status.className = "case-note-status";
  status.setAttribute("aria-live", "polite");

  saveBtn.addEventListener("click", async () => {
    const dateRequired = dateInput.input.value;
    const note = {
      caseOwner: ownerName,
      caseNumber,
      dateRequired,
      toothShade: shadeInput.input.value,
      workCategory: categorySelect.input.value,
      comment: commentField.input.value,
      updatedAt: new Date().toISOString(),
    };
    // Other fields have no API yet, so they stay in localStorage. The due date is
    // written through to additionalcasedetails.due_date (shows in the case-list "Due"
    // column, shared across devices).
    const localOk = saveCaseNote(state.caseIntID, note);
    saveBtn.disabled = true;
    status.textContent = "Saving…";
    status.classList.remove("is-error");
    // Write the date through to additionalcasedetails.due_date and the comment
    // through to additionalcasedetails.comments (shared case-level comment).
    const remoteOk = await updateCaseDueDate(
      state.caseIntID,
      dateRequired,
      commentField.input.value
    );
    if (remoteOk) saveCaseDueDate(state.caseIntID, dateRequired);
    saveBtn.disabled = false;

    // The Case Note has its own Save button: it persists on its own and surfaces
    // its own toast, independent of the back-dialog's "Save & Return" action.
    if (remoteOk) {
      status.textContent = "Saved.";
      toast.success("Saved successfully");
      setMessage("Case note saved.", false);
      setTimeout(() => {
        if (status.textContent === "Saved.") status.textContent = "";
      }, 2000);
    } else if (localOk) {
      status.textContent = "Saved locally.";
      status.classList.add("is-error");
      toast.warning("Saved locally — couldn't update the request date on the server.");
    } else {
      status.textContent = "Save failed.";
      status.classList.add("is-error");
      toast.error("Save failed.");
    }
  });

  actions.appendChild(saveBtn);
  actions.appendChild(status);
  form.appendChild(actions);

  return form;
}

function buildReadonlyRow(labelText, value) {
  const row = document.createElement("div");
  row.className = "case-note-row";
  const label = document.createElement("span");
  label.className = "case-note-label";
  label.textContent = labelText;
  const display = document.createElement("span");
  display.className = "case-note-readonly";
  display.textContent = value;
  row.appendChild(label);
  row.appendChild(display);
  return row;
}

function buildInputRow(labelText, type, id, value, opts = {}) {
  const row = document.createElement("div");
  row.className = "case-note-row";
  const label = document.createElement("label");
  label.className = "case-note-label";
  label.textContent = labelText;
  label.htmlFor = id;
  const input = document.createElement("input");
  input.type = type;
  input.id = id;
  input.className = "case-note-input";
  input.value = value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  row.appendChild(label);
  row.appendChild(input);
  return { row, input };
}

function buildSelectRow(labelText, id, options, value) {
  const row = document.createElement("div");
  row.className = "case-note-row";
  const label = document.createElement("label");
  label.className = "case-note-label";
  label.textContent = labelText;
  label.htmlFor = id;
  const input = document.createElement("select");
  input.id = id;
  input.className = "case-note-input";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    input.appendChild(o);
  }
  row.appendChild(label);
  row.appendChild(input);
  return { row, input };
}

function buildTextareaRow(labelText, id, value) {
  const row = document.createElement("div");
  row.className = "case-note-row case-note-row--block";
  const label = document.createElement("label");
  label.className = "case-note-label";
  label.textContent = labelText;
  label.htmlFor = id;
  const input = document.createElement("textarea");
  input.id = id;
  input.className = "case-note-input case-note-textarea";
  input.rows = 4;
  input.value = value;
  row.appendChild(label);
  row.appendChild(input);
  return { row, input };
}

// Ensure major tab has a valid default selected component.
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

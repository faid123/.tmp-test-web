import { COMPONENTS } from "./components-catalog.js";
import { MODE, LOWER_FDI, UPPER_FDI } from "./constants.js";

function componentBadgeText(componentId) {
  const component = COMPONENTS.find((item) => item.id === componentId);
  return component ? component.shortLabel : componentId;
}

function renderTeethGrid(state, container, fdiList) {
  container.innerHTML = "";

  for (const id of fdiList) {
    const tooth = state.teeth[id];

    const toothEl = document.createElement("button");
    toothEl.type = "button";
    toothEl.className = `tooth ${tooth.presence === "missing" ? "missing" : ""}`;
    toothEl.dataset.toothId = String(id);

    const idEl = document.createElement("div");
    idEl.className = "tooth-id";
    idEl.textContent = `FDI ${id}`;

    const badges = document.createElement("div");
    badges.className = "badges";

    for (const componentId of tooth.components) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = componentBadgeText(componentId);
      badges.appendChild(badge);
    }

    toothEl.appendChild(idEl);
    toothEl.appendChild(badges);
    container.appendChild(toothEl);
  }
}

export function render(state) {
  const upper = document.getElementById("upper-jaw");
  const lower = document.getElementById("lower-jaw");
  const statusText = document.getElementById("status-text");
  const componentList = document.getElementById("component-list");

  renderTeethGrid(state, upper, UPPER_FDI);
  renderTeethGrid(state, lower, LOWER_FDI);

  statusText.textContent = state.statusText;

  componentList.innerHTML = "";
  for (const component of COMPONENTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${state.selectedComponentId === component.id ? "active" : ""}`;
    button.dataset.componentId = component.id;
    button.textContent = component.label;
    componentList.appendChild(button);
  }

  const modeDesign = document.getElementById("mode-design");
  const modePresence = document.getElementById("mode-presence");
  modeDesign.classList.toggle("active", state.mode === MODE.DESIGN);
  modePresence.classList.toggle("active", state.mode === MODE.PRESENCE);
}

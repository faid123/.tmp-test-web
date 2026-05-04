import { COMPONENT_BY_ID, COMPONENT_CATALOG } from "./components.js";
import { state, ui } from "./annotationState.js";
import { setMessage } from "./annotationDom.js";
import { renderComponentCatalog } from "./annotationCatalog.js";
import { renderJaws } from "./annotationRenderBridge.js";

const RADIAL_SIZE = 160;
const VIEW = 160;
const CX = VIEW / 2;
const CY = VIEW / 2;
const R_OUTER = 76;
const R_INNER = 22;

function onPresentToothRadialKeydown(ev) {
  if (ev.key === "Escape") {
    closePresentToothRadialQuickPick();
  }
}

export function closePresentToothRadialQuickPick() {
  const host = ui.presentToothRadialHost;
  if (!host) {
    return;
  }
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
    setMessage(`No component found for tab “${tabId}”.`, true);
    return;
  }
  state.selectedTab = tabId;
  state.selectedComponentId = id;
  state.suppressArchPlacementSuggestions = false;
  renderComponentCatalog();
  renderJaws();
  const label = COMPONENT_BY_ID.get(id)?.label || id;
  setMessage(`${label} selected — use suggestion markers on the arch.`, false);
}

function sectorPath(startDeg, endDeg) {
  const r0 = R_INNER;
  const r1 = R_OUTER;
  const t0 = (startDeg * Math.PI) / 180;
  const t1 = (endDeg * Math.PI) / 180;
  const x0 = CX + r0 * Math.cos(t0);
  const y0 = CY + r0 * Math.sin(t0);
  const x1 = CX + r1 * Math.cos(t0);
  const y1 = CY + r1 * Math.sin(t0);
  const x2 = CX + r1 * Math.cos(t1);
  const y2 = CY + r1 * Math.sin(t1);
  const x3 = CX + r0 * Math.cos(t1);
  const y3 = CY + r0 * Math.sin(t1);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r1} ${r1} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r0} ${r0} 0 ${large} 0 ${x0.toFixed(2)} ${y0.toFixed(2)} Z`;
}

function labelPoint(angleDeg) {
  const t = (angleDeg * Math.PI) / 180;
  const r = (R_INNER + R_OUTER) / 2;
  return { x: CX + r * Math.cos(t), y: CY + r * Math.sin(t) };
}

/**
 * Present-tooth quick picker: Rest / Clasps / Bars → switches catalog tab and default item.
 */
export function showPresentToothRadialQuickPick(toothId, clientX, clientY) {
  closePresentToothRadialQuickPick();

  const backdrop = document.createElement("div");
  backdrop.className = "tooth-radial-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const panel = document.createElement("div");
  panel.className = "tooth-radial-panel";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${VIEW} ${VIEW}`);
  svg.setAttribute("class", "tooth-radial-svg");

  const sectors = [
    { label: "Rest", tab: "rests", start: 0, end: 120 },
    { label: "Clasps", tab: "clasps", start: 120, end: 240 },
    { label: "Bars", tab: "bars", start: 240, end: 360 },
  ];

  const wedgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wedgeGroup.setAttribute("transform", `rotate(-90 ${CX} ${CY})`);

  for (const s of sectors) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "tooth-radial-sector");
    g.setAttribute("tabindex", "0");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", sectorPath(s.start, s.end));
    g.appendChild(path);
    const mid = (s.start + s.end) / 2;
    const p = labelPoint(mid);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(p.x));
    text.setAttribute("y", String(p.y));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("transform", `rotate(90 ${p.x} ${p.y})`);
    text.setAttribute("class", "tooth-radial-label");
    text.textContent = s.label;
    g.appendChild(text);

    const activate = () => {
      applyRadialTab(s.tab);
      closePresentToothRadialQuickPick();
    };
    g.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate();
    });
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    wedgeGroup.appendChild(g);
  }

  svg.appendChild(wedgeGroup);

  const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  hole.setAttribute("cx", String(CX));
  hole.setAttribute("cy", String(CY));
  hole.setAttribute("r", String(R_INNER));
  hole.setAttribute("class", "tooth-radial-center-box");
  svg.appendChild(hole);

  const idText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  idText.setAttribute("x", String(CX));
  idText.setAttribute("y", String(CY));
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

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closePresentToothRadialQuickPick();
    }
  });
  document.addEventListener("keydown", onPresentToothRadialKeydown);
}

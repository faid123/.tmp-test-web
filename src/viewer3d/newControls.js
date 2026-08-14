import * as THREE from "three";

const basePath = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";
const wireframeOverlays = new Set();

const style = document.createElement("style");
style.textContent = `
  .component-panel-toggle {
    position: absolute;
    left: 16px;
    top: 16px;
    z-index: 1003;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #ffffff;
    font: 700 13px Arial, sans-serif;
    cursor: pointer;
    box-shadow: none;
    pointer-events: auto;
    transition: opacity 0.15s, filter 0.15s, transform 0.15s;
  }

  .component-panel-toggle:hover {
    filter: brightness(1.15);
    transform: scale(1.06);
  }

  /* The panel takes over the toggle's corner, so the toggle hides while open. */
  .component-panel-toggle.is-hidden {
    display: none;
  }

  .component-panel {
    position: absolute;
    left: 16px;
    top: 16px;
    transform: none;
    z-index: 1002;
    display: flex;
    flex-direction: column;
    width: min(268px, calc(100vw - 290px));
    max-height: min(300px, calc(100% - 32px));
    overflow: hidden;
    padding: 4px 0 2px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    background: rgba(56, 58, 64, 0.55);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
    color: #ffffff;
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.34);
    font-family: "Montserrat", Arial, sans-serif;
    pointer-events: auto;
  }

  .component-panel.hidden {
    display: none;
  }

  /* Dims the canvas behind the panel once it becomes a full-height sidebar
     (see the max-width: 1024px block at the bottom) — desktop never shows it. */
  .component-panel-backdrop {
    display: none;
    position: absolute;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.45);
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  /* "Show / Hide" bar: a chevron that folds the list away, plus the close X. */
  .component-panel-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 7px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .component-panel-collapse {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    transition: transform 0.18s ease;
  }

  .component-panel-collapse::before {
    content: "";
    display: block;
    width: 7px;
    height: 7px;
    margin: 3px auto 0;
    border-left: 2px solid currentColor;
    border-top: 2px solid currentColor;
    transform: rotate(45deg);
  }

  .component-panel.is-collapsed .component-panel-collapse {
    transform: rotate(180deg);
  }

  .component-panel-title {
    flex: 1 1 auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }

  .component-panel-close {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .component-panel-close:hover {
    background: rgba(255, 255, 255, 0.24);
  }

  .component-row.unavailable {
    opacity: 0.45;
  }

  .component-row.unavailable button,
  .component-row.unavailable input {
    cursor: not-allowed;
  }

  /* min-height:0 is what lets a flex child actually scroll instead of growing
     the panel past its max-height. Column flex with non-shrinking rows, NOT
     grid: once the list outgrows the cap, grid's align-content:stretch
     compresses the rows and each one clips its own name band away. */
  .component-panel-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
  }

  .component-panel-body::-webkit-scrollbar {
    width: 6px;
  }

  .component-panel-body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.3);
  }

  .component-panel.is-collapsed .component-panel-body,
  .component-panel.is-collapsed .component-panel-footer {
    display: none;
  }

  /* One tinted block per object: opacity rail on top, name + controls under it.
     --row-tint comes from the object's own material colour, so a row reads as
     the thing it drives. */
  .component-row {
    --row-tint: #5f6070;
    flex: 0 0 auto;
    display: grid;
    gap: 0;
    border-radius: 8px;
    overflow: hidden;
    background: var(--row-tint);
  }

  .component-row-rail {
    display: flex;
    align-items: center;
    padding: 4px 7px;
    background: rgba(255, 255, 255, 0.18);
  }

  .component-row-band {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    padding: 5px 7px;
  }

  .component-row-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }

  .component-row-title {
    overflow: hidden;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .component-row-buttons {
    display: flex;
    flex-direction: row;
    gap: 4px;
    align-items: center;
  }

  /* Pill rail with a filled portion. The fill is painted by the track
     background from --fill (set on input), so it reads at a glance without a
     visible thumb. */
  .component-opacity-control {
    -webkit-appearance: none;
    appearance: none;
    min-width: 0;
    width: 100%;
    height: 12px;
    margin: 0;
    padding: 0;
    border: 1.5px solid rgba(0, 0, 0, 0.7);
    border-radius: 999px;
    background:
      linear-gradient(#e08a5f, #e08a5f) left center / var(--fill, 100%) 100% no-repeat,
      #2f2f33;
    cursor: pointer;
  }

  .component-opacity-control::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 3px;
    height: 9px;
    border: 0;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.85);
  }

  .component-opacity-control::-moz-range-thumb {
    width: 3px;
    height: 9px;
    border: 0;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.85);
  }

  .component-opacity-control::-moz-range-track {
    background: transparent;
  }

  /* "Hide All" / "Show All" — the list-wide switch, under a divider. */
  .component-panel-footer {
    flex: 0 0 auto;
    padding: 6px 10px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }

  .component-panel-showhide {
    width: 100%;
    padding: 1px 0;
    border: 0;
    background: transparent;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }

  .component-panel-showhide:hover {
    text-decoration: underline;
  }

  /* Bare icons on the tinted band — no plate, matching the reference. */
  .component-eye-button,
  .component-analysis-button,
  .component-polyline-button,
  .component-web-button {
    position: relative;
    flex: 0 0 20px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    background-position: center;
    background-repeat: no-repeat;
    background-size: 16px 16px;
    color: transparent;
    cursor: pointer;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  }

  .component-eye-button {
    background-size: 19px 11px;
  }

  .component-eye-button.hidden-state {
    opacity: 0.75;
  }

  .component-eye-button.hidden-state .component-eye-slash {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 17px;
    height: 1.5px;
    background: #ef9a9a;
    transform: translate(-50%, -50%) rotate(-38deg);
    border-radius: 999px;
  }

  .component-analysis-button.active,
  .component-polyline-button.vpm-active {
    background-color: rgba(56, 189, 248, 0.85);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.55);
  }

  .component-polyline-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* A slot's first undercut switch waits on the case scan download — pulse until it lands. */
  .component-analysis-button.is-busy {
    opacity: 0.6;
    cursor: progress;
    animation: component-analysis-busy 1s ease-in-out infinite;
  }

  @keyframes component-analysis-busy {
    50% { opacity: 1; }
  }

  .component-web-button::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16px;
    height: 10px;
    border: 1.5px solid rgba(255, 255, 255, 0.92);
    border-radius: 999px;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
  }

  .component-web-button::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16px;
    height: 10px;
    transform: translate(-50%, -50%);
    background:
      linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.9)) center / 1.2px 10px no-repeat,
      linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.9)) center / 16px 1.2px no-repeat,
      linear-gradient(rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.78)) left 4px top / 16px 1.2px no-repeat,
      linear-gradient(rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.78)) left top 3px / 1.2px 10px no-repeat;
    opacity: 0.95;
  }

  .component-web-button.active {
    background-color: rgba(0, 0, 0, 0.45);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.45);
  }

  .component-web-button.has-icon {
    background-size: 18px 12px;
  }

  .component-web-button.has-icon::before,
  .component-web-button.has-icon::after {
    display: none;
  }

  /* Undercut colour key — shown only while a jaw/slot's undercut view is on
     (see syncUndercutLegend). Palette matches preview3D.js's
     colorForSurveyingValue byte-for-byte, so the two heatmaps read the same. */
  .viewer-undercut-legend {
    position: absolute;
    left: 16px;
    bottom: 16px;
    z-index: 1002;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    background: rgba(56, 58, 64, 0.55);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
    color: #ffffff;
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.34);
    font-family: "Montserrat", Arial, sans-serif;
    pointer-events: none;
  }

  .viewer-undercut-legend.hidden {
    display: none;
  }

  .viewer-undercut-legend-title {
    font-size: 11px;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .viewer-undercut-legend-scale {
    display: flex;
    gap: 2px;
  }

  .viewer-undercut-legend-scale span {
    width: 30px;
    height: 10px;
    border-radius: 2px;
  }

  .viewer-undercut-legend-labels {
    display: flex;
    gap: 2px;
  }

  .viewer-undercut-legend-labels span {
    width: 30px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 9px;
    text-align: center;
  }

  /* #viewer-right-nav (index.js) becomes a full-width bar across the bottom
     at both breakpoints below, so the legend has to clear its height instead
     of sitting flush at bottom:0 like the desktop rule above. */
  @media (min-width: 769px) and (max-width: 1024px) {
    .viewer-undercut-legend {
      bottom: calc(86px + env(safe-area-inset-bottom, 0px));
    }
  }

  @media (max-width: 768px) {
    .viewer-undercut-legend {
      left: 12px;
      bottom: calc(86px + env(safe-area-inset-bottom, 0px));
      padding: 6px 8px 8px;
    }

    .viewer-undercut-legend-scale span,
    .viewer-undercut-legend-labels span {
      width: 24px;
    }
  }

  @media (max-width: 640px), (max-height: 720px) {
    .component-panel-toggle {
      width: 48px;
      height: 48px;
    }

    .component-panel {
      left: 16px;
      top: 16px;
      transform: none;
      width: min(260px, calc(100vw - 280px));
      max-height: min(260px, calc(100% - 32px));
    }
  }

  @media (max-width: 1024px) {
    .component-panel {
      left: 16px;
      top: 16px;
      bottom: auto;
      transform: none;
      max-width: calc(100vw - 20px);
    }

    .component-panel-body {
      gap: 6px;
      padding: 8px 10px;
    }
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .component-panel-toggle {
      width: 56px;
      height: 56px;
    }

    .component-panel {
      top: 16px;
      bottom: auto;
      width: min(300px, calc(100vw - 20px));
      max-height: min(300px, calc(100% - 32px));
    }
  }

  @media (max-width: 768px) {
    .component-panel-toggle {
      left: 12px;
      top: 12px;
      width: 52px;
      height: 52px;
    }

    .component-panel {
      top: 12px;
      left: 12px;
      bottom: auto;
      width: min(280px, calc(100vw - 24px));
      max-height: min(280px, calc(100% - 24px));
    }
  }

  /* Objects panel as a full-height right sidebar on tablet/phone, opened by
     the footer hamburger (#footerObjectsBtn, wired in viewerShell.js) instead
     of the floating top-left toggle above, which was eating too much of the
     small screen and is hidden here. Both drive the same viewerPanelManager
     entry (see createComponentPanel), so either trigger opens/closes it.
     !important beats both this file's own narrower rules above and
     style.css's older top-sheet rules, and — being appended to <head> at
     runtime, after style.css's <link> — this block also wins any tie against
     them for free; !important just makes that not depend on load order. */
  @media (max-width: 1024px) {
    .component-panel-toggle {
      display: none !important;
    }

    .component-panel {
      display: flex !important;
      top: 0 !important;
      left: auto !important;
      right: 0 !important;
      bottom: 0 !important;
      /* ~60% of the screen, not the near-total-width overlay min(300px, 84vw)
         gave on most phones — floor/ceiling just keep it usable at the
         extremes (a tiny phone, or this same breakpoint on a wide tablet). */
      width: clamp(220px, 60vw, 420px) !important;
      max-width: none !important;
      height: 100% !important;
      max-height: none !important;
      border-radius: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      box-shadow: -14px 0 34px rgba(0, 0, 0, 0.4) !important;
      transform: translateX(100%) !important;
      transition: transform 0.25s ease !important;
    }

    .component-panel:not(.hidden) {
      transform: translateX(0) !important;
    }

    .component-panel-backdrop:not(.hidden) {
      display: block;
    }
  }
`;
document.head.appendChild(style);

function removeWireframeOverlay(mesh) {
  const overlay = mesh.userData?.componentWireframeOverlay;
  if (!overlay) return;
  mesh.remove(overlay);
  overlay.geometry?.dispose?.();
  overlay.material?.dispose?.();
  wireframeOverlays.delete(overlay);
  delete mesh.userData.componentWireframeOverlay;
}

function clearAllWireframeOverlays() {
  Array.from(wireframeOverlays).forEach((overlay) => {
    const parent = overlay.parent;
    if (parent?.isMesh) {
      removeWireframeOverlay(parent);
    } else {
      overlay.geometry?.dispose?.();
      overlay.material?.dispose?.();
      wireframeOverlays.delete(overlay);
    }
  });
}

function applyWireframeOverlay(mesh) {
  removeWireframeOverlay(mesh);
  if (!mesh.isMesh || !mesh.userData.componentWireframeEnabled) return;

  const geometry = new THREE.WireframeGeometry(mesh.geometry);
  const material = new THREE.LineBasicMaterial({
    color: "#000000",
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  });
  const overlay = new THREE.LineSegments(geometry, material);
  overlay.name = `${mesh.name || "mesh"}-wireframe-overlay`;
  overlay.renderOrder = 999;
  overlay.userData.overlayType = "component-wireframe-overlay";
  mesh.add(overlay);
  mesh.userData.componentWireframeOverlay = overlay;
  wireframeOverlays.add(overlay);
}

function refreshWireframeOverlay(mesh) {
  if (mesh.userData?.componentWireframeEnabled) {
    applyWireframeOverlay(mesh);
  }
}

function setMeshGroupVisible(meshes, isVisible) {
  meshes.forEach((mesh) => {
    mesh.visible = isVisible;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      material.transparent = (material.opacity ?? 1) < 1;
      material.depthTest = true;
      material.depthWrite = (material.opacity ?? 1) >= 0.95;
      material.needsUpdate = true;
    });
  });
}

function setMeshGroupOpacity(meshes, opacity) {
  meshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.depthWrite = opacity >= 0.95;
      material.needsUpdate = true;
    });
  });
}

function getMeshGroupOpacity(meshes) {
  const firstMaterial = meshes
    .flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
    .find(Boolean);
  return firstMaterial?.opacity ?? 1;
}

function areAnyVisible(meshes) {
  return meshes.some((mesh) => mesh.visible);
}

function applyJawMaterial(meshes, materialArray, index) {
  meshes.forEach((mesh) => {
    const meshMaterials = materialArray[mesh.name];
    if (!meshMaterials || !meshMaterials[index]) return;
    mesh.geometry = meshMaterials[index];
    mesh.geometry.needsUpdate = true;
    refreshWireframeOverlay(mesh);
  });
}

// A row is tinted with the colour of the thing it drives, so the list reads
// against the model. Meshes give up their own material colour; overlay rows
// (polylines, artificial teeth, empty slots) have no material to read, so they
// fall back to a neutral lavender.
const ROW_TINT_FALLBACK = "#5f6070";

function getGroupTint(group) {
  const material = group.meshes
    ?.flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
    // A vertexColors material paints from the geometry, and its own colour is a
    // white multiplier — reading it tints the row white and swallows the white
    // label and icon. That is what the case jaws use.
    .find((entry) => entry?.color && !entry.vertexColors);
  if (!material) return ROW_TINT_FALLBACK;
  // Keep every tint dark enough for white content to read on it.
  const color = material.color.clone();
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 });
  color.setHSL(hsl.h, Math.max(hsl.s, 0.14), Math.min(Math.max(hsl.l, 0.3), 0.46));
  return `#${color.getHexString()}`;
}

function createComponentPanel(groups) {
  removeVisibilityAndTransparencyControls();

  const toggle = document.createElement("button");
  toggle.id = "component-panel-toggle";
  toggle.className = "component-panel-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Objects");
  toggle.title = "Objects";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<img src="${basePath}/assets/Icon_objects3.png" alt="Objects" style="width:36px;height:36px;object-fit:contain;display:block;margin:auto;pointer-events:none;">`;

  const panel = document.createElement("div");
  panel.id = "component-panel";
  panel.className = "component-panel hidden";

  const header = document.createElement("div");
  header.className = "component-panel-header";

  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.className = "component-panel-collapse";
  collapseButton.title = "Collapse";
  collapseButton.setAttribute("aria-label", "Collapse the object list");
  collapseButton.setAttribute("aria-expanded", "true");

  const title = document.createElement("button");
  title.type = "button";
  title.className = "component-panel-title";
  title.textContent = "Show / Hide";
  title.title = "Collapse the object list";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "component-panel-close";
  closeButton.textContent = "\u00d7";
  closeButton.title = "Close objects";
  closeButton.setAttribute("aria-label", "Close objects");

  header.appendChild(collapseButton);
  header.appendChild(title);
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = "component-panel-body";

  // List-wide switch, below the rows.
  const footer = document.createElement("div");
  footer.className = "component-panel-footer";
  const showHideAllButton = document.createElement("button");
  showHideAllButton.type = "button";
  showHideAllButton.className = "component-panel-showhide";
  footer.appendChild(showHideAllButton);

  const rowControllers = [];
  let polylinePanelRegistered = false;
  // Set once the legend is mounted, below — read fresh each sync so the
  // panel-construction order above doesn't matter.
  let undercutLegend = null;

  const areAllGroupsVisible = () =>
    groups.every((g) => g.hasContent?.() === false || (g.getVisible?.() ?? true));

  const syncShowHideButton = () => {
    const allVisible = areAllGroupsVisible();
    showHideAllButton.textContent = allVisible ? "Hide All" : "Show All";
    showHideAllButton.title = allVisible
      ? "Hide all objects"
      : "Show all available objects";
  };

  // Some cases don't have polylines/artificial teeth generated yet, so their
  // rows render disabled (row.hasContent below). Left in their fixed
  // jaw/mesh/polylines/teeth slots, an unavailable row can sit above
  // components the user actually has, forcing a scroll past dead rows to
  // reach them. Sinking unavailable rows to the bottom keeps everything
  // usable within reach at the top. Array#sort is stable, so rows that share
  // an availability state keep their original relative order.
  const reorderRows = () => {
    [...rowControllers]
      .sort((a, b) => Number(b.hasContent()) - Number(a.hasContent()))
      .forEach(({ row }) => body.appendChild(row));
  };

  // The legend is one shared key for the whole panel — it shows once ANY row's
  // undercut view is on, and hides again once none are, rather than per-row.
  const syncUndercutLegend = () => {
    if (!undercutLegend) return;
    const anyUndercutOn = groups.some((group) => group.getMode?.() === "undercut");
    undercutLegend.classList.toggle("hidden", !anyUndercutOn);
  };

  const syncAllRows = () => {
    rowControllers.forEach((controller) => controller.sync());
    reorderRows();
    syncShowHideButton();
    syncUndercutLegend();
  };

  showHideAllButton.addEventListener("click", () => {
    const allVisible = areAllGroupsVisible();
    groups.forEach((group) => {
      if (group.hasContent?.() === false) return;
      group.setVisible?.(!allVisible);
    });
    syncAllRows();
  });

  const toggleCollapsed = () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.title = collapsed ? "Expand" : "Collapse";
  };
  collapseButton.addEventListener("click", toggleCollapsed);
  title.addEventListener("click", toggleCollapsed);

  groups.forEach((group) => {
    const row = document.createElement("div");
    row.className = "component-row";
    row.style.setProperty("--row-tint", getGroupTint(group));

    const band = document.createElement("div");
    band.className = "component-row-band";

    if (group.iconPath) {
      const rowIcon = document.createElement("img");
      rowIcon.className = "component-row-icon";
      rowIcon.src = group.iconPath;
      rowIcon.alt = "";
      rowIcon.setAttribute("aria-hidden", "true");
      band.appendChild(rowIcon);
    } else {
      band.appendChild(document.createElement("span"));
    }

    const rowTitle = document.createElement("div");
    rowTitle.className = "component-row-title";
    rowTitle.textContent = group.label;
    rowTitle.title = group.label; // labels ellipsize at this width
    band.appendChild(rowTitle);

    const buttonsRow = document.createElement("div");
    buttonsRow.className = "component-row-buttons";

    const visibilityButton = document.createElement("button");
    visibilityButton.type = "button";
    visibilityButton.className = "component-eye-button";
    visibilityButton.style.backgroundImage = `url(${basePath}/assets/Icon_Show.png)`;
    visibilityButton.title = `Toggle ${group.label} visibility`;
    visibilityButton.setAttribute("aria-label", `Toggle ${group.label} visibility`);

    const visibilitySlash = document.createElement("span");
    visibilitySlash.className = "component-eye-slash";
    visibilityButton.appendChild(visibilitySlash);

    visibilityButton.addEventListener("click", () => {
      group.setVisible?.(!(group.getVisible?.() ?? true));
      syncAllRows();
    });

    buttonsRow.appendChild(visibilityButton);

    let undercutButton = null;
    let occlusionButton = null;
    // Slot rows offer undercut only (borrowed from the case jaw); the case's own jaws
    // offer both analyses.
    if (group.supportsAnalysis || group.supportsUndercut) {
      undercutButton = document.createElement("button");
      undercutButton.type = "button";
      undercutButton.className = "component-analysis-button";
      undercutButton.style.backgroundImage = `url(${basePath}/assets/Undercut.png)`;
      undercutButton.title = `${group.label} undercut`;
      undercutButton.addEventListener("click", () => {
        const next = group.getMode?.() === "undercut" ? "normal" : "undercut";
        // A slot's first switch fetches the case scan, so setMode may be async — mark the
        // button busy until it settles, then resync from whatever mode was really applied.
        const result = group.setMode?.(next);
        if (result && typeof result.then === "function") {
          undercutButton.disabled = true;
          undercutButton.classList.add("is-busy");
          result
            .catch((error) => console.warn("Undercut switch failed:", error))
            .finally(() => {
              undercutButton.disabled = false;
              undercutButton.classList.remove("is-busy");
              syncAllRows();
            });
        }
        syncAllRows();
      });
    }
    if (group.supportsAnalysis) {
      occlusionButton = document.createElement("button");
      occlusionButton.type = "button";
      occlusionButton.className = "component-analysis-button";
      occlusionButton.style.backgroundImage = `url(${basePath}/assets/Occlusion.png)`;
      occlusionButton.title = `${group.label} occlusion`;
      occlusionButton.addEventListener("click", () => {
        group.setMode?.(group.getMode?.() === "occlusion" ? "normal" : "occlusion");
        syncAllRows();
      });
    }

    if (undercutButton) buttonsRow.appendChild(undercutButton);
    if (occlusionButton) buttonsRow.appendChild(occlusionButton);

    // The polyline rows carry the opener for the polyline panel — it has no
    // button of its own in the nav.
    let polylineButton = null;
    if (group.opensPolylinePanel) {
      polylineButton = document.createElement("button");
      polylineButton.type = "button";
      polylineButton.className = "component-polyline-button";
      polylineButton.style.backgroundImage = `url(${basePath}/assets/Icon_Hide_SkeletalPrev.png)`;
      polylineButton.title = "Polyline components";
      polylineButton.setAttribute("aria-label", "Polyline components");
      polylineButton.addEventListener("click", () => {
        const controller = window.polylinePanelController;
        if (!controller) return;
        if (window.viewerPanelManager) {
          window.viewerPanelManager.toggle("polylines-panel");
          return;
        }
        if (controller.isOpen()) controller.close();
        else controller.open();
      });
      buttonsRow.appendChild(polylineButton);

      // Both jaw rows open the same panel; the first one registered is the
      // button the panel manager highlights.
      const controller = window.polylinePanelController;
      if (controller && !polylinePanelRegistered) {
        polylinePanelRegistered = true;
        window.viewerPanelManager?.register(
          "polylines-panel",
          polylineButton,
          controller.open,
          controller.close
        );
      }
    }

    let webButton = null;
    if (group.type === "mesh") {
      webButton = document.createElement("button");
      webButton.type = "button";
      webButton.className = "component-web-button";
      if (group.vertexIconPath) {
        webButton.classList.add("has-icon");
        webButton.style.backgroundImage = `url(${group.vertexIconPath})`;
      }
      webButton.title = `${group.label} vertices`;
      webButton.setAttribute("aria-label", `${group.label} vertices`);
      webButton.addEventListener("click", () => {
        const nextEnabled = !group.meshes?.some((mesh) => mesh.userData.componentWireframeEnabled);
        group.meshes?.forEach((mesh) => {
          mesh.userData.componentWireframeEnabled = nextEnabled;
          if (nextEnabled) applyWireframeOverlay(mesh);
          else removeWireframeOverlay(mesh);
        });
        syncAllRows();
      });
      buttonsRow.appendChild(webButton);
    }

    band.appendChild(buttonsRow);

    // Opacity rail, above the name band.
    const rail = document.createElement("div");
    rail.className = "component-row-rail";

    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.className = "component-opacity-control";
    opacitySlider.min = "0";
    opacitySlider.max = "100";
    opacitySlider.value = "100";
    opacitySlider.title = `${group.label} opacity`;
    opacitySlider.setAttribute("aria-label", `${group.label} opacity`);

    opacitySlider.addEventListener("input", () => {
      // Only touch this row's own visuals while dragging — syncAllRows()
      // walks every row and re-appends them all (reorderRows), which is
      // expensive DOM work that made the slider feel stiff when it ran on
      // every drag tick. Opacity doesn't affect row order/availability, so
      // that full resync only needs to happen once the drag settles.
      group.setOpacity?.(Number(opacitySlider.value) / 100);
      opacitySlider.style.setProperty("--fill", `${opacitySlider.value}%`);
      rail.dataset.opacity = opacitySlider.value;
    });

    opacitySlider.addEventListener("change", () => {
      syncAllRows();
    });

    rail.appendChild(opacitySlider);

    row.appendChild(rail);
    row.appendChild(band);
    body.appendChild(row);

    rowControllers.push({
      row,
      // Not every case has polylines/artificial teeth generated yet, so a
      // component can go from unavailable to available (or back) after the
      // panel was built. Read fresh each reorder rather than cached at
      // creation time.
      hasContent: () => group.hasContent?.() ?? true,
      sync: () => {
        const hasContent = group.hasContent?.() ?? true;
        const isVisible = hasContent && (group.getVisible?.() ?? true);
        row.classList.toggle("unavailable", !hasContent);
        visibilityButton.classList.toggle("hidden-state", !isVisible);
        visibilityButton.disabled = !hasContent;
        visibilityButton.setAttribute("aria-pressed", String(isVisible));
        visibilityButton.title = hasContent
          ? `${isVisible ? "Hide" : "Show"} ${group.label}`
          : `${group.label} unavailable`;
        const opacityValue = Math.round((group.getOpacity?.() ?? 1) * 100);
        opacitySlider.value = String(opacityValue);
        opacitySlider.disabled = !hasContent;
        // Paints the filled portion of the rail.
        opacitySlider.style.setProperty("--fill", `${opacityValue}%`);
        rail.dataset.opacity = String(opacityValue);
        if (polylineButton) polylineButton.disabled = !hasContent;
        const mode = group.getMode?.() || "normal";
        undercutButton?.classList.toggle("active", mode === "undercut");
        occlusionButton?.classList.toggle("active", mode === "occlusion");
        webButton?.classList.toggle(
          "active",
          Boolean(group.meshes?.some((mesh) => mesh.userData.componentWireframeEnabled))
        );
      },
    });
  });

  toggle.addEventListener("click", () => {
    if (window.viewerPanelManager) {
      window.viewerPanelManager.toggle("objects-panel");
    } else {
      openPanel();
    }
  });

  closeButton.addEventListener("click", () => {
    if (window.viewerPanelManager) {
      window.viewerPanelManager.close("objects-panel");
    } else {
      closePanel();
    }
  });

  // Only exists to be dimmed/clicked-through on the mobile/tablet sidebar
  // (display:none at desktop widths — see the max-width: 1024px block above).
  const backdrop = document.createElement("div");
  backdrop.id = "component-panel-backdrop";
  backdrop.className = "component-panel-backdrop hidden";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.addEventListener("click", () => {
    if (window.viewerPanelManager) window.viewerPanelManager.close("objects-panel");
    else closePanel();
  });

  // The panel occupies the toggle's corner (desktop) or slides in as a
  // sidebar over the backdrop (tablet/phone — see #footerObjectsBtn in
  // viewerShell.js), so only one of the two triggers is on screen at a time.
  const openPanel = () => {
    panel.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    toggle.classList.add("is-hidden");
    toggle.setAttribute("aria-expanded", "true");
    window.dispatchEvent(new CustomEvent("viewerobjectspanelchange", { detail: { open: true } }));
  };
  const closePanel = () => {
    panel.classList.add("hidden");
    backdrop.classList.add("hidden");
    toggle.classList.remove("is-hidden");
    toggle.setAttribute("aria-expanded", "false");
    window.dispatchEvent(new CustomEvent("viewerobjectspanelchange", { detail: { open: false } }));
  };

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  // Objects sits in the canvas's own top-left corner, not in the right nav.
  const panelHost =
    document.getElementById("container3D") ||
    window.getViewerRightNav?.()?.parentElement ||
    document.body;
  panelHost.appendChild(backdrop);
  panelHost.appendChild(toggle);
  panelHost.appendChild(panel);
  // Bottom-left of the same host, so it never fights the (top-left) objects
  // panel or the (right-side) polyline panel for space.
  undercutLegend = createUndercutLegend(panelHost);
  window.viewerPanelManager?.register("objects-panel", toggle, openPanel, closePanel);
  window.syncComponentPanelRows = syncAllRows;
  syncAllRows();
  syncShowHideButton();

  // Open on load — the objects list is the viewer's primary control. Except
  // on tablet/phone, where it's now a full-height sidebar over a backdrop:
  // auto-opening it there would cover the model on every load, the exact
  // screen-space problem the footer hamburger trigger exists to fix.
  const opensOnLoad = !window.matchMedia("(max-width: 1024px)").matches;
  if (opensOnLoad) {
    if (window.viewerPanelManager) window.viewerPanelManager.open("objects-panel");
    else openPanel();
  }
}

function removeVisibilityAndTransparencyControls() {
  clearAllWireframeOverlays();
  document.getElementById("component-panel-backdrop")?.remove();
  document.getElementById("component-panel")?.remove();
  document.getElementById("component-panel-toggle")?.remove();
  document.getElementById("viewer-undercut-legend")?.remove();
}

// Undercut colour key, byte-for-byte the same palette as preview3D.js's
// colorForSurveyingValue/undercutBandHex — keep the two in sync.
const UNDERCUT_LEGEND_BANDS = [
  { hex: "#AA0003", label: ">0.75" },
  { hex: "#FE4600", label: "0.5-0.75" },
  { hex: "#FD8C00", label: "0.25-0.5" },
  { hex: "#FFD200", label: "<0.25" },
];

// Built once per panel (case view or design view); syncUndercutLegend below
// shows/hides it depending on whether any row's undercut view is on.
function createUndercutLegend(panelHost) {
  const legend = document.createElement("div");
  legend.id = "viewer-undercut-legend";
  legend.className = "viewer-undercut-legend hidden";

  const title = document.createElement("div");
  title.className = "viewer-undercut-legend-title";
  title.textContent = "Undercut (mm)";
  legend.appendChild(title);

  const scale = document.createElement("div");
  scale.className = "viewer-undercut-legend-scale";
  const labels = document.createElement("div");
  labels.className = "viewer-undercut-legend-labels";
  UNDERCUT_LEGEND_BANDS.forEach(({ hex, label }) => {
    const swatch = document.createElement("span");
    swatch.style.background = hex;
    scale.appendChild(swatch);

    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labels.appendChild(labelEl);
  });
  legend.appendChild(scale);
  legend.appendChild(labels);

  panelHost.appendChild(legend);
  return legend;
}

// One row per design slot: icon, "Slot N: <name>", eye toggle and opacity.
// Slots the case has no upload for still get a row, disabled via hasContent.
function buildDesignSlotGroups(designSlots) {
  return designSlots.map((entry) => {
    const meshes = entry.mesh ? [entry.mesh] : [];
    return {
      key: `design-slot-${entry.slot}`,
      label: entry.label,
      type: "overlay",
      iconPath: entry.iconPath,
      meshes,
      supportsAnalysis: false, // uploads carry no occlusion data of their own
      // A jaw slot borrows the case jaw's undercut heatmap, so it gets that button alone.
      // Read the mode off the mesh rather than caching it: the panel is rebuilt on every
      // view switch, and a cached mode would come back "normal" over a heatmapped slot.
      supportsUndercut: Boolean(entry.supportsUndercut) && meshes.length > 0,
      getMode: () => (entry.getUndercut?.() ? "undercut" : "normal"),
      // Async: the first switch pulls in the case's scan and heatmaps. Resolves to the mode
      // actually applied, so a slot that can't be matched to the jaw stays plain.
      setMode: async (mode) => {
        if (mode === "occlusion") return "normal";
        const applied = await entry.setUndercut?.(mode === "undercut");
        return applied ? "undercut" : "normal";
      },
      hasContent: () => meshes.length > 0,
      getVisible: () => areAnyVisible(meshes),
      setVisible: (isVisible) => setMeshGroupVisible(meshes, isVisible),
      getOpacity: () => getMeshGroupOpacity(meshes),
      setOpacity: (opacity) => setMeshGroupOpacity(meshes, opacity),
    };
  });
}

function addVisibilityAndTransparencyControls(
  parentObject,
  name,
  materialArray,
  designSlots = []
) {
  // The design overlay replaces the case's meshes on screen, so the panel
  // lists the slots that are actually visible rather than the hidden jaws.
  if (designSlots.length) {
    createComponentPanel(buildDesignSlotGroups(designSlots));
    return;
  }

  const meshesByJaw = {
    upper: { jaw: [], surface: [] },
    lower: { jaw: [], surface: [] },
  };

  const getJawKey = (child) => {
    const nameText = String(child.name || "").toLowerCase();
    const jawTypeText = String(child.userData?.jaw_type || "").toLowerCase();
    if (nameText.includes("upper") || jawTypeText.includes("upper") || jawTypeText === "2") return "upper";
    if (nameText.includes("lower") || jawTypeText.includes("lower") || jawTypeText === "1") return "lower";
    return null;
  };

  parentObject.children.forEach((child) => {
    if (!child.isMesh) return;
    // Slot STLs stay in the scene, parked hidden, while the case view is up.
    // They carry a jaw_type, so they would land in the case's jaw groups and
    // the jaw eye toggle would switch them back on over the case mesh. They get
    // their own rows in design view (buildDesignSlotGroups).
    if (child.userData?.isDesignSlot) return;
    child.userData.baseGeometry = child.userData.baseGeometry || child.geometry;
    const jawKey = getJawKey(child);
    if (!jawKey) return;
    const bucket = child.name.toLowerCase().includes("surface") ? "surface" : "jaw";
    meshesByJaw[jawKey][bucket].push(child);
  });

  const groups = [];

  ["upper", "lower"].forEach((jawKey) => {
    const jawMeshes = meshesByJaw[jawKey].jaw;
    const surfaceMeshes = meshesByJaw[jawKey].surface;
    if (!jawMeshes.length && !surfaceMeshes.length) return;

    const titlePrefix = jawKey === "upper" ? "Upper" : "Lower";
    let currentMode = "normal";

    groups.push({
      key: `${jawKey}-jaw`,
      label: `${titlePrefix} jaw`,
      type: "mesh",
      iconPath: `${basePath}/assets/Icon_${titlePrefix}Jaw_Occlusal.png`,
      vertexIconPath: `${basePath}/assets/Icon_${jawKey}_jaw_vertice.png`,
      meshes: jawMeshes,
      supportsAnalysis: true,
      getVisible: () => areAnyVisible(jawMeshes),
      setVisible: (isVisible) => {
        setMeshGroupVisible(jawMeshes, isVisible);
        window.syncArtificialTeethToJaw?.();
      },
      getOpacity: () => getMeshGroupOpacity(jawMeshes),
      setOpacity: (opacity) => setMeshGroupOpacity(jawMeshes, opacity),
      getMode: () => currentMode,
      setMode: (mode) => {
        currentMode = mode;
        const indexByMode = { normal: 0, occlusion: 1, undercut: 2 };
        applyJawMaterial(jawMeshes, materialArray, indexByMode[mode] ?? 0);
      },
    });

    groups.push({
      key: `${jawKey}-surface`,
      label: `${titlePrefix} Mesh`,
      type: "mesh",
      iconPath: `${basePath}/assets/Icon_${titlePrefix}Jaw.png`,
      vertexIconPath: `${basePath}/assets/Icon_${jawKey}_mesh.png`,
      meshes: surfaceMeshes,
      supportsAnalysis: false,
      getVisible: () => areAnyVisible(surfaceMeshes),
      setVisible: (isVisible) => {
        setMeshGroupVisible(surfaceMeshes, isVisible);
        window.syncArtificialTeethToJaw?.();
      },
      getOpacity: () => getMeshGroupOpacity(surfaceMeshes),
      setOpacity: (opacity) => setMeshGroupOpacity(surfaceMeshes, opacity),
    });

    groups.push({
      key: `${jawKey}-polyline`,
      label: `${titlePrefix} polylines`,
      type: "overlay",
      iconPath: `${basePath}/assets/Icon_Hide_SkeletalPrev.png`,
      meshes: [],
      supportsAnalysis: false,
      opensPolylinePanel: true,
      hasContent: () => window.hasPolylineJawComponents?.(jawKey) ?? false,
      getVisible: () => window.getPolylineJawVisibility?.(jawKey) ?? true,
      setVisible: (isVisible) => window.setPolylineJawVisibility?.(jawKey, isVisible),
      getOpacity: () => window.getPolylineJawOpacity?.(jawKey) ?? 1,
      setOpacity: (opacity) => window.setPolylineJawOpacity?.(jawKey, opacity),
    });

    groups.push({
      key: `${jawKey}-artificial-teeth`,
      label: `${titlePrefix} artificial teeth`,
      type: "overlay",
      iconPath: `${basePath}/assets/Icon_ArtificialTeeth.png`,
      meshes: [],
      supportsAnalysis: false,
      hasContent: () => window.hasArtificialTeethJaw?.(jawKey) ?? false,
      getVisible: () => window.getArtificialTeethJawVisibility?.(jawKey) ?? true,
      setVisible: (isVisible) => window.setArtificialTeethJawVisibility?.(jawKey, isVisible),
      getOpacity: () => window.getArtificialTeethJawOpacity?.(jawKey) ?? 1,
      setOpacity: (opacity) => window.setArtificialTeethJawOpacity?.(jawKey, opacity),
    });
  });

  createComponentPanel(groups);
}

export { addVisibilityAndTransparencyControls, removeVisibilityAndTransparencyControls };

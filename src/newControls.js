import * as THREE from "three";

const basePath = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";
const wireframeOverlays = new Set();

const style = document.createElement("style");
style.textContent = `
  .component-panel-toggle {
    position: static;
    order: 50;
    z-index: 1001;
    width: 100%;
    height: 56px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    background: #b08d2f;
    color: #ffffff;
    font: 700 13px Arial, sans-serif;
    cursor: pointer;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
    pointer-events: auto;
    transition: box-shadow 0.15s, background 0.15s, opacity 0.15s, filter 0.15s;
  }

  .component-panel {
    position: absolute;
    left: 16px;
    top: 16px;
    transform: none;
    z-index: 1002;
    width: min(380px, calc(100vw - 290px));
    max-height: min(340px, calc(55vh - 32px));
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(32, 32, 32, 0.96);
    color: #f5f5f5;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
    font-family: Arial, sans-serif;
    pointer-events: auto;
  }

  .component-panel.hidden {
    display: none;
  }

  .component-panel-header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: #303030;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .component-panel-title {
    padding: 7px 10px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  .component-panel-title:hover {
    border-color: rgba(255, 255, 255, 0.52);
    background: rgba(255, 255, 255, 0.15);
  }

  .component-panel-close {
    width: 30px;
    height: 30px;
    border: 1px solid #ef4444;
    border-radius: 5px;
    background: #b91c1c;
    color: #ffffff;
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .component-panel-close:hover {
    background: #dc2626;
  }

  .component-row.unavailable {
    opacity: 0.58;
  }

  .component-row.unavailable button,
  .component-row.unavailable input {
    cursor: not-allowed;
  }

  .component-panel-body {
    display: grid;
    gap: 8px;
    padding: 10px;
  }

  .component-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 170px;
    gap: 10px;
    align-items: center;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
  }

  .component-row-main {
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .component-row-icon {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }

  .component-row-title {
    overflow: hidden;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .component-row-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .component-row-buttons {
    display: flex;
    flex-direction: row;
    gap: 6px;
    align-items: center;
  }

  .component-opacity-control {
    min-width: 0;
    width: 100%;
  }

  .component-eye-button,
  .component-analysis-button,
  .component-web-button {
    position: relative;
    flex: 0 0 34px;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 5px;
    background: #2d2d2d;
    background-position: center;
    background-repeat: no-repeat;
    background-size: 22px 22px;
    color: transparent;
    cursor: pointer;
  }

  .component-eye-button {
    background-size: 24px 14px;
  }

  .component-eye-button.hidden-state {
    border-color: rgba(248, 113, 113, 0.45);
    background-color: #2d2d2d;
  }

  .component-eye-button.hidden-state .component-eye-slash {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 22px;
    height: 1.75px;
    background: #ef9a9a;
    transform: translate(-50%, -50%) rotate(-38deg);
    border-radius: 999px;
  }

  .component-analysis-button.active {
    border-color: #38bdf8;
    background-color: #075985;
  }

  .component-web-button::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 21px;
    height: 13px;
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
    width: 21px;
    height: 13px;
    transform: translate(-50%, -50%);
    background:
      linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.9)) center / 1.5px 13px no-repeat,
      linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.9)) center / 21px 1.5px no-repeat,
      linear-gradient(rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.78)) left 5px top / 21px 1.5px no-repeat,
      linear-gradient(rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.78)) left top 4px / 1.5px 13px no-repeat;
    opacity: 0.95;
  }

  .component-web-button.active {
    border-color: rgba(0, 0, 0, 0.55);
    background-color: #222222;
  }

  .component-web-button.has-icon {
    background-size: 24px 16px;
  }

  .component-web-button.has-icon::before,
  .component-web-button.has-icon::after {
    display: none;
  }

  @media (max-width: 640px), (max-height: 720px) {
    .component-panel-toggle {
      width: 132px;
      height: 38px;
      padding: 0 10px;
    }

    .component-panel {
      left: 16px;
      top: 16px;
      transform: none;
      width: min(320px, calc(100vw - 280px));
      max-height: min(300px, calc(50vh - 20px));
    }
  }

  @media (max-width: 1024px) {
    .component-panel-toggle {
      position: static;
      flex: 0 0 auto;
      overflow: visible;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 6px;
      background: #b08d2f;
      color: #17130a;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
    }

    .component-panel {
      left: 16px;
      top: auto;
      bottom: calc(130px + env(safe-area-inset-bottom, 0px));
      transform: none;
      max-width: calc(100vw - 20px);
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(32, 32, 32, 0.97);
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
    }

    .component-panel-header {
      height: auto;
      padding: 10px 12px;
      background: #303030;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .component-panel-title {
      padding-left: 0;
      font: 800 14px/1.2 Arial, sans-serif;
    }

    .component-panel-close {
      width: 32px;
      height: 32px;
      border: 1px solid #ef4444;
      border-radius: 5px;
      background: #b91c1c;
      color: #ffffff;
    }

    .component-panel-close::before {
      display: none;
    }

    .component-panel-body {
      gap: 8px;
      padding: 10px;
    }

    .component-row {
      grid-template-columns: minmax(0, 1fr) 170px;
      gap: 10px;
      min-height: 0;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.04);
    }

    .component-row-main {
      grid-template-columns: 28px minmax(0, 1fr);
      height: auto;
      gap: 8px;
      padding-left: 0;
      background: transparent;
    }

    .component-row-main::before {
      display: none;
    }

    .component-row-icon {
      display: block;
    }

    .component-row-title {
      font: 700 12px/1.2 Arial, sans-serif;
    }

    .component-row-controls {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-left: 0;
      background: transparent;
    }

    .component-row-controls::after {
      display: none;
    }

    .component-opacity-control {
      width: 100%;
      height: auto;
      appearance: auto;
      border: 0;
      border-radius: 0;
      background: initial;
      overflow: visible;
    }

    .component-opacity-control::-webkit-slider-thumb {
      appearance: auto;
      width: auto;
      height: auto;
      background: initial;
      box-shadow: none;
    }

    .component-opacity-control::-moz-range-thumb {
      width: auto;
      height: auto;
      background: initial;
    }

    .component-opacity-control::-moz-range-progress {
      height: auto;
      background: initial;
    }

    .component-eye-button,
    .component-analysis-button,
    .component-web-button {
      display: block;
      flex: 0 0 34px;
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 5px;
      background-color: #2d2d2d;
      background-size: 22px 22px;
    }

    .component-eye-button {
      background-size: 24px 14px;
    }

    .component-web-button::before {
      width: 21px;
      height: 13px;
      border-color: rgba(255, 255, 255, 0.92);
      border-radius: 999px;
      transform: translate(-50%, -50%);
      clip-path: none;
    }

    .component-web-button::after {
      display: block;
    }

    .component-web-button.has-icon {
      background-size: 24px 16px;
    }
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .component-panel-toggle {
      width: 140px;
      height: 64px;
      padding: 0 14px;
    }

    .component-panel {
      top: auto;
      bottom: calc(130px + env(safe-area-inset-bottom, 0px));
      width: min(420px, calc(100vw - 20px));
      max-height: min(320px, 44dvh);
    }
  }

  @media (max-width: 768px) {
    .component-panel-toggle {
      width: 128px;
      height: 60px;
      padding: 0 10px;
    }

    .component-panel {
      top: auto;
      left: 12px;
      bottom: calc(86px + env(safe-area-inset-bottom, 0px));
      width: min(360px, calc(100vw - 20px));
      max-height: min(280px, 44dvh);
    }

    .component-row {
      grid-template-columns: minmax(0, 1fr);
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

  const title = document.createElement("button");
  title.type = "button";
  title.className = "component-panel-title";
  title.innerHTML = `<img src="${basePath}/assets/Icon_layers3.png" alt="Show All" style="width:24px;height:24px;object-fit:contain;display:block;margin:auto;pointer-events:none;">`;
  title.title = "Show all available objects";
  title.setAttribute("aria-label", "Show all available objects");

  const syncShowHideButton = () => {
    const allVisible = groups.every(
      (g) => g.hasContent?.() === false || (g.getVisible?.() ?? true)
    );
    const icon = allVisible ? "Icon_layers3" : "Icon_layers4";
    const altText = allVisible ? "Hide All" : "Show All";
    const label = allVisible ? "Hide all objects" : "Show all available objects";
    title.innerHTML = `<img src="${basePath}/assets/${icon}.png" alt="${altText}" style="width:24px;height:24px;object-fit:contain;display:block;margin:auto;pointer-events:none;">`;
    title.title = label;
    title.setAttribute("aria-label", label);
  };

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "component-panel-close";
  closeButton.textContent = "\u00d7";
  closeButton.title = "Close objects";
  closeButton.setAttribute("aria-label", "Close objects");

  header.appendChild(title);
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = "component-panel-body";
  const rowControllers = [];

  const syncAllRows = () => {
    rowControllers.forEach((controller) => controller.sync());
    syncShowHideButton();
  };

  title.addEventListener("click", () => {
    const allVisible = groups.every(
      (g) => g.hasContent?.() === false || (g.getVisible?.() ?? true)
    );
    groups.forEach((group) => {
      if (group.hasContent?.() === false) return;
      group.setVisible?.(!allVisible);
    });
    syncAllRows();
  });

  groups.forEach((group) => {
    const row = document.createElement("div");
    row.className = "component-row";

    const main = document.createElement("div");
    main.className = "component-row-main";

    if (group.iconPath) {
      const rowIcon = document.createElement("img");
      rowIcon.className = "component-row-icon";
      rowIcon.src = group.iconPath;
      rowIcon.alt = "";
      rowIcon.setAttribute("aria-hidden", "true");
      main.appendChild(rowIcon);
    }

    const rowTitle = document.createElement("div");
    rowTitle.className = "component-row-title";
    rowTitle.textContent = group.label;
    main.appendChild(rowTitle);

    const controls = document.createElement("div");
    controls.className = "component-row-controls";

    // Top row: all icon toggle buttons, same size
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
    if (group.supportsAnalysis) {
      undercutButton = document.createElement("button");
      undercutButton.type = "button";
      undercutButton.className = "component-analysis-button";
      undercutButton.style.backgroundImage = `url(${basePath}/assets/Undercut.png)`;
      undercutButton.title = `${group.label} undercut`;
      undercutButton.addEventListener("click", () => {
        group.setMode?.(group.getMode?.() === "undercut" ? "normal" : "undercut");
        syncAllRows();
      });

      occlusionButton = document.createElement("button");
      occlusionButton.type = "button";
      occlusionButton.className = "component-analysis-button";
      occlusionButton.style.backgroundImage = `url(${basePath}/assets/Occlusion.png)`;
      occlusionButton.title = `${group.label} occlusion`;
      occlusionButton.addEventListener("click", () => {
        group.setMode?.(group.getMode?.() === "occlusion" ? "normal" : "occlusion");
        syncAllRows();
      });

      buttonsRow.appendChild(undercutButton);
      buttonsRow.appendChild(occlusionButton);
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

    controls.appendChild(buttonsRow);

    // Bottom row: opacity slider
    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.className = "component-opacity-control";
    opacitySlider.min = "0";
    opacitySlider.max = "100";
    opacitySlider.value = "100";
    opacitySlider.title = `${group.label} opacity`;

    opacitySlider.addEventListener("input", () => {
      group.setOpacity?.(Number(opacitySlider.value) / 100);
      syncAllRows();
    });

    controls.appendChild(opacitySlider);

    row.appendChild(main);
    row.appendChild(controls);
    body.appendChild(row);

    rowControllers.push({
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
        controls.dataset.opacity = String(opacityValue);
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
      const isHidden = panel.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", String(!isHidden));
    }
  });

  closeButton.addEventListener("click", () => {
    if (window.viewerPanelManager) {
      window.viewerPanelManager.close("objects-panel");
    } else {
      panel.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  panel.appendChild(header);
  panel.appendChild(body);
  const nav = window.getViewerRightNav?.() || document.body;
  const panelHost =
    document.getElementById("container3D") ||
    nav.parentElement ||
    document.body;
  nav.appendChild(toggle);
  panelHost.appendChild(panel);
  window.viewerPanelManager?.register(
    "objects-panel",
    toggle,
    () => { panel.classList.remove("hidden"); toggle.setAttribute("aria-expanded", "true"); },
    () => { panel.classList.add("hidden"); toggle.setAttribute("aria-expanded", "false"); }
  );
  window.syncComponentPanelRows = syncAllRows;
  syncAllRows();
  syncShowHideButton();
}

function removeVisibilityAndTransparencyControls() {
  clearAllWireframeOverlays();
  document.getElementById("component-panel")?.remove();
  document.getElementById("component-panel-toggle")?.remove();
}

function addVisibilityAndTransparencyControls(parentObject, name, materialArray) {
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

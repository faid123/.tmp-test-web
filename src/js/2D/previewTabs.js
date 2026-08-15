// The preview panel's folder tabs. Both 3D tabs SHARE one frame — Extra 3D just stages the
// slot files in it — so the WebGL context is never torn down; Reference Images pauses it.

import {
  setPreview3DRenderPaused,
  openUpload3dModal,
  closeUpload3dModal,
} from "./preview3D.js";
import { loadReferenceImages, closeViewer } from "./referenceImages.js";

function tabEls() {
  return {
    shell: document.querySelector(".annotation-shell"),
    tabs: document.querySelectorAll(".preview-tab"),
    frame: document.getElementById("imagePreviewArea"),
    refsPane: document.getElementById("referenceImagesPane"),
    maximizeBtn: document.getElementById("preview3dMaximizeBtn"),
  };
}

let activeTab = "3d";

export function initPreviewTabs() {
  const { tabs } = tabEls();
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showPreviewTab(tab.dataset.previewTab));
  });
  showPreviewTab("3d");
}

export function showPreviewTab(name) {
  const { shell, tabs, frame, refsPane, maximizeBtn } = tabEls();
  if (!frame || !refsPane) return;
  const refs = name === "refs";
  const extras = name === "extras";

  // The maximize/restore control lives inside the 3D frame, so leaving for the
  // gallery while maximized would strand the user with no way back.
  if (refs && shell?.classList.contains("preview-maximized")) maximizeBtn?.click();

  tabs.forEach((tab) => {
    const active = tab.dataset.previewTab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  });
  frame.classList.toggle("is-hidden", refs);
  frame.classList.toggle("is-extras-tab", extras);
  refsPane.classList.toggle("is-hidden", !refs);
  setPreview3DRenderPaused(refs);

  if (refs) loadReferenceImages();
  else closeViewer();

  if (extras) openUpload3dModal();
  else if (activeTab === "extras") closeUpload3dModal();

  activeTab = name;
}

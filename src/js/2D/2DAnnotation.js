/**
 * 2D arch annotation — entry point.
 * Side-effect: loads annotationRender.js first so render bridge + mesh env are registered.
 */
import "./annotationRender.js";

import { ui } from "./annotationState.js";
import { setMessage } from "./annotationDom.js";
import { renderJaws } from "./annotationRenderBridge.js";
import { initializeCaseIds } from "./annotationCase.js";
import { initializeTeethState } from "./annotationTeethModel.js";
import {
  bindActionButtons,
  bindArchWhitespaceDismiss,
  bindJawControls,
  bindRemoveComponentModeBtn,
  bindStatusPicker,
  syncDesignModeWithLocks,
  updateEditModeUI,
} from "./annotationLocks.js";
import { initComponentCatalog } from "./annotationCatalog.js";
import { loadPreviewImage } from "./annotationPersistence.js";

function start() {
  if (ui.hasInitialized) return;
  ui.hasInitialized = true;
  init();
}

function init() {
  initializeCaseIds();
  initializeTeethState();

  try {
    bindStatusPicker();
    bindJawControls();
    bindArchWhitespaceDismiss();
    bindRemoveComponentModeBtn();
    bindActionButtons();
    initComponentCatalog();
    loadPreviewImage();
    syncDesignModeWithLocks(false);
    renderJaws();
    updateEditModeUI();
  } catch (err) {
    console.error("2D annotation init failed", err);
    setMessage("Loaded jaw view with limited tools. Check console for init error.", true);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

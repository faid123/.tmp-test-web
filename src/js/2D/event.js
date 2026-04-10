import { JAW } from "./constants.js";
import { clearAll, clearJaw, handleToothClick, redoAction, selectComponent, setMode, undoAction } from "./manager.js";
import { render } from "./render.js";

export function bindEvents(state) {
  const appRoot = document.body;

  appRoot.addEventListener("click", (event) => {
    const modeBtn = event.target.closest("[data-mode]");
    if (modeBtn) {
      setMode(state, modeBtn.dataset.mode);
      render(state);
      return;
    }

    const componentBtn = event.target.closest("[data-component-id]");
    if (componentBtn) {
      selectComponent(state, componentBtn.dataset.componentId);
      render(state);
      return;
    }

    const toothBtn = event.target.closest("[data-tooth-id]");
    if (toothBtn) {
      handleToothClick(state, Number(toothBtn.dataset.toothId));
      render(state);
      return;
    }

    if (event.target.id === "undo-btn") {
      undoAction(state);
      render(state);
      return;
    }

    if (event.target.id === "redo-btn") {
      redoAction(state);
      render(state);
      return;
    }

    if (event.target.id === "clear-upper-btn") {
      clearJaw(state, JAW.UPPER);
      render(state);
      return;
    }

    if (event.target.id === "clear-lower-btn") {
      clearJaw(state, JAW.LOWER);
      render(state);
      return;
    }

    if (event.target.id === "clear-all-btn") {
      clearAll(state);
      render(state);
    }
  });
}

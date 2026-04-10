import { ALL_FDI, JAW, MODE, UPPER_FDI } from "./constants.js";

export function createInitialState() {
  const teeth = {};
  for (const fdi of ALL_FDI) {
    teeth[fdi] = {
      fdiId: fdi,
      jaw: UPPER_FDI.includes(fdi) ? JAW.UPPER : JAW.LOWER,
      presence: "present",
      components: [],
    };
  }

  return {
    mode: MODE.DESIGN,
    selectedComponentId: null,
    teeth,
    history: {
      undoStack: [],
      redoStack: [],
    },
    statusText: "Ready.",
  };
}

export function setStatus(state, text) {
  state.statusText = text;
}

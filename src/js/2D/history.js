function unique(list) {
  return [...new Set(list)];
}

function applyDeltaForward(tooth, delta) {
  if (typeof delta.presenceAfter === "string") {
    tooth.presence = delta.presenceAfter;
  }

  for (const componentId of delta.remove || []) {
    tooth.components = tooth.components.filter((existingId) => existingId !== componentId);
  }

  tooth.components = unique([...(tooth.components || []), ...(delta.add || [])]);
}

function applyDeltaBackward(tooth, delta) {
  if (typeof delta.presenceBefore === "string") {
    tooth.presence = delta.presenceBefore;
  }

  for (const componentId of delta.add || []) {
    tooth.components = tooth.components.filter((existingId) => existingId !== componentId);
  }

  tooth.components = unique([...(tooth.components || []), ...(delta.remove || [])]);
}

export function applyCommand(state, command, direction = "forward") {
  for (const delta of command.deltas) {
    const tooth = state.teeth[delta.toothId];
    if (!tooth) {
      continue;
    }

    if (direction === "forward") {
      applyDeltaForward(tooth, delta);
    } else {
      applyDeltaBackward(tooth, delta);
    }
  }
}

export function pushHistory(state, command) {
  state.history.undoStack.push(command);
  state.history.redoStack.length = 0;
}

export function undo(state) {
  const command = state.history.undoStack.pop();
  if (!command) {
    return false;
  }

  applyCommand(state, command, "backward");
  state.history.redoStack.push(command);
  return true;
}

export function redo(state) {
  const command = state.history.redoStack.pop();
  if (!command) {
    return false;
  }

  applyCommand(state, command, "forward");
  state.history.undoStack.push(command);
  return true;
}

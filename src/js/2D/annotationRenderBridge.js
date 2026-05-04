let renderJawImpl = () => {};
let renderJawsImpl = () => {};

export function registerRender(fns) {
  renderJawImpl = fns.renderJaw;
  renderJawsImpl = fns.renderJaws;
}

export function renderJaw(jaw) {
  return renderJawImpl(jaw);
}

export function renderJaws() {
  return renderJawsImpl();
}

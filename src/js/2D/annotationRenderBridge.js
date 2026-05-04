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

let meshAnnotationEnvImpl = () => ({});

export function registerMeshAnnotationEnv(fn) {
  meshAnnotationEnvImpl = fn;
}

export function meshAnnotationEnv() {
  return meshAnnotationEnvImpl();
}

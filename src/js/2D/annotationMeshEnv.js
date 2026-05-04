let meshAnnotationEnvImpl = () => ({});

export function registerMeshAnnotationEnv(fn) {
  meshAnnotationEnvImpl = fn;
}

export function meshAnnotationEnv() {
  return meshAnnotationEnvImpl();
}

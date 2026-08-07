// preview3DSurvey.js — SET SURVEY ANGLE: aim, save and apply jaw insertion angles.
// Shares preview3D's state and helpers; preview3D imports the entry points back
// (call-time-only circular import).

import { state } from "./2DAnnotation.js";
import { toast } from "../shared/toast.js";
import {
  THREE,
  preview3DState,
  srgbToLinear,
  colorForSurveyingValue,
  buildDllUndercutSurface,
  applySurveyUndercutToPreview,
  setHeatmapEnabled,
  fetchCaseData,
  getLoggedInUser,
  PREVIEW_MACHINE_ID,
  PREVIEW_FALLBACK_UUID,
  SMARTRPD_API_BASE,
} from "./preview3D.js";

// Read a jaw's stored *_insertion_angle_{x,y,z} fields as a vector; null if unset.
export function savedSurveyVectorForJaw(caseData, jaw) {
  if (!caseData) return null;
  const prefix = jaw === "upper" ? "upper" : "lower";
  const rawValues = ["x", "y", "z"].map((axis) =>
    caseData[`${prefix}_insertion_angle_${axis}`]
  );
  if (rawValues.some((value) => value === undefined || value === null || value === "")) return null;
  const values = rawValues.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return { x: values[0], y: values[1], z: values[2] };
}

// Bring a world-space direction into the mesh's local (modelRoot) frame for the DLL.
// Null for a zero vector so an unset case is never surveyed.
function worldToLocalSurveyDirection(worldVec) {
  if (!worldVec || !THREE) return null;
  const dir = worldVec.clone();
  const root = preview3DState.modelRoot;
  if (root) {
    const rootQuat = new THREE.Quaternion();
    root.getWorldQuaternion(rootQuat);
    dir.applyQuaternion(rootQuat.invert());
  }
  if (dir.lengthSq() < 1e-9) return null;
  dir.normalize();
  return [dir.x, dir.y, dir.z].map((value) => Number(Number(value).toFixed(8)));
}

// Desktop's per-jaw flip between the stored vector and the DLL direction.
// Self-inverse (encodes and decodes). Do NOT add a modelRoot rotation on top.
export function desktopSurveyFlip(jaw, [x, y, z]) {
  return jaw === "upper" ? [-x, -y, z] : [x, y, -z];
}

export function savedSurveyDirectionForJaw(caseData, jaw) {
  const vec = savedSurveyVectorForJaw(caseData, jaw);
  if (!vec) return null;
  const [x, y, z] = desktopSurveyFlip(jaw, [vec.x, vec.y, vec.z]);
  const len = Math.hypot(x, y, z);
  if (len < 1e-4) return null; // unset case stores (0,0,0)
  return [x / len, y / len, z / len].map((v) => Number(Number(v).toFixed(8)));
}

function getCameraSurveyDirection() {
  const camera = preview3DState.camera;
  if (!camera || !THREE) return [1, 0, 0];

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.multiplyScalar(-1);

  const root = preview3DState.modelRoot;
  if (root) {
    const rootQuat = new THREE.Quaternion();
    root.getWorldQuaternion(rootQuat);
    dir.applyQuaternion(rootQuat.invert());
  }

  if (dir.lengthSq() < 1e-9) return [1, 0, 0];
  dir.normalize();
  return [dir.x, dir.y, dir.z].map((value) =>
    Number(Number(value).toFixed(8))
  );
}

function getWorldSurveyDirection() {
  if (!THREE) return null;
  const direction = new THREE.Vector3(...getCameraSurveyDirection());
  const root = preview3DState.modelRoot;
  if (root) {
    const rootQuat = new THREE.Quaternion();
    root.getWorldQuaternion(rootQuat);
    direction.applyQuaternion(rootQuat);
  }
  if (direction.lengthSq() < 1e-9) return null;
  return direction.normalize();
}

// Drag sensitivity for swinging the arrow, in radians per pixel.
const SURVEY_AIM_DRAG_SPEED = 0.009;


// The aim is tracked in world space; the arrow is positioned in the model's frame.
function surveyAimWorldDirection() {
  const aiming = preview3DState.surveyAiming;
  if (!aiming || !THREE) return null;
  return aiming.dir.clone().normalize();
}

function surveyAimLocalDirection() {
  const world = surveyAimWorldDirection();
  if (!world) return null;
  const root = preview3DState.modelRoot;
  if (root) {
    const rootQuat = new THREE.Quaternion();
    root.getWorldQuaternion(rootQuat);
    world.applyQuaternion(rootQuat.invert());
  }
  return world.normalize();
}

// Placement arrow: local +Y with the tip at the origin, sized to the jaw's bounding sphere.
function createSurveyPlacementArrow(radius) {
  const total = radius * 0.35;
  const headLength = total * 0.28;
  const shaftLength = total - headLength;
  const shaftRadius = total * 0.055;
  const headRadius = shaftRadius * 2.6;

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x0f766e,
    emissive: 0x0f766e,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.1,
  });

  // ConeGeometry's apex sits at +height/2; flip it so the apex leads at y=0.
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headRadius, headLength, 28),
    material
  );
  head.rotation.x = Math.PI;
  head.position.y = headLength / 2;
  group.add(head);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 24),
    material
  );
  shaft.position.y = headLength + shaftLength / 2;
  group.add(shaft);

  // Translucent beam on the same axis, sunk slightly past the tip. Normal blending:
  // additive over the white backdrop would be invisible.
  const beamLength = total * 1.12;
  const sink = total * 0.1;
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x2fd4bb,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftRadius * 2.4, shaftRadius * 1.1, beamLength, 24, 1, true),
    beamMaterial
  );
  beam.position.y = beamLength / 2 - sink;
  group.add(beam);

  group.userData.surveyArrowLength = total;
  group.userData.surveyArrowMaterial = material;
  group.userData.surveyBeamMaterial = beamMaterial;
  return group;
}

// Parallel light down the insertion axis: whatever it shadows is undercut.
function createSurveyRayLight(metrics, root) {
  // Near-zero intensity: the light exists only to render a shadow map.
  const light = new THREE.DirectionalLight(0xffffff, 0.0001);
  light.castShadow = true;

  const target = new THREE.Object3D();
  target.position.copy(metrics.center);
  root.add(target);
  light.target = target;

  // Ortho shadow frustum sized to the jaw, with depth to spare either side.
  const r = metrics.radius;
  const cam = light.shadow.camera;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
  cam.near = 0.1; cam.far = r * 6;
  cam.updateProjectionMatrix();
  light.shadow.mapSize.set(1024, 1024);
  // Keeps gentle slopes from self-shadowing into acne.
  light.shadow.bias = -0.0004;
  // Must stay well under undercut depth or shallow undercuts stop shadowing.
  light.shadow.normalBias = r * 0.004;

  root.add(light);
  light.userData.surveyRayTarget = target;
  return light;
}

// Shadowed pixels are tinted the heatmap's deepest-undercut red, sourced from the
// palette so the two can't drift.
const SURVEY_TINT_UNIFORMS = {
  uSurveyTintColor: { value: null },
  uSurveyTintAmount: { value: 0.85 },
};

function surveyTintColor() {
  if (!SURVEY_TINT_UNIFORMS.uSurveyTintColor.value) {
    const [r, g, b] = colorForSurveyingValue(1);
    SURVEY_TINT_UNIFORMS.uSurveyTintColor.value = new THREE.Color(
      srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)
    );
  }
  return SURVEY_TINT_UNIFORMS.uSurveyTintColor.value;
}

// Shader patch: tint pixels shadowed by the survey light red. Compiles out when no
// shadow caster is in the scene, so it never needs unpatching.
function applySurveyShadowTint(material) {
  if (!material || material.userData.surveyTintPatched) return;
  material.userData.surveyTintPatched = true;
  surveyTintColor();

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurveyTintColor = SURVEY_TINT_UNIFORMS.uSurveyTintColor;
    shader.uniforms.uSurveyTintAmount = SURVEY_TINT_UNIFORMS.uSurveyTintAmount;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform vec3 uSurveyTintColor;\nuniform float uSurveyTintAmount;\nvoid main() {"
      )
      // USE_SHADOWMAP guard required: getShadow doesn't exist when shadow mapping is off.
      .replace(
        "#include <opaque_fragment>",
        `#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  DirectionalLightShadow svCfg = directionalLightShadows[ 0 ];
  // receiveShadow keeps the tint off the opposing arch, which is excluded from shadows.
  float svLit = receiveShadow ? getShadow( directionalShadowMap[ 0 ], svCfg.shadowMapSize,
    svCfg.shadowBias, svCfg.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
  // Carrying the shaded luminance through keeps relief visible inside the red.
  float svLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  outgoingLight = mix( outgoingLight, uSurveyTintColor * ( 0.35 + svLum ),
    ( 1.0 - svLit ) * uSurveyTintAmount );
#endif
#include <opaque_fragment>`
      );
  };
  // Without this three.js would hand the patched material a cached unpatched program.
  material.customProgramCacheKey = () => "surveyShadowTint";
  material.needsUpdate = true;
}

// Shadows are on only while a jaw is armed (they cost a second scene render).
function setSurveyShadowsEnabled(enabled, jaw = null) {
  const renderer = preview3DState.renderer;
  if (!renderer) return;
  renderer.shadowMap.enabled = enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Manual updates only: the map is redrawn just when the aim moves.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = enabled;

  // Only the surveyed jaw casts and receives.
  const flag = (group, on) => {
    group?.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = on;
      obj.receiveShadow = on;
      // DoubleSide materials self-shadow badly on a hollow scan shell.
      if (obj.material) obj.material.shadowSide = THREE.BackSide;
      // Patch both jaws: the material is shared; receiveShadow gates the tint.
      if (enabled) applySurveyShadowTint(obj.material);
    });
  };
  flag(preview3DState.groups?.upper, enabled && jaw === "upper");
  flag(preview3DState.groups?.lower, enabled && jaw === "lower");
}

// Jaw metrics in modelRoot-local space: where to point the arrow, how big to draw it.
function surveyTargetMetrics(jaw) {
  const group = preview3DState.groups?.[jaw];
  const root = preview3DState.modelRoot;
  if (!group || !root || !THREE) return null;

  const worldBox = new THREE.Box3().setFromObject(group);
  if (worldBox.isEmpty()) return null;

  // Re-fit the world AABB into modelRoot's frame (the arrow's parent).
  const box = worldBox.applyMatrix4(
    new THREE.Matrix4().copy(root.matrixWorld).invert()
  );
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const radius = half.length();
  return {
    group,
    center,
    half,
    radius: radius || 30,
    points: cacheSurveySurfacePoints(group, root),
  };
}

// Snapshot every jaw vertex in modelRoot-local space so per-drag scans are one flat pass.
function cacheSurveySurfacePoints(group, root) {
  if (!group || !root || !THREE) return null;

  const meshes = [];
  let vertexCount = 0;
  group.traverse((obj) => {
    if (obj.isMesh && obj.geometry?.attributes?.position) {
      meshes.push(obj);
      vertexCount += obj.geometry.attributes.position.count;
    }
  });
  if (!vertexCount) return null;

  const points = new Float32Array(vertexCount * 3);
  const toLocal = new THREE.Matrix4();
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const vertex = new THREE.Vector3();
  let offset = 0;

  for (const mesh of meshes) {
    toLocal.multiplyMatrices(inverseRoot, mesh.matrixWorld);
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(toLocal);
      points[offset] = vertex.x;
      points[offset + 1] = vertex.y;
      points[offset + 2] = vertex.z;
      offset += 3;
    }
  }
  return points;
}

// Place the tip just clear of the mesh: furthest vertex along the aim (support function).
function surveySurfaceTip(metrics, localDirection) {
  const gap = metrics.radius * 0.015;
  const { center, half, points } = metrics;

  if (!points || !points.length) {
    // Fallback: support function of the AABB.
    const reach =
      Math.abs(half.x * localDirection.x) +
      Math.abs(half.y * localDirection.y) +
      Math.abs(half.z * localDirection.z);
    return center.clone().addScaledVector(localDirection, reach + gap);
  }

  const { x: dx, y: dy, z: dz } = localDirection;
  let furthest = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const projection = points[i] * dx + points[i + 1] * dy + points[i + 2] * dz;
    if (projection > furthest) furthest = projection;
  }

  // Re-base projections onto the arrow's axis through the jaw centre.
  const reach = furthest - center.dot(localDirection);
  return center.clone().addScaledVector(localDirection, reach + gap);
}

export function updateSurveyPlacementArrow() {
  const aiming = preview3DState.surveyAiming;
  const arrow = preview3DState.surveyArrow;
  if (!aiming || !arrow || !THREE) return;

  // Metrics are captured at arm time; the mesh doesn't move while aiming.
  const metrics = aiming.metrics;
  if (!metrics) return;

  // Rescan only when the aim actually moved.
  if (!aiming.aimDirty) return;
  aiming.aimDirty = false;

  const direction = surveyAimLocalDirection();
  if (!direction || direction.lengthSq() < 1e-9) return;

  const tip = surveySurfaceTip(metrics, direction);
  if (!tip) return;

  arrow.position.copy(tip);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  // Park the light back along the aim and redraw the shadow map.
  const light = preview3DState.surveyRayLight;
  if (light) {
    light.position
      .copy(metrics.center)
      .addScaledVector(direction, metrics.radius * 3);
    light.target.position.copy(metrics.center);
    light.target.updateMatrixWorld();
    if (preview3DState.renderer) preview3DState.renderer.shadowMap.needsUpdate = true;
  }
}

// (Hold-to-rotate removed: jaw rotation is now always two-finger drag.)

// Aim input: mouse left-drag swings the arrow (right-drag rotates the jaw); touch is
// intercepted at the mount in the capture phase so TrackballControls' one-finger
// rotate can't fight the arrow drag.
function attachSurveyAimDrag() {
  const canvas = preview3DState.renderer?.domElement;
  const mount = preview3DState.mount;
  if (!canvas || !mount) return null;

  // Rotate the aim vector about the camera's screen axes; quaternions have no
  // poles, so the swing is free in every direction.
  const spinAim = (dx, dy) => {
    const aiming = preview3DState.surveyAiming;
    const camera = preview3DState.camera;
    if (!aiming || !camera) return;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const spin = new THREE.Quaternion()
      .setFromAxisAngle(up, dx * SURVEY_AIM_DRAG_SPEED)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(right, dy * SURVEY_AIM_DRAG_SPEED)
      );
    aiming.dir.applyQuaternion(spin).normalize();
    aiming.aimDirty = true;
  };

  // Touch counterpart of right-drag rotate: orbit the camera with the inverse spin
  // so the jaw follows the finger.
  const orbitCamera = (dx, dy) => {
    const camera = preview3DState.camera;
    const controls = preview3DState.controls;
    if (!camera || !controls) return;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const spin = new THREE.Quaternion()
      .setFromAxisAngle(up, -dx * SURVEY_AIM_DRAG_SPEED)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(right, -dy * SURVEY_AIM_DRAG_SPEED)
      );
    const offset = camera.position.clone().sub(controls.target).applyQuaternion(spin);
    camera.up.applyQuaternion(spin);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
  };

  // Pinch zoom, clamped to the controls' min/max distances.
  const zoomCamera = (ratio) => {
    const camera = preview3DState.camera;
    const controls = preview3DState.controls;
    if (!camera || !controls || !Number.isFinite(ratio) || ratio <= 0) return;
    const offset = camera.position.clone().sub(controls.target);
    const len = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, offset.length() * ratio)
    );
    camera.position
      .copy(controls.target)
      .addScaledVector(offset.normalize(), len);
  };

  // ---- mouse: left-drag swings the arrow; right-drag falls through to controls ----
  let mouseDragging = false;
  let mLastX = 0;
  let mLastY = 0;

  const onMouseDown = (e) => {
    if (e.pointerType === "touch") return; // touch is owned by the mount handlers
    if (e.button !== 0 || !preview3DState.surveyAiming) return;
    mouseDragging = true;
    mLastX = e.clientX;
    mLastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add("is-aiming-drag");
  };

  const onMouseMove = (e) => {
    if (e.pointerType === "touch") return;
    if (!mouseDragging || !preview3DState.surveyAiming) return;
    spinAim(e.clientX - mLastX, e.clientY - mLastY);
    mLastX = e.clientX;
    mLastY = e.clientY;
  };

  const onMouseUp = (e) => {
    if (e.pointerType === "touch" || !mouseDragging) return;
    mouseDragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    canvas.classList.remove("is-aiming-drag");
  };

  // ---- touch: 1-finger drag = arrow · 2-finger drag = jaw rotate · 2-finger pinch = zoom ----
  // Gesture map:
  //   1 finger  → immediately drags the placement arrow
  //   2 fingers → rotates the jaw (centroid delta) AND zooms (pinch delta) simultaneously
  //   3+ fingers → ignored until all lifted
  const touchPoints = new Map(); // pointerId -> {x, y}
  let touchMode = null; // "arrow" | "jaw" | "dead"
  let tLastX = 0;
  let tLastY = 0;
  let pinchDist = 0;

  // Centroid of all active touch points.
  const centroid = () => {
    let sx = 0, sy = 0;
    for (const p of touchPoints.values()) { sx += p.x; sy += p.y; }
    return { x: sx / touchPoints.size, y: sy / touchPoints.size };
  };

  const pinchDistance = () => {
    const [a, b] = [...touchPoints.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  const resetTouch = () => {
    touchPoints.clear();
    touchMode = null;
    canvas.classList.remove("is-aiming-drag");
    mount.classList.remove("is-jaw-rotating");
  };

  const onTouchDown = (e) => {
    if (e.pointerType !== "touch" || !preview3DState.surveyAiming) return;
    e.stopPropagation();
    e.preventDefault();
    mount.setPointerCapture?.(e.pointerId);
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touchPoints.size === 1) {
      // Single finger: arrow drag.
      touchMode = "arrow";
      tLastX = e.clientX;
      tLastY = e.clientY;
      canvas.classList.add("is-aiming-drag");
      mount.classList.remove("is-jaw-rotating");
    } else if (touchPoints.size === 2 && touchMode !== "dead") {
      // Second finger added: switch to jaw rotate + pinch zoom.
      touchMode = "jaw";
      canvas.classList.remove("is-aiming-drag");
      mount.classList.add("is-jaw-rotating");
      navigator.vibrate?.(18); // light haptic nudge on Android; no-op on iOS
      const c = centroid();
      tLastX = c.x;
      tLastY = c.y;
      pinchDist = pinchDistance();
    } else {
      // 3+ fingers: kill the gesture.
      touchMode = "dead";
      canvas.classList.remove("is-aiming-drag");
      mount.classList.remove("is-jaw-rotating");
    }
  };

  const onTouchMove = (e) => {
    if (!touchPoints.has(e.pointerId)) return;
    if (!preview3DState.surveyAiming) { resetTouch(); return; }
    e.stopPropagation();
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touchMode === "arrow" && touchPoints.size === 1) {
      spinAim(e.clientX - tLastX, e.clientY - tLastY);
      tLastX = e.clientX;
      tLastY = e.clientY;
    } else if (touchMode === "jaw" && touchPoints.size === 2) {
      // Rotate by centroid delta and zoom by pinch ratio in the same move event.
      const c = centroid();
      orbitCamera(c.x - tLastX, c.y - tLastY);
      tLastX = c.x;
      tLastY = c.y;

      const next = pinchDistance();
      zoomCamera(pinchDist / next); // spread fingers → zoom in
      pinchDist = next;
    }
  };

  const onTouchUp = (e) => {
    if (!touchPoints.has(e.pointerId)) return;
    e.stopPropagation();
    mount.releasePointerCapture?.(e.pointerId);
    touchPoints.delete(e.pointerId);

    if (touchPoints.size === 0) {
      resetTouch();
    } else if (touchPoints.size === 1 && touchMode === "jaw") {
      // One finger lifted from a two-finger gesture: go back to arrow mode.
      touchMode = "arrow";
      canvas.classList.add("is-aiming-drag");
      mount.classList.remove("is-jaw-rotating");
      const [remaining] = touchPoints.values();
      tLastX = remaining.x;
      tLastY = remaining.y;
    } else {
      // Dropped from 3+ into 2 or 1: safer to kill until all are up.
      touchMode = "dead";
      canvas.classList.remove("is-aiming-drag");
      mount.classList.remove("is-jaw-rotating");
    }
  };

  canvas.addEventListener("pointerdown", onMouseDown);
  canvas.addEventListener("pointermove", onMouseMove);
  canvas.addEventListener("pointerup", onMouseUp);
  canvas.addEventListener("pointercancel", onMouseUp);
  // Capture phase on the mount: keeps TrackballControls blind to touch while aiming.
  mount.addEventListener("pointerdown", onTouchDown, true);
  mount.addEventListener("pointermove", onTouchMove, true);
  mount.addEventListener("pointerup", onTouchUp, true);
  mount.addEventListener("pointercancel", onTouchUp, true);

  return () => {
    canvas.removeEventListener("pointerdown", onMouseDown);
    canvas.removeEventListener("pointermove", onMouseMove);
    canvas.removeEventListener("pointerup", onMouseUp);
    canvas.removeEventListener("pointercancel", onMouseUp);
    mount.removeEventListener("pointerdown", onTouchDown, true);
    mount.removeEventListener("pointermove", onTouchMove, true);
    mount.removeEventListener("pointerup", onTouchUp, true);
    mount.removeEventListener("pointercancel", onTouchUp, true);
    resetTouch();
  };
}

function createSurveyHint(mount) {
  const hint = document.createElement("div");
  hint.className = "jaw-preview-survey-hint";
  // Desktop-only, so the wording can assume a mouse and keyboard.
  hint.innerHTML =
    '<span class="jaw-preview-survey-hint-jaw"></span>' +
    "<span>Drag to swing the placement arrow &middot; right-drag to rotate the jaw &middot; press <b>SET</b>." +
    " <span class='jaw-preview-survey-hint-esc'>Esc to cancel</span></span>";
  mount.appendChild(hint);
  return hint;
}

function enterSurveyAiming(jaw, btn) {
  const root = preview3DState.modelRoot;
  const mount = preview3DState.mount;
  if (!root || !mount || !THREE) return;

  // Only one jaw can be armed; re-arming switches target.
  if (preview3DState.surveyAiming) exitSurveyAiming();

  const metrics = surveyTargetMetrics(jaw);
  if (!metrics) {
    toast?.error?.(`No ${jaw} jaw loaded to survey.`);
    return;
  }

  // Seed from the saved angle, else from the current camera direction.
  const saved = savedSurveyDirectionForJaw(preview3DState.caseData, jaw);
  const seedLocal = new THREE.Vector3(...(saved || getCameraSurveyDirection()));
  const rootQuat = new THREE.Quaternion();
  root.getWorldQuaternion(rootQuat);
  // Both seeds are model-frame; the aim direction is tracked in world space.
  const seedWorld = seedLocal.applyQuaternion(rootQuat).normalize();

  const arrow = createSurveyPlacementArrow(metrics.radius);
  root.add(arrow);
  preview3DState.surveyArrow = arrow;
  preview3DState.surveyRayLight = createSurveyRayLight(metrics, root);
  setSurveyShadowsEnabled(true, jaw);
  preview3DState.surveyAiming = {
    jaw,
    btn,
    metrics,
    dir: seedWorld.clone(),
    aimDirty: true,
  };

  // LEFT drags the arrow; jaw rotate moves to RIGHT. TrackballControls hard-wires
  // its LEFT slot to rotate, so point that slot at button 2 and unmap RIGHT.
  const controls = preview3DState.controls;
  if (controls) {
    controls.noRotate = false;
    controls.mouseButtons = { LEFT: 2, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: -1 };
  }
  preview3DState.surveyDragCleanup = attachSurveyAimDrag();
  mount.classList.add("is-aiming-survey");

  if (btn) {
    btn.textContent = "SET";
    btn.classList.add("is-aiming");
    btn.title = "Confirm this placement direction and survey the jaw";
  }
  setSurveyCancelState(jaw, { visible: true, disabled: false });

  // Focus the stage: maximize the panel and show only the armed jaw.
  // Restored on cancel/Esc; kept after a successful SET.
  preview3DState.surveyPrevVisibility = {
    upper: preview3DState.groups?.upper?.visible,
    lower: preview3DState.groups?.lower?.visible,
  };
  setSurveyJawVisible(jaw, true);
  setSurveyJawVisible(jaw === "upper" ? "lower" : "upper", false);
  const shell = document.querySelector(".annotation-shell");
  if (shell && !shell.classList.contains("preview-maximized")) {
    // Route through the maximize button so 2DAnnotation.js owns panel-mode state.
    document.getElementById("preview3dMaximizeBtn")?.click();
    preview3DState.surveyAutoMaximized = true;
  }
  // Lock out the other jaw while aiming.
  const otherRow = jaw === "upper" ? "rowLower" : "rowUpper";
  preview3DState.topControls?.[otherRow]?.surveyBtn?.setAttribute("disabled", "true");

  // The instruction bubble is desktop-only (on a phone it covers a third of the viewport).
  if (!window.matchMedia?.("(pointer: coarse)")?.matches) {
    const hint = preview3DState.surveyHint || createSurveyHint(mount);
    hint.querySelector(".jaw-preview-survey-hint-jaw").textContent =
      jaw === "upper" ? "UPPER" : "LOWER";
    hint.classList.add("is-on");
    preview3DState.surveyHint = hint;
  }

  preview3DState.surveyKeyHandler = (e) => {
    if (e.key === "Escape") exitSurveyAiming();
  };
  window.addEventListener("keydown", preview3DState.surveyKeyHandler);

  updateSurveyPlacementArrow();
}

export function exitSurveyAiming({ preserveStage = false } = {}) {
  const aiming = preview3DState.surveyAiming;
  const arrow = preview3DState.surveyArrow;

  if (arrow) {
    arrow.parent?.remove(arrow);
    arrow.traverse((obj) => obj.geometry?.dispose?.());
    arrow.userData.surveyArrowMaterial?.dispose?.();
    arrow.userData.surveyBeamMaterial?.dispose?.();
  }
  preview3DState.surveyArrow = null;

  const rayLight = preview3DState.surveyRayLight;
  if (rayLight) {
    rayLight.userData.surveyRayTarget?.parent?.remove(rayLight.userData.surveyRayTarget);
    rayLight.parent?.remove(rayLight);
    rayLight.shadow?.map?.dispose?.();
    rayLight.dispose?.();
  }
  preview3DState.surveyRayLight = null;
  setSurveyShadowsEnabled(false);

  // Restore the default button map and drop the aim listeners.
  if (preview3DState.controls) {
    preview3DState.controls.noRotate = false;
    preview3DState.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
  preview3DState.surveyDragCleanup?.();
  preview3DState.surveyDragCleanup = null;
  preview3DState.mount?.classList.remove("is-aiming-survey");

  if (aiming?.btn) {
    aiming.btn.textContent = "SET SURVEY ANGLE";
    aiming.btn.classList.remove("is-aiming");
    aiming.btn.removeAttribute("title");
  }
  preview3DState.topControls?.rowUpper?.surveyBtn?.removeAttribute("disabled");
  preview3DState.topControls?.rowLower?.surveyBtn?.removeAttribute("disabled");
  for (const key of ["rowUpper", "rowLower"]) {
    const cancel = preview3DState.topControls?.[key]?.cancelBtn;
    if (cancel) {
      cancel.classList.remove("is-on");
      cancel.disabled = false;
    }
  }

  // Cancel/Esc restores the stage; a successful SET keeps the maximized view.
  const prevVis = preview3DState.surveyPrevVisibility;
  if (!preserveStage && prevVis) {
    if (prevVis.upper !== undefined) setSurveyJawVisible("upper", !!prevVis.upper);
    if (prevVis.lower !== undefined) setSurveyJawVisible("lower", !!prevVis.lower);
  }
  preview3DState.surveyPrevVisibility = null;
  if (!preserveStage && preview3DState.surveyAutoMaximized) {
    const shell = document.querySelector(".annotation-shell");
    if (shell?.classList.contains("preview-maximized")) {
      document.getElementById("preview3dMaximizeBtn")?.click();
    }
  }
  preview3DState.surveyAutoMaximized = false;

  preview3DState.surveyHint?.classList.remove("is-on");

  if (preview3DState.surveyKeyHandler) {
    window.removeEventListener("keydown", preview3DState.surveyKeyHandler);
    preview3DState.surveyKeyHandler = null;
  }
  preview3DState.surveyAiming = null;
}

// Two-step control: first click arms the jaw, second (labelled SET) commits.
export function handleSurveyButtonClick(jaw, btn) {
  if (preview3DState.surveyAiming?.jaw === jaw) {
    // Lock cancel out during save so it can't null the aim mid-read.
    setSurveyCancelState(jaw, { disabled: true });
    saveSurveyAngle(jaw, btn);
    return;
  }
  enterSurveyAiming(jaw, btn);
}

function setSurveyJawVisible(jaw, visible) {
  const group = preview3DState.groups?.[jaw];
  if (!group) return;
  group.visible = visible;
  const rowKey = jaw === "upper" ? "rowUpper" : "rowLower";
  preview3DState.topControls?.[rowKey]?.row?.classList.toggle("is-hidden-jaw", !visible);
}

// Show/hide + enable/disable the per-jaw CANCEL buttons beside SET.
function setSurveyCancelState(jaw, { visible, disabled } = {}) {
  for (const key of ["rowUpper", "rowLower"]) {
    const btn = preview3DState.topControls?.[key]?.cancelBtn;
    if (!btn) continue;
    const isArmedRow = jaw === (key === "rowUpper" ? "upper" : "lower");
    if (visible !== undefined) btn.classList.toggle("is-on", visible && isArmedRow);
    if (disabled !== undefined) btn.disabled = disabled && isArmedRow;
  }
}

async function saveSurveyAngle(jaw, btn) {
  const camera = preview3DState.camera;
  const controls = preview3DState.controls;
  if (!camera || !controls || !state.caseIntID) return;

  // Capture the aim before any awaits so a slow read can't pick up a moved arrow.
  // Survey what the arrow points at; fall back to the camera direction.
  const aimWorld = surveyAimWorldDirection() || getWorldSurveyDirection();
  const worldVec = aimWorld ? aimWorld.clone().normalize() : new THREE.Vector3(0, 1, 0);
  // The DLL consumes the aim in the mesh's local frame.
  const surveyDirection = worldToLocalSurveyDirection(worldVec) || getCameraSurveyDirection();
  // Store desktop's encoding: un-apply the per-jaw flip.
  const [x, y, z] = desktopSurveyFlip(jaw, surveyDirection);

  // btn may currently read "SET" (aiming mode).
  if (btn) {
    btn.disabled = true;
    btn.textContent = "SAVING…";
  }

  // PUT /case/:id below replaces the whole row, so read it fresh (the cached copy
  // can be stale or from a failed request) and abort rather than write defaults:
  // a payload without the real case_id renames the case to "" — the case list then
  // shows "N/A" — and stale values would clobber the other jaw's saved angles.
  const fresh = await fetchCaseData({ force: true });
  if (fresh?.case_id) preview3DState.caseData = fresh;
  const current = preview3DState.caseData;
  if (!current?.case_id) {
    console.warn("[preview3D] survey angle not saved: case row unavailable", current);
    toast?.error?.("Couldn't read this case's details — survey angle not saved.");
    // Stay armed so the aim isn't lost; re-enable the cancel the click disabled.
    setSurveyCancelState(jaw, { disabled: false });
    if (btn) {
      btn.disabled = false;
      btn.textContent = "SET";
    }
    return;
  }
  const updated = { ...current };
  if (jaw === "upper") {
    updated.upper_insertion_angle_x = x;
    updated.upper_insertion_angle_y = y;
    updated.upper_insertion_angle_z = z;
  } else {
    updated.lower_insertion_angle_x = x;
    updated.lower_insertion_angle_y = y;
    updated.lower_insertion_angle_z = z;
  }

  const user = getLoggedInUser();
  const uuid = user?.uuid || PREVIEW_FALLBACK_UUID;
  const auth = {
    machine_id: PREVIEW_MACHINE_ID,
    uuid,
    caseIntID: state.caseIntID,
  };
  const caseBody = {
    // The case's name. Never defaulted — an empty string here wipes it (guarded above).
    case_id: updated.case_id,
    upper_insertion_angle_x: Number(updated.upper_insertion_angle_x) || 0,
    upper_insertion_angle_y: Number(updated.upper_insertion_angle_y) || 0,
    upper_insertion_angle_z: Number(updated.upper_insertion_angle_z) || 0,
    lower_insertion_angle_x: Number(updated.lower_insertion_angle_x) || 0,
    lower_insertion_angle_y: Number(updated.lower_insertion_angle_y) || 0,
    lower_insertion_angle_z: Number(updated.lower_insertion_angle_z) || 0,
    process_upper: Number(updated.process_upper) || 0,
    process_lower: Number(updated.process_lower) || 0,
  };

  const path = `/case/${state.caseIntID}`;
  if (btn) btn.textContent = "SURVEYING...";
  const t0 = performance.now();
  try {
    const res = await fetch(`${SMARTRPD_API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([auth, caseBody]),
    });
    const dt = Math.round(performance.now() - t0);
    const tag = res.ok ? "✓" : "✕";
    console.log(`[preview3D] ${tag} PUT ${path} status=${res.status} ${dt}ms`);
    if (!res.ok) {
      // A rejected write (an expired session 401s here) must not look like a save.
      toast?.error?.(`Survey angle not saved (HTTP ${res.status}).`);
      return;
    }
    preview3DState.caseData = updated;

    if (btn) btn.textContent = "COMPUTING...";
    const dllResult = await computeSurveyingNoPdForJaw(jaw, surveyDirection);
    const dllSurface = buildDllUndercutSurface(jaw, dllResult);
    if (!dllSurface) {
      throw new Error("DLL response did not include full surveying values");
    }

    const nextUndercut = {
      ...(preview3DState.undercut || {}),
      [jaw]: dllSurface,
    };
    await applySurveyUndercutToPreview(nextUndercut);
    // Reveal the heatmap — the point of the angle is seeing the undercuts.
    setHeatmapEnabled(true);
    toast?.success?.(`${jaw === "upper" ? "Upper" : "Lower"} survey angle applied.`);
  } catch (err) {
    console.error(`[preview3D] ✕ PUT ${path} failed`, err);
    toast?.error?.(`Survey angle failed. ${err.message || err}`);
  } finally {
    // Drops the placement arrow and resets the button back to SET SURVEY ANGLE.
    exitSurveyAiming({ preserveStage: true });
    if (btn) {
      btn.disabled = false;
      btn.textContent = "SET SURVEY ANGLE";
    }
  }
}

async function computeSurveyingNoPdForJaw(jaw, direction) {
  if (!state.caseIntID) throw new Error("Case ID unavailable");
  const user = getLoggedInUser();
  const uuid = user?.uuid || PREVIEW_FALLBACK_UUID;
  console.log("[preview3D] surveying direction request", {
    jaw,
    case_id: state.caseIntID,
    type: getJawDbType(jaw),
    direction,
  });
  const body = [
    {
      machine_id: PREVIEW_MACHINE_ID,
      uuid,
      caseIntID: state.caseIntID,
    },
    {
      case_id: state.caseIntID,
      type: getJawDbType(jaw),
      dir: direction,
      printFullSurveying: true,
      returnSurveyingBase64: true,
    },
  ];

  const path = "/dll/compute-surveying-no-pd";
  const t0 = performance.now();
  const res = await fetch(`${SMARTRPD_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const dt = Math.round(performance.now() - t0);
  const tag = res.ok ? "✓" : "✕";
  console.log(`[preview3D] ${tag} POST ${path} (${jaw}) status=${res.status} ${dt}ms`);

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(json?.details || json?.error || `DLL surveying request failed with status ${res.status}`);
  }
  return json;
}

export async function autoApplySavedSurveyAngles() {
  if (!state.caseIntID) return;
  if (!preview3DState.caseData) {
    preview3DState.caseData = await fetchCaseData();
  }

  const caseData = preview3DState.caseData;
  if (!caseData) return;

  for (const jaw of ["upper", "lower"]) {
    if (!preview3DState.groups[jaw]) {
      console.log("[preview3D] saved survey auto-apply skipped: jaw mesh not loaded", {
        jaw,
        case_id: state.caseIntID,
      });
      continue;
    }

    const direction = savedSurveyDirectionForJaw(caseData, jaw);
    if (!direction) {
      console.log("[preview3D] saved survey auto-apply skipped: insertion angles missing", {
        jaw,
        case_id: state.caseIntID,
        upper: {
          x: caseData.upper_insertion_angle_x,
          y: caseData.upper_insertion_angle_y,
          z: caseData.upper_insertion_angle_z,
        },
        lower: {
          x: caseData.lower_insertion_angle_x,
          y: caseData.lower_insertion_angle_y,
          z: caseData.lower_insertion_angle_z,
        },
      });
      continue;
    }

    console.log("[preview3D] auto-applying saved survey direction", {
      jaw,
      case_id: state.caseIntID,
      direction,
    });

    const dllResult = await computeSurveyingNoPdForJaw(jaw, direction);
    const dllSurface = buildDllUndercutSurface(jaw, dllResult);
    if (!dllSurface) continue;

    const nextUndercut = {
      ...(preview3DState.undercut || {}),
      [jaw]: dllSurface,
    };
    await applySurveyUndercutToPreview(nextUndercut);
    // Auto-open the heatmap so the case lands on the undercut view.
    setHeatmapEnabled(true);
  }
}

function getJawDbType(jaw) {
  return jaw === "upper" ? 1 : 2;
}

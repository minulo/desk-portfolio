import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * "Enchantment" for clickable objects: a faint glint that drifts over their
 * surface all the time, and brightens when the pointer is on them. It tells
 * visitors what can be clicked.
 *
 * It works on any model: every mesh under an object's `lift` group gets a
 * second, see-through copy that draws only the moving bands of light. The
 * pattern is generated in the shader from world position, so it has the same
 * scale on every object and needs no textures or UV maps.
 */

const VERT = /* glsl */ `
varying vec3 vWorld;

void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vWorld;

void main() {
  // Thin diagonal streaks of light sliding across the surface: one slow, wide
  // set and one finer set moving the other way, both bent by a slow wave.
  vec3 p = vWorld * 30.0;
  float along = p.x * 0.9 + p.y * 1.2 + p.z * 0.7;
  float across = p.x * 0.7 - p.y * 0.3 + p.z * 1.1;
  float bend = sin(across * 0.55 + uTime * 0.35) * 0.7;
  float a = sin(along + bend - uTime * 1.5);
  float b = sin(along * 2.3 - bend * 1.3 + uTime * 0.9 + 1.7);
  float g1 = smoothstep(0.88, 1.0, a);
  float g2 = smoothstep(0.94, 1.0, b);
  vec3 colour = uColorA * g1 + uColorB * g2 * 0.6;
  // Far objects need the full effect to be noticed; up close the same streaks
  // fill the screen, so they fade as the camera nears.
  float near = clamp(distance(cameraPosition, vWorld) / 2.4, 0.3, 1.0);
  gl_FragColor = vec4(colour * uStrength * near, 1.0);
  #include <colorspace_fragment>
}
`;

const IDLE = 0.1;    // always on, deliberately faint
const HOVER = 0.34;  // under the pointer

/**
 * @param holders  the clickable objects
 * @param soft     true where there is no bloom or tone mapping (phones): the same
 *                 values look much harsher there, so everything is scaled down
 */
export function createEnchantment(holders, { soft = false } = {}) {
  const k = soft ? 0.3 : 1;
  const time = { value: 0 };
  const byHolder = new Map();

  for (const holder of holders) {
    const lift = holder.getObjectByName('lift');
    if (!lift) continue;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: time,
        uStrength: { value: IDLE * k },
        uColorA: { value: new THREE.Color(0.52, 0.5, 1.0) },   // violet-blue
        uColorB: { value: new THREE.Color(1.0, 0.72, 0.5) },   // warm
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      // Pull the copy a hair toward the camera so it never flickers against the surface.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });

    const meshes = [];
    lift.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      let overlay;
      if (mesh.isInstancedMesh) {
        overlay = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
        overlay.instanceMatrix = mesh.instanceMatrix;
      } else {
        overlay = new THREE.Mesh(mesh.geometry, material);
      }
      overlay.name = 'glint';
      overlay.castShadow = false;
      overlay.receiveShadow = false;
      overlay.raycast = () => {};
      overlay.renderOrder = 5;
      mesh.add(overlay);
    }
    byHolder.set(holder, material);
  }

  return {
    setTime(seconds) { time.value = seconds; },
    /** Brighten one object's glint (or none), easing the others back to idle. */
    setHover(holder, { animate = true, onUpdate } = {}) {
      for (const [h, material] of byHolder) {
        const goal = (h === holder ? HOVER : IDLE) * k;
        const u = material.uniforms.uStrength;
        gsap.killTweensOf(u);
        if (animate) gsap.to(u, { value: goal, duration: 0.45, ease: 'power2.out', onUpdate });
        else u.value = goal;
      }
      if (!animate) onUpdate?.();
    },
  };
}

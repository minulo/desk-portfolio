import * as THREE from 'three';
import { buildShapes } from './shapes.js';

/**
 * The centrepiece: a swarm of light particles that hovers over the desk.
 * At every stop it settles into a shape (see `swarm` in scene.config.js); between
 * stops each particle flies on its own delay, so the swarm streams like a comet
 * and re-forms. All motion happens in the vertex shader: the CPU only updates a
 * handful of uniforms per frame.
 */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uMix;
uniform float uAssemble;
uniform float uProj;        // pixels per metre at 1 m distance
uniform float uSize;
uniform vec3 uPosA;
uniform vec3 uPosB;
uniform float uScaleA;
uniform float uScaleB;
uniform vec4 uFaceA;        // yaw, pitch, roll speed, twirl speed
uniform vec4 uFaceB;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform vec3 uCool;
uniform vec3 uWarm;
uniform float uAlpha;
uniform float uGainA;
uniform float uGainB;

attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aRand;

varying vec3 vColor;
varying float vAlpha;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

vec3 orient(vec3 p, vec4 face) {
  p = rotZ(p, uTime * face.z);
  p = rotY(p, uTime * face.w);
  p = rotX(p, -face.y);
  return rotY(p, face.x + sin(uTime * 0.45) * 0.22);
}

void main() {
  // Each particle leaves and arrives on its own schedule.
  float t = clamp((uMix - aRand.x * 0.4) / 0.6, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);

  vec3 a = uPosA + orient(aA, uFaceA) * uScaleA;
  vec3 b = uPosB + orient(aB, uFaceB) * uScaleB;
  vec3 p = mix(a, b, t);
  float scale = mix(uScaleA, uScaleB, t);

  // In flight: arc upward and scatter, proportional to the distance travelled.
  float mid = sin(t * 3.14159265);
  float dist = length(uPosB - uPosA);
  vec3 turb = vec3(
    sin(aRand.y * 43.0 + uTime * 1.3),
    cos(aRand.z * 37.0 + uTime * 1.1),
    sin(aRand.w * 31.0 + uTime * 0.9));
  p += turb * mid * (0.03 + dist * 0.1);
  p.y += mid * dist * 0.14;

  // At rest: a slow shimmer so the shape feels alive.
  p += vec3(
    sin(uTime * 0.9 + aRand.y * 6.2832),
    sin(uTime * 1.1 + aRand.z * 6.2832),
    cos(uTime * 0.8 + aRand.w * 6.2832)) * 0.028 * scale;

  // Intro: gather from dust spread across the room.
  vec3 dust = vec3((aRand.y - 0.5) * 6.0, 0.25 + aRand.z * 2.7, (aRand.w - 0.5) * 4.5 + 0.6);
  float g = clamp((uAssemble - aRand.x * 0.45) / 0.55, 0.0, 1.0);
  g = 1.0 - pow(1.0 - g, 3.0);
  p = mix(dust, p, g);

  // The pointer pushes particles aside.
  vec3 away = p - uPointer;
  float d = length(away);
  float radius = scale * 0.85;
  float push = pow(max(0.0, 1.0 - d / radius), 2.0) * uPointerStrength;
  p += normalize(away + 1e-5) * push * radius * 0.6;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float sizeJitter = 0.55 + aRand.x * 0.9;
  float px = uSize * scale * sizeJitter * uProj / max(0.05, -mv.z);
  gl_PointSize = clamp(px, 1.5, 28.0);

  float k = smoothstep(-0.7, 0.7, mix(aA.y, aB.y, t) + (aRand.z - 0.5) * 0.9);
  vColor = mix(uWarm, uCool, k);

  // Thousands of additive sprites overlap, so each one is faint. Particles that
  // are spread out (in flight, as intro dust, pushed by the pointer) get a boost
  // because far fewer of them overlap.
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.2 + aRand.z * 3.0) + aRand.w * 6.2832);
  float spread = 1.0 + mid * 3.5 + (1.0 - g) * 3.0 + push * 1.0;
  vAlpha = uAlpha * mix(uGainA, uGainB, t) * twinkle * spread;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.4);
  gl_FragColor = vec4(vColor, a * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export async function createSwarm({ stops, count, bloom = true }) {
  const defs = stops.map((s) => s.swarm);
  const shapes = await buildShapes(defs, count);
  const attrs = shapes.map((arr) => new THREE.BufferAttribute(arr, 3));
  const n = stops.length;

  // Where each shape sits and which way it faces (toward that stop's camera).
  const anchors = stops.map((s) => new THREE.Vector3(...s.swarm.at));
  const faces = stops.map((s, i) => {
    const cam = new THREE.Vector3(...s.camera);
    const d = cam.sub(anchors[i]);
    const yaw = Math.atan2(d.x, d.z);
    const pitch = s.swarm.shape === 'helix' ? 0 : Math.atan2(d.y, Math.hypot(d.x, d.z));
    const [roll = 0, twirl = 0] = s.swarm.spin ?? [];
    return new THREE.Vector4(yaw, pitch, roll, twirl);
  });

  // Sparse shapes need brighter particles than dense ones to read equally well.
  const defaultGain = { knot: 2.0, helix: 1.5, sphere: 1.6, text: 1.0 };
  const gains = defs.map((d) => d.glow ?? defaultGain[d.shape] ?? 1);

  const rand = new Float32Array(count * 4);
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', attrs[0]);
  geometry.setAttribute('aA', attrs[0]);
  geometry.setAttribute('aB', attrs[Math.min(1, n - 1)]);
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uTime: { value: 0 },
    uMix: { value: 0 },
    uAssemble: { value: 1 },
    uProj: { value: 1000 },
    uSize: { value: 0.027 },
    // Fewer particles are each a little brighter. Without bloom, overlaps clip to
    // white sooner, so the boost is smaller there.
    uAlpha: { value: 0.2 * Math.min(bloom ? 2.5 : 1.7, 18000 / count) },
    uGainA: { value: gains[0] },
    uGainB: { value: gains[Math.min(1, n - 1)] },
    uPosA: { value: anchors[0].clone() },
    uPosB: { value: anchors[Math.min(1, n - 1)].clone() },
    uScaleA: { value: defs[0].size },
    uScaleB: { value: defs[Math.min(1, n - 1)].size },
    uFaceA: { value: faces[0].clone() },
    uFaceB: { value: faces[Math.min(1, n - 1)].clone() },
    uPointer: { value: new THREE.Vector3(0, -100, 0) },
    uPointerStrength: { value: 0 },
    uCool: { value: new THREE.Color(0.36, 0.5, 1.0) },
    uWarm: { value: new THREE.Color(1.0, 0.5, 0.2) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // With bloom the whole frame is tone mapped at the end. Without it, tone mapping
    // each sprite separately would grey the colours out, so sprites skip it.
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // positions are computed in the shader
  points.renderOrder = 10;
  points.raycast = () => {};

  // The swarm casts its own light on whatever it hovers over.
  const light = new THREE.PointLight(0x9db0ff, 0.22, 1.6, 2);
  light.position.copy(anchors[0]);

  const center = anchors[0].clone();
  let segment = -1;

  function setSegment(i) {
    if (i === segment) return;
    segment = i;
    const j = Math.min(i + 1, n - 1);
    geometry.setAttribute('aA', attrs[i]);
    geometry.setAttribute('aB', attrs[j]);
    uniforms.uPosA.value.copy(anchors[i]);
    uniforms.uPosB.value.copy(anchors[j]);
    uniforms.uScaleA.value = defs[i].size;
    uniforms.uScaleB.value = defs[j].size;
    uniforms.uFaceA.value.copy(faces[i]);
    uniforms.uFaceB.value.copy(faces[j]);
    uniforms.uGainA.value = gains[i];
    uniforms.uGainB.value = gains[j];
  }

  return {
    points,
    light,
    center,
    get radius() {
      return THREE.MathUtils.lerp(uniforms.uScaleA.value, uniforms.uScaleB.value, uniforms.uMix.value);
    },
    /** f runs from 0 (first stop) to n-1 (last stop); fractions are in-between flights. */
    setProgress(f) {
      const clamped = THREE.MathUtils.clamp(f, 0, n - 1);
      const i = Math.min(Math.floor(clamped), Math.max(n - 2, 0));
      setSegment(i);
      const m = clamped - i;
      uniforms.uMix.value = m;
      center.lerpVectors(uniforms.uPosA.value, uniforms.uPosB.value, m);
      center.y += Math.sin(m * Math.PI) * uniforms.uPosA.value.distanceTo(uniforms.uPosB.value) * 0.14;
      light.position.copy(center);
    },
    setTime(seconds) {
      uniforms.uTime.value = seconds;
      light.intensity = 0.22 + Math.sin(seconds * 1.7) * 0.025;
    },
    setAssemble(v) { uniforms.uAssemble.value = v; },
    setPointer(point, strength) {
      if (point) uniforms.uPointer.value.copy(point);
      uniforms.uPointerStrength.value = strength;
    },
    /** Call on resize: viewport height in device pixels and the camera's vertical FOV. */
    setProjection(heightPx, fovDeg) {
      uniforms.uProj.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    },
  };
}

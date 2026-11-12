import * as THREE from 'three';
import { buildShapes } from './shapes.js';
import { tech } from '../config/tech.js';

/**
 * The centrepiece: a swarm of light particles that hovers over the desk, "the
 * daemon". At every stop it settles into the logos of the technologies listed
 * for that stop (see `swarm` in scene.config.js), changing from one to the next
 * every few seconds. Between stops each particle flies on its own delay, so the
 * swarm streams like a comet and re-forms. All motion happens in the vertex
 * shader: the CPU only updates a handful of uniforms per frame.
 */

const HOLD_SECONDS = 3.4;   // how long a logo stays before changing
const MORPH_SECONDS = 1.5;  // how long the change takes

const VERT = /* glsl */ `
uniform float uTime;
uniform float uMix;
uniform float uCycA;        // 0..1 change from the current to the next shape at stop A
uniform float uCycB;
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
attribute vec3 aA2;
attribute vec3 aB;
attribute vec3 aB2;
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
  return rotY(p, face.x + sin(uTime * 0.45) * 0.2);
}

// Each particle leaves and arrives on its own schedule.
float stagger(float u, float r) {
  float t = clamp((u - r * 0.4) / 0.6, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  float t = stagger(uMix, aRand.x);
  float ca = stagger(uCycA, aRand.w);
  float cb = stagger(uCycB, aRand.w);

  vec3 localA = mix(aA, aA2, ca);
  vec3 localB = mix(aB, aB2, cb);
  vec3 a = uPosA + orient(localA, uFaceA) * uScaleA;
  vec3 b = uPosB + orient(localB, uFaceB) * uScaleB;
  vec3 p = mix(a, b, t);
  float scale = mix(uScaleA, uScaleB, t);

  vec3 turb = vec3(
    sin(aRand.y * 43.0 + uTime * 1.3),
    cos(aRand.z * 37.0 + uTime * 1.1),
    sin(aRand.w * 31.0 + uTime * 0.9));

  // In flight between stops: arc upward and scatter, proportional to the distance.
  float mid = sin(t * 3.14159265);
  float dist = length(uPosB - uPosA);
  p += turb * mid * (0.03 + dist * 0.1);
  p.y += mid * dist * 0.14;

  // Changing shape in place: a brief swirl.
  float swirl = sin(mix(ca, cb, t) * 3.14159265);
  p += turb * swirl * scale * 0.32;

  // At rest: a slow shimmer so the shape feels alive.
  p += vec3(
    sin(uTime * 0.9 + aRand.y * 6.2832),
    sin(uTime * 1.1 + aRand.z * 6.2832),
    cos(uTime * 0.8 + aRand.w * 6.2832)) * 0.022 * scale;

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

  float k = smoothstep(-0.7, 0.7, mix(localA.y, localB.y, t) + (aRand.z - 0.5) * 0.9);
  vColor = mix(uWarm, uCool, k);

  // Thousands of additive sprites overlap, so each one is faint. Particles that
  // are spread out (in flight, mid-change, as intro dust, pushed by the pointer)
  // get a boost because far fewer of them overlap.
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.2 + aRand.z * 3.0) + aRand.w * 6.2832);
  float spread = 1.0 + mid * 3.5 + swirl * 0.8 + (1.0 - g) * 3.0 + push * 1.0;
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

// Sparse procedural shapes need brighter particles than dense ones to read equally well.
const SHAPE_GAIN = { knot: 2.0, helix: 1.5, sphere: 1.6 };

/** A stop's `swarm` entry lists technologies by key, or gives one shape directly. */
function shapeDefs(swarm) {
  if (Array.isArray(swarm.tech) && swarm.tech.length) {
    return swarm.tech.map((key) => {
      const def = tech[key];
      if (!def) console.warn(`[swarm] unknown technology "${key}" in scene.config.js`);
      return def ?? { label: key, shape: 'sphere' };
    });
  }
  return [{ label: swarm.label ?? '', ...swarm }];
}

export async function createSwarm({ stops, count, bloom = true, onLabel }) {
  const n = stops.length;
  const defsByStop = stops.map((s) => shapeDefs(s.swarm));

  // Build every shape once, then group them back by stop.
  const flat = await buildShapes(defsByStop.flat(), count);
  let cursor = 0;
  const shapes = defsByStop.map((defs) => defs.map((def) => {
    const points = flat[cursor++];
    const gain = def.glow
      ?? SHAPE_GAIN[def.shape]
      ?? (points.fill ? THREE.MathUtils.clamp(Math.pow(points.fill / 0.38, 0.5), 0.75, 1.4) : 1);
    return { label: def.label ?? '', attr: new THREE.BufferAttribute(points, 3), gain };
  }));

  // Where each stop's shapes sit and which way they face (toward that stop's camera).
  const anchors = stops.map((s) => new THREE.Vector3(...s.swarm.at));
  const sizes = stops.map((s) => s.swarm.size);
  const faces = stops.map((s, i) => {
    const d = new THREE.Vector3(...s.camera).sub(anchors[i]);
    const yaw = Math.atan2(d.x, d.z);
    const pitch = s.swarm.shape === 'helix' ? 0 : Math.atan2(d.y, Math.hypot(d.x, d.z));
    const [roll = 0, twirl = 0] = s.swarm.spin ?? [];
    return new THREE.Vector4(yaw, pitch, roll, twirl);
  });

  // Which shape each stop currently shows, and the change in progress (if any).
  const state = stops.map((_, i) => ({ cur: 0, next: shapes[i].length > 1 ? 1 : 0, t: 0, clock: 0, morphing: false }));

  const rand = new Float32Array(count * 4);
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', shapes[0][0].attr);
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uTime: { value: 0 },
    uMix: { value: 0 },
    uCycA: { value: 0 },
    uCycB: { value: 0 },
    uAssemble: { value: 1 },
    uProj: { value: 1000 },
    uSize: { value: 0.027 },
    // Fewer particles are each a little brighter. Without bloom, overlaps clip to
    // white sooner, so the boost is smaller there.
    uAlpha: { value: 0.2 * Math.min(bloom ? 2.5 : 2.1, 18000 / count) },
    uGainA: { value: 1 },
    uGainB: { value: 1 },
    uPosA: { value: new THREE.Vector3() },
    uPosB: { value: new THREE.Vector3() },
    uScaleA: { value: 1 },
    uScaleB: { value: 1 },
    uFaceA: { value: new THREE.Vector4() },
    uFaceB: { value: new THREE.Vector4() },
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
  let segment = 0;
  let resting = 0;        // stop the swarm is settled at, or -1 while in flight
  let lastTime = null;
  let shownLabel = null;

  // Point the four shape slots at the right buffers for the current pair of stops.
  function bind() {
    const i = segment;
    const j = Math.min(i + 1, n - 1);
    geometry.setAttribute('aA', shapes[i][state[i].cur].attr);
    geometry.setAttribute('aA2', shapes[i][state[i].next].attr);
    geometry.setAttribute('aB', shapes[j][state[j].cur].attr);
    geometry.setAttribute('aB2', shapes[j][state[j].next].attr);
    uniforms.uPosA.value.copy(anchors[i]);
    uniforms.uPosB.value.copy(anchors[j]);
    uniforms.uScaleA.value = sizes[i];
    uniforms.uScaleB.value = sizes[j];
    uniforms.uFaceA.value.copy(faces[i]);
    uniforms.uFaceB.value.copy(faces[j]);
  }

  function syncCycleUniforms() {
    const i = segment;
    const j = Math.min(i + 1, n - 1);
    const gain = (k) => THREE.MathUtils.lerp(shapes[k][state[k].cur].gain, shapes[k][state[k].next].gain, state[k].t);
    uniforms.uCycA.value = state[i].t;
    uniforms.uCycB.value = state[j].t;
    uniforms.uGainA.value = gain(i);
    uniforms.uGainB.value = gain(j);
  }

  function announce() {
    let label = '';
    // No name while flying between stops or while the intro dust is still gathering.
    if (resting >= 0 && uniforms.uAssemble.value >= 1) {
      const s = state[resting];
      label = shapes[resting][s.morphing ? s.next : s.cur].label;
    }
    if (label === shownLabel) return;
    shownLabel = label;
    onLabel?.(label);
  }

  bind();
  syncCycleUniforms();

  return {
    points,
    light,
    center,
    /** Stop index the swarm is settled at, or -1 while it is flying between stops. */
    get resting() { return resting; },
    get radius() {
      return THREE.MathUtils.lerp(uniforms.uScaleA.value, uniforms.uScaleB.value, uniforms.uMix.value);
    },
    /** f runs from 0 (first stop) to n-1 (last stop); fractions are in-between flights. */
    setProgress(f) {
      const clamped = THREE.MathUtils.clamp(f, 0, n - 1);
      const i = Math.min(Math.floor(clamped), Math.max(n - 2, 0));
      if (i !== segment) {
        segment = i;
        bind();
      }
      const m = clamped - i;
      uniforms.uMix.value = m;
      resting = m < 0.02 ? i : m > 0.98 ? Math.min(i + 1, n - 1) : -1;
      center.lerpVectors(uniforms.uPosA.value, uniforms.uPosB.value, m);
      center.y += Math.sin(m * Math.PI) * uniforms.uPosA.value.distanceTo(uniforms.uPosB.value) * 0.14;
      light.position.copy(center);
      syncCycleUniforms();
      announce();
    },
    /** Advance the animation clock. Also steps the logo change at the resting stop. */
    setTime(seconds) {
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, seconds - lastTime));
      lastTime = seconds;
      uniforms.uTime.value = seconds;
      light.intensity = 0.22 + Math.sin(seconds * 1.7) * 0.025;

      if (resting < 0 || shapes[resting].length < 2 || uniforms.uAssemble.value < 1) return;
      const s = state[resting];
      s.clock += dt;
      if (!s.morphing) {
        if (s.clock >= HOLD_SECONDS) {
          s.morphing = true;
          s.clock = 0;
          announce();
        }
      } else {
        s.t = Math.min(1, s.clock / MORPH_SECONDS);
        if (s.t >= 1) {
          s.cur = s.next;
          s.next = (s.cur + 1) % shapes[resting].length;
          s.t = 0;
          s.clock = 0;
          s.morphing = false;
          bind();
        }
      }
      syncCycleUniforms();
    },
    setAssemble(v) {
      uniforms.uAssemble.value = v;
      if (v >= 1) announce();
    },
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

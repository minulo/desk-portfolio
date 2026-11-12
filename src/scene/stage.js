import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DESK_TOP } from '../config/scene.config.js';

/**
 * "After hours": the desk at night. A warm lamp, the cool glow of the monitor,
 * and city lights out of focus behind the window.
 *
 * `lite` = phones / low-power devices: no shadows and no post-processing.
 */

const NIGHT = 0x07080d;
const WALL_Z = -0.56;
const WINDOW = { x0: -1.35, x1: 1.35, y0: 1.02, y1: 2.3 };

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** A thin cylinder between two points. */
function rod(a, b, radius, material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 14), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Out-of-focus city lights, painted once onto a canvas. */
function cityTexture() {
  const W = 2048, H = 820;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#03040a');
  sky.addColorStop(0.5, '#070b1a');
  sky.addColorStop(0.8, '#120f24');
  sky.addColorStop(1, '#1a1226');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // deterministic pseudo-random so the skyline is the same every visit
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const warm = ['255,176,104', '255,140,84', '255,214,160', '255,196,128'];
  const cool = ['140,170,255', '178,160,255', '120,214,204'];
  const pick = () => (rnd() < 0.68 ? warm : cool)[Math.floor(rnd() * (rnd() < 0.68 ? 4 : 3)) % 3];
  ctx.globalCompositeOperation = 'lighter';
  // Soft discs: dense near the horizon band, thinning out toward the sky.
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W;
    const y = H * (0.48 + (rnd() + rnd() + rnd() - 1.5) * 0.3);
    const big = rnd() < 0.12;
    const r = big ? 14 + rnd() * 16 : 3 + rnd() * 8;
    const a = big ? 0.05 + rnd() * 0.08 : 0.12 + rnd() * 0.3;
    const col = pick();
    const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(0.8, `rgba(${col},${a * 1.2})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRoom(scene) {
  const wallMat = std(0x12151e, { roughness: 0.95 });
  const frameMat = std(0x050608, { roughness: 0.9 });
  const { x0, x1, y0, y1 } = WINDOW;
  const T = 0.1; // wall thickness

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), std(0x0d0e13, { roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall, built around the window opening.
  const walls = [
    box(8 + x0, 5, T, wallMat, (x0 - 8) / 2, 2.5, WALL_Z),
    box(8 - x1, 5, T, wallMat, (x1 + 8) / 2, 2.5, WALL_Z),
    box(x1 - x0, y0, T, wallMat, (x0 + x1) / 2, y0 / 2, WALL_Z),
    box(x1 - x0, 5 - y1, T, wallMat, (x0 + x1) / 2, (5 + y1) / 2, WALL_Z),
  ];
  walls.forEach((w) => { w.receiveShadow = true; scene.add(w); });

  // Window frame, mullions and sill.
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0, b = 0.045;
  scene.add(
    box(w + b, b, T + 0.04, frameMat, cx, y1, WALL_Z),
    box(w + b, b, T + 0.04, frameMat, cx, y0, WALL_Z),
    box(b, h, T + 0.04, frameMat, x0, cy, WALL_Z),
    box(b, h, T + 0.04, frameMat, x1, cy, WALL_Z),
    box(b * 0.7, h, T, frameMat, x0 + w / 3, cy, WALL_Z),
    box(b * 0.7, h, T, frameMat, x0 + (2 * w) / 3, cy, WALL_Z),
    box(w + 0.16, 0.03, 0.2, frameMat, cx, y0 - 0.015, WALL_Z + 0.07),
  );

  // The city, far behind the glass so it shifts with the camera.
  const city = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 3.36),
    new THREE.MeshBasicMaterial({ map: cityTexture(), fog: false, color: 0xbfbfbf }),
  );
  city.position.set(0, 2.2, WALL_Z - 1.3);
  scene.add(city);
}

function buildDesk(scene) {
  const wood = std(0x4b3222, { roughness: 0.48 });
  const metal = std(0x101114, { roughness: 0.45, metalness: 0.6 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.04, 0.8, 2, 0.01), wood);
  top.position.y = DESK_TOP - 0.02;
  top.castShadow = top.receiveShadow = true;
  scene.add(top);
  for (const [x, z] of [[-0.74, -0.34], [0.74, -0.34], [-0.74, 0.34], [0.74, 0.34]]) {
    const leg = box(0.04, DESK_TOP - 0.04, 0.04, metal, x, (DESK_TOP - 0.04) / 2, z);
    leg.castShadow = true;
    scene.add(leg);
  }

  // Felt desk mat
  const mat = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.004, 0.36, 2, 0.002), std(0x14161d, { roughness: 1 }));
  mat.position.set(0, DESK_TOP + 0.002, 0.13);
  mat.receiveShadow = true;
  scene.add(mat);

  // A small stack of books
  const books = [
    { w: 0.2, h: 0.028, d: 0.14, color: 0x4a1d1a, rot: 0.12 },
    { w: 0.185, h: 0.022, d: 0.13, color: 0x8f8776, rot: -0.06 },
    { w: 0.17, h: 0.03, d: 0.12, color: 0x15383a, rot: 0.22 },
  ];
  let y = DESK_TOP;
  for (const bk of books) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(bk.w, bk.h, bk.d, 2, 0.004), std(bk.color, { roughness: 0.7 }));
    m.position.set(-0.64, y + bk.h / 2, -0.27);
    m.rotation.y = bk.rot;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    y += bk.h;
  }
}

function buildLamp(scene, lite) {
  const metal = std(0x17181c, { roughness: 0.35, metalness: 0.7 });
  const base = new THREE.Vector3(0.63, DESK_TOP, -0.27);
  const elbow = new THREE.Vector3(0.74, DESK_TOP + 0.36, -0.3);
  const head = new THREE.Vector3(0.5, DESK_TOP + 0.5, -0.12);
  const aim = new THREE.Vector3(0.5, DESK_TOP, -0.12); // straight down: the glowing inside only shows from below
  const dir = new THREE.Vector3().subVectors(aim, head).normalize();

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.016, 32), metal);
  foot.position.copy(base).setY(DESK_TOP + 0.008);
  foot.castShadow = true;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), metal);
  joint.position.copy(elbow);
  scene.add(foot, joint, rod(base, elbow, 0.007, metal), rod(elbow, head, 0.007, metal));

  // Shade: narrow end at the head, opening toward the desk.
  const shadeGeo = new THREE.CylinderGeometry(0.024, 0.078, 0.11, 32, 1, true);
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const shade = new THREE.Mesh(shadeGeo, std(0x17181c, { roughness: 0.35, metalness: 0.7, side: THREE.FrontSide }));
  const inner = new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.52, 0.22), side: THREE.BackSide }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026, 20, 12), metal);
  for (const m of [shade, inner]) {
    m.position.copy(head).addScaledVector(dir, 0.05);
    m.quaternion.copy(orientation);
  }
  // The lining sits just inside the shade so it never peeks past the rim.
  inner.scale.setScalar(0.95);
  cap.position.copy(head);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 20, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.8) }),
  );
  bulb.position.copy(head).addScaledVector(dir, 0.065);
  scene.add(shade, inner, cap, bulb);

  const spot = new THREE.SpotLight(0xffa860, 4.6, 4, 1.05, 1, 2);
  spot.position.copy(bulb.position);
  spot.target.position.copy(aim);
  spot.castShadow = !lite;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 0.08;
  spot.shadow.camera.far = 4;
  spot.shadow.bias = -0.0006;
  spot.shadow.normalBias = 0.012;
  spot.shadow.radius = 5;
  scene.add(spot, spot.target);
}

export function createStage(canvas, { lite, pixelRatio }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lite ? 1.3 : 1.15;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Nothing in the scene moves on its own, so the shadow map is only redrawn on request.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 3.2, 11);

  // Faint image-based lighting, just enough for reflections on dark materials.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.16;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0x2b3552, 0x0a0a0d, 0.45));

  // Moonlight and city glow coming through the window: a cool rim on everything.
  const rim = new THREE.DirectionalLight(0x5f7cf0, 0.42);
  rim.position.set(-1.4, 2.4, -3);
  scene.add(rim);

  // The monitor lights the desk in front of it.
  const screenGlow = new THREE.PointLight(0x7f9bff, 0.2, 1.6, 2);
  screenGlow.position.set(0, DESK_TOP + 0.22, 0.05);
  scene.add(screenGlow);

  buildRoom(scene);
  buildDesk(scene);
  buildLamp(scene, lite);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);

  // Post-processing (desktop only): render -> bloom -> SMAA -> tone map/sRGB.
  // SMAAPass works in linear space and must run before OutputPass (see SMAAPass.js header).
  let composer = null;
  let bloom = null;
  if (!lite) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.6, 1.0);
    composer.addPass(bloom);
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
  }

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
    camera.aspect = w / h;
    // Tall, narrow screens: widen the field of view so objects still fit, and
    // slide the picture up so the scene sits above the text at the bottom.
    const portrait = camera.aspect < 0.8;
    camera.fov = portrait ? 54 : 32;
    if (portrait) camera.setViewOffset(w, h, 0, Math.round(h * 0.2), w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  return {
    renderer, scene, camera, resize, render,
    invalidateShadows() { renderer.shadowMap.needsUpdate = true; },
    /** Lower the resolution (and optionally drop bloom) when frames are slow. */
    setPixelRatio(ratio) {
      renderer.setPixelRatio(ratio);
      resize();
    },
    setBloom(on) { if (bloom) bloom.enabled = on; },
  };
}

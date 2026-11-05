import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DESK_TOP } from '../config/scene.config.js';

/** Renderer, room, desk, lights and environment map. */
export function createStage(canvas, { lite }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e4dc);
  scene.fog = new THREE.Fog(0xe9e4dc, 4, 9);

  // Soft image-based lighting without downloading an HDR file.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x8a7f72, 0.6);
  const key = new THREE.DirectionalLight(0xfff1dd, 1.6);
  key.position.set(1.8, 3.0, 1.4);
  key.castShadow = !lite;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.2;
  key.shadow.camera.right = 1.2;
  key.shadow.camera.top = 1.2;
  key.shadow.camera.bottom = -1.2;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 6;
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.01;
  scene.add(hemi, key);

  // Floor and wall
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshStandardMaterial({ color: 0xece6dd, roughness: 1 }));
  wall.position.set(0, 2.5, -0.75);
  wall.receiveShadow = true;
  scene.add(floor, wall);

  // Desk
  const wood = new THREE.MeshStandardMaterial({ color: 0xa47551, roughness: 0.6 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.4 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.04, 0.8, 2, 0.01), wood);
  top.position.y = DESK_TOP - 0.02;
  top.castShadow = top.receiveShadow = true;
  scene.add(top);
  for (const [x, z] of [[-0.74, -0.34], [0.74, -0.34], [-0.74, 0.34], [0.74, 0.34]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, DESK_TOP - 0.04, 0.04), legMat);
    leg.position.set(x, (DESK_TOP - 0.04) / 2, z);
    leg.castShadow = true;
    scene.add(leg);
  }

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: widen the field of view so objects still fit.
    camera.fov = camera.aspect < 0.8 ? 58 : 40;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize };
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Simple stand-in shapes. Absolute sizes don't matter much: the loader
// rescales every object (placeholder or .glb) to the `fit` size in the config.

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...opts });

function monitor() {
  const g = new THREE.Group();
  const dark = mat(0x22252b, { roughness: 0.4 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.015, 0.16, 2, 0.006), dark);
  base.position.y = 0.0075;
  const neck = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.16, 0.025, 2, 0.008), dark);
  neck.position.set(0, 0.09, -0.03);
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.36, 0.025, 3, 0.008), dark);
  body.position.set(0, 0.32, -0.02);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.595, 0.335),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x3557c9, emissiveIntensity: 0.55, roughness: 0.3 }),
  );
  screen.position.set(0, 0.32, -0.0065);
  g.add(base, neck, body, screen);
  return g;
}

function keyboard() {
  const g = new THREE.Group();
  const caseMesh = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.025, 0.14, 2, 0.008), mat(0xd9d4cb));
  caseMesh.position.y = 0.0125;
  g.add(caseMesh);
  // A grid of keys as one InstancedMesh (one draw call).
  const cols = 14, rows = 5, key = 0.026, gap = 0.004;
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(key, 0.012, key, 1, 0.003), mat(0x3b3f47), cols * rows);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      m.setPosition(
        (c - (cols - 1) / 2) * (key + gap),
        0.03,
        (r - (rows - 1) / 2) * (key + gap),
      );
      keys.setMatrixAt(i++, m);
    }
  }
  g.add(keys);
  return g;
}

function mug() {
  const g = new THREE.Group();
  const ceramic = mat(0xc9643f, { roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 40, 1, true), ceramic);
  body.material.side = THREE.DoubleSide;
  body.position.y = 0.05;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.038, 40), ceramic);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.002;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.039, 40), mat(0x2a160c, { roughness: 0.15 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.085;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 12, 32, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.042, 0.05, 0);
  g.add(body, bottom, coffee, handle);
  return g;
}

function phone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.009, 0.155, 3, 0.004), mat(0x1c1d21, { roughness: 0.3 }));
  body.position.y = 0.0045;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.068, 0.146),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x7a5cff, emissiveIntensity: 0.35, roughness: 0.2 }),
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.0092;
  g.add(body, screen);
  return g;
}

export const placeholders = { monitor, keyboard, mug, phone };

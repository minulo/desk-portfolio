import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { placeholders } from './placeholders.js';

/**
 * The single entry point for getting an object into the scene.
 * Given a config entry it returns a normalised Object3D, from a .glb when
 * `entry.model` is set, otherwise from a placeholder builder. If a .glb fails
 * to load it falls back to the placeholder, so the site never breaks.
 *
 * Normalisation (same for both paths): scale so the largest dimension equals
 * `entry.fit`, centre on X/Z, put the bottom at y = 0, add a soft contact
 * shadow under the footprint, then apply the configured rotation and position.
 */

let shadowTexture = null;
function getShadowTexture() {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTexture = new THREE.CanvasTexture(c);
  return shadowTexture;
}

export function createModelLoader(manager) {
  const gltf = new GLTFLoader(manager);
  // gltf-transform `optimize` compresses geometry with meshopt by default.
  gltf.setMeshoptDecoder(MeshoptDecoder);

  async function loadRaw(entry) {
    if (entry.model) {
      try {
        const { scene } = await gltf.loadAsync(entry.model);
        return scene;
      } catch (err) {
        console.warn(`[loader] ${entry.id}: failed to load ${entry.model}, using placeholder`, err);
      }
    }
    // Report placeholders to the manager too, so the progress bar counts every object.
    const key = `placeholder:${entry.id}`;
    manager.itemStart(key);
    const build = placeholders[entry.placeholder];
    const obj = build ? build() : new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
    manager.itemEnd(key);
    return obj;
  }

  async function load(entry) {
    const raw = await loadRaw(entry);
    raw.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    // Fit and centre inside an inner group so the outer group's transform is clean.
    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    const scale = entry.fit / Math.max(size.x, size.y, size.z, 1e-6);
    raw.scale.multiplyScalar(scale);
    box.setFromObject(raw);
    const center = box.getCenter(new THREE.Vector3());
    raw.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    box.getSize(size);

    // Soft ambient-occlusion blob under the footprint (cheap, reads as "grounded").
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.0015;
    contact.scale.set(size.x * 1.45, size.z * 1.45, 1);
    contact.renderOrder = -1;
    contact.raycast = () => {}; // never hover-pick the shadow blob

    // `lift` holds the model so hover animations never fight the base position.
    const lift = new THREE.Group();
    lift.name = 'lift';
    lift.add(raw);

    const holder = new THREE.Group();
    holder.name = entry.id;
    holder.userData.entry = entry;
    holder.add(contact, lift);
    holder.position.fromArray(entry.position);
    holder.rotation.y = THREE.MathUtils.degToRad(entry.rotationY ?? 0);
    return holder;
  }

  return { load };
}

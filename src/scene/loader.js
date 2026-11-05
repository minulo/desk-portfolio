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
 * `entry.fit`, centre on X/Z, put the bottom at y = 0, then apply the
 * configured rotation and position.
 */
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

    const holder = new THREE.Group();
    holder.name = entry.id;
    holder.add(raw);
    holder.position.fromArray(entry.position);
    holder.rotation.y = THREE.MathUtils.degToRad(entry.rotationY ?? 0);
    return holder;
  }

  return { load };
}

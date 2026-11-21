import { Vector3 } from 'three';
import { placeholders } from './objects.js';
import { fitScale } from './geometry.js';
import { resolveAsset } from '../lib/asset-url.js';

/**
 * Turns one entry of scene.config.js into a single geometry, ready for the toon,
 * outline and shadow materials: scaled so its largest side is `entry.fit`, centred on
 * x and z, standing on y = 0.
 *
 * With `entry.model` set, the file is loaded and flattened into one mesh that keeps
 * each part's colour (see model-geometry.js). If the file cannot be loaded, the
 * placeholder is used and a warning is logged, so the page never breaks over a model.
 *
 * @returns {Promise<{ geometry: import('three').BufferGeometry, fromModel: boolean }>}
 */
export async function loadObject(entry) {
  let geometry = null;
  let fromModel = false;

  if (entry.model) {
    try {
      geometry = await loadModel(resolveAsset(entry.model, document.baseURI));
      fromModel = true;
    } catch (err) {
      console.warn(`[scene] ${entry.id}: could not load ${entry.model}; using the placeholder.`, err);
    }
  }
  if (!geometry) {
    const build = placeholders[entry.placeholder];
    if (!build) throw new Error(`[scene] ${entry.id}: no placeholder named "${entry.placeholder}"`);
    geometry = build();
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const scale = fitScale(size, entry.fit);
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  return { geometry, fromModel };
}

// The glTF loader and the model code are only downloaded when a model is configured.
// The meshopt decoder is what `gltf-transform optimize` output needs (its default
// compression). Draco-compressed files are not supported.
async function loadModel(url) {
  const [{ GLTFLoader }, { MeshoptDecoder }, { geometryFromScene }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('./model-geometry.js'),
  ]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  return geometryFromScene(gltf.scene);
}

import { Box3, BufferAttribute, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { placeholders } from './objects.js';
import { paint, addOutlineNormals, fitScale } from './geometry.js';

/**
 * Turns one entry of scene.config.js into a single geometry, ready for the toon,
 * outline and shadow materials: scaled so its largest side is `entry.fit`, centred on
 * x and z, standing on y = 0.
 *
 * With `entry.model` set, the file is loaded and flattened into one mesh that keeps
 * each part's base colour. Its textures are not used: the site draws flat colour, not
 * photographic surfaces. If the file cannot be loaded, the placeholder is used and a
 * warning is logged, so the page never breaks over a missing model.
 *
 * @returns {Promise<{ geometry: BufferGeometry, fromModel: boolean }>}
 */
export async function loadObject(entry) {
  let geometry = null;
  let fromModel = false;

  if (entry.model) {
    try {
      geometry = await loadModel(entry.model);
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
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  geometry.scale(...new Array(3).fill(fitScale(size, entry.fit)));
  geometry.computeBoundingBox();
  return { geometry, fromModel };
}

// The glTF loader is only downloaded when a model is actually configured.
async function loadModel(url) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);

  const parts = [];
  gltf.scene.traverse((node) => {
    if (!node.isMesh || !node.geometry?.getAttribute('position')) return;
    let g = node.geometry.clone().applyMatrix4(node.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    const c = material?.color;
    const hex = c ? (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255) : 0xcccccc;
    paint(g, hex, { flat: !!material?.emissiveIntensity && material.emissive?.getHex() > 0 });
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'aColor'].includes(name)) g.deleteAttribute(name);
    }
    // Models keep their own vertex colours when they have them.
    const vertexColours = node.geometry.getAttribute('color');
    if (vertexColours && !node.geometry.index) {
      const data = g.getAttribute('aColor').array;
      for (let i = 0; i < vertexColours.count; i++) {
        data[i * 4] = vertexColours.getX(i);
        data[i * 4 + 1] = vertexColours.getY(i);
        data[i * 4 + 2] = vertexColours.getZ(i);
      }
      g.setAttribute('aColor', new BufferAttribute(data, 4));
    }
    parts.push(g);
  });
  if (!parts.length) throw new Error('the file contains no meshes');
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('the meshes could not be merged');
  return addOutlineNormals(merged);
}

/** World-space box of an object, for hit-testing the pointer against it. */
export function worldBox(object) {
  return new Box3().setFromObject(object);
}

import { BufferAttribute, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlineNormals } from './geometry.js';

/**
 * Flattens a loaded model (a three.js object tree, as GLTFLoader returns it) into one
 * geometry painted for the toon shader.
 *
 * Each vertex gets the colour the model would show without lighting: the material's
 * base colour times the vertex colour, if there is one. three.js keeps both in linear
 * light; the toon shader works in screen colours, so they are converted here.
 * Textures are not used. Parts with an emissive colour are marked flat (unshaded).
 *
 * @param {import('three').Object3D} root  with world matrices already updated
 */
export function geometryFromScene(root) {
  const parts = [];
  const colour = new Color();

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry?.getAttribute('position')) return;

    let g = node.geometry.clone().applyMatrix4(node.matrixWorld);
    if (g.index) g = g.toNonIndexed(); // keeps every attribute, including vertex colours
    if (!g.getAttribute('normal')) g.computeVertexNormals();

    const count = g.getAttribute('position').count;
    const vertexColour = g.getAttribute('color');
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    // A mesh with several materials says which vertices use which through its groups.
    const materialAt = (i) => {
      if (materials.length > 1) {
        for (const group of g.groups) {
          if (i >= group.start && i < group.start + group.count) return materials[group.materialIndex] ?? materials[0];
        }
      }
      return materials[0];
    };

    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const material = materialAt(i);
      const base = material?.color;
      colour.setRGB(base ? base.r : 0.6, base ? base.g : 0.6, base ? base.b : 0.6);
      if (vertexColour) {
        colour.r *= vertexColour.getX(i);
        colour.g *= vertexColour.getY(i);
        colour.b *= vertexColour.getZ(i);
      }
      colour.convertLinearToSRGB();
      const glows = !!material?.emissive && material.emissive.getHex() > 0 && (material.emissiveIntensity ?? 1) > 0;
      data.set([colour.r, colour.g, colour.b, glows ? 1 : 0], i * 4);
    }
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    }
    g.setAttribute('aColor', new BufferAttribute(data, 4));
    g.clearGroups();
    parts.push(g);
  });

  if (!parts.length) throw new Error('the file contains no meshes');
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('the meshes could not be merged');
  return addOutlineNormals(merged);
}

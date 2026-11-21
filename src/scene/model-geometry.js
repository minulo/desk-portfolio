import { BufferAttribute, BufferGeometry, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlineNormals } from './geometry.js';

/**
 * Copies an attribute into plain floats. Compressed models store positions and normals
 * as scaled integers, sometimes interleaved in one buffer; `getX/Y/Z` undo both.
 */
function asFloats(attribute, itemSize = 3) {
  const out = new Float32Array(attribute.count * itemSize);
  for (let i = 0; i < attribute.count; i++) {
    out[i * itemSize] = attribute.getX(i);
    out[i * itemSize + 1] = attribute.getY(i);
    if (itemSize > 2) out[i * itemSize + 2] = attribute.getZ(i);
  }
  return new BufferAttribute(out, itemSize);
}

/** A copy of a mesh's geometry holding only what is needed here, as plain floats. */
function plainCopy(source) {
  const g = new BufferGeometry();
  g.setAttribute('position', asFloats(source.getAttribute('position')));
  if (source.getAttribute('normal')) g.setAttribute('normal', asFloats(source.getAttribute('normal')));
  if (source.getAttribute('color')) g.setAttribute('color', asFloats(source.getAttribute('color')));
  if (source.index) g.setIndex(source.index.clone());
  for (const group of source.groups) g.addGroup(group.start, group.count, group.materialIndex);
  return g;
}

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

    let g = plainCopy(node.geometry).applyMatrix4(node.matrixWorld);
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

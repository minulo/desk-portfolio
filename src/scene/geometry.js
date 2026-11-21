import { BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothNormals } from './outline-normals.js';

/** 0xff8000 -> [1, 0.5, 0]. Colours are used as written, with no colour-space conversion. */
export function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * Give every vertex of a geometry one colour (attribute `aColor`, rgb + flag).
 * `flat: true` marks the part as unshaded: it is drawn in exactly this colour,
 * which is how screens and printed details are done.
 */
export function paint(geometry, hex, { flat = false } = {}) {
  const [r, g, b] = hexToRgb(hex);
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) data.set([r, g, b, flat ? 1 : 0], i * 4);
  geometry.setAttribute('aColor', new BufferAttribute(data, 4));
  return geometry;
}

/**
 * Merge painted parts into one geometry (one draw call per object) and add the
 * smoothed normals the ink outline is pushed along (attribute `aSmooth`).
 */
export function combine(parts) {
  if (!parts.length) throw new Error('combine: no parts to merge');
  // Keep only the attributes every part is guaranteed to have, so any mix of shapes merges.
  for (const part of parts) {
    for (const name of Object.keys(part.attributes)) {
      if (!['position', 'normal', 'aColor'].includes(name)) part.deleteAttribute(name);
    }
  }
  // Indexed parts stay indexed (fewer vertices). A mix is flattened so the merge accepts it.
  const allIndexed = parts.every((p) => p.index);
  const merged = mergeGeometries(allIndexed ? parts : parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  if (!merged) throw new Error('combine: parts could not be merged');
  return addOutlineNormals(merged);
}

/** Add `aSmooth` to a geometry that already has positions and normals. */
export function addOutlineNormals(geometry) {
  const smooth = smoothNormals(geometry.getAttribute('position').array, geometry.getAttribute('normal').array);
  geometry.setAttribute('aSmooth', new BufferAttribute(smooth, 3));
  return geometry;
}

/** The uniform scale that makes a box's largest side equal to `fit`. */
export function fitScale(size, fit) {
  return fit / Math.max(size.x, size.y, size.z, 1e-6);
}

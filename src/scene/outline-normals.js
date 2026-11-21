/**
 * Outlines are drawn by pushing a copy of each mesh outward along its normals. Where a
 * mesh has a hard edge, two vertices sit at the same point with different normals, and
 * the pushed copy splits open there. Averaging the normals of every vertex that shares
 * a position closes those gaps.
 *
 * @param {Float32Array} positions  xyz per vertex
 * @param {Float32Array} normals    xyz per vertex
 * @param {number} precision        positions closer than this count as the same point
 * @returns {Float32Array} averaged, unit-length normals, xyz per vertex
 */
export function smoothNormals(positions, normals, precision = 1e-4) {
  const count = positions.length / 3;
  const sums = new Map();
  const keys = new Array(count);
  const q = (v) => Math.round(v / precision);

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const key = `${q(positions[o])},${q(positions[o + 1])},${q(positions[o + 2])}`;
    keys[i] = key;
    const s = sums.get(key);
    if (s) {
      s[0] += normals[o];
      s[1] += normals[o + 1];
      s[2] += normals[o + 2];
    } else {
      sums.set(key, [normals[o], normals[o + 1], normals[o + 2]]);
    }
  }

  const out = new Float32Array(positions.length);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const s = sums.get(keys[i]);
    const len = Math.hypot(s[0], s[1], s[2]);
    if (len > 1e-6) {
      out[o] = s[0] / len;
      out[o + 1] = s[1] / len;
      out[o + 2] = s[2] / len;
    } else {
      // Opposite normals cancelled out: fall back to the vertex's own normal.
      const own = Math.hypot(normals[o], normals[o + 1], normals[o + 2]) || 1;
      out[o] = normals[o] / own;
      out[o + 1] = normals[o + 1] / own;
      out[o + 2] = normals[o + 2] / own;
    }
  }
  return out;
}

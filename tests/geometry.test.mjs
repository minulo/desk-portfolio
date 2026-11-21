import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import { hexToRgb, paint, combine, fitScale } from '../src/scene/geometry.js';

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

test('hexToRgb splits a hex colour into 0..1 channels', () => {
  const [r, g, b] = hexToRgb(0xff8000);
  assert.ok(near(r, 1) && near(g, 128 / 255) && near(b, 0), `${r}, ${g}, ${b}`);
});

test('paint gives every vertex the colour, with the flat flag off by default', () => {
  const g = paint(new BoxGeometry(1, 1, 1), 0xff0000);
  const c = g.getAttribute('aColor');
  assert.equal(c.itemSize, 4);
  assert.equal(c.count, g.getAttribute('position').count);
  assert.deepEqual([c.getX(0), c.getY(0), c.getZ(0), c.getW(0)], [1, 0, 0, 0]);
  assert.deepEqual([c.getX(23), c.getY(23), c.getZ(23), c.getW(23)], [1, 0, 0, 0]);
});

test('paint marks a part as flat (drawn without shading) when asked', () => {
  const c = paint(new BoxGeometry(1, 1, 1), 0x00ff00, { flat: true }).getAttribute('aColor');
  assert.deepEqual([c.getX(5), c.getY(5), c.getZ(5), c.getW(5)], [0, 1, 0, 1]);
});

test('combine merges painted parts into one geometry and keeps each part\'s colour', () => {
  const a = paint(new BoxGeometry(1, 1, 1), 0xff0000);
  const b = paint(new BoxGeometry(1, 1, 1).translate(3, 0, 0), 0x0000ff);
  const merged = combine([a, b]);
  assert.equal(merged.getAttribute('position').count, 48);
  const c = merged.getAttribute('aColor');
  assert.equal(c.getX(0), 1);
  assert.equal(c.getZ(47), 1);
});

test('combine adds smoothed outline normals: a box corner points diagonally outward', () => {
  const merged = combine([paint(new BoxGeometry(2, 2, 2), 0xffffff)]);
  const pos = merged.getAttribute('position');
  const smooth = merged.getAttribute('aSmooth');
  assert.equal(smooth.count, pos.count);
  const k = Math.sqrt(1 / 3);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(
      near(smooth.getX(i), Math.sign(pos.getX(i)) * k) && near(smooth.getY(i), Math.sign(pos.getY(i)) * k) && near(smooth.getZ(i), Math.sign(pos.getZ(i)) * k),
      `vertex ${i}: ${smooth.getX(i)}, ${smooth.getY(i)}, ${smooth.getZ(i)}`,
    );
  }
});

test('combine refuses an empty list with a clear message', () => {
  assert.throws(() => combine([]), /no parts/);
});

test('fitScale makes the largest side equal to the target size', () => {
  assert.ok(near(fitScale({ x: 2, y: 1, z: 1 }, 0.5), 0.25));
  assert.ok(near(fitScale({ x: 0.1, y: 4, z: 1 }, 0.4), 0.1));
});

test('fitScale stays finite for a model with no size', () => {
  assert.ok(Number.isFinite(fitScale({ x: 0, y: 0, z: 0 }, 0.5)));
});

// ---------- geometryFromScene: turning a loaded model into painted geometry ----------
import { BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { geometryFromScene } from '../src/scene/model-geometry.js';

const MID_GREY_LINEAR = 0.2158605; // what #808080 is once converted to linear light
const first = (g) => { const c = g.getAttribute('aColor'); return [c.getX(0), c.getY(0), c.getZ(0)]; };

function modelWith(mesh) {
  const root = new Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}

test('a model part keeps its material colour as it looks on screen (#808080 stays mid grey)', () => {
  const g = geometryFromScene(modelWith(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x808080 }))));
  for (const v of first(g)) assert.ok(near(v, 128 / 255, 2e-3), `channel ${v}`);
});

test('an indexed model keeps its vertex colours', () => {
  const box = new BoxGeometry(1, 1, 1); // indexed, like almost every glTF
  const colours = new Float32Array(box.getAttribute('position').count * 3);
  for (let i = 0; i < colours.length; i += 3) colours[i] = 1; // pure red
  box.setAttribute('color', new BufferAttribute(colours, 3));
  const g = geometryFromScene(modelWith(new Mesh(box, new MeshStandardMaterial({ color: 0xffffff, vertexColors: true }))));
  const c = g.getAttribute('aColor');
  for (const i of [0, 7, c.count - 1]) {
    assert.ok(near(c.getX(i), 1, 2e-3) && near(c.getY(i), 0, 2e-3) && near(c.getZ(i), 0, 2e-3), `vertex ${i}: ${c.getX(i)}, ${c.getY(i)}, ${c.getZ(i)}`);
  }
});

test('vertex colours are converted from linear light to screen colour', () => {
  const box = new BoxGeometry(1, 1, 1);
  box.setAttribute('color', new BufferAttribute(new Float32Array(box.getAttribute('position').count * 3).fill(MID_GREY_LINEAR), 3));
  const g = geometryFromScene(modelWith(new Mesh(box, new MeshStandardMaterial({ color: 0xffffff, vertexColors: true }))));
  for (const v of first(g)) assert.ok(near(v, 128 / 255, 2e-3), `channel ${v}`);
});

test('each part is placed where the model puts it', () => {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  mesh.position.set(5, 0, 0);
  const g = geometryFromScene(modelWith(mesh));
  g.computeBoundingBox();
  assert.ok(near(g.boundingBox.min.x, 4.5) && near(g.boundingBox.max.x, 5.5), `${g.boundingBox.min.x}..${g.boundingBox.max.x}`);
});

test('the result carries the normals the ink outline needs', () => {
  const g = geometryFromScene(modelWith(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())));
  assert.equal(g.getAttribute('aSmooth').count, g.getAttribute('position').count);
});

test('a model with no meshes is rejected with a clear message', () => {
  assert.throws(() => geometryFromScene(new Group()), /no meshes/);
});

// ---------- compressed models: integer ("quantised") and interleaved vertex data ----------
import { InterleavedBuffer, InterleavedBufferAttribute } from 'three';

/** A 2 x 2 x 2 box whose positions and normals are stored as normalised integers, as gltf-transform writes them. */
function quantisedBox() {
  const box = new BoxGeometry(2, 2, 2);
  const pos = box.getAttribute('position');
  const nor = box.getAttribute('normal');
  box.setAttribute('position', new BufferAttribute(Int16Array.from(pos.array, (v) => Math.round(v * 32767)), 3, true));
  box.setAttribute('normal', new BufferAttribute(Int8Array.from(nor.array, (v) => Math.round(v * 127)), 3, true));
  return box;
}

test('a quantised model part ends up where the model puts it, not clamped to its integer range', () => {
  const mesh = new Mesh(quantisedBox(), new MeshStandardMaterial());
  mesh.position.set(5, 0, 0);
  mesh.scale.setScalar(0.5);
  const g = geometryFromScene(modelWith(mesh));
  g.computeBoundingBox();
  assert.ok(near(g.boundingBox.min.x, 4.5, 1e-3) && near(g.boundingBox.max.x, 5.5, 1e-3), `x ${g.boundingBox.min.x}..${g.boundingBox.max.x}`);
  assert.ok(near(g.boundingBox.min.y, -0.5, 1e-3) && near(g.boundingBox.max.y, 0.5, 1e-3), `y ${g.boundingBox.min.y}..${g.boundingBox.max.y}`);
});

test('a quantised model part gets real-number positions and unit-length normals', () => {
  const g = geometryFromScene(modelWith(new Mesh(quantisedBox(), new MeshStandardMaterial())));
  assert.ok(g.getAttribute('position').array instanceof Float32Array, 'positions are floats');
  const n = g.getAttribute('normal');
  const s = g.getAttribute('aSmooth');
  for (const i of [0, 10, n.count - 1]) {
    assert.ok(near(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), 1, 1e-2), `normal ${i}`);
    assert.ok(near(Math.hypot(s.getX(i), s.getY(i), s.getZ(i)), 1, 1e-2), `outline normal ${i}`);
  }
});

test('a model part with interleaved vertex data is read correctly', () => {
  const box = new BoxGeometry(2, 2, 2).toNonIndexed();
  const pos = box.getAttribute('position');
  const nor = box.getAttribute('normal');
  const data = new Float32Array(pos.count * 6);
  for (let i = 0; i < pos.count; i++) data.set([pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)], i * 6);
  const buffer = new InterleavedBuffer(data, 6);
  box.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0));
  box.setAttribute('normal', new InterleavedBufferAttribute(buffer, 3, 3));
  const g = geometryFromScene(modelWith(new Mesh(box, new MeshStandardMaterial())));
  g.computeBoundingBox();
  assert.ok(near(g.boundingBox.min.x, -1) && near(g.boundingBox.max.z, 1), `${g.boundingBox.min.x}..${g.boundingBox.max.z}`);
  assert.equal(g.getAttribute('position').count, 36);
});

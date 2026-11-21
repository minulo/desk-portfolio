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

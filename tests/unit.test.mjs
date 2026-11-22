import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickActive } from '../src/lib/active-section.js';
import { easeOutExpo, runTween } from '../src/lib/tween.js';
import { artWindowOffset } from '../src/lib/view-offset.js';
import { smoothNormals } from '../src/scene/outline-normals.js';

// ---------- pickActive ----------
const stacked = [
  { top: -900, bottom: 0 },
  { top: 0, bottom: 900 },
  { top: 900, bottom: 1800 },
];

test('pickActive returns the section that contains the reference line', () => {
  assert.equal(pickActive(stacked, 400), 1);
});

test('pickActive returns the first section when the line is above every section', () => {
  assert.equal(pickActive([{ top: 200, bottom: 900 }, { top: 900, bottom: 1600 }], 100), 0);
});

test('pickActive returns the last section when the line is below every section', () => {
  assert.equal(pickActive([{ top: -1800, bottom: -900 }, { top: -900, bottom: -10 }], 400), 1);
});

test('pickActive gives a shared boundary to the later section', () => {
  assert.equal(pickActive(stacked, 900), 2);
});

test('pickActive returns -1 for an empty list', () => {
  assert.equal(pickActive([], 400), -1);
});

// ---------- tween ----------
test('easeOutExpo starts at 0, ends at 1 and never goes backwards', () => {
  assert.equal(easeOutExpo(0), 0);
  assert.equal(easeOutExpo(1), 1);
  let last = 0;
  for (let i = 1; i <= 20; i++) {
    const v = easeOutExpo(i / 20);
    assert.ok(v >= last, `not monotonic at ${i / 20}`);
    last = v;
  }
});

// A hand-cranked clock: each tick() advances time and runs the queued frame.
function fakeClock() {
  let time = 0;
  let queued = null;
  return {
    raf: (cb) => { queued = cb; return 1; },
    now: () => time,
    tick(ms) { time += ms; const cb = queued; queued = null; if (cb) cb(time); },
    get pending() { return queued !== null; },
  };
}

test('runTween ends with exactly one frame at progress 1, then calls onDone', () => {
  const clock = fakeClock();
  const frames = [];
  let done = 0;
  runTween({ duration: 100, onFrame: (p) => frames.push(p), onDone: () => { done++; }, raf: clock.raf, now: clock.now });
  for (let i = 0; i < 10; i++) clock.tick(30);
  assert.equal(frames.filter((p) => p === 1).length, 1);
  assert.equal(frames.at(-1), 1);
  assert.equal(done, 1);
  assert.equal(clock.pending, false, 'no frame is requested after the tween has finished');
});

test('runTween stops calling onFrame after cancel', () => {
  const clock = fakeClock();
  const frames = [];
  let done = 0;
  const cancel = runTween({ duration: 1000, onFrame: (p) => frames.push(p), onDone: () => { done++; }, raf: clock.raf, now: clock.now });
  clock.tick(16);
  const before = frames.length;
  cancel();
  clock.tick(16);
  clock.tick(2000);
  assert.equal(frames.length, before);
  assert.equal(done, 0);
});

test('runTween with zero duration jumps straight to progress 1', () => {
  const clock = fakeClock();
  const frames = [];
  runTween({ duration: 0, onFrame: (p) => frames.push(p), raf: clock.raf, now: clock.now });
  clock.tick(16);
  assert.deepEqual(frames, [1]);
});

// ---------- artWindowOffset ----------
test('artWindowOffset is zero when the window is centred in the viewport', () => {
  assert.deepEqual(artWindowOffset({ width: 1000, height: 600 }, { x: 250, y: 150, width: 500, height: 300 }), { x: 0, y: 0 });
});

test('artWindowOffset moves the scene centre to the middle of the right half', () => {
  assert.deepEqual(artWindowOffset({ width: 1000, height: 600 }, { x: 500, y: 0, width: 500, height: 600 }), { x: -250, y: 0 });
});

test('artWindowOffset moves the scene centre up for a window in the top part of a phone screen', () => {
  assert.deepEqual(artWindowOffset({ width: 400, height: 800 }, { x: 0, y: 0, width: 400, height: 400 }), { x: 0, y: 200 });
});

// ---------- smoothNormals ----------
const near = (a, b) => Math.abs(a - b) < 1e-4;

test('smoothNormals averages the normals of vertices that share a position', () => {
  const positions = new Float32Array([1, 1, 0, 1, 1, 0]);
  const normals = new Float32Array([1, 0, 0, 0, 1, 0]);
  const out = smoothNormals(positions, normals);
  assert.equal(out.length, 6);
  for (const o of [0, 3]) {
    assert.ok(near(out[o], Math.SQRT1_2) && near(out[o + 1], Math.SQRT1_2) && near(out[o + 2], 0), `vertex at offset ${o}: ${[...out.slice(o, o + 3)]}`);
  }
});

test('smoothNormals leaves a vertex with a unique position unchanged', () => {
  const positions = new Float32Array([0, 0, 0, 5, 5, 5]);
  const normals = new Float32Array([0, 0, 1, 0, 1, 0]);
  assert.deepEqual([...smoothNormals(positions, normals)], [0, 0, 1, 0, 1, 0]);
});

test('smoothNormals treats positions within the precision as the same point', () => {
  const positions = new Float32Array([1, 0, 0, 1.00001, 0, 0]);
  const normals = new Float32Array([1, 0, 0, 0, 0, 1]);
  const out = smoothNormals(positions, normals);
  assert.ok(near(out[0], Math.SQRT1_2) && near(out[2], Math.SQRT1_2));
  assert.ok(near(out[3], Math.SQRT1_2) && near(out[5], Math.SQRT1_2));
});

test('smoothNormals keeps a usable normal when the shared normals cancel out', () => {
  const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
  const normals = new Float32Array([1, 0, 0, -1, 0, 0]);
  const out = smoothNormals(positions, normals);
  for (const o of [0, 3]) {
    const len = Math.hypot(out[o], out[o + 1], out[o + 2]);
    assert.ok(near(len, 1), `normal at offset ${o} has length ${len}`);
  }
});

// ---------- renderScale ----------
import { renderScale } from '../src/lib/render-scale.js';
import { featureCamera } from '../src/lib/feature-view.js';

test('renderScale keeps a Retina laptop canvas within the pixel budget', () => {
  const scale = renderScale(1512, 982, 2);
  assert.ok(scale > 1.5 && scale < 2, `scale ${scale}`);
  assert.ok(1512 * 982 * scale * scale <= 4.5e6 * 1.001, `${(1512 * 982 * scale * scale / 1e6).toFixed(2)} megapixels`);
});

test('renderScale never renders above the display\'s own pixel ratio', () => {
  assert.equal(renderScale(1280, 720, 1), 1);
});

test('renderScale caps a phone\'s 3x display at 2x', () => {
  assert.equal(renderScale(390, 844, 3), 2);
});

test('renderScale never drops below one device pixel per CSS pixel, even on a huge window', () => {
  assert.equal(renderScale(3840, 2160, 1), 1);
  assert.equal(renderScale(3840, 2160, 2), 1);
});

test('renderScale copes with a missing or zero-sized window', () => {
  assert.equal(renderScale(0, 0, 2), 2);
  assert.equal(renderScale(800, 600, undefined), 1);
});

// ---------- resolveAsset ----------
import { resolveAsset } from '../src/lib/asset-url.js';

test('resolveAsset keeps a root-style path inside the folder the site is served from', () => {
  assert.equal(resolveAsset('/models/mug.glb', 'https://example.github.io/desk-portfolio/'), 'https://example.github.io/desk-portfolio/models/mug.glb');
});

test('resolveAsset treats a relative path the same way', () => {
  assert.equal(resolveAsset('models/mug.glb', 'https://example.github.io/desk-portfolio/'), 'https://example.github.io/desk-portfolio/models/mug.glb');
});

test('resolveAsset works when the site is served from the root', () => {
  assert.equal(resolveAsset('/models/mug.glb', 'http://localhost:5173/'), 'http://localhost:5173/models/mug.glb');
});

test('resolveAsset ignores the page\'s file name and query', () => {
  assert.equal(resolveAsset('/models/mug.glb', 'https://example.com/site/index.html?perf'), 'https://example.com/site/models/mug.glb');
});

test('resolveAsset leaves a full address alone', () => {
  assert.equal(resolveAsset('https://cdn.example.com/m.glb', 'https://example.com/site/'), 'https://cdn.example.com/m.glb');
});

// ---------- createTweenTracker ----------
import { createTweenTracker } from '../src/lib/tween.js';

test('a tracked tween counts as active while it runs and not after it finishes', () => {
  const clock = fakeClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  tracker.run({ duration: 100, onFrame() {} });
  assert.equal(tracker.active, 1);
  for (let i = 0; i < 10; i++) clock.tick(30);
  assert.equal(tracker.active, 0);
});

test('cancelling a tracked tween stops counting it, and cancelling twice does not go negative', () => {
  const clock = fakeClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  let done = 0;
  const cancel = tracker.run({ duration: 1000, onFrame() {}, onDone: () => { done++; } });
  clock.tick(16);
  cancel();
  cancel();
  clock.tick(2000);
  assert.equal(tracker.active, 0);
  assert.equal(done, 0);
});

test('cancelling one tracked tween leaves the other counted', () => {
  const clock = fakeClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  const cancelFirst = tracker.run({ duration: 1000, onFrame() {} });
  tracker.run({ duration: 1000, onFrame() {} });
  cancelFirst();
  assert.equal(tracker.active, 1);
});

/**
 * A clock that runs every callback queued for a frame, and whose time moves on by
 * `drift` each time it is read, as a real clock does between two callbacks of one frame.
 */
function frameClock() {
  let time = 0;
  let queue = [];
  const clock = {
    drift: 0,
    raf: (cb) => { queue.push(cb); return queue.length; },
    now: () => { const t = time; time += clock.drift; return t; },
    tick(ms) { time += ms; const run = queue; queue = []; for (const cb of run) cb(time); },
  };
  return clock;
}

test('a tween started with the same key replaces the one still running, so the newest has the last word', () => {
  // The case that left a hovered object stuck in the air: "up" and "down" start within
  // one frame, and on the last frame the clock passes the finish line between their two
  // callbacks. "Down" finishes first, then "up" finishes a frame later and wins.
  const clock = frameClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  const thing = {};
  let height = 0;
  clock.drift = 0.01;
  tracker.run({ key: thing, duration: 150, onFrame: (p) => { height = 0.02 * p; } });
  tracker.run({ key: thing, duration: 150, onFrame: (p) => { height = 0.02 * (1 - p); } });
  assert.equal(tracker.active, 1, 'the replaced tween no longer counts');
  clock.drift = 0.5;
  clock.tick(149.8);
  for (let i = 0; i < 4; i++) clock.tick(16);
  assert.equal(height, 0);
  assert.equal(tracker.active, 0);
});

test('tweens with different keys, or with none, do not replace each other', () => {
  const clock = frameClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  const seen = [];
  tracker.run({ key: 'a', duration: 50, onFrame: (p) => { if (p === 1) seen.push('a'); } });
  tracker.run({ key: 'b', duration: 50, onFrame: (p) => { if (p === 1) seen.push('b'); } });
  tracker.run({ duration: 50, onFrame: (p) => { if (p === 1) seen.push('none 1'); } });
  tracker.run({ duration: 50, onFrame: (p) => { if (p === 1) seen.push('none 2'); } });
  assert.equal(tracker.active, 4);
  for (let i = 0; i < 10; i++) clock.tick(16);
  assert.deepEqual(seen.sort(), ['a', 'b', 'none 1', 'none 2']);
  assert.equal(tracker.active, 0);
});

test('a key is free again once its tween has finished or been cancelled', () => {
  const clock = frameClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  let finished = 0;
  tracker.run({ key: 'k', duration: 30, onFrame() {}, onDone: () => { finished++; } });
  for (let i = 0; i < 5; i++) clock.tick(16);
  const cancel = tracker.run({ key: 'k', duration: 30, onFrame() {}, onDone: () => { finished++; } });
  cancel();
  tracker.run({ key: 'k', duration: 30, onFrame() {}, onDone: () => { finished++; } });
  for (let i = 0; i < 5; i++) clock.tick(16);
  assert.equal(finished, 2);
  assert.equal(tracker.active, 0);
});

test('a tracker can cancel whatever is running under a key, and ignores a key with nothing running', () => {
  const clock = frameClock();
  const tracker = createTweenTracker({ raf: clock.raf, now: clock.now });
  let value = 0;
  tracker.run({ key: 'k', duration: 100, onFrame: (p) => { value = p; } });
  clock.tick(16);
  const before = value;
  tracker.cancel('k');
  tracker.cancel('nothing here');
  for (let i = 0; i < 10; i++) clock.tick(16);
  assert.equal(value, before);
  assert.equal(tracker.active, 0);
});

// ---------- featureCamera ----------
const ball = { centre: [1, 0.5, -2], radius: 0.3, from: [0, 0], fill: 0.5, fov: 30 };
const standOff = (v) => Math.hypot(v.camera[0] - v.target[0], v.camera[1] - v.target[1], v.camera[2] - v.target[2]);

test('featureCamera looks at the centre of the object', () => {
  assert.deepEqual(featureCamera(ball).target, [1, 0.5, -2]);
});

test('featureCamera stands back far enough that the object spans `fill` of the view height', () => {
  // At distance d the view is 2 * d * tan(fov / 2) tall; the object is 2 * radius.
  const viewHeight = 2 * standOff(featureCamera(ball)) * Math.tan((30 * Math.PI) / 360);
  assert.ok(Math.abs((2 * 0.3) / viewHeight - 0.5) < 1e-9);
});

test('featureCamera with a smaller fill puts the camera further away', () => {
  assert.ok(standOff(featureCamera({ ...ball, fill: 0.25 })) > standOff(featureCamera(ball)));
});

test('featureCamera with no turn and no tilt is straight in front, on +z', () => {
  const v = featureCamera(ball);
  assert.ok(Math.abs(v.camera[0] - 1) < 1e-9 && Math.abs(v.camera[1] - 0.5) < 1e-9 && v.camera[2] > -2);
});

test('featureCamera: a quarter turn moves it to +x, and tilting raises it', () => {
  const side = featureCamera({ ...ball, from: [90, 0] });
  assert.ok(side.camera[0] > 1 && Math.abs(side.camera[2] + 2) < 1e-9);
  assert.ok(featureCamera({ ...ball, from: [0, 40] }).camera[1] > 0.5);
});

// ---------- fracture: the cracked-screen pattern of Static mode ----------
import { CRACKS, fracture, displace, restore, locate, sector, move, strayChannel } from '../src/lib/fracture.js';

const broken = fracture({ centre: [1000, 500], size: 800 });
const toRad = (deg) => (deg * Math.PI) / 180;
/** A point `r` pixels from the impact, in the direction `deg` (clockwise from east, as on screen). */
const at = (layout, deg, r) => [layout.impact[0] + Math.cos(toRad(deg)) * r, layout.impact[1] + Math.sin(toRad(deg)) * r];
const apartBy = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('the cracks cut the full circle into wedges, each narrower than a half turn', () => {
  assert.equal(broken.pieces.length, CRACKS.length);
  let total = 0;
  for (const piece of broken.pieces) {
    const width = piece.to - piece.from;
    assert.ok(width > 20 && width < 180, `a piece is ${width} degrees wide`);
    total += width;
  }
  assert.equal(Math.round(total), 360);
});

test('the point of impact is inside the picture but off the object in its middle, and scales with it', () => {
  const small = fracture({ centre: [100, 100], size: 80 });
  const fromCentre = apartBy(broken.impact, [1000, 500]) / 800;
  assert.ok(fromCentre > 0.12 && fromCentre < 0.35, `the impact is ${fromCentre.toFixed(2)} of the size from the centre`);
  assert.ok(Math.abs((small.impact[0] - 100) * 10 - (broken.impact[0] - 1000)) < 1e-6);
});

test('every piece moves away from the impact, turns, and changes size a little: no two alike', () => {
  const seen = new Set();
  for (const piece of broken.pieces) {
    const middle = toRad((piece.from + piece.to) / 2);
    const outward = piece.offset[0] * Math.cos(middle) + piece.offset[1] * Math.sin(middle);
    assert.ok(outward > 800 * 0.008, `a piece moves ${outward.toFixed(1)}px outward`);
    assert.ok(Math.abs(piece.turn) > 1 && Math.abs(piece.turn) < 6, `a piece turns ${piece.turn} degrees`);
    assert.ok(piece.scale > 0.9 && piece.scale < 1.1 && piece.scale !== 1, `a piece is scaled by ${piece.scale}`);
    seen.add(`${piece.turn}/${piece.scale}/${outward.toFixed(2)}`);
  }
  assert.equal(seen.size, broken.pieces.length);
});

test('each piece sees the picture from its own angle, like a piece of a broken mirror', () => {
  const views = broken.pieces.map((p) => p.view.join('/'));
  assert.equal(new Set(views).size, broken.pieces.length, 'every piece has a different view');
  for (const piece of broken.pieces) {
    assert.ok(Math.abs(piece.view[0]) >= 3 && Math.abs(piece.view[0]) <= 15, `turned ${piece.view[0]} degrees`);
    assert.ok(Math.abs(piece.view[1]) >= 1 && Math.abs(piece.view[1]) <= 8, `tilted ${piece.view[1]} degrees`);
    assert.ok(piece.sway !== 1, 'it answers the pointer by its own amount');
  }
  assert.ok(broken.pieces.some((p) => p.sway < 0) && broken.pieces.some((p) => p.sway > 0), 'some pieces move against the others');
});

test('two pieces are tuned to other channels, and they are not next to each other', () => {
  const stray = broken.pieces.map((p, i) => (p.stray ? i : -1)).filter((i) => i >= 0);
  assert.equal(stray.length, 2);
  const gap = Math.abs(stray[0] - stray[1]);
  assert.ok(gap > 1 && gap < broken.pieces.length - 1, 'the two pieces share a crack');
  assert.notEqual(broken.pieces[stray[0]].stray, broken.pieces[stray[1]].stray, 'both are tuned to the same channel');
});

test('strayChannel names a neighbouring channel, never the opening one and never the same one', () => {
  // Six sections: the opening one (0) and five channels (1..5).
  assert.equal(strayChannel(3, 0, 6), 3, 'a piece that is not stray shows the channel itself');
  assert.equal(strayChannel(3, 1, 6), 4);
  assert.equal(strayChannel(3, -1, 6), 2);
  assert.equal(strayChannel(5, 1, 6), 1, 'past the last channel it wraps to the first, not to the opening');
  assert.equal(strayChannel(1, -1, 6), 5);
  assert.equal(strayChannel(0, 1, 6), 1, 'from the opening it is the first channel');
  assert.equal(strayChannel(0, -1, 6), 5, '...or the last');
  for (let current = 0; current < 6; current++) {
    for (const stray of [1, -1]) {
      const other = strayChannel(current, stray, 6);
      assert.ok(other >= 1 && other <= 5 && other !== current);
    }
  }
});

test('with amount 0 nothing has moved, and the pieces fit together again', () => {
  const whole = fracture({ centre: [1000, 500], size: 800, amount: 0 });
  for (const piece of whole.pieces) {
    assert.deepEqual(piece.offset.map((v) => Math.abs(v)), [0, 0]);
    assert.equal(Math.abs(piece.turn), 0);
    assert.equal(piece.scale, 1);
    assert.deepEqual(piece.view.map((v) => Math.abs(v)), [0, 0]);
    assert.equal(piece.sway, 1);
  }
  const point = at(whole, 10, 200);
  assert.ok(apartBy(displace(whole, point), point) < 1e-9);
});

test('a point in a piece moves with it, and can be traced back to where it was', () => {
  broken.pieces.forEach((piece, i) => {
    const point = at(broken, (piece.from + piece.to) / 2, 240);
    assert.equal(sector(broken, point), i);
    const moved = displace(broken, point);
    assert.ok(apartBy(moved, point) > 3, 'the point moved');
    assert.ok(apartBy(move(broken, i, point), moved) < 1e-9, 'move() with the piece named gives the same place');
    const found = locate(broken, moved);
    assert.ok(found, 'the moved point is found in a piece');
    assert.equal(found.index, i);
    assert.ok(apartBy(found.point, point) < 1e-6);
    assert.ok(apartBy(restore(broken, moved), point) < 1e-6);
  });
});

test('the cracks have opened: somewhere along each one there is a gap that belongs to no piece', () => {
  for (const piece of broken.pieces) {
    let gaps = 0;
    for (let r = 60; r <= 600; r += 20) {
      for (const lean of [-1.5, -0.5, 0.5, 1.5]) if (!locate(broken, at(broken, piece.from + lean, r))) gaps++;
    }
    assert.ok(gaps > 0, `the crack at ${piece.from} degrees has no gap`);
  }
  assert.equal(restore(broken, at(fracture({ centre: [1000, 500], size: 800, amount: 0 }), 10, 200)) === null, false);
});

test('each piece comes with an outline that contains its own points and not its neighbours\'', () => {
  const inside = (polygon, [x, y]) => {
    let odd = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
    }
    return odd;
  };
  broken.pieces.forEach((piece, i) => {
    const own = at(broken, (piece.from + piece.to) / 2, 350);
    const next = broken.pieces[(i + 1) % broken.pieces.length];
    const other = at(broken, (next.from + next.to) / 2, 350);
    assert.ok(inside(piece.polygon, own), 'the outline holds the middle of its piece');
    assert.ok(!inside(piece.polygon, other), 'the outline leaves out the next piece');
  });
});

test('smaller cracks join each pair of neighbouring cracks, like a web', () => {
  assert.equal(broken.web.length, broken.pieces.length);
  broken.web.forEach(([a, b], i) => {
    const piece = broken.pieces[i];
    const bearing = (p) => (Math.atan2(p[1] - broken.impact[1], p[0] - broken.impact[0]) * 180) / Math.PI;
    const same = (x, y) => Math.abs(((x - y + 540) % 360) - 180) < 1e-6;
    assert.ok(same(bearing(a), piece.from) && same(bearing(b), piece.to), 'it runs from one crack to the next');
    assert.ok(apartBy(a, broken.impact) > 800 * 0.1 && apartBy(a, broken.impact) < 800 * 0.5);
  });
});

test('small shards lie scattered around the impact, inside the picture, in several tones', () => {
  assert.ok(broken.debris.length >= 10);
  for (const bit of broken.debris) {
    assert.ok(apartBy(bit.at, [1000, 500]) < 800 * 0.62, 'a shard lies outside the picture');
    assert.ok(apartBy(bit.at, broken.impact) > 800 * 0.08, 'a shard sits on the impact');
    assert.ok(bit.size > 800 * 0.01 && bit.size < 800 * 0.07);
  }
  assert.ok(new Set(broken.debris.map((b) => b.tone)).size >= 4);
  const whole = fracture({ centre: [1000, 500], size: 800, amount: 0 });
  for (const bit of whole.debris) assert.ok(apartBy(bit.at, whole.impact) < 1e-9, 'before the break the shards are at the impact');
});

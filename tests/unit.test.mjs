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

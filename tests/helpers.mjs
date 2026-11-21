import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

/** Playwright is optional: browser tests are skipped when it is not installed. */
export function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    return null;
  }
}

export const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Run `vite build` once and wait for it. Throws with the build output on failure. */
export function build() {
  const r = spawnSync(process.execPath, [VITE, 'build'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`vite build failed:\n${r.stdout}\n${r.stderr}`);
}

/** Start the dev server or a preview of the production build on a free port. */
export async function serve(kind) {
  const port = await freePort();
  const args = [VITE, ...(kind === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`${kind} server did not start on ${url}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, stop: () => child.kill() };
}

export const gzipSize = (file) => gzipSync(readFileSync(file)).length;

/** Sizes of the production build, split into what loads up front and everything else. */
export function builtSizes() {
  const dist = path.join(ROOT, 'dist');
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const upfront = new Set(
    [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.js)"/g)].map((m) => path.basename(m[1])),
  );
  const assets = path.join(dist, 'assets');
  const files = readdirSync(assets);
  const sum = (list) => list.reduce((n, f) => n + gzipSize(path.join(assets, f)), 0);
  const js = files.filter((f) => f.endsWith('.js'));
  return {
    html,
    upfrontScripts: [...upfront],
    entryJs: sum(js.filter((f) => upfront.has(f))),
    totalJs: sum(js),
    css: sum(files.filter((f) => f.endsWith('.css'))),
    jsFiles: js.map((f) => path.join(assets, f)),
  };
}

/**
 * Runs in the page before any site code. Counts what the page asks the GPU to do:
 * draw calls, render passes (a framebuffer bind followed by at least one draw),
 * megapixels covered by those passes, frames that drew anything, and shader programs.
 */
export function glHook() {
  const s = (window.__gl = { frames: 0, draws: 0, passes: 0, megapixels: 0, programs: 0, _drew: false, _vp: 0, _pass: false });
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    const wrap = (name, fn) => {
      const original = P[name];
      if (!original) return;
      P[name] = function (...args) { fn(...args); return original.apply(this, args); };
    };
    wrap('viewport', (x, y, w, h) => { s._vp = w * h; });
    wrap('bindFramebuffer', () => { s._pass = false; });
    for (const d of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      wrap(d, () => {
        s.draws++;
        s._drew = true;
        if (!s._pass) { s._pass = true; s.passes++; s.megapixels += s._vp / 1e6; }
      });
    }
    wrap('linkProgram', () => { s.programs++; });
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    s._drew = false;
    s._pass = false;
    cb(t);
    if (s._drew) s.frames++;
  });
}

export const SECTION_IDS = ['intro', 'about', 'drops', 'tour', 'kit', 'contact'];

export const VIEWPORTS = [
  [360, 640], [390, 844], [768, 1024], [1024, 768], [1280, 720],
  [1366, 768], [1440, 900], [1920, 1080], [2560, 1080],
];

/**
 * A minimal glTF file (one magenta box, 2 x 1 x 1) as a string, for testing that a real
 * model can replace a placeholder. Built from three's own BoxGeometry.
 */
export async function boxGltf() {
  const { BoxGeometry } = await import('three');
  const g = new BoxGeometry(2, 1, 1);
  const position = g.getAttribute('position').array;
  const normal = g.getAttribute('normal').array;
  const index = Uint16Array.from(g.getIndex().array);
  const bytes = Buffer.concat([Buffer.from(position.buffer), Buffer.from(normal.buffer), Buffer.from(index.buffer)]);
  const count = position.length / 3;
  return JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0.18, 0.53, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min: [-1, -0.5, -0.5], max: [1, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: index.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: position.byteLength },
      { buffer: 0, byteOffset: position.byteLength, byteLength: normal.byteLength },
      { buffer: 0, byteOffset: position.byteLength + normal.byteLength, byteLength: index.byteLength },
    ],
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}` }],
  });
}

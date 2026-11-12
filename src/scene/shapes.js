/**
 * Point-cloud shapes for the swarm. Every builder returns a Float32Array of
 * `count` xyz triples, normalised to fit roughly inside a unit sphere, so the
 * config's `size` is the shape's radius in metres.
 */

// Small deterministic random generator, so the swarm looks the same on every visit.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random point in a ball, biased toward the surface so tubes read as glowing shells.
function inBall(rand, radius, out, o) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const r = radius * Math.sqrt(rand());
  const s = Math.sqrt(1 - u * u);
  out[o] += r * s * Math.cos(phi);
  out[o + 1] += r * s * Math.sin(phi);
  out[o + 2] += r * u;
}

function knot(count, rand) {
  const out = new Float32Array(count * 3);
  const p = 2, q = 3, R = 0.6;
  for (let i = 0; i < count; i++) {
    const u = rand() * Math.PI * 2 * p;
    const quOverP = (q / p) * u;
    const cs = Math.cos(quOverP);
    const o = i * 3;
    out[o] = R * (2 + cs) * 0.5 * Math.cos(u);
    out[o + 1] = R * (2 + cs) * 0.5 * Math.sin(u);
    out[o + 2] = R * Math.sin(quOverP) * 0.5;
    inBall(rand, i % 5 === 0 ? 0.2 : 0.085, out, o); // a loose halo around a tight core
  }
  return out;
}

function helix(count, rand) {
  const out = new Float32Array(count * 3);
  const turns = 2.1, r = 0.4, height = 1.8, rungs = 15;
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    if (i % 5 === 0) {
      // rungs between the two strands
      const t = (Math.floor(rand() * rungs) + 0.5) / rungs;
      const a = t * Math.PI * 2 * turns;
      const k = (rand() * 2 - 1) * r;
      out[o] = Math.cos(a) * k;
      out[o + 1] = (t - 0.5) * height;
      out[o + 2] = Math.sin(a) * k;
      inBall(rand, 0.02, out, o);
    } else {
      const t = rand();
      const a = t * Math.PI * 2 * turns + (i % 2 ? Math.PI : 0);
      out[o] = Math.cos(a) * r;
      out[o + 1] = (t - 0.5) * height;
      out[o + 2] = Math.sin(a) * r;
      inBall(rand, 0.05, out, o);
    }
  }
  return out;
}

function sphere(count, rand) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    if (i % 4 === 0) {
      // tilted orbit ring
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * 0.98, z = Math.sin(a) * 0.98;
      out[o] = x;
      out[o + 1] = z * 0.35;
      out[o + 2] = z * 0.94;
      inBall(rand, 0.03, out, o);
    } else {
      const y = 1 - 2 * rand();
      const s = Math.sqrt(1 - y * y);
      const a = rand() * Math.PI * 2;
      out[o] = Math.cos(a) * s * 0.62;
      out[o + 1] = y * 0.62;
      out[o + 2] = Math.sin(a) * s * 0.62;
    }
  }
  return out;
}

/** Draws the characters on a 2D canvas and scatters points over the filled pixels. */
async function text(count, rand, def) {
  const font = def.font ?? "700 200px system-ui, sans-serif";
  try {
    // Make sure the web font is ready before measuring; fall back silently if it isn't.
    await Promise.race([document.fonts.load(font, def.text), new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* use fallback font */ }

  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = font;
  const m = ctx.measureText(def.text);
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 16;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 16;
  c.width = Math.max(w, 8);
  c.height = Math.max(h, 8);
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.fillText(def.text, 8 + m.actualBoundingBoxLeft, 8 + m.actualBoundingBoxAscent);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;

  const filled = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 128) filled.push(x, y);
    }
  }
  if (filled.length < 2) return sphere(count, rand);

  const half = Math.max(c.width, c.height) / 2;
  const out = new Float32Array(count * 3);
  const n = filled.length / 2;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(rand() * n) * 2;
    const o = i * 3;
    out[o] = (filled[k] + rand() - c.width / 2) / half;
    out[o + 1] = -(filled[k + 1] + rand() - c.height / 2) / half;
    out[o + 2] = (rand() - 0.5) * 0.16;
    if (i % 9 === 0) inBall(rand, 0.1, out, o); // a few stragglers soften the edges
  }
  return out;
}

const builders = { knot, helix, sphere, text };

export async function buildShapes(defs, count) {
  return Promise.all(
    defs.map((def, i) => (builders[def.shape] ?? sphere)(count, mulberry32(1337 + i * 7919), def)),
  );
}

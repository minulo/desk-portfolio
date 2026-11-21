import { BoxGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { paint, combine } from './geometry.js';

/**
 * Stand-in objects for the street-corner set, built from simple shapes. Each builder
 * returns ONE geometry (one draw call) standing on y = 0. Real models replace them
 * through scene.config.js; sizes here matter little because every object is rescaled
 * to its `fit` size.
 *
 * Colour follows the site's rule: bodies are quiet base tones, and each object carries
 * one small, loud accent.
 */

// Base tones (never pure black or white)
const INK = 0x161514;
const CHAR = 0x2b2825;
const CONCRETE = 0x8c8880;
const SHELL = 0xd9d3c4; // off-white plastic
const PAPER = 0xece7da;
const SCREEN = 0x14161c;
// Accents
const YELLOW = 0xffd400;
const CRIMSON = 0xff2a44;
const MAGENTA = 0xff2e88;
const CYAN = 0x19e0ff;
const ACID = 0xb6ff3c;

const FLAT = { flat: true };
const box = (w, h, d, x, y, z, hex, opts) => paint(new BoxGeometry(w, h, d).translate(x, y, z), hex, opts);
/** A disc facing the viewer (+z), for knobs and reels. */
const disc = (r, depth, x, y, z, hex, opts) => paint(new CylinderGeometry(r, r, depth, 18).rotateX(Math.PI / 2).translate(x, y, z), hex, opts);

/** A CRT television on a crate, showing colour bars. The centrepiece. */
function tv() {
  const parts = [
    box(0.54, 0.2, 0.42, 0, 0.1, 0, CHAR),                         // crate
    box(0.54, 0.034, 0.004, 0, 0.15, 0.212, YELLOW, FLAT),         // stripe on the crate
    box(0.66, 0.5, 0.48, 0, 0.45, 0, SHELL),                       // shell
    box(0.62, 0.46, 0.012, 0, 0.45, 0.242, CHAR),                  // front panel
    box(0.426, 0.346, 0.006, -0.08, 0.47, 0.25, SCREEN, FLAT),     // screen, a hair larger than the bars
    box(0.42, 0.05, 0.007, -0.08, 0.325, 0.2505, INK, FLAT),       // lower band
    box(0.12, 0.028, 0.008, -0.2, 0.325, 0.251, PAPER, FLAT),      // station ident
    disc(0.03, 0.03, 0.225, 0.585, 0.255, INK),                    // channel knob
    box(0.008, 0.03, 0.004, 0.225, 0.595, 0.272, YELLOW, FLAT),
    disc(0.024, 0.026, 0.225, 0.49, 0.255, INK),                   // volume knob
    box(0.08, 0.02, 0.06, 0, 0.71, -0.06, INK),                    // antenna base
  ];
  // Colour bars: the one place this object is loud.
  [PAPER, YELLOW, CYAN, ACID, MAGENTA, CRIMSON].forEach((hex, i) => {
    parts.push(box(0.07, 0.24, 0.007, -0.255 + i * 0.07, 0.52, 0.2505, hex, FLAT));
  });
  // Speaker slits
  for (let i = 0; i < 4; i++) parts.push(box(0.09, 0.008, 0.004, 0.225, 0.31 + i * 0.022, 0.249, CONCRETE, FLAT));
  // Rabbit-ear antenna: two rods hinged at the base
  for (const lean of [-0.52, 0.42]) {
    parts.push(paint(new CylinderGeometry(0.005, 0.005, 0.42, 8).translate(0, 0.21, 0).rotateZ(lean).translate(0, 0.72, -0.06), INK));
  }
  return combine(parts);
}

/** One VHS tape lying flat, face up, centred on the origin. */
function tape() {
  const reel = (x) => paint(new CylinderGeometry(0.015, 0.015, 0.0012, 16).translate(x, 0.0152, -0.022), PAPER, FLAT);
  return [
    box(0.2, 0.028, 0.11, 0, 0, 0, INK),
    box(0.15, 0.018, 0.002, 0.01, 0, 0.056, PAPER, FLAT),          // spine label
    box(0.028, 0.017, 0.0025, -0.06, 0, 0.0562, MAGENTA, FLAT),
    box(0.16, 0.001, 0.036, 0, 0.0146, 0.028, PAPER, FLAT),        // face label
    box(0.158, 0.0012, 0.008, 0, 0.0148, 0.041, MAGENTA, FLAT),    // stripes sit just inside their label
    box(0.1, 0.0012, 0.002, -0.02, 0.0148, 0.024, CONCRETE, FLAT), // a written line
    box(0.13, 0.001, 0.04, 0, 0.0146, -0.022, SCREEN, FLAT),       // window
    reel(-0.036),
    reel(0.036),
  ];
}

/** Three VHS tapes: two stacked, one stood on its end behind them. */
function tapes() {
  const lying = (y, turn, dx, dz) => tape().map((g) => g.rotateY(turn).translate(dx, y, dz));
  const standing = tape().map((g) => g.rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(-0.35).translate(-0.085, 0.1, -0.08));
  return combine([...lying(0.014, 0.06, 0.03, 0.02), ...lying(0.043, -0.22, 0.04, 0.03), ...standing]);
}

/** A cassette standing on its edge, leaning on a small block, with its case in front. */
function cassette() {
  const lean = -0.3;
  const pieces = [
    box(0.1, 0.064, 0.012, 0, 0.032, 0, CHAR),
    box(0.088, 0.04, 0.002, 0, 0.04, 0.0065, PAPER, FLAT),         // label
    box(0.086, 0.007, 0.0022, 0, 0.0555, 0.0067, CYAN, FLAT),
    box(0.05, 0.0015, 0.0022, -0.014, 0.0475, 0.0067, CONCRETE, FLAT), // a written line
    box(0.04, 0.016, 0.0024, 0, 0.034, 0.0068, INK, FLAT),         // window
    disc(0.0085, 0.003, -0.027, 0.034, 0.0075, INK, FLAT),         // reels
    disc(0.0085, 0.003, 0.027, 0.034, 0.0075, INK, FLAT),
    disc(0.0035, 0.0034, -0.027, 0.034, 0.0077, PAPER, FLAT),
    disc(0.0035, 0.0034, 0.027, 0.034, 0.0077, PAPER, FLAT),
    box(0.06, 0.013, 0.015, 0, 0.0065, 0, INK),                    // head opening
  ];
  for (const x of [-0.044, 0.044]) {
    for (const y of [0.0065, 0.0575]) pieces.push(disc(0.0022, 0.003, x, y, 0.0062, CONCRETE, FLAT)); // screws
  }
  // Leaning tips the front bottom edge 2.2 mm below the ground; lift it back onto it.
  const leaning = pieces.map((g) => g.rotateX(lean).translate(0, 0.0023, 0));
  // Its case, lying open side up in front.
  const cassetteCase = [
    box(0.108, 0.014, 0.07, 0, 0.007, 0, INK),
    box(0.096, 0.001, 0.058, 0, 0.0146, 0, PAPER, FLAT),           // inlay card
    box(0.094, 0.0012, 0.012, 0, 0.0148, 0.02, CYAN, FLAT),
    box(0.06, 0.0012, 0.002, -0.014, 0.0148, -0.004, CONCRETE, FLAT),
    box(0.06, 0.0012, 0.002, -0.014, 0.0148, -0.014, CONCRETE, FLAT),
  ].map((g) => g.rotateY(0.38).translate(0.03, 0, 0.07));
  return combine([...leaning, box(0.03, 0.036, 0.02, 0, 0.018, -0.026, INK), ...cassetteCase]);
}

/** One floppy disk lying flat, label up, centred on the origin. */
function floppy(body) {
  return [
    box(0.09, 0.005, 0.094, 0, 0, 0, body),
    box(0.05, 0.001, 0.03, 0.006, 0.003, -0.032, CONCRETE, FLAT),  // metal shutter
    box(0.014, 0.0012, 0.022, 0.012, 0.0031, -0.032, INK, FLAT),   // the opening in it
    box(0.07, 0.001, 0.044, 0, 0.003, 0.022, PAPER, FLAT),         // label
    box(0.068, 0.0012, 0.008, 0, 0.0031, 0.005, ACID, FLAT),
    box(0.05, 0.0012, 0.002, -0.006, 0.0031, 0.02, CONCRETE, FLAT), // written lines
    box(0.05, 0.0012, 0.002, -0.006, 0.0031, 0.03, CONCRETE, FLAT),
  ];
}

/** Three floppy disks: two lying flat, one stood up against a small block. */
function floppies() {
  const lying = (y, turn, dx, dz, body) => floppy(body).map((g) => g.rotateY(turn).translate(dx, y, dz));
  // Stood on its edge with the label at the top, leaning back.
  const prop = (g) => g.rotateY(0.3).translate(-0.03, 0, -0.03);
  // The lean tips its back bottom edge just under the ground, so it is lifted by that much.
  const standing = floppy(CHAR).map((g) => prop(g.rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 0.047, 0).rotateX(-0.3).translate(0, 0.0008, 0)));
  return combine([
    ...lying(0.0025, 0.12, 0.03, 0.04, INK),
    ...lying(0.0085, -0.3, 0.038, 0.045, CHAR),
    ...standing,
    prop(box(0.03, 0.05, 0.02, 0, 0.025, -0.026, INK)),
  ]);
}

/** A brick phone with a stub antenna and a lit display. */
function phone() {
  const parts = [
    box(0.066, 0.2, 0.046, 0, 0.1, 0, CHAR),
    box(0.046, 0.028, 0.002, 0, 0.15, 0.0235, YELLOW, FLAT),       // display
    paint(new CylinderGeometry(0.006, 0.006, 0.1, 8).translate(-0.02, 0.25, 0), INK),
    paint(new SphereGeometry(0.009, 10, 8).translate(-0.02, 0.302, 0), YELLOW, FLAT),
  ];
  for (let i = 0; i < 3; i++) parts.push(box(0.022, 0.004, 0.002, 0, 0.176 + i * 0.008, 0.0235, PAPER, FLAT)); // earpiece
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) parts.push(box(0.012, 0.011, 0.005, (c - 1) * 0.017, 0.114 - r * 0.02, 0.0245, PAPER));
  }
  return combine(parts);
}

/** A traffic cone. */
function cone() {
  return combine([
    box(0.15, 0.012, 0.15, 0, 0.006, 0, INK),
    paint(new CylinderGeometry(0.014, 0.058, 0.2, 20).translate(0, 0.112, 0), CRIMSON),
    // Stripes sit a hair outside the cone, which narrows from 0.058 (y 0.012) to 0.014 (y 0.212).
    paint(new CylinderGeometry(0.0378, 0.0466, 0.04, 20, 1, true).translate(0, 0.088, 0), PAPER),
    paint(new CylinderGeometry(0.0268, 0.0321, 0.024, 20, 1, true).translate(0, 0.146, 0), PAPER),
  ]);
}

/** A spray can. Decoration. */
function can() {
  return combine([
    paint(new CylinderGeometry(0.033, 0.033, 0.13, 22).translate(0, 0.065, 0), CHAR),
    paint(new CylinderGeometry(0.0336, 0.0336, 0.034, 22, 1, true).translate(0, 0.07, 0), YELLOW),
    paint(new SphereGeometry(0.033, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.13, 0), CONCRETE),
    paint(new CylinderGeometry(0.012, 0.012, 0.016, 12).translate(0, 0.166, 0), PAPER),
    box(0.006, 0.006, 0.012, 0, 0.168, 0.012, INK),
  ]);
}

/**
 * A concrete slab with a hazard-striped front edge. Top at y = `top`. The big one is the
 * set everything stands on; small thin ones are the stands objects are shown on alone.
 *
 * @param {number} top
 * @param {object} [o]
 * @param {number} [o.width]
 * @param {number} [o.depth]
 * @param {number} [o.thickness]  how far down from `top` it reaches (default: to y = 0)
 * @param {number} [o.stripe]     width of one block of the hazard stripe
 * @param {boolean} [o.line]      paint a line along the front of the top (sized for the big slab)
 * @param {boolean} [o.bare]      just the block, with no stripe or line: the shape a
 *                                die-cut edge follows, so it has no notch at every stripe
 */
export function slab(top, { width = 1.86, depth = 1.04, thickness = top, stripe = 0.116, line = true, bare = false } = {}) {
  const middle = top - thickness / 2;
  const parts = [box(width, thickness, depth, 0, middle, 0, CONCRETE)];
  if (bare) return combine(parts);
  if (line) parts.push(box(width - 0.16, 0.001, 0.016, 0, top + 0.0006, depth / 2 - 0.08, PAPER, FLAT));
  const blocks = Math.max(4, Math.round(width / stripe / 2) * 2); // an even number
  for (let i = 0; i < blocks; i++) {
    parts.push(box(width / blocks, thickness * 0.72, 0.004, -width / 2 + (i + 0.5) * (width / blocks), middle, depth / 2 + 0.002, i % 2 ? INK : YELLOW, FLAT));
  }
  return combine(parts);
}

export const placeholders = { tv, tapes, cassette, floppies, phone, cone, can };

import {
  BoxGeometry, CylinderGeometry, TorusGeometry, SphereGeometry,
} from 'three';
import { paint, combine } from './geometry.js';

/**
 * Stand-in objects, built from simple shapes and drawn in the site's palette. Each
 * builder returns ONE geometry (one draw call) standing on y = 0. Real models replace
 * them through scene.config.js; sizes here do not matter much because every object is
 * rescaled to its `fit` size.
 */

const INK = 0x141416;
const PAPER = 0xf2efe6;
const YELLOW = 0xffd400;
const MAGENTA = 0xff2e88;
const CRIMSON = 0xd7263d;
const LIME = 0xb6ff3c;
const STEEL = 0x8b8f9c;

const box = (w, h, d, x, y, z, hex, opts) => paint(new BoxGeometry(w, h, d).translate(x, y, z), hex, opts);

function monitor() {
  const parts = [
    box(0.24, 0.016, 0.17, 0, 0.008, 0, INK),                 // foot
    box(0.045, 0.17, 0.03, 0, 0.1, -0.03, INK),               // neck
    box(0.62, 0.37, 0.03, 0, 0.345, -0.02, INK),              // body
    box(0.58, 0.33, 0.004, 0, 0.345, -0.003, 0x1b1d3a, { flat: true }), // screen
    box(0.58, 0.03, 0.005, 0, 0.495, -0.002, MAGENTA, { flat: true }),  // title bar
  ];
  // Lines of "code": flat coloured bars.
  const bars = [
    [0.2, YELLOW], [0.34, PAPER], [0.26, PAPER], [0.14, MAGENTA], [0.38, PAPER],
    [0.22, YELLOW], [0.3, PAPER], [0.12, LIME],
  ];
  bars.forEach(([w, hex], i) => {
    const indent = i % 3 === 0 ? 0 : 0.03;
    parts.push(box(w, 0.014, 0.005, -0.26 + indent + w / 2, 0.455 - i * 0.03, -0.001, hex, { flat: true }));
  });
  parts.push(box(0.03, 0.006, 0.006, 0.27, 0.172, -0.004, LIME, { flat: true })); // power light
  return combine(parts);
}

function keyboard() {
  const parts = [box(0.44, 0.022, 0.15, 0, 0.011, 0, INK)];
  const cols = 14, rows = 5, key = 0.025, gap = 0.0052;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const accent = (r === 0 && c === 0) || (r === 3 && c === cols - 1);
      const edge = c === 0 || c === cols - 1 || r === rows - 1;
      const hex = accent ? MAGENTA : edge ? YELLOW : PAPER;
      parts.push(box(key, 0.012, key, (c - (cols - 1) / 2) * (key + gap), 0.028, (r - (rows - 1) / 2) * (key + gap), hex));
    }
  }
  return combine(parts);
}

function mug() {
  const body = paint(new CylinderGeometry(0.044, 0.04, 0.1, 28).translate(0, 0.05, 0), PAPER);
  const band = paint(new CylinderGeometry(0.0432, 0.042, 0.03, 28, 1, true).translate(0, 0.042, 0), MAGENTA);
  const coffee = paint(new CylinderGeometry(0.037, 0.037, 0.002, 28).translate(0, 0.1, 0), 0x2a1710, { flat: true });
  const handle = paint(new TorusGeometry(0.027, 0.008, 8, 18, Math.PI).rotateZ(-Math.PI / 2).translate(0.043, 0.05, 0), PAPER);
  return combine([body, band, coffee, handle]);
}

function phone() {
  // Built lying flat, then tipped up to lean on a small stand so its screen faces the camera.
  const lean = (70 * Math.PI) / 180;
  const flat = [
    box(0.078, 0.01, 0.158, 0, 0.005, 0, INK),
    box(0.068, 0.002, 0.146, 0, 0.0105, 0, 0x24124a, { flat: true }),   // screen
    box(0.05, 0.002, 0.03, 0, 0.0112, -0.035, MAGENTA, { flat: true }), // incoming call
    box(0.016, 0.002, 0.016, -0.016, 0.0112, 0.04, CRIMSON, { flat: true }),
    box(0.016, 0.002, 0.016, 0.016, 0.0112, 0.04, LIME, { flat: true }),
  ].map((part) => part.rotateX(lean));
  const stand = box(0.05, 0.062, 0.04, 0, -0.044, -0.042, INK);
  return combine([...flat, stand]);
}

function cone() {
  return combine([
    box(0.15, 0.012, 0.15, 0, 0.006, 0, INK),
    paint(new CylinderGeometry(0.014, 0.058, 0.2, 20).translate(0, 0.112, 0), CRIMSON),
    // Stripes sit a hair outside the cone, which narrows from 0.058 (y 0.012) to 0.014 (y 0.212).
    paint(new CylinderGeometry(0.0378, 0.0466, 0.04, 20, 1, true).translate(0, 0.088, 0), PAPER),
    paint(new CylinderGeometry(0.0268, 0.0321, 0.024, 20, 1, true).translate(0, 0.146, 0), PAPER),
  ]);
}

function can() {
  return combine([
    paint(new CylinderGeometry(0.033, 0.033, 0.13, 22).translate(0, 0.065, 0), MAGENTA),
    paint(new CylinderGeometry(0.0336, 0.0336, 0.034, 22, 1, true).translate(0, 0.07, 0), INK),
    paint(new SphereGeometry(0.033, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.13, 0), STEEL),
    paint(new CylinderGeometry(0.012, 0.012, 0.016, 12).translate(0, 0.166, 0), PAPER),
    box(0.006, 0.006, 0.012, 0, 0.168, 0.012, INK),
  ]);
}

/** The desk itself: slab, legs and a mat. Built in metres around the origin; top at y = `top`. */
export function desk(top) {
  const slab = 0.045;
  const leg = top - slab;
  const parts = [
    box(1.64, slab, 0.84, 0, top - slab / 2, 0, 0xe9e4d6),
    box(1.64, 0.012, 0.012, 0, top - slab + 0.006, 0.421, YELLOW, { flat: true }),   // front edge stripe
    box(0.96, 0.005, 0.38, -0.02, top + 0.0025, 0.15, INK),                          // mat
  ];
  for (const [x, z] of [[-0.76, -0.36], [0.76, -0.36], [-0.76, 0.36], [0.76, 0.36]]) {
    parts.push(box(0.05, leg, 0.05, x, leg / 2, z, INK));
  }
  parts.push(box(1.5, 0.04, 0.04, 0, leg * 0.3, -0.36, INK)); // back stretcher
  return combine(parts);
}

export const placeholders = { monitor, keyboard, mug, phone, cone, can };

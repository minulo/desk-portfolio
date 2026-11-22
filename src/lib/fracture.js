/**
 * The cracked-screen pattern of Static mode.
 *
 * Straight cracks run out from one point of impact and cut the picture into wedges.
 * Each wedge moves outward, turns and changes size a little, as a piece of broken glass
 * would, so the cracks open into gaps. And like the pieces of a broken mirror, each one
 * shows the scene from its own angle; two of them are even tuned to other channels.
 *
 * The chaos is drawn, not random: the pattern is the same every time and every piece
 * is rigid. That regularity is what lets a visitor read the damage as made on purpose
 * rather than as a fault.
 *
 * Everything here is in screen terms: x to the right, y DOWN, angles in degrees turning
 * clockwise from "east". The page uses it to cut up the screen frame, and the 3D scene
 * uses it to cut up the picture, so both break along the same lines.
 */

/** The directions the cracks run in. One piece lies between each crack and the next. */
export const CRACKS = [-158, -112, -61, -18, 34, 97, 151];

// Where the impact is, from the centre of the picture, as a share of its size: up in a
// corner, not on the object. With every crack meeting on top of it, the object would be
// cut into slivers; from the corner it stays in a few large pieces.
const IMPACT = [0.17, -0.15];

// One entry per piece. Fixed, not random: the picture breaks the same way every time.
const SHIFT = [0.02, 0.013, 0.024, 0.015, 0.021, 0.016, 0.018]; // how far it moves outward (share of the size)
const TURN = [-3.2, 2.1, -1.6, 3.8, -2.6, 1.9, -4.1];           // how far it turns, degrees
const GROW = [0.04, -0.05, 0.07, -0.03, 0.05, -0.06, 0.02];     // how much larger or smaller it is drawn
const VIEW = [[6, -3], [-9, 5], [12, -6], [-5, 4], [8, -4], [-12, 6], [4, -2]]; // the angle it sees the scene from: [turn, tilt], degrees
const SWAY = [1.6, -1.2, 2.4, -0.8, 1.9, -2.2, 1.1];            // how it answers the pointer, against the whole picture's 1
const STRAY = [0, 0, 1, 0, -1, 0, 0];                           // tuned to the next (+1) or the previous (-1) channel
const WEB = [0.2, 0.36, 0.27, 0.42, 0.18, 0.33, 0.24];          // where a smaller crack crosses it (share of the size from the impact)

// Small shards knocked loose: [direction in degrees, distance, size (shares of the picture's
// size), turn in degrees, tone]. They lie along the cracks, where the gaps are.
const DEBRIS = [
  [-155, 0.24, 0.03, 40, 0], [-150, 0.46, 0.022, -70, 1], [-109, 0.16, 0.034, 115, 2], [-116, 0.3, 0.02, 20, 3],
  [-57, 0.14, 0.024, -35, 4], [-64, 0.27, 0.036, 80, 0], [-14, 0.2, 0.03, 150, 1], [-22, 0.33, 0.022, -110, 5],
  [38, 0.24, 0.032, 60, 2], [30, 0.4, 0.024, -20, 3], [101, 0.3, 0.03, 95, 4], [93, 0.52, 0.038, -140, 5],
  [147, 0.3, 0.024, 10, 1], [155, 0.5, 0.032, -85, 0], [140, 0.62, 0.026, 130, 2], [165, 0.42, 0.02, -50, 4],
];

const rad = (degrees) => (degrees * Math.PI) / 180;
const ray = (from, degrees, length) => [from[0] + Math.cos(rad(degrees)) * length, from[1] + Math.sin(rad(degrees)) * length];

/**
 * @param {object} o
 * @param {number[]} o.centre  [x, y] centre of the picture, in pixels
 * @param {number} o.size      side of the square the picture is framed in, in pixels
 * @param {number} [o.amount]  0 = whole, 1 = fully apart (more than 1 while it overshoots)
 * @returns {{ impact: number[], pieces: object[], web: number[][][], debris: object[] }}
 *   pieces[i]:
 *     from, to  the two cracks that bound the piece, degrees, from < to
 *     offset    [dx, dy] the piece has moved, pixels
 *     turn      degrees it has turned around the impact, clockwise
 *     scale     how much larger (or smaller) it is drawn, around the impact
 *     view      [turn, tilt] degrees: the angle it sees the scene from
 *     sway      how strongly it follows the pointer (negative: the other way)
 *     stray     0, or +1 / -1 when it is tuned to the next / previous channel
 *     polygon   its outline before it moved, as [x, y] points (reaches far outside the picture)
 *   web[i]:     a smaller crack across piece i, as two points, before anything moved
 *   debris[j]:  { at: [x, y], size, turn, tone } one loose shard
 */
export function fracture({ centre, size, amount = 1 }) {
  const impact = [centre[0] + IMPACT[0] * size, centre[1] + IMPACT[1] * size];
  const far = size * 4;
  const pieces = CRACKS.map((from, i) => {
    const to = i + 1 < CRACKS.length ? CRACKS[i + 1] : CRACKS[0] + 360;
    const middle = (from + to) / 2;
    const shift = SHIFT[i] * size * amount;
    return {
      from,
      to,
      offset: [Math.cos(rad(middle)) * shift, Math.sin(rad(middle)) * shift],
      turn: TURN[i] * amount,
      scale: 1 + GROW[i] * amount,
      view: [VIEW[i][0] * amount, VIEW[i][1] * amount],
      sway: 1 + (SWAY[i] - 1) * amount,
      stray: STRAY[i],
      // A kite, not a triangle: the extra point keeps the far edge well away from the picture.
      polygon: [impact, ray(impact, from, far), ray(impact, middle, far), ray(impact, to, far)],
    };
  });
  const web = pieces.map((piece, i) => [ray(impact, piece.from, WEB[i] * size), ray(impact, piece.to, WEB[i] * size)]);
  const debris = DEBRIS.map(([direction, distance, bit, turn, tone]) => ({
    at: ray(impact, direction, distance * size * amount),
    size: bit * size,
    turn: turn * amount,
    tone,
  }));
  return { impact, pieces, web, debris };
}

/** The angle of `point` seen from the impact, in degrees, in the full turn that starts at the first crack. */
function bearing(layout, point) {
  const degrees = (Math.atan2(point[1] - layout.impact[1], point[0] - layout.impact[0]) * 180) / Math.PI;
  const first = layout.pieces[0].from;
  return ((((degrees - first) % 360) + 360) % 360) + first;
}

/** Which piece a point of the whole picture belongs to. */
export function sector(layout, point) {
  const angle = bearing(layout, point);
  const index = layout.pieces.findIndex((p) => angle >= p.from && angle < p.to);
  return index < 0 ? layout.pieces.length - 1 : index;
}

/** Turn `point` around the impact by `degrees` (clockwise on screen) and scale it from there. */
function turned(layout, point, degrees, scale) {
  const c = Math.cos(rad(degrees)) * scale;
  const s = Math.sin(rad(degrees)) * scale;
  const x = point[0] - layout.impact[0];
  const y = point[1] - layout.impact[1];
  return [layout.impact[0] + c * x - s * y, layout.impact[1] + s * x + c * y];
}

/** Where a point of the whole picture ends up when piece `index` carries it. */
export function move(layout, index, point) {
  const piece = layout.pieces[index];
  const [x, y] = turned(layout, point, piece.turn, piece.scale);
  return [x + piece.offset[0], y + piece.offset[1]];
}

/** Where a point of the whole picture ends up once its own piece has moved. */
export function displace(layout, point) {
  return move(layout, sector(layout, point), point);
}

/**
 * The reverse: which piece is showing at `point` now, and which point of the whole
 * picture that is. Returns null where there is no piece, which is to say in a gap.
 * Where two pieces overlap, the one drawn last (the later one) is on top.
 * @returns {{ index: number, point: number[] } | null}
 */
export function locate(layout, point) {
  for (let index = layout.pieces.length - 1; index >= 0; index--) {
    const piece = layout.pieces[index];
    const back = turned(layout, [point[0] - piece.offset[0], point[1] - piece.offset[1]], -piece.turn, 1 / piece.scale);
    const angle = bearing(layout, back);
    if (angle >= piece.from && angle < piece.to) return { index, point: back };
  }
  return null;
}

/** As locate(), but just the point. */
export function restore(layout, point) {
  return locate(layout, point)?.point ?? null;
}

/**
 * The channel a piece shows. `current` is the section on screen and `count` the number
 * of sections; section 0 is the opening one and has no object of its own, so a stray
 * piece only ever lands on 1..count-1, and never on the current channel.
 * @param {number} current  index of the section on screen
 * @param {number} stray    0, +1 or -1 (a piece's `stray`)
 * @param {number} count    number of sections, the opening one included
 */
export function strayChannel(current, stray, count) {
  if (!stray) return current;
  const channels = count - 1;
  if (current === 0) return stray > 0 ? 1 : channels;
  return ((((current - 1 + stray) % channels) + channels) % channels) + 1;
}

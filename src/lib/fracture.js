/**
 * The cracked-screen pattern of Static mode.
 *
 * Straight cracks run out from one point of impact and cut the picture into wedges.
 * Each wedge moves a little way outward and turns slightly, as a piece of broken glass
 * would, so every crack opens into a gap. The pattern is the same every time and the
 * pieces are rigid: that regularity is what lets a visitor read the damage as drawn on
 * purpose rather than as a fault.
 *
 * Everything here is in screen terms: x to the right, y DOWN, angles in degrees turning
 * clockwise from "east". The page uses it to cut up the screen frame, and the 3D scene
 * uses it to cut up the picture, so both break along the same lines.
 */

/** The directions the cracks run in. One piece lies between each crack and the next. */
export const CRACKS = [-158, -112, -61, -18, 34, 97, 151];

// Where the impact is, from the centre of the picture, as a share of its size.
const IMPACT = [0.07, -0.06];
// How far each piece moves outward (a share of the picture's size) and how far it turns
// (degrees). Fixed, not random: the picture breaks the same way every time.
// Small on purpose: the gaps should read as cracks, and leave the picture easy to see.
const SHIFT = [0.017, 0.011, 0.019, 0.012, 0.017, 0.01, 0.015];
const TURN = [-1.1, 0.8, -0.6, 1.3, -0.9, 0.7, -1.4];

const rad = (degrees) => (degrees * Math.PI) / 180;

/**
 * @param {object} o
 * @param {number[]} o.centre  [x, y] centre of the picture, in pixels
 * @param {number} o.size      side of the square the picture is framed in, in pixels
 * @param {number} [o.amount]  0 = whole, 1 = fully apart (more than 1 while it overshoots)
 * @returns {{ impact: number[], pieces: { from: number, to: number, offset: number[], turn: number, polygon: number[][] }[] }}
 *   from/to: the two cracks that bound the piece, degrees, from < to
 *   offset:  [dx, dy] the piece has moved, pixels
 *   turn:    degrees the piece has turned around the impact, clockwise
 *   polygon: the piece's outline before it moved, as [x, y] points (reaches far outside the picture)
 */
export function fracture({ centre, size, amount = 1 }) {
  const impact = [centre[0] + IMPACT[0] * size, centre[1] + IMPACT[1] * size];
  const far = size * 4;
  const corner = (degrees) => [impact[0] + Math.cos(rad(degrees)) * far, impact[1] + Math.sin(rad(degrees)) * far];
  const pieces = CRACKS.map((from, i) => {
    const to = i + 1 < CRACKS.length ? CRACKS[i + 1] : CRACKS[0] + 360;
    const middle = (from + to) / 2;
    const shift = SHIFT[i % SHIFT.length] * size * amount;
    return {
      from,
      to,
      offset: [Math.cos(rad(middle)) * shift, Math.sin(rad(middle)) * shift],
      turn: TURN[i % TURN.length] * amount,
      // A kite, not a triangle: the extra point keeps the far edge well away from the picture.
      polygon: [impact, corner(from), corner(middle), corner(to)],
    };
  });
  return { impact, pieces };
}

/** The angle of `point` seen from the impact, in degrees, in the half-open turn that starts at the first crack. */
function bearing(layout, point) {
  const degrees = (Math.atan2(point[1] - layout.impact[1], point[0] - layout.impact[0]) * 180) / Math.PI;
  const first = layout.pieces[0].from;
  return ((((degrees - first) % 360) + 360) % 360) + first;
}

/** Turn `point` around the impact by `degrees` (clockwise on screen). */
function turned(layout, point, degrees) {
  const c = Math.cos(rad(degrees));
  const s = Math.sin(rad(degrees));
  const x = point[0] - layout.impact[0];
  const y = point[1] - layout.impact[1];
  return [layout.impact[0] + c * x - s * y, layout.impact[1] + s * x + c * y];
}

/** Where a point of the whole picture ends up once its piece has moved. */
export function displace(layout, point) {
  const angle = bearing(layout, point);
  const piece = layout.pieces.find((p) => angle >= p.from && angle < p.to) ?? layout.pieces.at(-1);
  const [x, y] = turned(layout, point, piece.turn);
  return [x + piece.offset[0], y + piece.offset[1]];
}

/**
 * The reverse: which point of the whole picture is showing at `point` now.
 * Returns null where there is no piece, which is to say in a gap.
 */
export function restore(layout, point) {
  for (const piece of layout.pieces) {
    const back = turned(layout, [point[0] - piece.offset[0], point[1] - piece.offset[1]], -piece.turn);
    const angle = bearing(layout, back);
    if (angle >= piece.from && angle < piece.to) return back;
  }
  return null;
}

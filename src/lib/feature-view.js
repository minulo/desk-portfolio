const rad = (degrees) => (degrees * Math.PI) / 180;

/**
 * Where to put the camera to feature one object on its own.
 *
 * The object is treated as a ball of `radius` around `centre`. The camera looks at the
 * centre from the direction `from` and stands back just far enough that the ball spans
 * `fill` of the view's height.
 *
 * @param {object} o
 * @param {number[]} o.centre  [x, y, z]
 * @param {number} o.radius
 * @param {number[]} o.from    [turn, tilt] in degrees: turn 0 is straight in front (+z),
 *                             90 is from the right (+x); tilt raises the camera
 * @param {number} o.fill      0..1 share of the view height the ball takes up
 * @param {number} o.fov       the camera's vertical field of view, in degrees
 * @returns {{ camera: number[], target: number[] }}
 */
export function featureCamera({ centre, radius, from, fill, fov }) {
  const turn = rad(from[0]);
  const tilt = rad(from[1]);
  const distance = radius / (fill * Math.tan(rad(fov) / 2));
  return {
    target: [...centre],
    camera: [
      centre[0] + Math.sin(turn) * Math.cos(tilt) * distance,
      centre[1] + Math.sin(tilt) * distance,
      centre[2] + Math.cos(turn) * Math.cos(tilt) * distance,
    ],
  };
}

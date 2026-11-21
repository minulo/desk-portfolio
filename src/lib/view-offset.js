/**
 * The 3D scene is framed around the centre of the screen. This returns the offset for
 * `camera.setViewOffset(width, height, x, y, width, height)` that moves that centre to
 * the middle of `rect` (the part of the screen not covered by text).
 *
 * @param {{width: number, height: number}} viewport
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {{x: number, y: number}}
 */
export function artWindowOffset(viewport, rect) {
  return {
    x: viewport.width / 2 - (rect.x + rect.width / 2),
    y: viewport.height / 2 - (rect.y + rect.height / 2),
  };
}

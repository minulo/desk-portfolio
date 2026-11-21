/**
 * How many canvas pixels to draw per CSS pixel.
 *
 * Sharper is better for ink lines, but cost grows with the square of this number, and a
 * large Retina window would otherwise mean 8+ megapixels per frame. So: use the display's
 * own ratio, at most 2, and no more than fits a fixed pixel budget; never less than 1.
 *
 * @param {number} width   window width in CSS pixels
 * @param {number} height  window height in CSS pixels
 * @param {number} deviceRatio  window.devicePixelRatio
 * @param {number} budget  most canvas pixels to draw
 */
export function renderScale(width, height, deviceRatio, budget = 4.5e6) {
  const device = deviceRatio > 0 ? deviceRatio : 1;
  const area = width * height;
  const fits = area > 0 ? Math.sqrt(budget / area) : Infinity;
  return Math.max(Math.min(device, 1), Math.min(device, 2, fits));
}

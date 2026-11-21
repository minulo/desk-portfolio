/**
 * Which section is the visitor looking at?
 *
 * @param {{top: number, bottom: number}[]} rects  section boxes in viewport pixels, in page order
 * @param {number} line  y position of the reference line in viewport pixels
 * @returns {number} index of the section containing the line; the first section if the
 *   line is above all of them, the last if below all; -1 for an empty list. A boundary
 *   shared by two sections belongs to the later one.
 */
export function pickActive(rects, line) {
  if (!rects.length) return -1;
  let active = 0;
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].top <= line) active = i;
  }
  return active;
}

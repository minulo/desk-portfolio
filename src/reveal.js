import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/**
 * Text reveals for each section. Headings and paragraphs marked [data-split]
 * rise line by line out of a mask; elements marked [data-rise] (list rows,
 * links) fade up as whole blocks, so grids and links are never broken apart.
 * SplitText re-splits on resize and font load (autoSplit) and rebuilds its
 * animation through onSplit.
 * Skipped when the user prefers reduced motion: the CSS then shows text plainly.
 */
export function createReveals(sections, { enabled }) {
  if (!enabled) return { show() {}, hide() {}, reset() {} };

  const state = new Map();

  sections.forEach((section) => {
    const entry = { lines: null, blocks: null, shown: false };
    state.set(section, entry);

    const blocks = section.querySelectorAll('[data-rise]');
    if (blocks.length) {
      entry.blocks = gsap.from(blocks, {
        y: 22, opacity: 0, duration: 0.9, stagger: 0.07, delay: 0.25, ease: 'power3.out', paused: true,
      });
    }

    const split = section.querySelectorAll('[data-split]');
    if (!split.length) return;
    SplitText.create(split, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      linesClass: 'line',
      onSplit(self) {
        entry.lines = gsap.from(self.lines, {
          yPercent: 115, duration: 1.1, stagger: 0.07, ease: 'power4.out', paused: true,
        });
        if (entry.shown) entry.lines.progress(1);
        return entry.lines;
      },
    });
  });

  return {
    show(section) {
      const e = state.get(section);
      if (!e) return;
      e.shown = true;
      e.lines?.timeScale(1).play();
      e.blocks?.timeScale(1).play();
    },
    hide(section) {
      const e = state.get(section);
      if (!e) return;
      e.shown = false;
      e.lines?.timeScale(2.2).reverse();
      e.blocks?.timeScale(2.2).reverse();
    },
    /** Put the text back to its hidden state without animating (used before the intro). */
    reset(section) {
      const e = state.get(section);
      if (!e) return;
      e.shown = false;
      e.lines?.pause(0);
      e.blocks?.pause(0);
    },
  };
}

import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/**
 * Line-by-line text reveals for each section panel. Each panel gets a paused
 * timeline that `show()`/`hide()` play or reverse. SplitText re-splits on
 * resize/font load (autoSplit) and rebuilds the animation via onSplit.
 * Skipped when the user prefers reduced motion: the CSS then shows text plainly.
 */
export function createReveals(sections, { enabled }) {
  if (!enabled) {
    return { show() {}, hide() {}, reset() {} };
  }
  const anims = new Map();

  sections.forEach((section) => {
    const panel = section.querySelector('.panel');
    const targets = panel.querySelectorAll('h1, h2, p, li, .links');
    SplitText.create(targets, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      linesClass: 'line',
      onSplit(self) {
        const anim = gsap.from(self.lines, {
          yPercent: 110,
          opacity: 0,
          duration: 0.9,
          stagger: 0.045,
          ease: 'power3.out',
          paused: true,
        });
        if (section.classList.contains('is-active')) anim.progress(1);
        anims.set(section, anim);
        return anim;
      },
    });
  });

  return {
    show(section) { anims.get(section)?.play(); },
    hide(section) { anims.get(section)?.reverse(); },
    /** Put the text back to its hidden state without animating (used before the intro). */
    reset(section) { anims.get(section)?.pause(0); },
  };
}

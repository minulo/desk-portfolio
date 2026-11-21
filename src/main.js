// Entry script. Deliberately small: the page is readable before this runs.
// It tracks which section is on screen and switches the fixed art layer to match.
import { pickActive } from './lib/active-section.js';

const html = document.documentElement;
const sections = [...document.querySelectorAll('main section')];
const word = document.getElementById('art-word');
const wipe = document.getElementById('art-wipe');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const WIPE_MS = 520;
let active = 0;       // section under the reference line (drives the nav highlight)
let swapTimer = 0;

/** Switch the art layer to section `i`: field colour, side, giant word. */
function applyArt(i) {
  const s = sections[i];
  html.dataset.art = s.id;
  html.dataset.accent = s.dataset.accent;
  html.dataset.side = s.dataset.side;
  word.textContent = s.dataset.word;
}

function setActive(i) {
  if (i === active || i < 0) return;
  active = i;
  html.dataset.section = sections[i].id;

  clearTimeout(swapTimer);
  for (const a of wipe.getAnimations()) a.cancel();
  if (reduceMotion.matches) {
    applyArt(active);
    return;
  }
  // A slanted block crosses the art layer; the switch happens while it covers everything.
  // If the visitor scrolls on before then, the timer restarts and only the last section is applied.
  wipe.animate(
    [
      { transform: 'translateX(-135%) skewX(-14deg)' },
      { transform: 'translateX(0%) skewX(-14deg)', offset: 0.5 },
      { transform: 'translateX(135%) skewX(-14deg)' },
    ],
    { duration: WIPE_MS, easing: 'cubic-bezier(0.7, 0, 0.3, 1)' },
  );
  swapTimer = setTimeout(() => applyArt(active), WIPE_MS / 2);
}

let queued = false;
function track() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    setActive(pickActive(sections.map((s) => s.getBoundingClientRect()), window.innerHeight * 0.45));
  });
}

window.addEventListener('scroll', track, { passive: true });
window.addEventListener('resize', track);

// The page may open part-way down (reload, or a link to a section).
const start = pickActive(sections.map((s) => s.getBoundingClientRect()), window.innerHeight * 0.45);
if (start > 0) {
  active = start;
  html.dataset.section = sections[start].id;
  applyArt(start);
}

// Entry script. Deliberately small: the page is readable before this runs.
// It tracks which section is on screen, switches the fixed art layer to match, and
// loads the 3D scene afterwards as a separate download.
import { pickActive } from './lib/active-section.js';

const html = document.documentElement;
const sections = [...document.querySelectorAll('main section')];
const word = document.getElementById('art-word');
const wipe = document.getElementById('art-wipe');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrow = window.matchMedia('(max-width: 860px)');

const WIPE_MS = 520;
let active = 0;       // section under the reference line (drives the menu highlight)
let swapTimer = 0;
let scene = null;     // set once the 3D scene has loaded

/** The part of the screen the art shows through, in CSS pixels. Mirrors the layout in CSS. */
function artRect(side) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (narrow.matches) {
    const bar = parseFloat(getComputedStyle(html).getPropertyValue('--bar')) || 58;
    return { x: 0, y: bar, width: W, height: H * 0.42 };
  }
  return { x: side === 'left' ? 0 : W / 2, y: 0, width: W / 2, height: H };
}

const cssColour = (name) => parseInt(getComputedStyle(html).getPropertyValue(name).trim().replace('#', ''), 16);

function showInScene(animate) {
  scene?.show(html.dataset.art, {
    field: cssColour('--field'),
    line: cssColour('--field-ink'),
    rect: artRect(html.dataset.side),
    animate,
  });
}

/** Switch the art layer to section `i`: field colour, side, giant word, 3D framing. */
function applyArt(i, animate = true) {
  const s = sections[i];
  html.dataset.art = s.id;
  html.dataset.accent = s.dataset.accent;
  html.dataset.side = s.dataset.side;
  word.textContent = s.dataset.word;
  showInScene(animate);
}

function setActive(i) {
  if (i === active || i < 0) return;
  active = i;
  html.dataset.section = sections[i].id;

  clearTimeout(swapTimer);
  for (const a of wipe.getAnimations()) a.cancel();
  if (reduceMotion.matches) {
    applyArt(active, false);
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

const currentIndex = () => pickActive(sections.map((s) => s.getBoundingClientRect()), window.innerHeight * 0.45);

let queued = false;
function track() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    setActive(currentIndex());
  });
}

window.addEventListener('scroll', track, { passive: true });
window.addEventListener('resize', () => {
  track();
  showInScene(false);
});

// The page may open part-way down (reload, or a link to a section).
const start = currentIndex();
if (start > 0) {
  active = start;
  html.dataset.section = sections[start].id;
  applyArt(start, false);
}

// ---------- the 3D scene: loaded after the page is up, and optional ----------
function webglWorks() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function startScene() {
  if (!webglWorks()) {
    html.classList.add('scene-off');
    return;
  }
  try {
    const [{ createScene }, config] = await Promise.all([
      import('./scene/scene.js'),
      import('./config/scene.config.js'),
    ]);
    // Menu labels double as the labels pinned to the objects.
    const labels = Object.fromEntries([...document.querySelectorAll('.nav a')].map((a) => [
      a.getAttribute('href').slice(1),
      { num: a.querySelector('b')?.textContent ?? '', text: a.lastChild.textContent.trim() },
    ]));
    scene = await createScene({
      canvas: document.getElementById('scene'),
      pinLayer: document.getElementById('art-tags'),
      objects: config.objects,
      views: config.views,
      deskTop: config.DESK_TOP,
      labels,
      onPick: (id) => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' }),
      reducedMotion: () => reduceMotion.matches,
    });
    showInScene(false);
    html.classList.add('scene-ready');
    performance.mark('scene-ready');
  } catch (err) {
    // The page is complete without the scene, so this is a note, not a failure.
    console.warn('[scene] not started:', err);
    html.classList.add('scene-off');
  }
}

const whenIdle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 120));
if (document.readyState === 'complete') whenIdle(startScene);
else window.addEventListener('load', () => whenIdle(startScene), { once: true });

// `?perf` in the address shows load and frame timings measured on this device.
if (new URLSearchParams(location.search).has('perf')) {
  import('./perf.js').then((m) => m.showPerf(() => scene));
}

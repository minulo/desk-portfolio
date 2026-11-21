// Entry script. Deliberately small: the page is readable before this runs.
// It tracks which section is on screen, flips the fixed art layer to that section's
// channel, runs the Static (other-world) switch, and loads the 3D scene afterwards as
// a separate download.
import { pickActive } from './lib/active-section.js';

const html = document.documentElement;
const sections = [...document.querySelectorAll('main section')];
const word = document.getElementById('art-word');
const flip = document.getElementById('art-flip');
const flipChannel = document.getElementById('flip-channel');
const artSet = document.getElementById('art-set');
const osdChannel = document.getElementById('osd-channel');
const osdCode = document.getElementById('osd-code');
const worldSwitch = document.getElementById('world');
const probe = document.getElementById('art-probe');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const FLIP_MS = 420;  // how long the static covers the art layer
const SWAP_MS = 150;  // when, under the static, the picture actually changes
let active = 0;       // section under the reference line (drives the menu highlight)
let swapTimer = 0;
let scene = null;     // set once the 3D scene has loaded

/**
 * The square the 3D picture is framed in, in CSS pixels. Its centre and size are read
 * from an invisible element the stylesheet places (art.css: --art-x, --art-y,
 * --art-view), so the picture and the screen frame behind it cannot drift apart,
 * whatever units the stylesheet uses. Layout offsets are not changed by the roll
 * animation, so this is right in the middle of a channel flip too.
 */
function artRect() {
  const side = probe.offsetWidth;
  return { x: probe.offsetLeft - side / 2, y: probe.offsetTop - side / 2, width: side, height: side };
}

const cssColour = (name) => parseInt(getComputedStyle(html).getPropertyValue(name).trim().replace('#', ''), 16);

function showInScene(animate) {
  scene?.show(html.dataset.art, {
    accent: cssColour('--accent'),
    wall: cssColour('--wall'),
    rect: artRect(),
    animate,
  });
}

/** Switch the art layer to section `i`: accent, side, giant word, on-screen display, 3D framing. */
function applyArt(i, animate = true) {
  const s = sections[i];
  html.dataset.art = s.id;
  html.dataset.accent = s.dataset.accent;
  html.dataset.side = s.dataset.side;
  word.textContent = s.dataset.word;
  osdChannel.replaceChildren(`CH ${s.dataset.channel} `, Object.assign(document.createElement('b'), { textContent: s.dataset.name }));
  osdCode.textContent = `MN-${s.dataset.channel} · 0:0${i}:00`;
  showInScene(animate);
}

/** A burst of TV static with tracking bars, and the picture rolling back into place. */
function playFlip(label) {
  for (const a of [...flip.getAnimations(), ...artSet.getAnimations()]) a.cancel();
  flipChannel.textContent = label;
  flipChannel.classList.toggle('is-long', label.length > 6); // set smaller, to fit the window
  if (reduceMotion.matches) return;
  // 'step-end' holds each frame until the next one: hard cuts, not fades.
  const hold = 'step-end';
  flip.animate(
    [
      { opacity: 1, backgroundPosition: '0 0, 0 0, 0 0', easing: hold },
      { opacity: 1, backgroundPosition: '0 37px, 53px 91px, 0 0', offset: 0.17, easing: hold },
      { opacity: 1, backgroundPosition: '0 -22px, -31px 17px, 0 0', offset: 0.34, easing: hold },
      { opacity: 1, backgroundPosition: '0 61px, 77px -43px, 0 0', offset: 0.51, easing: hold },
      { opacity: 0.6, backgroundPosition: '0 12px, -12px 66px, 0 0', offset: 0.68, easing: hold },
      { opacity: 0.3, backgroundPosition: '0 -40px, 40px 20px, 0 0', offset: 0.84, easing: hold },
      { opacity: 0, backgroundPosition: '0 0, 0 0, 0 0' },
    ],
    { duration: FLIP_MS },
  );
  artSet.animate(
    [
      { transform: 'translateY(-7%)', easing: hold },
      { transform: 'translateY(5%)', offset: 0.3, easing: hold },
      { transform: 'translateY(-2%)', offset: 0.62, easing: hold },
      { transform: 'translateY(0)' },
    ],
    { duration: 300, delay: SWAP_MS },
  );
}

function setActive(i) {
  if (i === active || i < 0) return;
  sections[active]?.classList.remove('is-live');
  active = i;
  html.dataset.section = sections[i].id;
  sections[i].classList.add('is-live'); // its heading slams in

  clearTimeout(swapTimer);
  if (reduceMotion.matches) {
    applyArt(active, false);
    return;
  }
  // The channel flips: static covers the art layer and the switch happens underneath.
  // If the visitor scrolls on before then, the timer restarts and only the last section is applied.
  playFlip(`CH ${sections[i].dataset.channel}`);
  swapTimer = setTimeout(() => applyArt(active), SWAP_MS);
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

// ---------- Static: the other-world mode ----------
function setWorld(on) {
  if (on) html.dataset.world = 'static'; else delete html.dataset.world;
  worldSwitch.setAttribute('aria-pressed', String(on));
  worldSwitch.querySelector('b').textContent = on ? 'On' : 'Off';
  playFlip(on ? 'NO SIGNAL' : 'SIGNAL OK');
  showInScene(false); // the wall colour changed
  scene?.setWorld(on);
}
const toggleWorld = () => setWorld(html.dataset.world !== 'static');
worldSwitch.addEventListener('click', toggleWorld);

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
    // Menu labels double as the sticker labels pinned to the objects.
    const labels = Object.fromEntries([...document.querySelectorAll('.nav a')].map((a) => [
      a.getAttribute('href').slice(1),
      { num: a.querySelector('b')?.textContent ?? '', text: a.lastChild.textContent.trim() },
    ]));
    scene = await createScene({
      canvas: document.getElementById('scene'),
      pinLayer: document.getElementById('art-tags'),
      objects: config.objects,
      views: config.views,
      stageTop: config.STAGE_TOP,
      labels,
      onPick: (id) => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' }),
      onAction: (action) => { if (action === 'world') toggleWorld(); },
      reducedMotion: () => reduceMotion.matches,
    });
    showInScene(false);
    scene.setWorld(html.dataset.world === 'static');
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

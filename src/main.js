// Entry script. Deliberately small: the page is readable before this runs.
// It tracks which section is on screen, flips the fixed art layer to that section's
// channel, runs the Static (other-world) switch, and loads the 3D scene afterwards as
// a separate download.
import { pickActive } from './lib/active-section.js';
import { fracture, strayChannel } from './lib/fracture.js';

const html = document.documentElement;
const sections = [...document.querySelectorAll('main section')];
const word = document.getElementById('art-word');
const flip = document.getElementById('art-flip');
const flipChannel = document.getElementById('flip-channel');
const artSet = document.getElementById('art-set');
const osdChannel = document.getElementById('osd-channel');
const osdCode = document.getElementById('osd-code');
const worldSwitch = document.getElementById('world');
const signal = document.getElementById('signal');
const worldStatus = document.getElementById('world-status');
const sweep = document.getElementById('sweep');
const art = document.querySelector('.art');
const shards = document.getElementById('shards');
const cracks = document.getElementById('cracks');
const debris = document.getElementById('debris');
const impact = document.getElementById('impact');
const screenFrame = document.querySelector('.art-set > .screen');
const display = document.querySelector('.art-set > .osd');
const probe = document.getElementById('art-probe');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const FLIP_MS = 420;  // how long the static covers the art layer
const SWAP_MS = 150;  // when, under the static, the picture actually changes
const TUNE_MS = 760;  // the longer flip when the signal itself is lost
const NOTE_MS = 7000; // how long the note in Static mode explains itself
const BREAK_MS = 380; // when, in that longer flip, the picture breaks apart
const isStatic = () => html.dataset.world === 'static';
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

/** The section the art layer is showing. */
const shownIndex = () => Math.max(0, sections.findIndex((s) => s.id === html.dataset.art));

/**
 * In Static mode some broken pieces are tuned to other channels. For each piece: the
 * section it shows, when that is not the one on screen, or null.
 */
function tunedPieces() {
  const current = shownIndex();
  return fracture({ centre: [0, 0], size: 1 }).pieces.map((piece) => {
    const other = strayChannel(current, piece.stray, sections.length);
    return other === current ? null : sections[other];
  });
}

function showInScene(animate) {
  scene?.show(html.dataset.art, {
    accent: cssColour('--accent'),
    wall: cssColour('--wall'),
    rect: artRect(),
    tuned: tunedPieces().map((s) => s && { section: s.id, accent: cssColour(`--${s.dataset.accent}`) }),
    animate,
  });
}

/** Write what a display says for section `i` into `osd`. With no signal there is no time code. */
function fillDisplay(osd, i) {
  const s = sections[i];
  const name = (isStatic() && s.dataset.nameStatic) || s.dataset.name;
  osd.querySelector('.osd-channel').replaceChildren(`CH ${s.dataset.channel} `, Object.assign(document.createElement('b'), { textContent: name }));
  osd.querySelector('.osd-code').textContent = `MN-${s.dataset.channel} · ${isStatic() ? '-:--:--' : `0:0${i}:00`}`;
}
function updateDisplay(i) {
  fillDisplay(display, i);
  copyDisplay();
}

/** Switch the art layer to section `i`: accent, side, giant word, on-screen display, 3D framing. */
function applyArt(i, animate = true) {
  const s = sections[i];
  html.dataset.art = s.id;
  html.dataset.accent = s.dataset.accent;
  html.dataset.side = s.dataset.side;
  word.textContent = s.dataset.word;
  updateDisplay(i);
  showInScene(animate);
  // In Static mode each channel's picture arrives whole and breaks again.
  breakPicture(animate ? 90 : null);
}

// ---------- the break: in Static mode the screen and the picture are in pieces ----------
// The cracks run from one point of impact (src/lib/fracture.js). The screen frame is cut
// along them here, into copies that each show one wedge; the 3D scene cuts the picture
// along the same lines; and the cracks themselves are drawn across the whole page.
let breakTimer = 0;

/**
 * Give every piece of the screen its wording and colour. Most show the channel on
 * screen; a piece tuned to another channel shows that channel's number in its accent.
 */
function copyDisplay() {
  const tuned = tunedPieces();
  [...shards.children].forEach((piece, i) => {
    const other = tuned[i];
    fillDisplay(piece.querySelector('.osd'), other ? sections.indexOf(other) : shownIndex());
    if (other) piece.dataset.accent = other.dataset.accent; else delete piece.dataset.accent;
  });
}

/** Cut the screen along the cracks, for where the art window is now. */
function layoutBreak() {
  const rect = artRect();
  const centre = [rect.x + rect.width / 2, rect.y + rect.height / 2];
  const layout = fracture({ centre, size: rect.width });
  // The pieces live in a box around the screen; their outlines are measured from its corner.
  const corner = [shards.offsetLeft - shards.offsetWidth / 2, shards.offsetTop - shards.offsetHeight / 2];
  const local = ([x, y]) => `${(x - corner[0]).toFixed(1)}px ${(y - corner[1]).toFixed(1)}px`;
  if (!shards.children.length) {
    for (let i = 0; i < layout.pieces.length; i++) {
      const piece = document.createElement('div');
      piece.className = 'shard';
      piece.append(screenFrame.cloneNode(true), display.cloneNode(true));
      for (const el of piece.querySelectorAll('[id]')) el.removeAttribute('id');
      shards.append(piece);
    }
    for (const bit of layout.debris) {
      const el = document.createElement('i');
      el.dataset.tone = String(bit.tone);
      debris.append(el);
    }
  }
  copyDisplay();
  layout.pieces.forEach((piece, i) => {
    const el = shards.children[i];
    el.style.clipPath = `polygon(${piece.polygon.map(local).join(', ')})`;
    el.style.transformOrigin = local(layout.impact);
    el.style.setProperty('--dx', `${piece.offset[0].toFixed(2)}px`);
    el.style.setProperty('--dy', `${piece.offset[1].toFixed(2)}px`);
    el.style.setProperty('--turn', `${piece.turn}deg`);
    el.style.setProperty('--grow', String(piece.scale - 1));
  });
  // Loose shards: each starts on the impact and is thrown to its place along a crack.
  layout.debris.forEach((bit, i) => {
    const el = debris.children[i];
    el.style.left = `${layout.impact[0].toFixed(1)}px`;
    el.style.top = `${layout.impact[1].toFixed(1)}px`;
    el.style.width = el.style.height = `${bit.size.toFixed(1)}px`;
    el.style.setProperty('--dx', `${(bit.at[0] - layout.impact[0]).toFixed(1)}px`);
    el.style.setProperty('--dy', `${(bit.at[1] - layout.impact[1]).toFixed(1)}px`);
    el.style.setProperty('--turn', `${bit.turn}deg`);
  });
  // The cracks: straight lines from the impact, long enough to leave any screen, and a
  // smaller one across each piece. They are in the art layer, so only the art window
  // shows them; the text panels lie on top.
  const reach = (window.innerWidth + window.innerHeight) * 2;
  const line = (a, b, name) => `<line class="${name}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
  cracks.innerHTML = layout.pieces.map((piece) => {
    const angle = (piece.from * Math.PI) / 180;
    return line(layout.impact, [layout.impact[0] + Math.cos(angle) * reach, layout.impact[1] + Math.sin(angle) * reach], 'crack');
  }).join('') + layout.web.map(([a, b]) => line(a, b, 'web')).join('');
  impact.style.left = `${layout.impact[0].toFixed(1)}px`;
  impact.style.top = `${layout.impact[1].toFixed(1)}px`;
}

/**
 * Put the pieces where they belong. With `delay` (milliseconds) they first fit together
 * and then snap apart after it; with null they are simply apart.
 */
function breakPicture(delay) {
  clearTimeout(breakTimer);
  if (!isStatic()) return;
  layoutBreak();
  if (delay === null || reduceMotion.matches) {
    art.style.setProperty('--apart', '1');
    scene?.shatter('apart');
    return;
  }
  art.classList.add('is-mended'); // fitted together at once, without easing back
  art.style.setProperty('--apart', '0');
  scene?.shatter('whole');
  breakTimer = setTimeout(() => {
    art.classList.remove('is-mended');
    art.style.setProperty('--apart', '1');
    scene?.shatter('snap');
  }, delay);
}

/** A burst of TV static with tracking bars, and the picture rolling back into place. */
function playFlip(label, duration = FLIP_MS) {
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
    { duration },
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
  breakPicture(null);
});

// The page may open part-way down (reload, or a link to a section).
const start = currentIndex();
if (start > 0) {
  active = start;
  html.dataset.section = sections[start].id;
  applyArt(start, false);
}

// ---------- Static: the other-world mode ----------
// A visitor must be able to tell this is a mode and not a fault. So the change is staged
// (a tracking bar crosses the whole page, the screen shows NO SIGNAL), the picture then
// holds still, the display and labels reword themselves, and a note names the mode and
// keeps the way back in reach.
let noteTimer = 0;

/** One tracking bar down the whole page: the moment the broadcast changes. */
function playSweep() {
  for (const a of sweep.getAnimations()) a.cancel();
  if (reduceMotion.matches) return;
  sweep.animate(
    [{ opacity: 1, transform: 'translateY(-100%)' }, { opacity: 1, transform: 'translateY(100vh)' }],
    { duration: 520, easing: 'steps(10, end)' },
  );
}

function setWorld(on) {
  if (on) html.dataset.world = 'static'; else delete html.dataset.world;
  worldSwitch.setAttribute('aria-pressed', String(on));
  worldSwitch.querySelector('b').textContent = on ? 'On' : 'Off';

  // The note: shown while the mode is on, with its one line of explanation at first.
  signal.hidden = !on;
  signal.classList.toggle('is-new', on);
  clearTimeout(noteTimer);
  if (on) noteTimer = setTimeout(() => signal.classList.remove('is-new'), NOTE_MS);
  // Screen readers get it in plain words; they cannot see the rest.
  worldStatus.textContent = on
    ? 'Static mode is on. The page now shows its dead-channel look, on purpose. Retune, or the Static mode switch, turns it off.'
    : 'Static mode is off.';

  updateDisplay(shownIndex());
  playFlip(on ? 'NO SIGNAL' : 'SIGNAL OK', on ? TUNE_MS : FLIP_MS);
  playSweep();
  showInScene(false); // the wall colour changed
  scene?.setWorld(on);
  breakPicture(BREAK_MS); // as the static clears, the picture is seen to break
}
const toggleWorld = () => setWorld(!isStatic());
worldSwitch.addEventListener('click', toggleWorld);
document.getElementById('retune').addEventListener('click', () => {
  setWorld(false);
  worldSwitch.focus(); // the button that was pressed is gone; do not leave the keyboard nowhere
});

// ---------- the 3D scene: loaded after the page is up, and optional ----------
function webglWorks() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // This context was only a question. Hand it back at once: browsers allow a limited
    // number at a time, and left to the garbage collector it would count against the
    // one the scene is about to ask for.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
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
    scene.setWorld(isStatic());
    breakPicture(null);
    html.classList.add('scene-ready');
    performance.mark('scene-ready');
  } catch (err) {
    // The page is complete without the scene, so this is a note, not a failure.
    console.warn('[scene] not started:', err);
    html.classList.add('scene-off');
  }
}

// After the page is up, when the browser has a quiet moment, but not only then: a page
// that is perfectly still (reduced motion) may never be told it is idle, so the request
// carries a deadline.
const whenIdle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 120));
if (document.readyState === 'complete') whenIdle(startScene);
else window.addEventListener('load', () => whenIdle(startScene), { once: true });

// `?perf` in the address shows load and frame timings measured on this device.
if (new URLSearchParams(location.search).has('perf')) {
  import('./perf.js').then((m) => m.showPerf(() => scene));
}

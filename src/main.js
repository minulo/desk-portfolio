import * as THREE from 'three';
import { gsap } from 'gsap';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/inter/index.css';
import 'lenis/dist/lenis.css';
import './style.css';
import { objects, stops } from './config/scene.config.js';
import { createStage } from './scene/stage.js';
import { createModelLoader } from './scene/loader.js';
import { createSwarm } from './scene/swarm.js';
import { createScrollCamera } from './scroll.js';
import { createInteractions } from './interact.js';
import { createReveals } from './reveal.js';

const mqMobile = window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 1024px)');
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/** 'static' = jump between stops, 'stepped' = short ease between stops, 'continuous' = full scroll-driven path */
const getMode = () => (mqReduce.matches ? 'static' : mqMobile.matches ? 'stepped' : 'continuous');

// `?q=high` pins full quality (used for screenshots); otherwise quality adapts to frame rate.
const pinnedQuality = new URLSearchParams(location.search).get('q') === 'high';

const html = document.documentElement;
const loaderEl = document.getElementById('loader');
const barEl = document.getElementById('loader-bar');
const pctEl = document.getElementById('loader-pct');
const progressEl = document.getElementById('progress');
const secIndexEl = document.getElementById('sec-index');
const secNameEl = document.getElementById('sec-name');
const tooltipEl = document.getElementById('tooltip');
const sections = stops.map((s) => document.querySelector(`[data-stop="${s.section}"]`));
sections.forEach((el, i) => el.classList.add(`align-${stops[i].align}`));

function setProgress(ratio) {
  const pct = Math.round(ratio * 100);
  barEl.style.transform = `scaleX(${ratio})`;
  pctEl.textContent = String(pct).padStart(3, '0');
  loaderEl.setAttribute('aria-valuenow', String(pct));
}

function hideLoader() {
  loaderEl.classList.add('is-done');
  html.classList.add('is-ready');
  setTimeout(() => loaderEl.remove(), 1600);
}

function showStopMeta(i) {
  secIndexEl.textContent = String(i + 1).padStart(2, '0');
  secNameEl.textContent = sections[i].dataset.label ?? stops[i].section;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

function plainFallback() {
  // The page is plain HTML underneath, so it still works without 3D.
  html.classList.add('no-webgl');
  sections.forEach((el) => el.classList.add('is-active'));
  hideLoader();
}

async function start() {
  if (!webglAvailable()) return plainFallback();

  const lite = mqMobile.matches;
  const canvas = document.getElementById('scene');
  let pixelRatio = Math.min(window.devicePixelRatio, lite ? 1.5 : 1.75);
  const stage = createStage(canvas, { lite, pixelRatio });
  const { scene, camera, renderer } = stage;

  let needsRender = true;
  const requestRender = () => { needsRender = true; };

  // Models (placeholders or .glb files, see scene.config.js)
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => setProgress((loaded / total) * 0.9);
  const loader = createModelLoader(manager);
  const holders = await Promise.all(objects.map((entry) => loader.load(entry)));
  holders.forEach((obj) => scene.add(obj));

  // The swarm samples glyphs from the web fonts, so those must be ready first.
  await document.fonts.ready;
  const swarm = await createSwarm({ stops, count: lite ? 7000 : 18000, bloom: !lite });
  scene.add(swarm.points, swarm.light);

  const reveal = createReveals(sections, { enabled: !mqReduce.matches });

  const fit = () => {
    stage.resize();
    swarm.setProjection(renderer.domElement.height, camera.fov);
  };
  fit();

  const scroll = createScrollCamera({
    camera, stops, sections, requestRender, getMode,
    onStop: showStopMeta,
    onText: (i, active) => (active ? reveal.show(sections[i]) : reveal.hide(sections[i])),
    onProgress: (p) => { progressEl.style.transform = `scaleX(${p})`; },
    onPath: (f) => swarm.setProgress(f),
  });
  createInteractions({
    canvas, camera, holders, stops, scroll, swarm, requestRender, getMode,
    invalidateShadows: stage.invalidateShadows, tooltip: tooltipEl,
  });

  const onChange = () => {
    fit();
    scroll.refresh();
    requestRender();
  };
  window.addEventListener('resize', onChange);
  mqMobile.addEventListener('change', onChange);
  mqReduce.addEventListener('change', onChange);

  // Frame loop. The swarm animates continuously unless motion is reduced, in
  // which case frames are only drawn when something changed.
  const t0 = performance.now();
  const gov = { since: 0, frames: 0 };
  function govern(now) {
    if (pinnedQuality) return;
    if (!gov.since) { gov.since = now; gov.frames = 0; return; }
    gov.frames++;
    const elapsed = now - gov.since;
    if (elapsed < 2500) return;
    const ms = elapsed / gov.frames;
    gov.since = 0;
    if (ms < 30) return; // comfortably above ~33 fps
    if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      stage.setPixelRatio(pixelRatio);
      swarm.setProjection(renderer.domElement.height, camera.fov);
    } else {
      stage.setBloom(false);
    }
  }
  document.addEventListener('visibilitychange', () => { gov.since = 0; });

  let governing = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (getMode() !== 'static') {
      swarm.setTime((now - t0) / 1000);
      needsRender = true;
    }
    if (!needsRender) return;
    needsRender = false;
    stage.render();
    if (governing) govern(now);
  }

  document.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const i = stops.findIndex((s) => s.section === a.dataset.goto);
      if (i >= 0) scroll.scrollToStop(i);
    });
  });

  // First frame compiles the shaders while the loader is still up.
  const animateIntro = getMode() === 'continuous' && scroll.activeIndex === 0 && window.scrollY < 4;
  const first = sections[scroll.activeIndex];
  if (animateIntro) {
    swarm.setAssemble(0);
    reveal.reset(first);
  }
  stage.render();
  setProgress(1);
  requestAnimationFrame(frame);

  // Intro: the loader lifts, the camera dollies in, dust gathers into the swarm,
  // then the first lines of text rise.
  await new Promise((r) => setTimeout(r, 350));
  hideLoader();
  if (animateIntro) {
    const assemble = { v: 0 };
    gsap.to(assemble, { v: 1, duration: 3.6, ease: 'power2.inOut', onUpdate: () => swarm.setAssemble(assemble.v) });
    setTimeout(() => reveal.show(first), 1300);
    await scroll.playIntro(3.4);
  }
  governing = true;
}

start().catch((err) => {
  console.error(err);
  plainFallback();
});

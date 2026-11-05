import * as THREE from 'three';
import '@fontsource-variable/fraunces/index.css';
import '@fontsource-variable/inter/index.css';
import 'lenis/dist/lenis.css';
import './style.css';
import { objects, stops } from './config/scene.config.js';
import { createStage } from './scene/stage.js';
import { createModelLoader } from './scene/loader.js';
import { createScrollCamera } from './scroll.js';
import { createInteractions } from './interact.js';
import { createReveals } from './reveal.js';

const mqMobile = window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 1024px)');
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/** 'static' = jump between stops, 'stepped' = short ease between stops, 'continuous' = full scroll-driven path */
const getMode = () => (mqReduce.matches ? 'static' : mqMobile.matches ? 'stepped' : 'continuous');

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
  document.documentElement.classList.add('is-ready');
  loaderEl.addEventListener('transitionend', () => loaderEl.remove(), { once: true });
  setTimeout(() => loaderEl.remove(), 1500); // in case transitions are disabled
}

function showStopMeta(i) {
  secIndexEl.textContent = String(i + 1).padStart(2, '0');
  secNameEl.textContent = sections[i].querySelector('h1, h2')?.textContent?.trim() ?? stops[i].section;
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
  document.documentElement.classList.add('no-webgl');
  sections.forEach((el) => el.classList.add('is-active'));
  hideLoader();
}

async function start() {
  if (!webglAvailable()) return plainFallback();

  const canvas = document.getElementById('scene');
  const { scene, camera, resize, render } = createStage(canvas, { lite: mqMobile.matches });

  let needsRender = true;
  const requestRender = () => { needsRender = true; };

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => setProgress(loaded / total);
  const loader = createModelLoader(manager);

  const holders = await Promise.all(objects.map((entry) => loader.load(entry)));
  holders.forEach((obj) => scene.add(obj));

  // Text reveals must exist before the scroll controller activates the first stop.
  await document.fonts.ready;
  const reveal = createReveals(sections, { enabled: !mqReduce.matches });

  resize();
  const scroll = createScrollCamera({
    camera, stops, sections, requestRender, getMode,
    onStop: (i) => {
      showStopMeta(i);
      sections.forEach((el, j) => (j === i ? reveal.show(el) : reveal.hide(el)));
    },
    onProgress: (p) => { progressEl.style.transform = `scaleX(${p})`; },
  });
  createInteractions({ canvas, camera, holders, stops, scroll, requestRender, getMode, tooltip: tooltipEl });

  // Compile shaders and draw one frame before revealing, so the first scroll doesn't stutter.
  render();
  setProgress(1);

  const onChange = () => {
    resize();
    scroll.refresh();
    requestRender();
  };
  window.addEventListener('resize', onChange);
  mqMobile.addEventListener('change', onChange);
  mqReduce.addEventListener('change', onChange);

  // Render only when something changed (saves battery; nothing animates on its own).
  let rafPending = false;
  const frame = () => {
    rafPending = false;
    if (!needsRender) return;
    needsRender = false;
    render();
  };
  const loop = () => {
    if (needsRender && !rafPending) {
      rafPending = true;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(loop);
  };
  loop();

  document.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const i = stops.findIndex((s) => s.section === a.dataset.goto);
      if (i >= 0) scroll.scrollToStop(i);
    });
  });

  // Intro: text starts hidden, loader fades, camera dollies in, then the first panel reveals.
  const first = sections[scroll.activeIndex];
  reveal.reset(first);
  hideLoader();
  await new Promise((r) => setTimeout(r, 250));
  const dolly = scroll.playIntro();
  setTimeout(() => reveal.show(first), getMode() === 'continuous' ? 700 : 0);
  await dolly;
}

start().catch((err) => {
  console.error(err);
  plainFallback();
});

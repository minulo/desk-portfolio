import * as THREE from 'three';
import './style.css';
import { objects, stops } from './config/scene.config.js';
import { createStage } from './scene/stage.js';
import { createModelLoader } from './scene/loader.js';
import { createScrollCamera } from './scroll.js';

const mqMobile = window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 1024px)');
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/** 'static' = jump between stops, 'stepped' = short ease between stops, 'continuous' = full scroll-driven path */
const getMode = () => (mqReduce.matches ? 'static' : mqMobile.matches ? 'stepped' : 'continuous');

const loaderEl = document.getElementById('loader');
const barEl = document.getElementById('loader-bar');
const pctEl = document.getElementById('loader-pct');
const sections = stops.map((s) => document.querySelector(`[data-stop="${s.section}"]`));
sections.forEach((el, i) => el.classList.add(`align-${stops[i].align}`));

function setProgress(ratio) {
  const pct = Math.round(ratio * 100);
  barEl.style.transform = `scaleX(${ratio})`;
  pctEl.textContent = `${pct}%`;
  loaderEl.setAttribute('aria-valuenow', String(pct));
}

function hideLoader() {
  loaderEl.classList.add('is-done');
  document.documentElement.classList.add('is-ready');
  loaderEl.addEventListener('transitionend', () => loaderEl.remove(), { once: true });
  setTimeout(() => loaderEl.remove(), 1500); // in case transitions are disabled
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

async function start() {
  if (!webglAvailable()) {
    // The page is plain HTML underneath, so it still works without 3D.
    document.documentElement.classList.add('no-webgl');
    sections.forEach((el) => el.classList.add('is-active'));
    hideLoader();
    return;
  }

  const canvas = document.getElementById('scene');
  const { renderer, scene, camera, resize } = createStage(canvas, { lite: mqMobile.matches });

  let needsRender = true;
  const requestRender = () => { needsRender = true; };

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => setProgress(loaded / total);
  const loader = createModelLoader(manager);

  const loaded = await Promise.all(objects.map((entry) => loader.load(entry)));
  loaded.forEach((obj) => scene.add(obj));

  resize();
  const scroll = createScrollCamera({ camera, stops, sections, requestRender, getMode });

  // Compile shaders before revealing, so the first scroll doesn't stutter.
  renderer.compile(scene, camera);
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
  renderer.setAnimationLoop(() => {
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
  });

  document.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const i = stops.findIndex((s) => s.section === a.dataset.goto);
      if (i >= 0) scroll.scrollToStop(i);
    });
  });

  hideLoader();
}

start().catch((err) => {
  console.error(err);
  document.documentElement.classList.add('no-webgl');
  sections.forEach((el) => el.classList.add('is-active'));
  hideLoader();
});

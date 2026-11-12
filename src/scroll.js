import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Drives the camera (and everything that follows it) from scroll position.
 *
 * Continuous mode (desktop, motion allowed): scroll progress 0..1 is mapped
 * onto a Catmull-Rom curve through the camera stops. Each segment is eased
 * with a plateau so the camera rests at each stop while its section is read.
 * Lenis smooths the scroll itself; GSAP's scrub smooths the camera on top.
 *
 * Stepped mode (mobile) / static mode (prefers-reduced-motion): the camera
 * eases or jumps to the nearest stop.
 *
 * Final camera position = path(u) + introOffset * (1 - introT) + parallax.
 * `onPath(f)` reports the eased position as a float from 0 to stops-1.
 */
export function createScrollCamera({ camera, stops, sections, requestRender, getMode, onStop, onProgress, onPath, onText }) {
  const positions = new THREE.CatmullRomCurve3(stops.map((s) => new THREE.Vector3(...s.camera)), false, 'centripetal');
  const targets = new THREE.CatmullRomCurve3(stops.map((s) => new THREE.Vector3(...s.target)), false, 'centripetal');
  const n = stops.length;
  const lookAt = new THREE.Vector3();
  const basePos = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let activeIndex = -1;
  let stepTween = null;
  const stepState = { u: 0 };
  let lastU = 0;

  const intro = { t: 1, offset: new THREE.Vector3(0.5, 0.35, 1.5) };
  const parallax = { x: 0, y: 0 };

  // Rest for the first and last 22% of each segment, smooth move in between.
  const plateau = (t) => {
    const x = THREE.MathUtils.clamp((t - 0.22) / 0.56, 0, 1);
    return x * x * (3 - 2 * x);
  };

  function placeAt(u) {
    lastU = u;
    positions.getPoint(u, basePos);
    targets.getPoint(u, lookAt);
    camera.position.copy(basePos);
    if (intro.t < 1) camera.position.addScaledVector(intro.offset, 1 - intro.t);
    camera.lookAt(lookAt);
    if (parallax.x || parallax.y) {
      right.setFromMatrixColumn(camera.matrix, 0);
      up.setFromMatrixColumn(camera.matrix, 1);
      camera.position.addScaledVector(right, parallax.x).addScaledVector(up, parallax.y);
      camera.lookAt(lookAt);
    }
    onPath?.(u * (n - 1));
    requestRender();
  }

  function easedU(progress) {
    const f = progress * (n - 1);
    const i = Math.min(Math.floor(f), n - 2);
    return (i + plateau(f - i)) / (n - 1);
  }

  function setActive(index) {
    if (index === activeIndex) return;
    activeIndex = index;
    document.documentElement.dataset.stop = stops[index].section;
    onStop?.(index);
  }

  // Raw scroll progress: decides which section is active, and moves the camera in stepped modes.
  function onScroll(progress) {
    onProgress?.(progress);
    const index = Math.round(progress * (n - 1));
    setActive(index);
    const mode = getMode();
    if (mode === 'continuous') return;
    const goal = index / (n - 1);
    if (Math.abs(stepState.u - goal) < 1e-4) return;
    stepTween?.kill();
    if (mode === 'static') {
      stepState.u = goal;
      placeAt(goal);
    } else {
      stepTween = gsap.to(stepState, { u: goal, duration: 1.1, ease: 'power2.inOut', onUpdate: () => placeAt(stepState.u) });
    }
  }

  // Smooth scrolling (Lenis) on desktop. Phones keep native touch scrolling, and
  // static mode (reduced motion) keeps the browser's own scrolling untouched.
  let lenis = null;
  if (getMode() === 'continuous') {
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Smoothed progress: GSAP's `scrub` eases a linked animation toward the scroll
  // position, so the camera follows a proxy value instead of raw scroll.
  const proxy = { p: 0 };
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: '#sections',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => onScroll(self.progress),
    },
  });
  timeline.to(proxy, {
    p: 1,
    ease: 'none',
    onUpdate: () => {
      if (getMode() === 'continuous') placeAt(easedU(proxy.p));
    },
  });
  const trigger = timeline.scrollTrigger;

  // Text: a section's copy shows once its pinned block is nearly in place and
  // hides shortly after it starts to leave. This is separate from the camera's
  // "nearest stop", so the words appear as the camera arrives, not half-way there.
  function setText(i, active) {
    sections[i].classList.toggle('is-active', !!active);
    if (active) document.documentElement.dataset.align = stops[i].align;
    onText?.(i, active);
  }
  const textTriggers = sections.map((el, i) => ScrollTrigger.create({
    trigger: el,
    start: 'top 20%',
    end: 'bottom 75%',
    onToggle: (self) => setText(i, self.isActive),
  }));
  textTriggers.forEach((st, i) => setText(i, !!st.isActive));

  function syncToScroll() {
    const p = trigger.progress;
    const mode = getMode();
    stepTween?.kill();
    stepState.u = mode === 'continuous' ? easedU(p) : Math.round(p * (n - 1)) / (n - 1);
    placeAt(stepState.u);
    setActive(Math.round(p * (n - 1)));
    onProgress?.(p);
  }
  syncToScroll();

  return {
    get activeIndex() { return activeIndex; },
    // Call after a resize or a mode change (mobile <-> desktop, reduced motion toggled).
    refresh() {
      ScrollTrigger.refresh();
      syncToScroll();
    },
    scrollToStop(i) {
      const top = trigger.start + (trigger.end - trigger.start) * (i / (n - 1));
      if (lenis) lenis.scrollTo(top, { duration: 1.6 });
      else window.scrollTo({ top, behavior: getMode() === 'static' ? 'auto' : 'smooth' });
    },
    /** Dolly in from a pulled-back position to the current stop. Resolves when done. */
    playIntro(duration = 3.2) {
      if (getMode() !== 'continuous') return Promise.resolve();
      intro.t = 0;
      placeAt(lastU);
      return new Promise((resolve) => {
        gsap.to(intro, { t: 1, duration, ease: 'power3.out', onUpdate: () => placeAt(lastU), onComplete: resolve });
      });
    },
    /** Small camera offset from the pointer, in metres. Only used in continuous mode. */
    setParallax(x, y) {
      if (getMode() !== 'continuous') return;
      parallax.x = x;
      parallax.y = y;
      placeAt(lastU);
    },
  };
}

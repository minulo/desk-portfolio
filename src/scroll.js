import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Drives the camera from scroll position.
 *
 * Continuous mode (desktop, motion allowed): scroll progress 0..1 is mapped
 * onto a Catmull-Rom curve through the camera stops. Each segment is eased
 * with a plateau so the camera rests at each stop while its section is read.
 *
 * Stepped mode (mobile or prefers-reduced-motion): the camera jumps to the
 * nearest stop (reduced motion) or eases there briefly (mobile), and only
 * renders on those changes.
 */
export function createScrollCamera({ camera, stops, sections, requestRender, getMode }) {
  const positions = new THREE.CatmullRomCurve3(stops.map((s) => new THREE.Vector3(...s.camera)), false, 'centripetal');
  const targets = new THREE.CatmullRomCurve3(stops.map((s) => new THREE.Vector3(...s.target)), false, 'centripetal');
  const n = stops.length;
  const lookAt = new THREE.Vector3();
  let activeIndex = -1;
  let stepTween = null;
  const stepState = { u: 0 };

  // Rest for the first and last 22% of each segment, smooth move in between.
  const plateau = (t) => {
    const x = THREE.MathUtils.clamp((t - 0.22) / 0.56, 0, 1);
    return x * x * (3 - 2 * x);
  };

  function placeAt(u) {
    positions.getPoint(u, camera.position);
    targets.getPoint(u, lookAt);
    camera.lookAt(lookAt);
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
    sections.forEach((el, i) => el.classList.toggle('is-active', i === index));
    document.documentElement.dataset.stop = stops[index].section;
  }

  // Raw scroll progress: decides which section is active, and moves the camera in stepped modes.
  function onScroll(progress) {
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
      stepTween = gsap.to(stepState, { u: goal, duration: 0.7, ease: 'power2.inOut', onUpdate: () => placeAt(stepState.u) });
    }
  }

  // Smoothed progress: GSAP's `scrub` eases a linked animation toward the scroll
  // position, so the camera follows a proxy value instead of raw scroll.
  const proxy = { p: 0 };
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: '#sections',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.8,
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

  function syncToScroll() {
    const p = trigger.progress;
    const mode = getMode();
    stepTween?.kill();
    stepState.u = mode === 'continuous' ? easedU(p) : Math.round(p * (n - 1)) / (n - 1);
    placeAt(stepState.u);
    setActive(Math.round(p * (n - 1)));
  }
  syncToScroll();

  return {
    // Call after a resize or a mode change (mobile <-> desktop, reduced motion toggled).
    refresh() {
      ScrollTrigger.refresh();
      syncToScroll();
    },
    scrollToStop(i) {
      const top = trigger.start + (trigger.end - trigger.start) * (i / (n - 1));
      const reduce = getMode() === 'static';
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    },
  };
}

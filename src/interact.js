import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * Pointer interactions on the 3D scene:
 *  - parallax: the camera drifts a few centimetres with the pointer (desktop, motion allowed)
 *  - hover: an object lifts slightly, the cursor becomes a pointer, a label follows the pointer
 *  - click: scrolls to the section that object introduces
 * Everything is skipped on coarse pointers (touch) because there is no hover there.
 */
export function createInteractions({ canvas, camera, holders, stops, scroll, requestRender, getMode, tooltip }) {
  const fine = window.matchMedia('(pointer: fine)').matches;
  if (!fine) return { dispose() {} };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const byObject = new Map(stops.map((s, i) => [s.object, i]).filter(([o]) => o));
  const hoverable = holders.filter((h) => byObject.has(h.name));
  let hovered = null;
  let pending = null;
  let px = 0, py = 0;

  // Parallax target/current, eased on the GSAP ticker; renders only while moving.
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  function tick() {
    if (getMode() !== 'continuous') return;
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (Math.abs(dx) < 1e-5 && Math.abs(dy) < 1e-5) return;
    current.x += dx * 0.06;
    current.y += dy * 0.06;
    scroll.setParallax(current.x, current.y);
  }
  gsap.ticker.add(tick);

  function setHover(holder) {
    if (holder === hovered) return;
    const motion = getMode() !== 'static';
    if (hovered) {
      const lift = hovered.getObjectByName('lift');
      gsap.killTweensOf(lift.position);
      if (motion) gsap.to(lift.position, { y: 0, duration: 0.5, ease: 'power3.out', onUpdate: requestRender });
      else { lift.position.y = 0; requestRender(); }
    }
    hovered = holder;
    canvas.style.cursor = holder ? 'pointer' : '';
    tooltip.classList.toggle('is-visible', !!holder);
    if (holder) {
      const i = byObject.get(holder.name);
      const section = document.querySelector(`[data-stop="${stops[i].section}"]`);
      const title = section?.querySelector('h1, h2')?.textContent?.trim() ?? stops[i].section;
      tooltip.innerHTML = `<span>${String(i).padStart(2, '0')}</span>${title}`;
      const lift = holder.getObjectByName('lift');
      gsap.killTweensOf(lift.position);
      if (motion) gsap.to(lift.position, { y: 0.012, duration: 0.6, ease: 'power3.out', onUpdate: requestRender });
      else { lift.position.y = 0.012; requestRender(); }
    }
  }

  function pick() {
    pending = null;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hoverable, true);
    let holder = null;
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.entry) o = o.parent;
      holder = o ?? null;
    }
    setHover(holder);
  }

  function onMove(e) {
    px = e.clientX;
    py = e.clientY;
    ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    target.x = ndc.x * 0.035;
    target.y = ndc.y * 0.02;
    tooltip.style.transform = `translate(${px + 18}px, ${py + 18}px)`;
    if (!pending) pending = requestAnimationFrame(pick);
  }

  function onLeave() {
    target.x = target.y = 0;
    setHover(null);
  }

  function onClick() {
    if (!hovered) return;
    scroll.scrollToStop(byObject.get(hovered.name));
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  // Panels sit above the canvas; clicks on them should not reach the scene.
  // (The canvas only receives clicks where no panel covers it.)

  return {
    dispose() {
      gsap.ticker.remove(tick);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
    },
  };
}

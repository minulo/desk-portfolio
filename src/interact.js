import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * Pointer interactions on the 3D scene (mouse / trackpad only):
 *  - parallax: the camera drifts a few centimetres with the pointer
 *  - swarm: particles near the pointer are pushed aside
 *  - hover: an object lifts slightly, the cursor becomes a pointer, a label follows
 *  - click: scrolls to the section that object introduces
 * Touch screens have no hover, so all of this is skipped there.
 */
export function createInteractions({ canvas, camera, holders, stops, scroll, swarm, requestRender, invalidateShadows, getMode, tooltip }) {
  if (!window.matchMedia('(pointer: fine)').matches) return;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(0, 0);
  const byObject = new Map(stops.map((s, i) => [s.object, i]).filter(([o]) => o));
  const hoverable = holders.filter((h) => byObject.has(h.name));
  const forward = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let hovered = null;
  let pickQueued = false;
  let inside = false;

  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  const push = { strength: 0 };

  // Where the pointer's ray crosses the plane that faces the camera through the swarm.
  function pointerOnSwarmPlane() {
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(forward);
    const denom = raycaster.ray.direction.dot(forward);
    if (Math.abs(denom) < 1e-4) return null;
    const t = hit.copy(swarm.center).sub(raycaster.ray.origin).dot(forward) / denom;
    return t > 0 ? hit.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, t) : null;
  }

  gsap.ticker.add(() => {
    if (getMode() === 'static') return;
    // Camera parallax eases toward the pointer.
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) {
      current.x += dx * 0.05;
      current.y += dy * 0.05;
      scroll.setParallax(current.x, current.y);
    }
    swarm.setPointer(inside ? pointerOnSwarmPlane() : null, push.strength);
  });

  function lift(holder, y) {
    const group = holder.getObjectByName('lift');
    gsap.killTweensOf(group.position);
    const done = () => { invalidateShadows(); requestRender(); };
    if (getMode() === 'static') { group.position.y = y; done(); }
    else gsap.to(group.position, { y, duration: 0.6, ease: 'power3.out', onUpdate: done });
  }

  function setHover(holder) {
    if (holder === hovered) return;
    if (hovered) lift(hovered, 0);
    hovered = holder;
    canvas.style.cursor = holder ? 'pointer' : '';
    tooltip.classList.toggle('is-visible', !!holder);
    if (!holder) return;
    const i = byObject.get(holder.name);
    const section = document.querySelector(`[data-stop="${stops[i].section}"]`);
    const title = section?.querySelector('h1, h2')?.textContent?.trim() ?? stops[i].section;
    tooltip.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: String(i).padStart(2, '0') }),
      document.createTextNode(title),
    );
    lift(holder, 0.014);
  }

  function pick() {
    pickQueued = false;
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

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (!inside) {
      inside = true;
      gsap.to(push, { strength: 1, duration: 0.6, overwrite: true });
    }
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    target.x = ndc.x * 0.045;
    target.y = ndc.y * 0.025;
    tooltip.style.transform = `translate(${e.clientX + 18}px, ${e.clientY + 18}px)`;
    // Only pick when the pointer is over the canvas itself, not over text.
    if (e.target === canvas) {
      if (!pickQueued) { pickQueued = true; requestAnimationFrame(pick); }
    } else {
      setHover(null);
    }
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    inside = false;
    target.x = target.y = 0;
    gsap.to(push, { strength: 0, duration: 0.8, overwrite: true });
    setHover(null);
  });

  canvas.addEventListener('click', () => {
    if (hovered) scroll.scrollToStop(byObject.get(hovered.name));
  });
}

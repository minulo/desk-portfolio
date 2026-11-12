import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * Pointer interactions on the 3D scene.
 *
 * Everywhere:
 *  - click or tap an object: rolls a check, then scrolls to its section
 *  - clickable objects carry a faint glint (see scene/enchant.js)
 *
 * With a mouse or trackpad as well:
 *  - parallax: the camera drifts a few centimetres with the pointer
 *  - swarm: particles near the pointer are pushed aside
 *  - hover: the object lifts, its glint and outline brighten, a label follows
 *
 * On desktop, every clickable object also has a soft pulsing outline while
 * nothing is hovered, so visitors can see what is interactive.
 */
export function createInteractions({
  canvas, camera, holders, stops, scroll, swarm, stage, enchant, roll,
  requestRender, getMode, tooltip,
}) {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(0, 0);
  const byObject = new Map(stops.map((s, i) => [s.object, i]).filter(([o]) => o));
  const clickable = holders.filter((h) => byObject.has(h.name));
  const lifts = clickable.map((h) => h.getObjectByName('lift'));
  const forward = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let hovered = null;
  let pickQueued = false;
  let inside = false;

  const idleOutline = () => stage.setOutline(lifts, 'idle');
  idleOutline();

  function setNdc(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  function pickAt() {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(clickable, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.entry) o = o.parent;
    return o ?? null;
  }

  function describe(holder) {
    const i = byObject.get(holder.name);
    const section = document.querySelector(`[data-stop="${stops[i].section}"]`);
    return {
      index: i,
      thing: section?.dataset.object ?? holder.name,
      label: section?.dataset.label ?? stops[i].section,
    };
  }

  function lift(holder, y) {
    const group = holder.getObjectByName('lift');
    gsap.killTweensOf(group.position);
    const done = () => { stage.invalidateShadows(); requestRender(); };
    if (getMode() === 'static') { group.position.y = y; done(); }
    else gsap.to(group.position, { y, duration: 0.6, ease: 'power3.out', onUpdate: done });
  }

  function setHover(holder) {
    if (holder === hovered) return;
    if (hovered) lift(hovered, 0);
    hovered = holder;
    canvas.style.cursor = holder ? 'pointer' : '';
    tooltip.classList.toggle('is-visible', !!holder);
    enchant.setHover(holder, { animate: getMode() !== 'static', onUpdate: requestRender });
    if (!holder) {
      idleOutline();
      requestRender();
      return;
    }
    const info = describe(holder);
    tooltip.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: 'inspect' }),
      document.createTextNode(`${info.thing} · ${info.label}`),
    );
    stage.setOutline([holder.getObjectByName('lift')], 'hover');
    lift(holder, 0.014);
  }

  // Click or tap: works with or without a hover state (phones have none).
  canvas.addEventListener('click', (e) => {
    setNdc(e);
    const holder = hovered ?? pickAt();
    if (!holder) return;
    const info = describe(holder);
    roll(holder.name);
    scroll.scrollToStop(info.index);
  });

  if (!fine) return {};

  const pointer = { x: -1, y: -1 };
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

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (!inside) {
      inside = true;
      gsap.to(push, { strength: 1, duration: 0.6, overwrite: true });
    }
    setNdc(e);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    target.x = ndc.x * 0.045;
    target.y = ndc.y * 0.025;
    tooltip.style.transform = `translate(${e.clientX + 18}px, ${e.clientY + 18}px)`;
    // Only pick when the pointer is over the canvas itself, not over text.
    if (e.target === canvas) {
      if (!pickQueued) {
        pickQueued = true;
        requestAnimationFrame(() => { pickQueued = false; setHover(pickAt()); });
      }
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

  return {
    /** The scene moved under a still pointer (after a scroll): work out again what it is over. */
    recheckHover() {
      if (!inside) return;
      const over = document.elementFromPoint(pointer.x, pointer.y);
      setHover(over === canvas ? pickAt() : null);
    },
  };
}

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector2, Vector3, Raycaster, Box3,
} from 'three';
import { createShared, createMaterials } from './toon.js';
import { loadObject } from './loader.js';
import { desk } from './objects.js';
import { hexToRgb } from './geometry.js';
import { artWindowOffset } from '../lib/view-offset.js';
import { runTween } from '../lib/tween.js';

/**
 * The 3D desk. One render pass, three small shaders, and no frame is drawn unless
 * something changed: a new section, a hovered object, a pointer move, a resize.
 *
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {HTMLElement} o.pinLayer        where the clickable labels for the opening view go
 * @param {object[]} o.objects            from scene.config.js
 * @param {object} o.views                from scene.config.js
 * @param {number} o.deskTop
 * @param {Record<string, {num: string, text: string}>} o.labels  section id -> its menu label
 * @param {(sectionId: string) => void} o.onPick   an object or its label was clicked
 * @param {() => boolean} o.reducedMotion
 */
export async function createScene({ canvas, pinLayer, objects, views, deskTop, labels, onPick, reducedMotion }) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);

  const shared = createShared();
  const materials = createMaterials(shared);
  const scene = new Scene();
  const camera = new PerspectiveCamera(27, 1, 0.05, 40);

  // Colours that follow the page section. Every outline and floor shadow reads these.
  const lineColour = new Vector3(0.04, 0.04, 0.05);
  const floorColour = new Vector3(0.8, 0.66, 0);
  const hoverColour = new Vector3(...hexToRgb(0xb6ff3c));
  const deskShadow = new Vector3(0.6, 0.57, 0.56);

  // ----- the desk -----
  const deskGeometry = desk(deskTop);
  const deskGroup = new Group();
  deskGroup.add(
    new Mesh(deskGeometry, materials.toon({ sss: 0.12 })),
    new Mesh(deskGeometry, materials.outline({ color: lineColour })),
    new Mesh(deskGeometry, materials.shadow({ color: floorColour, plane: 0, half: [50, 50] })),
  );
  deskGroup.children.forEach((m) => { m.frustumCulled = false; });
  scene.add(deskGroup);

  // ----- the objects on it -----
  let modelCount = 0;
  const items = await Promise.all(objects.map(async (entry) => {
    const { geometry, fromModel } = await loadObject(entry);
    if (fromModel) modelCount++;
    const toon = materials.toon({ gloss: entry.gloss, sss: entry.sss });
    const outline = materials.outline({ color: lineColour });
    const lift = new Group();
    lift.add(
      new Mesh(geometry, toon),
      new Mesh(geometry, outline),
      new Mesh(geometry, materials.shadow({ color: deskShadow, plane: deskTop + 0.001, half: [0.81, 0.415] })),
    );
    lift.children.forEach((m) => { m.frustumCulled = false; });
    const holder = new Group();
    holder.position.fromArray(entry.position);
    holder.rotation.y = ((entry.rotationY ?? 0) * Math.PI) / 180;
    holder.add(lift);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new Box3().setFromObject(lift.children[0]);
    return { entry, holder, lift, toon, outline, box, pin: null, top: new Vector3(entry.position[0], box.max.y + 0.03, entry.position[2]) };
  }));
  canvas.dataset.models = String(modelCount);
  const clickable = items.filter((it) => it.entry.section);

  // ----- drawing on demand -----
  const stats = { frames: 0, lastFrameMs: 0, slowestGapMs: 0 };
  let scheduled = false;
  let lastTick = 0;
  let animating = 0; // number of running tweens; frame gaps are only timed while > 0

  function draw(now) {
    scheduled = false;
    if (animating && lastTick) stats.slowestGapMs = Math.max(stats.slowestGapMs, now - lastTick);
    lastTick = animating ? now : 0;
    const t0 = performance.now();
    renderer.render(scene, camera);
    stats.lastFrameMs = performance.now() - t0;
    stats.frames++;
    if (shown === 'intro') placePins();
  }
  function invalidate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(draw);
  }
  function tween(options) {
    animating++;
    stats.slowestGapMs = 0;
    return runTween({ ...options, onDone: () => { animating--; options.onDone?.(); } });
  }

  // ----- camera -----
  let shown = null;
  let artRect = { x: 0, y: 0, width: 1, height: 1 };
  const viewPos = new Vector3();
  const viewTarget = new Vector3();
  const settle = { back: 0 };          // 1 = pulled back, 0 = in place
  const parallax = new Vector2();
  const right = new Vector3();
  const up = new Vector3();
  const away = new Vector3();

  function placeCamera() {
    away.subVectors(viewPos, viewTarget);
    camera.position.copy(viewTarget).addScaledVector(away, 1 + settle.back * 0.09);
    camera.position.y += settle.back * 0.04;
    camera.lookAt(viewTarget);
    if (parallax.x || parallax.y) {
      right.setFromMatrixColumn(camera.matrix, 0);
      up.setFromMatrixColumn(camera.matrix, 1);
      camera.position.addScaledVector(right, parallax.x).addScaledVector(up, parallax.y);
      camera.lookAt(viewTarget);
    }
    camera.updateMatrixWorld();
    invalidate();
  }

  function layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const offset = artWindowOffset({ width: W, height: H }, artRect);
    camera.aspect = W / H;
    camera.setViewOffset(W, H, offset.x, offset.y, W, H);
    // Each view is framed to fill a square about as tall as the art window.
    camera.zoom = Math.min(1.25, Math.max(0.3, Math.min(artRect.height, artRect.width * 1.06) / H));
    camera.updateProjectionMatrix();
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    shared.uResolution.value.set(canvas.width, canvas.height);
    shared.uPixel.value = ratio;
    layout();
    invalidate();
  }

  let cancelSettle = null;
  /**
   * Frame the scene for a page section.
   * @param {string} sectionId
   * @param {{ field: number, line: number, rect: {x:number,y:number,width:number,height:number}, animate?: boolean }} look
   *   field = the art layer's background colour, line = its line colour, rect = the art window in CSS pixels
   */
  function show(sectionId, { field, line, rect, animate = true }) {
    const view = views[sectionId] ?? views.intro;
    shown = sectionId;
    canvas.dataset.shown = sectionId;
    viewPos.fromArray(view.camera);
    viewTarget.fromArray(view.target);
    artRect = rect;

    // On a dark field the lines switch to the field's line colour, and so does the bounce light.
    const [fr, fg, fb] = hexToRgb(field);
    const dark = fr + fg + fb < 0.6;
    const [lr, lg, lb] = hexToRgb(line);
    if (dark) lineColour.set(lr, lg, lb); else lineColour.set(0.043, 0.043, 0.047);
    if (dark) shared.uBounce.value.set(lr, lg, lb); else shared.uBounce.value.set(fr, fg, fb);
    if (dark) floorColour.set(0.09, 0.09, 0.1); else floorColour.set(fr * 0.76, fg * 0.74, fb * 0.78);

    setHover(null);
    layout();
    cancelSettle?.();
    if (animate && !reducedMotion()) {
      settle.back = 1;
      cancelSettle = tween({ duration: 460, onFrame: (p) => { settle.back = 1 - p; placeCamera(); } });
    } else {
      settle.back = 0;
    }
    placeCamera();
  }

  // ----- hover and click -----
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  let hovered = null;

  function pick(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best = null;
    let bestDistance = Infinity;
    for (const it of clickable) {
      if (!raycaster.ray.intersectBox(it.box, hit)) continue;
      const d = hit.distanceTo(raycaster.ray.origin);
      if (d < bestDistance) { best = it; bestDistance = d; }
    }
    return best;
  }

  function setHover(item) {
    if (item === hovered) return;
    for (const it of [hovered, item]) {
      if (!it) continue;
      const on = it === item;
      it.outline.uniforms.uColor.value = on ? hoverColour : lineColour;
      it.toon.uniforms.uHover.value = on ? 1 : 0;
      it.pin?.classList.toggle('is-hot', on);
      const from = it.lift.position.y;
      const to = on ? 0.014 : 0;
      if (reducedMotion()) it.lift.position.y = to;
      else tween({ duration: 160, onFrame: (p) => { it.lift.position.y = from + (to - from) * p; invalidate(); } });
    }
    hovered = item;
    canvas.style.cursor = item ? 'pointer' : '';
    invalidate();
  }

  let moveQueued = false;
  let lastMove = null;
  canvas.addEventListener('pointermove', (e) => {
    lastMove = e;
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      setHover(pick(lastMove.clientX, lastMove.clientY));
      if (lastMove.pointerType !== 'touch' && !reducedMotion()) {
        parallax.set(((lastMove.clientX / window.innerWidth) * 2 - 1) * 0.03, -((lastMove.clientY / window.innerHeight) * 2 - 1) * 0.02);
        placeCamera();
      }
    });
  });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('click', (e) => {
    const item = pick(e.clientX, e.clientY);
    if (item) onPick(item.entry.section);
  });

  // ----- labels pinned to the objects on the opening view -----
  for (const it of clickable) {
    const label = labels[it.entry.section];
    if (!label) continue;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.tabIndex = -1; // a pointer shortcut; keyboard users have the menu and the index links
    pin.append(Object.assign(document.createElement('b'), { textContent: label.num }), label.text);
    pin.addEventListener('click', () => onPick(it.entry.section));
    pin.addEventListener('pointerenter', () => setHover(it));
    pin.addEventListener('pointerleave', () => setHover(null));
    pinLayer.append(pin);
    it.pin = pin;
  }
  const projected = new Vector3();
  function placePins() {
    for (const it of clickable) {
      if (!it.pin) continue;
      projected.copy(it.top).project(camera);
      const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      it.pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-12px, calc(-100% - 16px))`;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return { show, resize, stats, get modelCount() { return modelCount; } };
}

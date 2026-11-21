import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector2, Vector3, Raycaster, Box3, Sphere,
} from 'three';
import { createShared, createMaterials } from './toon.js';
import { loadObject } from './loader.js';
import { slab } from './objects.js';
import { hexToRgb } from './geometry.js';
import { artWindowOffset } from '../lib/view-offset.js';
import { featureCamera } from '../lib/feature-view.js';
import { createTweenTracker } from '../lib/tween.js';
import { renderScale } from '../lib/render-scale.js';

/**
 * The 3D set: a concrete slab with a television and a few objects on it. The opening
 * view shows all of it; every other channel features one object by itself, on a small
 * stand, big enough to overlap the screen frame behind it.
 *
 * One render pass, three small shaders, and no frame is drawn unless something changed:
 * a new section, the Static switch, a hovered object, a pointer move, a resize.
 *
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {HTMLElement} o.pinLayer        where the sticker labels for the opening view go
 * @param {object[]} o.objects            from scene.config.js
 * @param {object} o.views                from scene.config.js
 * @param {number} o.stageTop             height of the slab's top
 * @param {Record<string, {num: string, text: string}>} o.labels  section id -> its menu label
 * @param {(sectionId: string) => void} o.onPick      an object that leads to a section was clicked
 * @param {(action: string) => void} o.onAction       an object with an action was clicked
 * @param {() => boolean} o.reducedMotion
 */
export async function createScene({ canvas, pinLayer, objects, views, stageTop, labels, onPick, onAction, reducedMotion }) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearAlpha(0);

  const shared = createShared();
  const materials = createMaterials(shared);
  const scene = new Scene();
  const camera = new PerspectiveCamera(27, 1, 0.05, 40);

  // Colours every outline and shadow reads. They follow the section and the mode.
  const INK = hexToRgb(0x141312);
  const PAPER = hexToRgb(0xece7da);
  const lineColour = new Vector3(...INK);       // the thin line
  const stickerColour = new Vector3(...PAPER);  // the wide die-cut edge
  const hoverColour = new Vector3(...hexToRgb(0xb6ff3c));
  const floorColour = new Vector3(0.4, 0.39, 0.37);
  const slabShadow = new Vector3(0.36, 0.35, 0.36);
  const stickerShift = { value: 0 };            // sideways offset of the die-cut edge, CSS px

  // ----- the slab -----
  const slabGeometry = slab(stageTop);
  const slabGroup = new Group();
  slabGroup.add(
    new Mesh(slabGeometry, materials.toon({ sss: 0.1 })),
    new Mesh(slabGeometry, materials.outline({ color: lineColour })),
    new Mesh(slabGeometry, materials.shadow({ color: floorColour, plane: 0, half: [50, 50] })),
  );
  slabGroup.children.forEach((m) => { m.frustumCulled = false; });
  scene.add(slabGroup);

  // ----- the objects on it -----
  const SLAB_HALF = [0.92, 0.515];   // where shadows may fall on the big slab
  const STAND_MARGIN = 0.045;        // how far a stand reaches past its object, in metres
  const STAND_THICKNESS = 0.04;
  const featuredIds = new Set(Object.values(views).map((view) => view.feature).filter(Boolean));
  const sticker = () => materials.outline({ color: stickerColour, width: 7.5, shift: stickerShift, behind: true });
  let modelCount = 0;
  const items = await Promise.all(objects.map(async (entry) => {
    const { geometry, fromModel } = await loadObject(entry);
    if (fromModel) modelCount++;
    const toon = materials.toon({ gloss: entry.gloss, sss: entry.sss });
    const outline = materials.outline({ color: lineColour });
    const shadow = materials.shadow({ color: slabShadow, plane: stageTop + 0.001, half: SLAB_HALF });
    const lift = new Group();
    lift.add(
      new Mesh(geometry, toon),
      new Mesh(geometry, outline),
      new Mesh(geometry, sticker()), // the die-cut edge: wider, paper-coloured, behind the ink line
      new Mesh(geometry, shadow),
    );
    lift.children.forEach((m) => { m.frustumCulled = false; });
    const holder = new Group();
    holder.position.fromArray(entry.position);
    holder.add(lift);
    scene.add(holder);
    // Featured alone, an object faces straight ahead; on the set it is turned.
    holder.updateMatrixWorld(true);
    const soloBox = new Box3().setFromObject(lift.children[0]);
    const turn = ((entry.rotationY ?? 0) * Math.PI) / 180;
    holder.rotation.y = turn;
    holder.updateMatrixWorld(true);
    const box = new Box3().setFromObject(lift.children[0]);
    const centre = box.getCenter(new Vector3());

    // An object that a channel features by itself gets a small stand of its own.
    let stand = null;
    let standHalf = null;
    const ball = new Sphere();
    if (featuredIds.has(entry.id)) {
      const size = soloBox.getSize(new Vector3());
      const middle = soloBox.getCenter(new Vector3());
      standHalf = [size.x / 2 + STAND_MARGIN, size.z / 2 + STAND_MARGIN];
      const standGeometry = slab(stageTop, { width: standHalf[0] * 2, depth: standHalf[1] * 2, thickness: STAND_THICKNESS, stripe: 0.055 });
      stand = new Group();
      stand.add(
        new Mesh(standGeometry, materials.toon({ sss: 0.1, rim: 0.12 })),
        new Mesh(standGeometry, materials.outline({ color: lineColour })),
        new Mesh(standGeometry, sticker()),
      );
      stand.children.forEach((m) => { m.frustumCulled = false; });
      stand.position.set(middle.x, 0, middle.z);
      stand.visible = false;
      scene.add(stand);
      // What the camera frames: the object. Its stand may run past the edge of the view.
      soloBox.getBoundingSphere(ball);
    }
    return {
      entry, holder, lift, toon, outline, shadow, box, soloBox, turn, centre, stand, standHalf, ball, pin: null,
      top: new Vector3(entry.position[0], box.max.y + 0.03, entry.position[2]),
    };
  }));
  canvas.dataset.models = String(modelCount);
  const clickable = items.filter((it) => it.entry.section || it.entry.action);

  // ----- drawing on demand -----
  const stats = { frames: 0, lastFrameMs: 0, slowestGapMs: 0 };
  let scheduled = false;
  let lastTick = 0;
  const tweens = createTweenTracker(); // frame gaps are only timed while a tween is running

  function draw(now) {
    scheduled = false;
    if (tweens.active && lastTick) stats.slowestGapMs = Math.max(stats.slowestGapMs, now - lastTick);
    lastTick = tweens.active ? now : 0;
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
  /** Start a tween. The returned function cancels it. */
  function tween(options) {
    stats.slowestGapMs = 0;
    return tweens.run(options);
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

  // The size the canvas is displayed at, which is not always the window's size: with a
  // visible scrollbar the page is narrower, and the picture would be stretched.
  const viewWidth = () => canvas.clientWidth || window.innerWidth;
  const viewHeight = () => canvas.clientHeight || window.innerHeight;

  function layout() {
    const W = viewWidth();
    const H = viewHeight();
    const offset = artWindowOffset({ width: W, height: H }, artRect);
    camera.aspect = W / H;
    camera.setViewOffset(W, H, offset.x, offset.y, W, H);
    // Each view is framed to fill a square about as tall as the art window.
    camera.zoom = Math.min(1.25, Math.max(0.3, Math.min(artRect.height, artRect.width * 1.06) / H));
    camera.updateProjectionMatrix();
  }

  function resize() {
    const ratio = renderScale(viewWidth(), viewHeight(), window.devicePixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(viewWidth(), viewHeight(), false);
    shared.uResolution.value.set(canvas.width, canvas.height);
    shared.uPixel.value = ratio;
    layout();
    invalidate();
  }

  // ----- the look: section accent, wall tone, and the Static mode -----
  let world = false;
  let accent = hexToRgb(0xffd400);
  let wall = hexToRgb(0x8c8880);

  function applyLook() {
    shared.uBounce.value.set(...accent);
    shared.uWorld.value = world ? 1 : 0;
    if (world) {
      // Static: lines glow in the accent and the die-cut edge splits off to one side
      // in a second colour, like a misregistered print.
      const magentaAccent = accent[0] > 0.9 && accent[1] < 0.4 && accent[2] > 0.4;
      lineColour.set(...accent);
      stickerColour.set(...hexToRgb(magentaAccent ? 0x19e0ff : 0xff2e88));
      stickerShift.value = 5;
      floorColour.set(0.03, 0.03, 0.04);
      slabShadow.set(0.02, 0.02, 0.03);
    } else {
      lineColour.set(...INK);
      stickerColour.set(...PAPER);
      stickerShift.value = 0;
      floorColour.set(wall[0] * 0.72, wall[1] * 0.71, wall[2] * 0.74);
      slabShadow.set(0.36, 0.35, 0.36);
    }
    invalidate();
  }

  /** Show the whole set, or one object alone on its stand. */
  let featured = null;
  function feature(item) {
    featured = item;
    slabGroup.visible = !item;
    for (const it of items) {
      const alone = it === item;
      it.holder.visible = !item || alone;
      it.holder.rotation.y = alone ? 0 : it.turn;
      if (it.stand) it.stand.visible = alone;
      // The object's shadow falls on whatever it is standing on.
      it.shadow.uniforms.uCentre.value.set(alone ? it.stand.position.x : 0, alone ? it.stand.position.z : 0);
      it.shadow.uniforms.uHalf.value.fromArray(alone ? it.standHalf : SLAB_HALF);
    }
    if (item) canvas.dataset.feature = item.entry.id; else delete canvas.dataset.feature;
  }

  /** Switch the Static (other-world) look on or off. */
  function setWorld(on) {
    world = !!on;
    if (world) canvas.dataset.world = 'static'; else delete canvas.dataset.world;
    shared.uSeed.value = Math.random();
    applyLook();
  }

  // Overshoots 1 a little before landing on it: the "pop" of something slapped into place.
  const overshoot = (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

  let cancelSettle = null;
  /**
   * Frame the scene for a page section.
   * @param {string} sectionId
   * @param {{ accent: number, wall: number, rect: {x:number,y:number,width:number,height:number}, animate?: boolean }} look
   *   accent = the section's signature colour, wall = the art layer's wall colour,
   *   rect = the art window in CSS pixels
   */
  function show(sectionId, look) {
    const view = views[sectionId] ?? views.intro;
    const item = view.feature ? items.find((it) => it.entry.id === view.feature && it.stand) ?? null : null;
    shown = sectionId;
    canvas.dataset.shown = sectionId;
    feature(item);
    const framing = item
      ? featureCamera({ centre: item.ball.center.toArray(), radius: item.ball.radius, from: view.from ?? [24, 20], fill: view.fill ?? 0.8, fov: camera.fov })
      : (view.camera ? view : views.intro);
    viewPos.fromArray(framing.camera);
    viewTarget.fromArray(framing.target);
    artRect = look.rect;
    accent = hexToRgb(look.accent);
    wall = hexToRgb(look.wall);
    shared.uSeed.value = Math.random();

    setHover(null);
    applyLook();
    layout();
    cancelSettle?.();
    for (const it of items) it.lift.scale.setScalar(1);
    if ((look.animate ?? true) && !reducedMotion()) {
      settle.back = 1;
      cancelSettle = tween({
        duration: 380,
        onFrame: (p) => {
          settle.back = 1 - p;
          // A featured object pops in: a little small, past full size, then settled.
          item?.lift.scale.setScalar(0.84 + 0.16 * overshoot(p));
          placeCamera();
        },
      });
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
    ndc.set((clientX / viewWidth()) * 2 - 1, -(clientY / viewHeight()) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best = null;
    let bestDistance = Infinity;
    for (const it of clickable) {
      if (!it.holder.visible || !raycaster.ray.intersectBox(it === featured ? it.soloBox : it.box, hit)) continue;
      const d = hit.distanceTo(raycaster.ray.origin);
      if (d < bestDistance) { best = it; bestDistance = d; }
    }
    return best;
  }

  /** Squash and stretch: the object is pressed down and springs back. */
  function boing(item) {
    if (reducedMotion()) return;
    item.cancelBoing?.();
    item.cancelBoing = tween({
      duration: 420,
      onFrame: (p) => {
        const wobble = Math.sin(p * Math.PI * 3) * (1 - p) * 0.2;
        item.lift.scale.set(1 + wobble * 0.6, 1 - wobble, 1 + wobble * 0.6);
        invalidate();
      },
    });
  }

  function activate(item) {
    boing(item);
    if (item.entry.action) onAction(item.entry.action);
    // An object featured by itself is already on its own section: nowhere to go.
    else if (item !== featured) onPick(item.entry.section);
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
      const to = on ? 0.02 : 0;
      if (reducedMotion()) it.lift.position.y = to;
      else tween({ duration: 150, onFrame: (p) => { it.lift.position.y = from + (to - from) * p; invalidate(); } });
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
        parallax.set(((lastMove.clientX / viewWidth()) * 2 - 1) * 0.03, -((lastMove.clientY / viewHeight()) * 2 - 1) * 0.02);
        placeCamera();
      }
    });
  });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('click', (e) => {
    const item = pick(e.clientX, e.clientY);
    if (item) activate(item);
  });

  // ----- sticker labels pinned to the objects on the opening view -----
  for (const it of clickable) {
    const label = it.entry.action ? { num: '◉', text: it.entry.label ?? it.entry.action } : labels[it.entry.section];
    if (!label) continue;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.tabIndex = -1; // a pointer shortcut; keyboard users have the menu, the index links and the switch
    pin.append(Object.assign(document.createElement('b'), { textContent: label.num }), label.text);
    pin.addEventListener('click', () => activate(it));
    pin.addEventListener('pointerenter', () => setHover(it));
    pin.addEventListener('pointerleave', () => setHover(null));
    pinLayer.append(pin);
    it.pin = pin;
  }
  const projected = new Vector3();
  const onScreen = (point) => {
    projected.copy(point).project(camera);
    return [(projected.x * 0.5 + 0.5) * viewWidth(), (-projected.y * 0.5 + 0.5) * viewHeight()];
  };
  function placePins() {
    for (const it of clickable) {
      const [cx, cy] = onScreen(it.centre);
      if (it.entry.action) {
        // Lets the page (and its tests) find an object that has no section of its own.
        canvas.dataset[`${it.entry.id}X`] = cx.toFixed(1);
        canvas.dataset[`${it.entry.id}Y`] = cy.toFixed(1);
      }
      if (!it.pin) continue;
      const [x, y] = onScreen(it.top);
      it.pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-12px, calc(-100% - 14px))`;
      // Where the object itself is, for anything that wants to point at it.
      it.pin.dataset.cx = cx.toFixed(1);
      it.pin.dataset.cy = cy.toFixed(1);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  // If the browser takes the graphics context away (sleep, GPU reset, too many tabs) and
  // later returns it, three.js rebuilds its state but nothing asks for a new frame.
  canvas.addEventListener('webglcontextrestored', resize);

  return { show, setWorld, resize, stats, get modelCount() { return modelCount; } };
}

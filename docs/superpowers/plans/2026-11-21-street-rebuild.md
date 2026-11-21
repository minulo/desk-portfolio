# Street Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heavy real-time scene with a fast, cel-shaded, colour-blocked street-style site that paints text first and draws 3D only when something changes.

**Architecture:** Static HTML and CSS carry all content and most of the look. A fixed art layer behind the content holds a colour field, a giant word, a sigil ring and a transparent WebGL canvas. three.js loads after first paint as its own chunk and renders one pass, on demand.

**Tech Stack:** Vite 8.3.6, three 0.187.0 (lazy), Fontsource fonts (Anton, Chakra Petch, Space Grotesk), `node:test`, Playwright 1.63.0 for browser tests when available. `simple-icons` 16.37.0 is used only by a generator script.

**Spec:** `docs/superpowers/specs/2026-11-21-street-rebuild-design.md`

## Global Constraints

- Entry JS at most 20 KB gzip; all JS at most 230 KB gzip; CSS at most 20 KB gzip.
- Dev mode: at most 8 MB of JS downloaded; no request URL contains `simple-icons`.
- Heading text visible while the 3D chunk is still loading.
- 0 WebGL draw calls during 3 idle seconds.
- 1 render pass per drawn frame; at most 6 shader programs.
- No `gsap`, `lenis`, or `three/examples/jsm/postprocessing` imports.
- Palette: ink `#0b0b0c`, paper `#f2efe6`, concrete `#8d8d86`, yellow `#ffd400`, magenta `#ff2e88`, crimson `#d7263d`, lime `#b6ff3c`.
- Section ids, in order: `intro`, `about`, `drops`, `tour`, `kit`, `contact`.
- Every fact on the page comes from the previous portfolio's data files; nothing invented.
- `prefers-reduced-motion`: no running animations.
- Node tooling only; no OS-specific scripts.

## Review Focus

1. A visitor with JavaScript disabled: all six sections' text must be visible.
2. A browser without WebGL: the page must stay complete, with no error shown.
3. A 360 px wide phone: no sideways scrolling, no heading wider than the screen.
4. Scrolling quickly through several sections: the art layer must end on the last section, not an intermediate one.
5. The 3D chunk failing to load (offline, blocked): the page must keep working with the art layer's static graphics.

Tests for 1 to 3 live in Task 2 (`tests/browser.test.mjs`). 4 and 5 are added to the same file in Task 4.

---

### Task 1: Logic units

**Files:**
- Create: `src/lib/active-section.js`, `src/lib/tween.js`, `src/lib/view-offset.js`, `src/scene/outline-normals.js`
- Test: `tests/unit.test.mjs`
- Modify: `package.json` (`"test": "node --test tests/"`)

**Interfaces (produced):**
- `pickActive(rects: {top:number,bottom:number}[], line: number): number` — index of the section containing `line`; first section if the line is above all, last if below all, `-1` for an empty list; a shared boundary belongs to the later section.
- `easeOutExpo(t: number): number`
- `runTween({ duration, onFrame, onDone, raf, now }): () => void` — calls `onFrame(eased)` each tick, ends with exactly one `onFrame(1)` then `onDone()`; returns a cancel function.
- `artWindowOffset(viewport: {width,height}, rect: {x,y,width,height}): {x:number,y:number}` — the offset for `camera.setViewOffset` that puts the scene centre at the rect's centre: `x = width/2 - (rect.x + rect.width/2)`, same for `y`.
- `smoothNormals(positions: Float32Array, normals: Float32Array, precision = 1e-4): Float32Array` — per-vertex normal averaged over all vertices sharing a position, normalised.

- [ ] **Step 1:** Write `tests/unit.test.mjs` with the cases in the interface notes (boundary, empty, cancel, zero duration, centred rect gives `{0,0}`, right half of 1000 x 600 gives `x = -250`, two normals at one position average to `0.7071, 0.7071, 0`).
- [ ] **Step 2:** Run `npm test`; expect failures for missing modules.
- [ ] **Step 3:** Implement the four modules.
- [ ] **Step 4:** Run `npm test`; expect all unit tests to pass.
- [ ] **Step 5:** Commit.

### Task 2: Build, structure, responsive and performance tests

**Files:**
- Create: `tests/helpers.mjs`, `tests/build.test.mjs`, `tests/browser.test.mjs`

**Interfaces (produced):**
- `helpers.mjs`: `loadPlaywright()` (returns the module or `null`), `serve(kind: 'dev' | 'preview'): Promise<{ url, stop() }>`, `gzipSize(path)`, `glHook` (init script that counts draw calls, passes, megapixels, frames and linked programs on `window.__gl`).
- The page signals a ready scene with the class `scene-ready` on `<html>`.

Browser tests skip with a message when Playwright is not installed.

- [ ] **Step 1:** Write `tests/build.test.mjs`: after `vite build`, entry JS, total JS and CSS gzip sizes are within the Global Constraints; no built file contains the string `three/examples/jsm/postprocessing`.
- [ ] **Step 2:** Write `tests/browser.test.mjs`:
  - six sections with the ids above, each with a heading and visible text;
  - heading text is visible while requests for the scene chunk are held for 3 seconds;
  - after `scene-ready` plus 2 seconds, 0 draw calls in 3 seconds;
  - a section change draws at most 40 frames, each with 1 pass and at most the canvas's megapixels;
  - at most 6 programs linked;
  - no console errors or warnings;
  - dev server: at most 8 MB of JS, no `simple-icons` URL;
  - at 360x640, 390x844, 768x1024, 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080, 2560x1080: no sideways scroll, no heading wider than the screen;
  - JavaScript disabled: six sections' text visible;
  - WebGL unavailable: six sections visible, no page error;
  - reduced motion: no running animations.
- [ ] **Step 3:** Run `npm test` against the current code; record which fail (expected: sections, idle draws, passes, programs, dev JS size).
- [ ] **Step 4:** Commit the tests.

### Task 3: Static page

**Files:**
- Rewrite: `index.html`, `src/main.js`
- Create: `src/styles/main.css` (imports `tokens.css`, `base.css`, `layout.css`, `components.css`, `sections.css`), `scripts/build-icons.mjs`, `src/data/icons.js` (generated), `src/stickers.js`
- Delete: `src/style.css`, `src/reveal.js`, `src/check.js`, `src/scroll.js`, `src/interact.js`, `src/config/tech.js`
- Modify: `package.json` (remove `gsap`, `lenis`, Fraunces, Inter, JetBrains Mono; move `simple-icons` to devDependencies; add `"icons": "node scripts/build-icons.mjs"`)

**Interfaces:**
- Consumes: `pickActive` from Task 1.
- Produces: each `<section>` has `data-accent` (`yellow` | `magenta` | `ink` | `crimson`), `data-side` (`left` | `right`, the art window's side), `data-word`, `data-focus` (object id or `desk`). `<html>` carries `data-section` and `data-accent` for the active one. `icons` export: `{ [key]: { title, path } }`. Sticker elements carry `data-icon="<key>"`.

- [ ] **Step 1:** Write `scripts/build-icons.mjs`; run `npm run icons`; confirm `src/data/icons.js` is under 40 KB.
- [ ] **Step 2:** Write `index.html` with the real content, stylesheet linked in `<head>`, script as a module at the end.
- [ ] **Step 3:** Write the CSS and `src/main.js` (active section, art-layer swap with wipe, sticker logos). No scene yet.
- [ ] **Step 4:** Run `npm test`; structure, no-JS, responsive, reduced-motion and build-size tests pass.
- [ ] **Step 5:** Screenshot desktop and phone; adjust layout; commit.

### Task 4: Cel-shaded scene

**Files:**
- Create: `src/scene/index.js`, `src/scene/toon.js`, `src/scene/objects.js`, `src/perf.js`
- Rewrite: `src/scene/loader.js`, `src/config/scene.config.js`
- Delete: `src/scene/stage.js`, `src/scene/swarm.js`, `src/scene/shapes.js`, `src/scene/enchant.js`, `src/scene/placeholders.js`

**Interfaces:**
- Consumes: `artWindowOffset`, `runTween`, `smoothNormals`.
- Produces: `createScene({ canvas, objects, stops }): Promise<{ show(sectionId, accentHex), setArtRect(rect), pointer(nx, ny), pick(clientX, clientY): string|null, setHover(id|null), resize(), stats }>`; `stats = { frames, lastFrameMs }`. `main.js` imports it with `import('./scene/index.js')` after first paint and adds `scene-ready` to `<html>`.

- [ ] **Step 1:** Add the two Review Focus tests (fast scroll ends on the last section; blocked scene chunk leaves the page working) to `tests/browser.test.mjs`; run; expect failures.
- [ ] **Step 2:** Implement materials (toon, outline, planar shadow), objects, loader, scene, and the lazy import.
- [ ] **Step 3:** Run `npm test`; all tests pass.
- [ ] **Step 4:** Tune the look from screenshots; commit.

### Task 5: Verify and ship

- [ ] **Step 1:** Re-run the before/after measurement and record the numbers in the README.
- [ ] **Step 2:** Rewrite `README.md` (run, structure, theme rules, performance notes, model swap).
- [ ] **Step 3:** Run `npm test` and `npm run build`; commit; push branch `street`.

// Build-size, structure, responsive and performance tests for the whole site.
// One file on purpose: it builds `dist` once, and two files would build it at the same time.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  loadPlaywright, CHROMIUM_ARGS, build, serve, builtSizes, glHook, boxGltf, SECTION_IDS, VIEWPORTS, ROOT,
} from './helpers.mjs';

const KB = 1024;
const playwright = loadPlaywright();
const skip = playwright ? false : 'Playwright is not installed; browser tests skipped';

let sizes;
before(() => {
  build();
  sizes = builtSizes();
});

describe('production build size', () => {
  test('scripts loaded up front are at most 20 KB gzip', () => {
    assert.ok(sizes.entryJs <= 20 * KB, `up-front JS is ${(sizes.entryJs / KB).toFixed(1)} KB gzip (${sizes.upfrontScripts.join(', ')})`);
  });

  test('all JavaScript is at most 230 KB gzip', () => {
    assert.ok(sizes.totalJs <= 230 * KB, `total JS is ${(sizes.totalJs / KB).toFixed(1)} KB gzip`);
  });

  test('CSS is at most 20 KB gzip', () => {
    assert.ok(sizes.css <= 20 * KB, `CSS is ${(sizes.css / KB).toFixed(1)} KB gzip`);
  });

  test('no post-processing code is bundled', () => {
    for (const file of sizes.jsFiles) {
      const src = readFileSync(file, 'utf8');
      for (const marker of ['EffectComposer', 'UnrealBloomPass', 'OutlinePass', 'SMAAPass']) {
        assert.ok(!src.includes(marker), `${file} contains ${marker}`);
      }
    }
  });
});

describe('in the browser', { skip }, () => {
  let browser;
  let preview;
  let dev;
  const MAC = { viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 }; // 14" MacBook Pro, default scaling

  before(async () => {
    browser = await playwright.chromium.launch({ args: CHROMIUM_ARGS });
    preview = await serve('preview');
    dev = await serve('dev');
  });
  after(async () => {
    await browser?.close();
    preview?.stop();
    dev?.stop();
  });

  /**
   * Open the page with the GPU counters installed and run `fn(page, problems)`.
   * `problems` collects console errors, warnings and page errors. The tab is
   * always closed afterwards, so a failed test cannot slow the ones after it.
   */
  async function withPage(contextOptions, { url = () => preview.url, prepare, waitUntil = 'domcontentloaded' } = {}, fn) {
    const context = await browser.newContext(contextOptions);
    try {
      const page = await context.newPage();
      const problems = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await page.addInitScript(glHook);
      if (prepare) await prepare(page, context);
      await page.goto(url(), { waitUntil });
      await fn(page, problems);
    } finally {
      await context.close();
    }
  }

  /** Wait for the 3D scene. If it never starts, say what state the page was left in. */
  const sceneReady = async (page) => {
    try {
      await page.waitForSelector('html.scene-ready', { state: 'attached', timeout: 20000 });
    } catch (err) {
      const left = await page.evaluate(() => `html class "${document.documentElement.className}", a new WebGL2 context ${document.createElement('canvas').getContext('webgl2') ? 'can' : 'cannot'} be made`).catch(() => 'the page is gone');
      throw new Error(`the 3D scene did not start within 20 s: ${left}`, { cause: err });
    }
  };
  const gl = (page) => page.evaluate(() => ({ ...window.__gl }));
  const runningAnimations = (page) => page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => `${a.animationName || a.transitionProperty || 'animation'} on ${a.effect?.target?.getAttribute('class') || a.effect?.target?.tagName}`));
  /**
   * Wait until the only animations still running are ones `allowed` accepts (none by
   * default). Fixed waits are not used here: on a busy machine the page's transitions
   * start late. If something never stops, this times out and the test fails.
   */
  const untilSettled = (page, allowedSelector = null) => page.waitForFunction((sel) => document.getAnimations()
    .filter((a) => a.playState === 'running')
    .every((a) => sel && a.effect?.target?.closest(sel)), allowedSelector, { timeout: 15000 });
  /** Text whose contrast against its block's background is below WCAG AA. */
  const contrastFailures = (page) => page.evaluate(() => {
        const parse = (str) => { const p = /rgba?\(([^)]+)\)/.exec(str)[1].split(/[,\s/]+/).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const out = [];
        for (const el of document.querySelectorAll('main .block *')) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!own || el.closest('[aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          const fg = parse(cs.color);
          let alpha = fg.a;
          let bg = null;
          for (let n = el; n; n = n.parentElement) {
            const ns = getComputedStyle(n);
            alpha *= parseFloat(ns.opacity);
            if (!bg) { const b = parse(ns.backgroundColor); if (b.a > 0.99) bg = b.rgb; }
            if (n.classList.contains('block')) break;
          }
          if (!bg) continue;
          const seen = fg.rgb.map((v, i) => v * alpha + bg[i] * (1 - alpha));
          const [hi, lo] = [lum(seen), lum(bg)].sort((a, b) => b - a);
          const ratio = (hi + 0.05) / (lo + 0.05);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) out.push(`${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 22)}" ${ratio.toFixed(2)}:1 (needs ${large ? 3 : 4.5})`);
        }
        return [...new Set(out)];
      });

  /** Where an object is on screen: its label carries the projected centre of the object. */
  const objectSpot = (page, labelText) => page.evaluate((text) => {
    const pin = [...document.querySelectorAll('.pin')].find((el) => el.textContent.includes(text));
    return pin ? { x: Number(pin.dataset.cx), y: Number(pin.dataset.cy) } : null;
  }, labelText);
  const goTo = (page, id) => page.evaluate((id) => document.getElementById(id).scrollIntoView({ behavior: 'instant', block: 'start' }), id);

  async function visibleHeadings(page) {
    return page.evaluate((ids) => ids.map((id) => {
      const section = document.getElementById(id);
      const heading = section?.querySelector('h1, h2');
      if (!heading) return { id, ok: false, why: section ? 'no heading' : 'no section' };
      heading.scrollIntoView({ behavior: 'instant', block: 'center' });
      const style = getComputedStyle(heading);
      const box = heading.getBoundingClientRect();
      let opacity = 1;
      for (let el = heading; el; el = el.parentElement) opacity *= parseFloat(getComputedStyle(el).opacity);
      const ok = heading.textContent.trim().length > 0 && style.visibility === 'visible' && style.display !== 'none' && box.width > 0 && box.height > 0 && opacity > 0.9;
      return { id, ok, why: ok ? '' : `text="${heading.textContent.trim()}" opacity=${opacity} box=${box.width}x${box.height}` };
    }), SECTION_IDS);
  }

  test('has the six sections in order, each with a visible heading', async () => {
    await withPage(MAC, {}, async (page) => {
      const ids = await page.evaluate(() => [...document.querySelectorAll('main section')].map((s) => s.id));
      assert.deepEqual(ids, SECTION_IDS);
      await page.waitForTimeout(1500);
      const headings = await visibleHeadings(page);
      assert.deepEqual(headings.filter((h) => !h.ok), []);
    });
  });

  test('shows the main heading while every script is still loading', async () => {
    const holdScripts = (p) => p.route(/\.js(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue().catch(() => {});
    });
    // 'commit' resolves when the document starts arriving. Waiting for DOMContentLoaded
    // would wait for the module scripts, which is the delay this test is about.
    await withPage(MAC, { prepare: holdScripts, waitUntil: 'commit' }, async (page) => {
    await page.waitForTimeout(1200);
    const h1 = await page.evaluate(() => {
      const el = document.querySelector('h1');
      if (!el) return null;
      const box = el.getBoundingClientRect();
      let opacity = 1;
      for (let n = el; n; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
      return { text: el.textContent.trim(), opacity, inView: box.bottom > 0 && box.top < innerHeight, loader: !!document.querySelector('#loader:not(.is-done)') };
    });
    assert.ok(h1, 'there is an h1');
    assert.ok(h1.text.length > 0 && h1.opacity > 0.9 && h1.inView, `h1 not readable 1 s after navigation with scripts held back: ${JSON.stringify(h1)}`);
    assert.equal(h1.loader, false, 'a loading screen covers the page');
    });
  });

  test('draws nothing while idle', async () => {
    await withPage(MAC, {}, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(2000);
      const a = await gl(page);
      await page.waitForTimeout(3000);
      const b = await gl(page);
      assert.equal(b.draws - a.draws, 0, `${b.draws - a.draws} draw calls in 3 idle seconds (${b.frames - a.frames} frames)`);
    });
  });

  test('a section change draws at most 40 frames, each in one pass over the canvas', async () => {
    await withPage(MAC, {}, async (page) => {
    await sceneReady(page);
    await page.waitForTimeout(1500);
    const canvasMp = await page.evaluate(() => { const c = document.querySelector('canvas'); return (c.width * c.height) / 1e6; });
    const a = await gl(page);
    await goTo(page, 'about');
    await page.waitForTimeout(2500);
    const b = await gl(page);
    const frames = b.frames - a.frames;
    assert.ok(frames >= 1, 'the section change drew nothing');
    assert.ok(frames <= 40, `${frames} frames drawn for one section change`);
    assert.equal(b.passes - a.passes, frames, `${b.passes - a.passes} render passes over ${frames} frames`);
    const perFrame = (b.megapixels - a.megapixels) / frames;
    assert.ok(perFrame <= canvasMp + 0.01, `${perFrame.toFixed(1)} megapixels per frame on a ${canvasMp.toFixed(1)} megapixel canvas`);
    });
  });

  test('links at most 6 shader programs', async () => {
    await withPage(MAC, {}, async (page) => {
      await sceneReady(page);
      for (const id of SECTION_IDS) { await goTo(page, id); await page.waitForTimeout(500); }
      const { programs } = await gl(page);
      assert.ok(programs >= 1 && programs <= 6, `${programs} shader programs linked`);
    });
  });

  test('logs no console errors or warnings while visiting every section', async () => {
    await withPage(MAC, {}, async (page, problems) => {
      await sceneReady(page);
      for (const id of SECTION_IDS) { await goTo(page, id); await page.waitForTimeout(600); }
      assert.deepEqual(problems, []);
    });
  });

  test('dev mode downloads at most 8 MB of JavaScript and never the icon library', async () => {
    {
      let bytes = 0;
      const urls = [];
      const record = (p) => p.on('response', async (r) => {
        const type = r.headers()['content-type'] ?? '';
        if (!/javascript/.test(type)) return;
        urls.push(r.url());
        try { bytes += (await r.body()).length; } catch { /* aborted */ }
      });
      await withPage({ viewport: { width: 1280, height: 800 } }, { url: () => dev.url, prepare: record }, async (page) => {
        // Give the page time to request everything it is going to request, ready or not.
        await sceneReady(page).catch(() => {});
        await page.waitForTimeout(1000);
        assert.deepEqual(urls.filter((u) => u.includes('simple-icons')).map((u) => u.split('/').pop().split('?')[0]), []);
        assert.ok(bytes <= 8 * 1024 * KB, `dev mode downloaded ${(bytes / 1024 / KB).toFixed(1)} MB of JavaScript`);
      });
    }
  });

  test('scrolling quickly through every section ends with the page, art layer and scene on the last one', async () => {
    await withPage(MAC, {}, async (page) => {
      await sceneReady(page);
      for (const id of SECTION_IDS) { await goTo(page, id); await page.waitForTimeout(60); }
      await page.waitForTimeout(1800);
      const state = await page.evaluate(() => ({
        section: document.documentElement.dataset.section,
        art: document.documentElement.dataset.art,
        scene: document.getElementById('scene').dataset.shown,
      }));
      assert.deepEqual(state, { section: 'contact', art: 'contact', scene: 'contact' });
    });
  });

  test('when the scene script cannot be downloaded, the page still works and marks the scene as off', async () => {
    const upfront = new Set(sizes.upfrontScripts);
    const blockLazyScripts = (p) => p.route(/\.js(\?|$)/, (route) => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      return upfront.has(file) ? route.continue() : route.abort();
    });
    await withPage({ viewport: { width: 1280, height: 800 } }, { prepare: blockLazyScripts }, async (page, problems) => {
      await page.waitForSelector('html.scene-off', { state: 'attached', timeout: 15000 });
      const headings = await visibleHeadings(page);
      assert.deepEqual(headings.filter((h) => !h.ok), []);
      assert.deepEqual(problems.filter((p) => p.startsWith('pageerror')), []);
      await goTo(page, 'tour');
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.art), 'tour');
    });
  });

  test('a model file named in the config replaces that object\'s placeholder', async () => {
    const gltf = await boxGltf();
    let fetched = 0;
    const useFixture = async (p) => {
      await p.route('**/__fixture/box.gltf', (route) => { fetched++; return route.fulfill({ contentType: 'model/gltf+json', body: gltf }); });
      await p.route('**/scene.config.js*', async (route) => {
        const response = await route.fetch();
        const original = await response.text();
        const body = original.replace("id: 'cassette', model: null", "id: 'cassette', model: '/__fixture/box.gltf'");
        assert.notEqual(body, original, 'the config has a cassette entry with `model: null` to replace');
        await route.fulfill({ response, body });
      });
    };
    await withPage({ viewport: { width: 1280, height: 800 } }, { url: () => dev.url, prepare: useFixture }, async (page, problems) => {
      await sceneReady(page);
      await page.waitForTimeout(500);
      assert.equal(fetched, 1, 'the model file was requested once');
      assert.equal(await page.evaluate(() => document.getElementById('scene').dataset.models), '1');
      assert.deepEqual(problems, []);
      const { programs } = await gl(page);
      assert.ok(programs <= 6, `${programs} shader programs linked with a model loaded`);
    });
  });

  test('while idle away from the intro, nothing on the page is animating', async () => {
    await withPage(MAC, {}, async (page) => {
      await sceneReady(page);
      await goTo(page, 'kit');
      await untilSettled(page);
      // ...and it stays that way.
      await page.waitForTimeout(1500);
      assert.deepEqual(await runningAnimations(page), []);
    });
  });

  test('on the intro, the only thing that keeps moving is the tape', async () => {
    await withPage(MAC, {}, async (page) => {
      await sceneReady(page);
      await untilSettled(page, '.tape');
      await page.waitForTimeout(1500);
      const running = await runningAnimations(page);
      assert.ok(running.length > 0, 'the tape is moving');
      assert.deepEqual(running.filter((r) => !r.includes('tape')), []);
    });
  });

  test('clicking an object on the desk goes to its section', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(800);
      const spot = await objectSpot(page, 'Drops');
      assert.ok(spot && spot.x > 0 && spot.y > 0, 'the Drops object reports where it is');
      await page.mouse.move(spot.x - 60, spot.y + 150);
      await page.mouse.move(spot.x, spot.y, { steps: 6 });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.getElementById('scene').style.cursor), 'pointer', 'the pointer shows the object can be clicked');
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(2500);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.section), 'drops');
    });
  });

  test('every channel after the opening one features a single object by itself', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      const state = () => page.evaluate(() => { const c = document.getElementById('scene'); return { shown: c.dataset.shown, feature: c.dataset.feature ?? null }; });
      const drawsPerFrame = async (action) => {
        const a = await gl(page);
        await action();
        await page.waitForFunction((frames) => window.__gl.frames > frames, a.frames, { timeout: 10000 });
        await untilSettled(page, '.tape'); // the tape on the opening screen never stops
        await page.waitForTimeout(600);
        const b = await gl(page);
        return (b.draws - a.draws) / (b.frames - a.frames);
      };
      assert.deepEqual(await state(), { shown: 'intro', feature: null }, 'the opening view shows the whole set');

      const seen = [];
      let alone = 0;
      for (const id of SECTION_IDS.slice(1)) {
        alone = await drawsPerFrame(() => goTo(page, id));
        seen.push((await state()).feature);
      }
      assert.deepEqual(seen, ['cassette', 'tapes', 'boombox', 'floppies', 'phone']);

      const whole = await drawsPerFrame(() => goTo(page, 'intro'));
      assert.equal((await state()).feature, null, 'back on the opening view the whole set returns');
      assert.ok(alone <= 8, `a featured object and its stand take ${alone} draw calls per frame (limit 8)`);
      assert.ok(whole > alone * 2, `the whole set (${whole} draws per frame) is not hidden while one object is featured (${alone})`);
    });
  });

  test('clicking a featured object makes it bounce and leaves the page where it is', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      await goTo(page, 'drops');
      await untilSettled(page);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'instant' }));
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.section), 'drops');
      // The featured object sits in the middle of the art window. Put the pointer on it
      // first and let the hover finish, so the frames counted below come from the click.
      const x = (await page.evaluate(() => document.documentElement.dataset.side)) === 'left' ? 360 : 1080;
      await page.mouse.move(x - 40, 470);
      await page.mouse.move(x, 450, { steps: 5 });
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => document.getElementById('scene').style.cursor), 'pointer', 'the pointer is on the object');
      const still = await gl(page);
      await page.waitForTimeout(400);
      assert.equal((await gl(page)).frames, still.frames, 'the scene was not at rest before the click');

      const before = await page.evaluate(() => window.scrollY);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(1200);
      const frames = (await gl(page)).frames - still.frames;
      assert.ok(frames >= 5, `the object did not bounce: ${frames} frames drawn after the click`);
      assert.equal(await page.evaluate(() => window.scrollY), before, 'the page jumped');
      await page.waitForTimeout(300);
      assert.equal((await gl(page)).frames - still.frames, frames, 'the bounce never stopped');
    });
  });

  test('a model compressed with `gltf-transform optimize` replaces its placeholder', async () => {
    // tests/fixtures/box-optimized.glb is a box run through `@gltf-transform/cli optimize` 4.5.1:
    // meshopt-compressed, with positions and normals stored as integers.
    const glb = readFileSync(path.join(ROOT, 'tests', 'fixtures', 'box-optimized.glb'));
    const useFixture = async (p) => {
      await p.route('**/__fixture/box-optimized.glb', (route) => route.fulfill({ contentType: 'model/gltf-binary', body: glb }));
      await p.route('**/scene.config.js*', async (route) => {
        const response = await route.fetch();
        const original = await response.text();
        const body = original.replace("id: 'cassette', model: null", "id: 'cassette', model: '/__fixture/box-optimized.glb'");
        assert.notEqual(body, original, 'the config has a cassette entry with `model: null` to replace');
        await route.fulfill({ response, body });
      });
    };
    await withPage({ viewport: { width: 1280, height: 800 } }, { url: () => dev.url, prepare: useFixture }, async (page, problems) => {
      await sceneReady(page);
      await page.waitForTimeout(500);
      assert.deepEqual(problems, []);
      assert.equal(await page.evaluate(() => document.getElementById('scene').dataset.models), '1');
    });
  });

  test('block backgrounds are quiet base tones, never an accent', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await page.waitForTimeout(600);
      const loud = await page.evaluate(() => [...document.querySelectorAll('main .block')].map((b) => {
        const [r, g, bl] = /rgba?\(([^)]+)\)/.exec(getComputedStyle(b).backgroundColor)[1].split(/[,\s/]+/).map(Number);
        const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
        const saturation = max === 0 ? 0 : (max - min) / max;
        return { id: b.closest('section').id, rgb: `${r},${g},${bl}`, saturation: +saturation.toFixed(2) };
      }).filter((b) => b.saturation > 0.2));
      assert.deepEqual(loud, []);
    });
  });

  test('after a section change the on-screen display shows that section\'s channel', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      await goTo(page, 'tour');
      await page.waitForFunction(() => document.documentElement.dataset.art === 'tour', null, { timeout: 8000 });
      const osd = await page.evaluate(() => document.getElementById('osd-channel').textContent.replace(/\s+/g, ' ').trim());
      assert.match(osd, /CH\s*03/);
      assert.match(osd, /TOUR/i);
    });
  });

  test('the Static switch turns the other-world mode on and off, and the scene follows', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page, problems) => {
      await sceneReady(page);
      await untilSettled(page, '.tape');
      const state = () => page.evaluate(() => ({
        world: document.documentElement.dataset.world ?? '',
        pressed: document.getElementById('world').getAttribute('aria-pressed'),
        scene: document.getElementById('scene').dataset.world ?? '',
        background: getComputedStyle(document.body).backgroundColor,
      }));
      const before = await state();
      assert.deepEqual([before.world, before.pressed, before.scene], ['', 'false', '']);
      const drawn = (await gl(page)).frames;
      const named = (pressed) => page.getByRole('button', { name: 'Static mode', exact: true, pressed }).count();
      assert.equal(await named(false), 1, 'the switch is announced as "Static mode", not pressed');

      await page.click('#world');
      await page.waitForFunction(() => document.getElementById('scene').dataset.world === 'static', null, { timeout: 8000 });
      const on = await state();
      assert.deepEqual([on.world, on.pressed, on.scene], ['static', 'true', 'static']);
      assert.equal(await named(true), 1, 'the switch keeps its name and is announced as pressed');
      assert.notEqual(on.background, before.background, 'the page background changes');
      assert.ok((await gl(page)).frames > drawn, 'the scene was redrawn in the new look');

      // It survives a section change...
      await goTo(page, 'kit');
      await page.waitForFunction(() => document.documentElement.dataset.art === 'kit', null, { timeout: 8000 });
      assert.equal((await state()).world, 'static');

      // ...and switches back from the keyboard.
      await page.focus('#world');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('scene').dataset.world, null, { timeout: 8000 });
      const off = await state();
      assert.deepEqual([off.world, off.pressed], ['', 'false']);
      assert.deepEqual(problems, []);
    });
  });

  test('Static mode shows what it is: the display, the labels, and a note with a way back', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page, problems) => {
      await sceneReady(page);
      await untilSettled(page, '.tape');
      // What a visitor can read: the copy of the element that is on show (in Static mode the
      // screen is drawn as broken pieces, each a copy), without wording that is hidden.
      const text = (sel) => page.evaluate((sel) => {
        const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
      }, sel);
      const labels = () => page.evaluate(() => [...document.querySelectorAll('.pin')].map((p) => p.textContent));

      assert.equal(await page.isVisible('#signal'), false, 'no note while the signal is clean');
      assert.match(await text('.osd-play'), /PLAY/i);
      assert.match(await text('#intro .chip'), /^on air$/i);
      assert.ok((await labels()).some((t) => /Static/.test(t)), 'the television is labelled as the way in');

      await page.click('#world');
      await page.waitForFunction(() => document.getElementById('scene').dataset.world === 'static', null, { timeout: 8000 });
      // The picture says so itself...
      assert.match(await text('.osd-play'), /NO SIGNAL/i);
      assert.doesNotMatch(await text('.osd-play'), /PLAY/i);
      assert.match(await text('.osd-code'), /MN-00 · -:--:--/);
      assert.match(await text('.screen-tab'), /OFF AIR/i);
      assert.match(await text('#intro .chip'), /^off air$/i);
      // ...a note names it, explains itself at first, and offers the way back...
      assert.ok(await page.isVisible('#signal'), 'the note is shown');
      assert.match(await text('#signal'), /no signal/i);
      assert.match(await text('#signal'), /dead channel/i);
      assert.ok(await page.isVisible('#signal .signal-note'), 'the note explains itself when it first appears');
      assert.ok(await page.isVisible('#retune'));
      assert.match(await text('#world-status'), /static mode is on/i);
      // ...and the television now offers the way back too.
      assert.ok((await labels()).some((t) => /Retune/.test(t)), 'the television is labelled as the way back');
      assert.ok(!(await labels()).some((t) => /Static/.test(t)));

      // It holds across a channel change.
      await goTo(page, 'tour');
      await page.waitForFunction(() => document.documentElement.dataset.art === 'tour', null, { timeout: 8000 });
      assert.match(await text('.osd-code'), /MN-03 · -:--:--/);
      assert.ok(await page.isVisible('#signal'));

      // Retune puts everything back, and the keyboard is not left on a control that vanished.
      await page.focus('#retune');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('scene').dataset.world, null, { timeout: 8000 });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.world ?? ''), '');
      assert.equal(await page.isVisible('#signal'), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'world', 'focus moves to the switch');
      assert.equal(await page.getAttribute('#world', 'aria-pressed'), 'false');
      assert.match(await text('#world-status'), /static mode is off/i);
      assert.match(await text('.osd-play'), /PLAY/i);
      assert.match(await text('.osd-code'), /MN-03 · 0:03:00/);
      assert.ok((await labels()).some((t) => /Static/.test(t)));
      assert.deepEqual(problems, []);
    });
  });

  test('the note explains itself for a few seconds, then steps back to a label and the way back', async () => {
    await withPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, {}, async (page) => {
      await page.waitForTimeout(500);
      await page.evaluate(() => document.getElementById('world').click());
      await page.waitForSelector('#signal .signal-note', { state: 'visible', timeout: 4000 });
      const fits = () => page.evaluate(() => { const r = document.getElementById('signal').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight; });
      assert.ok(await fits(), 'the note is inside the screen on a phone');
      await page.waitForSelector('#signal .signal-note', { state: 'hidden', timeout: 15000 });
      assert.ok(await page.isVisible('#signal'), 'the label stays');
      assert.ok(await page.isVisible('#retune'), 'the way back stays');
      assert.ok(await fits());
    });
  });

  test('in Static mode the screen and the picture are broken into the same pieces, and hold still', async () => {
    const state = (page) => page.evaluate(() => {
      const shown = (el) => el.getClientRects().length > 0;
      const pieces = [...document.querySelectorAll('#shards .shard')].filter(shown);
      return {
        picture: document.getElementById('scene').dataset.pieces ?? '',
        screen: pieces.length,
        moved: new Set(pieces.map((el) => getComputedStyle(el).transform).filter((t) => t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)')).size,
        cracks: getComputedStyle(document.getElementById('cracks')).display === 'none' ? 0 : document.querySelectorAll('#cracks line.crack').length,
        wholeScreenShown: getComputedStyle(document.querySelector('.art-set > .screen')).visibility !== 'hidden',
      };
    });
    // The chaos in the window that shows the objects: smaller cracks, loose shards, and
    // pieces tuned to other channels.
    const chaos = (page) => page.evaluate(() => {
      const shown = (el) => el.getClientRects().length > 0;
      const canvas = document.getElementById('scene');
      const strays = [...document.querySelectorAll('#shards .shard[data-accent]')];
      return {
        web: [...document.querySelectorAll('#cracks line.web')].filter(shown).length,
        shards: [...document.querySelectorAll('#debris i')].filter(shown).length,
        tones: new Set([...document.querySelectorAll('#debris i')].filter(shown).map((el) => getComputedStyle(el).backgroundColor)).size,
        feature: canvas.dataset.feature ?? '',
        also: (canvas.dataset.also ?? '').split(',').filter(Boolean),
        strayAccents: strays.map((el) => el.dataset.accent),
        strayChannels: strays.map((el) => el.querySelector('.osd-channel').textContent.trim().slice(0, 5)),
        ownChannel: document.querySelector('#shards .shard:not([data-accent]) .osd-channel')?.textContent.trim().slice(0, 5) ?? '',
      };
    });
    const frame = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page, problems) => {
      await sceneReady(page);
      await goTo(page, 'about');
      await untilSettled(page);
      await page.waitForTimeout(600);
      assert.deepEqual(await state(page), { picture: '', screen: 0, moved: 0, cracks: 0, wholeScreenShown: true }, 'a clean signal is whole');

      await page.click('#world');
      await page.waitForFunction(() => document.getElementById('scene').dataset.pieces === '7', null, { timeout: 8000 });
      // The pieces fit together under the static, then snap apart.
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.art')).getPropertyValue('--apart').trim() === '1', null, { timeout: 8000 });
      await untilSettled(page);
      await frame(page);
      assert.deepEqual(await state(page), { picture: '7', screen: 7, moved: 7, cracks: 7, wholeScreenShown: false });

      // Around the object it is chaos, but a drawn one: every piece is accounted for.
      const wild = await chaos(page);
      assert.equal(wild.web, 7, 'a smaller crack crosses each piece');
      assert.ok(wild.shards >= 10 && wild.tones >= 4, `${wild.shards} loose shards in ${wild.tones} colours`);
      assert.equal(wild.feature, 'cassette');
      assert.equal(wild.also.length, 2, 'two pieces show other channels');
      assert.ok(!wild.also.includes('cassette') && new Set(wild.also).size === 2, `the stray pieces show ${wild.also}`);
      assert.deepEqual(wild.strayAccents.sort(), ['magenta', 'yellow'], 'the stray pieces carry the accents of Drops and Hotline, the channels either side of Who');
      assert.deepEqual(wild.strayChannels.sort(), ['CH 02', 'CH 05']);
      assert.equal(wild.ownChannel, 'CH 01');

      // Broken, but still: nothing is drawn and nothing animates.
      const a = await gl(page);
      await page.waitForTimeout(1500);
      assert.equal((await gl(page)).draws - a.draws, 0, 'the broken picture keeps being redrawn');
      assert.deepEqual(await runningAnimations(page), []);

      // A redraw draws the scene once per piece, still in one pass and with the same programs.
      await goTo(page, 'drops');
      await page.waitForFunction((frames) => window.__gl.frames > frames, a.frames, { timeout: 8000 });
      await untilSettled(page);
      await page.waitForTimeout(900);
      const b = await gl(page);
      const frames = b.frames - a.frames;
      assert.equal((b.draws - a.draws) / frames, 49, 'one featured object and its stand (7 draw calls), once for each of the 7 pieces');
      assert.equal((b.passes - a.passes) / frames, 1, 'more than one pass per frame');
      assert.ok(b.programs <= 6, `${b.programs} shader programs linked`);
      assert.equal((await state(page)).moved, 7, 'the pieces are apart again after the channel change');

      // Retune: one whole picture again.
      await page.click('#retune');
      await page.waitForFunction(() => !document.getElementById('scene').dataset.pieces, null, { timeout: 8000 });
      await untilSettled(page);
      assert.deepEqual(await state(page), { picture: '', screen: 0, moved: 0, cracks: 0, wholeScreenShown: true });
      const calm = await chaos(page);
      assert.deepEqual([calm.web, calm.shards, calm.also], [0, 0, []], 'nothing of the break is left on a clean signal');
      assert.deepEqual(problems, []);
    });
    // With reduced motion the pieces are simply apart: nothing snaps.
    await withPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, {}, async (page) => {
      await sceneReady(page);
      await page.click('#world');
      await page.waitForFunction(() => document.getElementById('scene').dataset.pieces === '7', null, { timeout: 8000 });
      assert.deepEqual(await runningAnimations(page), []);
      const s = await state(page);
      assert.deepEqual([s.screen, s.moved, s.cracks], [7, 7, 7]);
    });
  });

  test('in Static mode the cracks stay in the window that shows the objects, and never cross the text', async () => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await withPage({ viewport, reducedMotion: 'reduce' }, {}, async (page) => {
        await page.waitForTimeout(400);
        await page.evaluate(() => document.getElementById('world').click());
        await page.evaluate(() => document.getElementById('about').scrollIntoView({ behavior: 'instant', block: 'start' }));
        await page.waitForFunction(() => document.documentElement.dataset.art === 'about', null, { timeout: 8000 });
        const found = await page.evaluate(() => {
          const cracks = document.getElementById('cracks');
          const block = document.querySelector('#about .block');
          const box = block.getBoundingClientRect();
          // What is on top in the middle of the text panel, and whether it is opaque.
          // (Not near the bottom of the screen: the taped note sits there.)
          const top = document.elementFromPoint(box.left + box.width / 2, Math.max(box.top, 0) + Math.min(box.height, innerHeight) / 2);
          return {
            lines: cracks.querySelectorAll('line').length,
            inArtLayer: !!cracks.closest('.art'),
            artLevel: Number(getComputedStyle(document.querySelector('.art')).zIndex),
            textLevel: Number(getComputedStyle(document.querySelector('main')).zIndex),
            panelOnTop: !!top?.closest('#about .block'),
            panelOpaque: !/rgba\(.*,\s*0(\.\d+)?\)$/.test(getComputedStyle(block).backgroundColor) && getComputedStyle(block).backgroundColor !== 'transparent',
          };
        });
        assert.ok(found.lines >= 7, 'the cracks are drawn');
        assert.ok(found.inArtLayer, 'the cracks are not part of the art layer');
        assert.ok(found.artLevel < found.textLevel, 'the art layer is not below the text');
        assert.ok(found.panelOnTop && found.panelOpaque, 'the text panel does not cover what is behind it');
      });
    }
  });

  test('in Static mode an object is found where its broken piece is drawn', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      await untilSettled(page, '.tape');
      const tv = () => page.evaluate(() => { const c = document.getElementById('scene'); return { x: Number(c.dataset.tvX), y: Number(c.dataset.tvY) }; });
      const whole = await tv();
      await page.evaluate(() => document.getElementById('world').click());
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.art')).getPropertyValue('--apart').trim() === '1', null, { timeout: 8000 });
      await untilSettled(page, '.tape');
      await page.waitForTimeout(700);
      const broken = await tv();
      assert.ok(Math.hypot(broken.x - whole.x, broken.y - whole.y) > 2, 'the television has moved with its piece');
      // The television toggles the mode, so a click on it, where it is now, retunes.
      await page.mouse.move(broken.x - 30, broken.y + 40);
      await page.mouse.move(broken.x, broken.y, { steps: 4 });
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.getElementById('scene').style.cursor), 'pointer', 'the television is under the pointer');
      await page.mouse.click(broken.x, broken.y);
      await page.waitForFunction(() => !document.documentElement.dataset.world, null, { timeout: 8000 });
    });
  });

  test('in Static mode, nothing keeps animating while idle and text still meets contrast', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      await page.click('#world');
      await goTo(page, 'about');
      await untilSettled(page);
      await page.waitForTimeout(1500);
      assert.deepEqual(await runningAnimations(page), []);
      const a = await gl(page);
      await page.waitForTimeout(2000);
      assert.equal((await gl(page)).draws - a.draws, 0, 'the scene keeps drawing while idle in Static mode');
      assert.deepEqual((await contrastFailures(page)).slice(0, 10), []);
    });
  });

  test('clicking the television switches Static mode on', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(800);
      const spot = await page.evaluate(() => { const c = document.getElementById('scene'); return { x: Number(c.dataset.tvX), y: Number(c.dataset.tvY) }; });
      assert.ok(spot.x > 0 && spot.y > 0, `the television reports where it is: ${JSON.stringify(spot)}`);
      await page.mouse.move(spot.x - 30, spot.y + 60);
      await page.mouse.move(spot.x, spot.y, { steps: 5 });
      await page.waitForTimeout(400);
      await page.mouse.click(spot.x, spot.y);
      await page.waitForFunction(() => document.documentElement.dataset.world === 'static', null, { timeout: 8000 });
    });
  });

  test('tapping an object on a phone goes to its section', async () => {
    await withPage({ ...playwright.devices['iPhone 13'] }, {}, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(800);
      const spot = await objectSpot(page, 'Drops'); // labels are hidden on phones but still track their objects
      assert.ok(spot && spot.y > 0 && spot.y < 500, `the Drops object is in the art window at the top: ${JSON.stringify(spot)}`);
      await page.touchscreen.tap(spot.x, spot.y);
      await page.waitForFunction(() => document.documentElement.dataset.section === 'drops', null, { timeout: 8000 });
    });
  });

  test('with always-visible scrollbars, the canvas is not stretched and objects are still under the pointer', async () => {
    // Playwright hides scrollbars in headless mode. Windows, Linux and a Mac with a mouse
    // show them, which makes the page 15 px narrower than the window.
    const withScrollbars = await playwright.chromium.launch({ args: CHROMIUM_ARGS, ignoreDefaultArgs: ['--hide-scrollbars'] });
    try {
      const page = await (await withScrollbars.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
      await sceneReady(page);
      await page.waitForTimeout(800);
      const c = await page.evaluate(() => { const el = document.getElementById('scene'); return { w: el.width, h: el.height, cw: el.clientWidth, ch: el.clientHeight, bar: innerWidth - document.documentElement.clientWidth }; });
      assert.ok(c.bar > 0, 'this browser shows a scrollbar');
      const stretch = Math.abs((c.w / c.h) / (c.cw / c.ch) - 1);
      assert.ok(stretch < 0.004, `buffer ${c.w}x${c.h} shown at ${c.cw}x${c.ch}: ${(stretch * 100).toFixed(2)}% stretch`);
      // The object must be where its label says it is: hovering there finds it.
      const spot = await page.evaluate(() => {
        const pin = [...document.querySelectorAll('.pin')].find((el) => el.textContent.includes('Drops'));
        return { x: Number(pin.dataset.cx), y: Number(pin.dataset.cy) };
      });
      await page.mouse.move(spot.x - 40, spot.y + 120);
      await page.mouse.move(spot.x, spot.y, { steps: 5 });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.querySelector('.pin.is-hot')?.textContent ?? ''), '02Drops');
    } finally {
      await withScrollbars.close();
    }
  });

  test('the scene is redrawn after the graphics context is lost and restored', async () => {
    await withPage({ viewport: { width: 1280, height: 800 } }, {}, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(1200);
      const before = await gl(page);
      await page.evaluate(() => {
        const ext = document.getElementById('scene').getContext('webgl2').getExtension('WEBGL_lose_context');
        ext.loseContext();
        setTimeout(() => ext.restoreContext(), 250);
      });
      await page.waitForTimeout(2000);
      const after = await gl(page);
      assert.ok(after.draws > before.draws, 'nothing was drawn after the context came back');
    });
  });

  test('the ?perf readout does not report idle time as a slow frame', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, { url: () => `${preview.url}?perf` }, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(800);
      // Interrupt one transition with another, sit still, then nudge the pointer.
      await goTo(page, 'about');
      await page.waitForTimeout(330);
      await goTo(page, 'drops');
      await page.waitForTimeout(5000);
      await page.mouse.move(1000, 400);
      await page.mouse.move(1080, 460, { steps: 4 });
      await page.waitForTimeout(1200);
      const text = await page.evaluate(() => document.querySelector('pre')?.textContent ?? '');
      assert.match(text, /slowest frame gap/);
      const gap = Number(/slowest frame gap in\s+(\d+) ms/.exec(text)?.[1] ?? 0);
      assert.ok(gap < 1500, `readout says the slowest frame gap was ${gap} ms after 5 idle seconds`);
    });
  });

  for (const mode of ['clean', 'Static']) {
    test(`in ${mode} mode, every keyboard focus ring uses two colours that contrast, so it shows on any background`, async () => {
      // Reduced motion switches transitions off, so each ring is read in its final state
      // instead of part-way through a button's 0.12 s shadow fade.
      await withPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, {}, async (page) => {
        await page.waitForTimeout(800);
        if (mode === 'Static') {
          // Switched on from script: a real click would move the place Tab starts from.
          await page.evaluate(() => document.getElementById('world').click());
          await page.waitForFunction(() => document.documentElement.dataset.world === 'static');
        }
        // Controls that are on the page right now (the Retune button only exists in Static mode).
        const stops = await page.evaluate(() => [...document.querySelectorAll('a[href], button:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0).length);
        const weak = [];
        for (let i = 0; i < stops; i++) {
          await page.keyboard.press('Tab');
          const ring = await page.evaluate(() => {
            const el = document.activeElement;
            const cs = getComputedStyle(el);
            const rgb = (str) => /rgba?\(([^)]+)\)/.exec(str)?.[1].split(/[,\s/]+/).slice(0, 3).map(Number);
            const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
            const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 ? rgb(cs.outlineColor) : null;
            const shadow = cs.boxShadow !== 'none' ? rgb(cs.boxShadow) : null;
            let ratio = 0;
            if (outline && shadow) { const [hi, lo] = [lum(outline), lum(shadow)].sort((a, b) => b - a); ratio = (hi + 0.05) / (lo + 0.05); }
            return { what: `${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 24)}"`, ratio };
          });
          if (ring.ratio < 9) weak.push(`${ring.what}: ${ring.ratio.toFixed(1)}:1`);
        }
        assert.ok(stops > 20, `only ${stops} focus stops found`);
        assert.deepEqual(weak.slice(0, 6), []);
      });
    });
  }

  test('small pieces keep to their box: the notice header, the flip label, the on-screen display', async () => {
    const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
      await withPage({ viewport: { width, height }, reducedMotion: 'reduce' }, {}, async (page) => {
        await page.waitForTimeout(500);
        // The header bar of the "Now playing" notice runs the full width of its box.
        const notice = await page.evaluate(() => {
          const box = document.querySelector('.notice');
          return { head: box.querySelector('.notice-head').getBoundingClientRect().width, inner: box.clientWidth };
        });
        assert.ok(Math.abs(notice.head - notice.inner) <= 1, `${width}px: the notice header is ${notice.head}px in a ${notice.inner}px box`);
        // The channel-flip label fits the art window (half the screen here), longest label included.
        await page.click('#world');
        const label = await page.evaluate(() => {
          const el = document.getElementById('flip-channel');
          return { text: el.textContent, width: el.getBoundingClientRect().width };
        });
        assert.equal(label.text, 'NO SIGNAL');
        assert.ok(label.width <= width / 2 - 24, `${width}px: "${label.text}" is ${Math.round(label.width)}px wide in a ${width / 2}px window`);
      });
    }
    // On a phone held sideways the display's two top labels do not run into each other.
    await withPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, {}, async (page) => {
      await page.waitForTimeout(500);
      const boxes = await page.evaluate(() => ['.osd-play', '.osd-channel'].map((sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        return { shown: getComputedStyle(el).display !== 'none', left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      assert.ok(boxes[1].shown, 'the channel number is shown');
      assert.ok(!boxes[0].shown || !overlap(boxes[0], boxes[1]), 'PLAY overlaps the channel number');
    });
  });

  test('all text meets the WCAG AA contrast ratio against its block', async () => {
    await withPage({ viewport: { width: 1440, height: 900 } }, {}, async (page) => {
      await page.waitForTimeout(800);
      const failures = await contrastFailures(page);
      assert.deepEqual(failures.slice(0, 12), []);
    });
  });

  for (const [width, height] of VIEWPORTS) {
    test(`fits a ${width}x${height} screen: no sideways scroll, no text wider than the screen or its box`, async () => {
      await withPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 800, hasTouch: width < 800 }, {}, async (page) => {
      await page.waitForTimeout(1200);
      const report = await page.evaluate(() => ({
        sideways: document.documentElement.scrollWidth - window.innerWidth,
        wide: [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, main a')]
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1))
          .map(({ el, box }) => `${el.tagName} "${el.textContent.trim().slice(0, 30)}" ${Math.round(box.left)}..${Math.round(box.right)}`),
        // Text can also spill out of a box that itself fits the screen (and be cut off there).
        spilling: [...document.querySelectorAll('main *')]
          .filter((el) => !el.closest('[aria-hidden="true"]') && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
          .map((el) => `${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 30)}" content ${el.scrollWidth}px in ${el.clientWidth}px`),
      }));
      assert.ok(report.sideways <= 0, `page is ${report.sideways}px wider than the screen`);
      assert.deepEqual(report.wide.slice(0, 5), []);
      assert.deepEqual(report.spilling.slice(0, 5), []);
      });
    });
  }

  test('with JavaScript disabled, all six sections are readable', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
    try {
    const page = await context.newPage();
    await page.goto(preview.url, { waitUntil: 'load' });
    const report = await page.locator('main section').evaluateAll((sections) => sections.map((s) => {
      const h = s.querySelector('h1, h2');
      let opacity = 1;
      for (let n = h; n; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
      return { id: s.id, ok: !!h && opacity > 0.9 && h.getBoundingClientRect().height > 0 };
    }));
    assert.deepEqual(report.map((r) => r.id), SECTION_IDS);
    assert.deepEqual(report.filter((r) => !r.ok), []);
    } finally {
      await context.close();
    }
  });

  test('without WebGL, the page is complete and throws no error', async () => {
    const noWebGL = (p) => p.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/.test(type) ? null : original.call(this, type, ...rest);
      };
    });
    await withPage({ viewport: { width: 1280, height: 800 } }, { prepare: noWebGL }, async (page, problems) => {
      await page.waitForTimeout(4000);
      const headings = await visibleHeadings(page);
      assert.deepEqual(headings.filter((h) => !h.ok), []);
      assert.deepEqual(problems.filter((p) => p.startsWith('pageerror')), []);
    });
  });

  test('the 3D scene starts even if the browser never reports an idle moment', async () => {
    // A page that is perfectly still (reduced motion) can wait for "idle" for ever: seen
    // here in about one load in seven. The page must ask with a deadline. This browser
    // only honours the deadline, as the worst case does.
    await withPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, {
      prepare: (page) => page.addInitScript(() => {
        window.requestIdleCallback = (fn, options) => (options?.timeout ? setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 0 }), options.timeout) : 0);
      }),
    }, async (page) => {
      const t0 = Date.now();
      await page.waitForSelector('html.scene-ready', { state: 'attached', timeout: 12000 });
      assert.ok(Date.now() - t0 < 8000, 'the scene took too long to start');
    });
  });

  test('the built site works from a sub-folder, as GitHub Pages serves a project site', async () => {
    // https://<user>.github.io/<repo>/ : every address in the page must be relative.
    const { createServer } = await import('node:http');
    const { readFile } = await import('node:fs/promises');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', pdf: 'application/pdf', woff2: 'font/woff2', woff: 'font/woff', json: 'application/json' };
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith('/desk-portfolio/')) { response.writeHead(404).end('outside the site'); return; }
      const file = url.pathname.slice('/desk-portfolio/'.length) || 'index.html';
      try {
        const body = await readFile(path.join(ROOT, 'dist', file));
        response.writeHead(200, { 'content-type': types[file.split('.').pop()] ?? 'application/octet-stream' }).end(body);
      } catch {
        response.writeHead(404).end('not found');
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${server.address().port}/desk-portfolio/`;
    try {
      await withPage({ viewport: { width: 1280, height: 800 } }, { url: () => base }, async (page, problems) => {
        const missing = [];
        page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url().replace(base, '')}`); });
        page.on('requestfailed', (r) => missing.push(`failed ${r.url().replace(base, '')}`));
        await page.reload({ waitUntil: 'load' });
        await sceneReady(page);
        // Things the page points at but does not load by itself: the icons and the résumé.
        const linked = await page.evaluate(async () => {
          const targets = [document.querySelector('use').getAttribute('href').split('#')[0], document.querySelector('a[download]').getAttribute('href')];
          return Promise.all(targets.map(async (t) => `${(await fetch(t)).status} ${t}`));
        });
        assert.deepEqual(linked.filter((line) => !line.startsWith('200 ')), [], 'a linked file is missing');
        assert.equal(await page.evaluate(() => document.fonts.check('800 italic 40px "Barlow Condensed"')), true, 'the headline font did not load');
        await goTo(page, 'tour');
        await page.waitForFunction(() => document.getElementById('scene').dataset.shown === 'tour', null, { timeout: 10000 });
        assert.deepEqual(missing, []);
        assert.deepEqual(problems, []);
      });
    } finally {
      server.close();
    }
  });

  test('with reduced motion, no animation is running', async () => {
    await withPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, {}, async (page) => {
      await sceneReady(page);
      await page.waitForTimeout(1500);
      assert.deepEqual(await runningAnimations(page), []);
      // A section change must still happen, just without movement.
      const before = await gl(page);
      await goTo(page, 'drops');
      await page.waitForFunction(() => document.getElementById('scene').dataset.shown === 'drops', null, { timeout: 10000 });
      assert.deepEqual(await runningAnimations(page), []);
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => ({ art: document.documentElement.dataset.art, scene: document.getElementById('scene').dataset.shown }));
      assert.deepEqual(state, { art: 'drops', scene: 'drops' });
      const frames = (await gl(page)).frames - before.frames;
      assert.ok(frames >= 1 && frames <= 3, `${frames} frames drawn for a section change with reduced motion`);
    });
  });
});

// Build-size, structure, responsive and performance tests for the whole site.
// One file on purpose: it builds `dist` once, and two files would build it at the same time.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadPlaywright, CHROMIUM_ARGS, build, serve, builtSizes, glHook, boxGltf, SECTION_IDS, VIEWPORTS,
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

  const sceneReady = (page) => page.waitForSelector('html.scene-ready', { state: 'attached', timeout: 20000 });
  const gl = (page) => page.evaluate(() => ({ ...window.__gl }));
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
    const useFixture = async (p) => {
      await p.route('**/__fixture/box.gltf', (route) => route.fulfill({ contentType: 'model/gltf+json', body: gltf }));
      await p.route('**/scene.config.js*', async (route) => {
        const response = await route.fetch();
        const original = await response.text();
        const body = original.replace("id: 'mug', model: null", "id: 'mug', model: '/__fixture/box.gltf'");
        assert.notEqual(body, original, 'the config has a mug entry with `model: null` to replace');
        await route.fulfill({ response, body });
      });
    };
    await withPage({ viewport: { width: 1280, height: 800 } }, { url: () => dev.url, prepare: useFixture }, async (page, problems) => {
      await sceneReady(page);
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.getElementById('scene').dataset.models), '1');
      assert.deepEqual(problems, []);
      const { programs } = await gl(page);
      assert.ok(programs <= 6, `${programs} shader programs linked with a model loaded`);
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

  test('with reduced motion, no animation is running', async () => {
    await withPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, {}, async (page) => {
      await page.waitForTimeout(2500);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name));
      assert.deepEqual(running, []);
    });
  });
});

// Checks on the page's markup and data files that need no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SECTION_IDS } from './helpers.mjs';

const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const tags = (name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// The five loud colours. Everything else on the page is a quiet base tone.
const ACCENTS = ['yellow', 'crimson', 'magenta', 'cyan', 'acid'];
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8');

test('every section has the attributes the art layer reads, with allowed values', () => {
  const sections = tags('section');
  assert.deepEqual(sections.map((s) => attr(s, 'id')), SECTION_IDS);
  for (const s of sections) {
    const id = attr(s, 'id');
    assert.ok(ACCENTS.includes(attr(s, 'data-accent')), `${id}: data-accent="${attr(s, 'data-accent')}"`);
    assert.match(attr(s, 'data-channel') ?? '', /^\d{2}$/, `${id}: data-channel should be two digits`);
    assert.ok(['left', 'right'].includes(attr(s, 'data-side')), `${id}: data-side="${attr(s, 'data-side')}"`);
    assert.ok(attr(s, 'data-word')?.length > 0, `${id}: data-word is missing`);
  }
});

test('every in-page link points at an element that exists', () => {
  const targets = tags('a').map((a) => attr(a, 'href')).filter((h) => h?.startsWith('#')).map((h) => h.slice(1));
  assert.ok(targets.length > 0, 'the page has in-page links');
  assert.deepEqual(targets.filter((t) => !ids.has(t)), []);
});

test('every link to another site opens safely', () => {
  const external = tags('a').filter((a) => /^https?:/.test(attr(a, 'href') ?? ''));
  assert.ok(external.length > 0, 'the page has external links');
  assert.deepEqual(external.filter((a) => !/noopener/.test(attr(a, 'rel') ?? '')).map((a) => attr(a, 'href')), []);
});

test('every logo the page uses exists in the icon sprite', () => {
  const sprite = path.join(ROOT, 'public', 'icons.svg');
  assert.ok(existsSync(sprite), 'public/icons.svg has been generated (npm run icons)');
  const symbols = new Set([...readFileSync(sprite, 'utf8').matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/href="icons\.svg#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 0, 'the page uses logos from the sprite');
  assert.deepEqual(used.filter((u) => !symbols.has(u)), []);
});

test('the icon sprite stays small', () => {
  const sprite = path.join(ROOT, 'public', 'icons.svg');
  assert.ok(existsSync(sprite), 'public/icons.svg has been generated (npm run icons)');
  const kb = readFileSync(sprite).length / 1024;
  assert.ok(kb <= 60, `icon sprite is ${kb.toFixed(1)} KB`);
});

test('the résumé the page links to is in the repository', () => {
  const href = tags('a').map((a) => attr(a, 'href')).find((h) => h?.endsWith('.pdf') && !/^https?:/.test(h));
  assert.ok(href, 'the page links to a PDF of its own');
  assert.ok(existsSync(path.join(ROOT, 'public', href)), `public/${href} exists`);
});

test('every icon is hidden from screen readers (the word beside it is the label)', () => {
  const svgs = tags('svg');
  assert.ok(svgs.length > 20, 'the page has icons');
  assert.deepEqual(svgs.filter((t) => attr(t, 'aria-hidden') !== 'true'), []);
});

test('the shaders never call pow(), whose result is undefined for a negative base', () => {
  const src = readFileSync(path.join(ROOT, 'src', 'scene', 'toon.js'), 'utf8');
  assert.equal((src.match(/\bpow\s*\(/g) ?? []).length, 0);
});

test('the opening section leads with hazard yellow, and every accent is used by some section', () => {
  const sections = tags('section');
  assert.equal(attr(sections[0], 'data-accent'), 'yellow');
  const used = new Set(sections.map((t) => attr(t, 'data-accent')));
  assert.deepEqual(ACCENTS.filter((a) => !used.has(a)), []);
});

test('channels are numbered in page order, starting at 00', () => {
  assert.deepEqual(tags('section').map((t) => attr(t, 'data-channel')), ['00', '01', '02', '03', '04', '05']);
});

test('no pure black or pure white is used in the styles or the 3D palette', () => {
  const files = ['tokens.css', 'base.css', 'art.css', 'layout.css', 'components.css'].map((f) => ['src', 'styles', f])
    .concat([['src', 'scene', 'objects.js'], ['src', 'scene', 'scene.js'], ['src', 'scene', 'toon.js'], ['index.html']]);
  const pure = /#(?:000|fff|000000|ffffff)\b|0x(?:000000|ffffff)\b|(?<![-\w])(?:black|white)\s*[;,)]|rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,)]/gi;
  const found = [];
  for (const parts of files) {
    const text = read(...parts).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // comments may name them
    for (const m of text.matchAll(pure)) found.push(`${parts.at(-1)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test('the Static switch is a real button that says whether it is on', () => {
  const button = tags('button').find((t) => attr(t, 'id') === 'world');
  assert.ok(button, 'there is a <button id="world">');
  assert.equal(attr(button, 'type'), 'button');
  assert.equal(attr(button, 'aria-pressed'), 'false');
});

test('every section carries a stamped serial, and decorative barcodes are hidden from screen readers', () => {
  const serials = [...html.matchAll(/class="serial"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  assert.equal(serials.length, 6, `found ${serials.length} serials`);
  for (const text of serials) assert.match(text, /^MN-\d{2}-[A-Z0-9]+/);
  const barcodes = tags('span').filter((t) => /class="[^"]*\bbarcode\b/.test(t));
  assert.ok(barcodes.length >= 3, `found ${barcodes.length} barcodes`);
  assert.deepEqual(barcodes.filter((t) => attr(t, 'aria-hidden') !== 'true'), []);
});

// Checks on the page's markup and data files that need no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
    assert.ok(attr(s, 'data-name')?.length > 0, `${id}: data-name (shown on the display) is missing`);
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
  const styles = readdirSync(path.join(ROOT, 'src', 'styles')).filter((f) => f.endsWith('.css'));
  assert.ok(styles.includes('static.css'), 'the other-world stylesheet, which defines the deepest black, is checked too');
  const files = styles.map((f) => ['src', 'styles', f])
    .concat([['src', 'scene', 'objects.js'], ['src', 'scene', 'scene.js'], ['src', 'scene', 'toon.js'], ['index.html']]);
  // Hex in 3, 4, 6 or 8 digits (with any alpha), 0x literals, the keywords, and rgb() in
  // both the comma and the space form.
  const pure = /#(?:0{3,4}|f{3,4}|0{6}(?:[0-9a-f]{2})?|f{6}(?:[0-9a-f]{2})?)\b|0x(?:000000|ffffff)\b|(?<![-\w])(?:black|white)\s*[;,)]|rgba?\(\s*(?:0[\s,]+0[\s,]+0|255[\s,]+255[\s,]+255)\s*[,/)]/gi;
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

test('the Static switch has one fixed name, so its state is only said once', () => {
  const button = tags('button').find((t) => attr(t, 'id') === 'world');
  // With aria-pressed, a name that also changed ("Clean" / "Static") would be read out
  // as "Clean, not pressed". The label names what the button controls.
  assert.equal(attr(button, 'aria-label'), 'Static mode');
  assert.match(read('index.html'), /id="world"[^>]*>\s*<span>Static<\/span>/, 'the visible label contains the name');
});

test('every section carries a stamped serial, and decorative barcodes are hidden from screen readers', () => {
  const serials = [...html.matchAll(/class="serial"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  assert.equal(serials.length, 6, `found ${serials.length} serials`);
  for (const text of serials) assert.match(text, /^MN-\d{2}-[A-Z0-9]+/);
  const barcodes = tags('span').filter((t) => /class="[^"]*\bbarcode\b/.test(t));
  assert.ok(barcodes.length >= 3, `found ${barcodes.length} barcodes`);
  assert.deepEqual(barcodes.filter((t) => attr(t, 'aria-hidden') !== 'true'), []);
});

test('Static mode comes with a note that names it and a way back, hidden until it is on', () => {
  const note = tags('div').find((t) => attr(t, 'id') === 'signal');
  assert.ok(note, 'there is a <div id="signal">');
  assert.match(note, /\shidden(\s|>|=)/, 'the note is hidden until Static is on');
  const retune = tags('button').find((t) => attr(t, 'id') === 'retune');
  assert.ok(retune, 'there is a <button id="retune">');
  assert.equal(attr(retune, 'type'), 'button');
  const body = /<div[^>]*id="signal"[\s\S]*?<\/div>/.exec(html)[0];
  assert.match(body, /No signal/i);
  assert.match(body, /Dead channel/i);
});

test('a change of mode is announced to screen readers in plain words', () => {
  const status = [...html.matchAll(/<p\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'id') === 'world-status');
  assert.ok(status, 'there is a <p id="world-status">');
  assert.equal(attr(status, 'role'), 'status');
});

test('labels that change wording in Static mode have both wordings in the page', () => {
  const clean = (html.match(/class="when-clean"/g) ?? []).length;
  const off = (html.match(/class="when-static"/g) ?? []).length;
  assert.ok(off >= 3, `only ${off} labels have a Static wording`);
  assert.ok(clean >= 2, `only ${clean} labels have a clean-signal wording to hide`);
  assert.match(read('src', 'styles', 'base.css'), /\.when-static\s*\{[^}]*display:\s*none/, 'the Static wording is hidden by default');
});

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

test('every section has the attributes the art layer reads, with allowed values', () => {
  const sections = tags('section');
  assert.deepEqual(sections.map((s) => attr(s, 'id')), SECTION_IDS);
  for (const s of sections) {
    const id = attr(s, 'id');
    assert.ok(['yellow', 'magenta', 'paper', 'ink'].includes(attr(s, 'data-accent')), `${id}: data-accent="${attr(s, 'data-accent')}"`);
    assert.ok(['left', 'right'].includes(attr(s, 'data-side')), `${id}: data-side="${attr(s, 'data-side')}"`);
    assert.ok(attr(s, 'data-word')?.length > 0, `${id}: data-word is missing`);
    assert.ok(attr(s, 'data-focus')?.length > 0, `${id}: data-focus is missing`);
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

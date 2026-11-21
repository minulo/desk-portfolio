// Writes public/icons.svg: one <symbol> per technology logo the page uses.
//
// The logos come from the simple-icons package. Importing that package in the site
// itself would make the dev server send all 3,000+ icons to the browser, so the few
// we need are copied into a small static file here instead.
//
// Run with `npm run icons` after changing the list.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as simpleIcons from 'simple-icons';

// id used in index.html  ->  simple-icons slug
const WANTED = {
  typescript: 'typescript', javascript: 'javascript', python: 'python', go: 'go', rust: 'rust',
  java: 'openjdk', cpp: 'cplusplus',
  react: 'react', nextjs: 'nextdotjs', redux: 'redux',
  nodejs: 'nodedotjs', fastapi: 'fastapi', postgresql: 'postgresql', mongodb: 'mongodb', firebase: 'firebase',
  kubernetes: 'kubernetes', terraform: 'terraform', docker: 'docker', gcp: 'googlecloud', ubuntu: 'ubuntu',
  pytest: 'pytest', jest: 'jest', cypress: 'cypress', selenium: 'selenium', sphinx: 'sphinx',
  githubactions: 'githubactions', git: 'git', vite: 'vite', github: 'github',
};

const bySlug = new Map(Object.values(simpleIcons).filter((i) => i?.slug).map((i) => [i.slug, i]));
const symbols = [];
for (const [id, slug] of Object.entries(WANTED)) {
  const icon = bySlug.get(slug);
  if (!icon) throw new Error(`simple-icons has no icon with slug "${slug}" (wanted as "${id}")`);
  symbols.push(`<symbol id="${id}" viewBox="0 0 24 24"><title>${icon.title}</title><path d="${icon.path}"/></symbol>`);
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons.svg');
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`);
console.log(`wrote ${symbols.length} icons to public/icons.svg`);

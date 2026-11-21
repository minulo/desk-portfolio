/**
 * Where to fetch a file named in the config.
 *
 * The built site may live in a sub-folder (a GitHub Pages project site is served from
 * /<repo>/), so a path such as '/models/mug.glb' is read as "inside the site's folder",
 * not "at the root of the domain". Full addresses are left alone.
 *
 * @param {string} path     as written in scene.config.js
 * @param {string} baseURI  the page's address (document.baseURI)
 */
export function resolveAsset(path, baseURI) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), baseURI).href;
}

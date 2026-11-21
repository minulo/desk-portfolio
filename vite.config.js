import { defineConfig } from 'vite';

export default defineConfig({
  // A relative base lets the built site be served from any folder (GitHub Pages
  // project sites live under /<repo>/).
  base: './',
  // Prepare the 3D library up front in dev mode. Without this, Vite discovers it only
  // when the scene loads, rebuilds its cache mid-visit and reloads the page.
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/libs/meshopt_decoder.module.js',
    ],
  },
});

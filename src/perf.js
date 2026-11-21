/**
 * A small readout for checking speed on a real device. Open the site with `?perf`
 * added to the address. It shows how long the first text took to appear, how long the
 * 3D scene took to be ready, and how the scene's frames are doing.
 */
export function showPerf(getScene) {
  const panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;background:#0b0b0c;color:#b6ff3c;border:2px solid #b6ff3c;font:500 11px/1.5 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre';
  document.body.append(panel);

  const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);
  let last = '';
  setInterval(() => {
    const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    const ready = performance.getEntriesByName('scene-ready')[0]?.startTime;
    const scene = getScene();
    const canvas = document.getElementById('scene');
    const text = [
      `first text on screen   ${ms(paint)}`,
      `3D scene ready         ${ms(ready)}`,
      `canvas                 ${canvas.width} x ${canvas.height}`,
      `frames drawn so far    ${scene ? scene.stats.frames : '—'}`,
      `last frame, CPU side   ${scene ? scene.stats.lastFrameMs.toFixed(1) + ' ms' : '—'}`,
      `slowest frame gap in   ${scene && scene.stats.slowestGapMs ? ms(scene.stats.slowestGapMs) : '—'}`,
      `  the last transition  (16.7 ms = 60 fps)`,
    ].join('\n');
    if (text !== last) panel.textContent = last = text;
  }, 400);
}

/** Fast start, long soft landing. 0 maps to 0 and 1 maps to 1. */
export const easeOutExpo = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Run a short animation. Calls onFrame(eased progress) once per frame, finishes with
 * exactly one onFrame(1), then onDone(). Nothing is scheduled after that, so the page
 * goes back to doing no work.
 *
 * @returns {() => void} cancel
 */
export function runTween({
  duration,
  onFrame,
  onDone,
  raf = (cb) => requestAnimationFrame(cb),
  now = () => performance.now(),
}) {
  const start = now();
  let cancelled = false;
  const step = () => {
    if (cancelled) return;
    const t = duration <= 0 ? 1 : Math.min(1, (now() - start) / duration);
    if (t >= 1) {
      onFrame(1);
      onDone?.();
      return;
    }
    onFrame(easeOutExpo(t));
    raf(step);
  };
  raf(step);
  return () => { cancelled = true; };
}

/**
 * Runs tweens and knows how many are still going. A tween stops counting when it
 * finishes or when it is cancelled, whichever comes first, and never twice.
 *
 * @returns {{ run(options: object): () => void, readonly active: number }}
 */
export function createTweenTracker(clock = {}) {
  let active = 0;
  return {
    get active() { return active; },
    run(options) {
      let counted = true;
      const release = () => {
        if (!counted) return;
        counted = false;
        active--;
      };
      active++;
      const cancel = runTween({ ...clock, ...options, onDone: () => { release(); options.onDone?.(); } });
      return () => { cancel(); release(); };
    },
  };
}

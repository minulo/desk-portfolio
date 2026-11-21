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
 * Give tweens that drive the same value the same `key` (any value: the object being
 * moved will do). Starting one cancels the one still running under that key, so two
 * can never fight and the newest always has the last word. Without that, a tween
 * started a moment earlier can finish a frame later and overwrite the result.
 *
 * @returns {{ run(options: object): () => void, cancel(key: unknown): void, readonly active: number }}
 */
export function createTweenTracker(clock = {}) {
  let active = 0;
  const running = new Map(); // key -> cancel
  return {
    get active() { return active; },
    /** Stop whatever is running under `key`. Does nothing if nothing is. */
    cancel(key) { running.get(key)?.(); },
    run(options) {
      const { key } = options;
      if (key !== undefined) running.get(key)?.();
      let counted = true;
      const release = () => {
        if (!counted) return;
        counted = false;
        active--;
        if (key !== undefined && running.get(key) === stop) running.delete(key);
      };
      active++;
      const cancel = runTween({ ...clock, ...options, onDone: () => { release(); options.onDone?.(); } });
      const stop = () => { cancel(); release(); };
      if (key !== undefined) running.set(key, stop);
      return stop;
    },
  };
}

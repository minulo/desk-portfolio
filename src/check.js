/**
 * The "skill check" shown when a visitor inspects something: a d20 roll written
 * like a line of terminal output. It is flavour only. Whatever the dice say, the
 * action still happens.
 */

const OUTCOMES = {
  critical: { mark: '★', word: 'CRITICAL', note: 'It was waiting for you.' },
  pass: { mark: '✓', word: 'PASSED', note: '' },
  fail: { mark: '✗', word: 'FAILED', note: 'The daemon opens it anyway.' },
  fumble: { mark: '✗', word: 'NAT 1', note: 'You knock it over. It opens anyway.' },
};

export function createCheck(el, { reducedMotion }) {
  let hideTimer = null;
  let flicker = null;

  const cmd = el.querySelector('[data-cmd]');
  const die = el.querySelector('[data-die]');
  const sum = el.querySelector('[data-sum]');
  const verdict = el.querySelector('[data-verdict]');

  /** Roll for `target` (for example "monitor") and show the result. */
  return function roll(target, { verb = 'inspect', bonus = 2, dc = 8 } = {}) {
    const d = 1 + Math.floor(Math.random() * 20);
    const total = d + bonus;
    const key = d === 20 ? 'critical' : d === 1 ? 'fumble' : total >= dc ? 'pass' : 'fail';
    const out = OUTCOMES[key];

    clearTimeout(hideTimer);
    clearInterval(flicker);
    cmd.textContent = `${verb} ${target}`;
    sum.textContent = `+ ${bonus} vs DC ${dc}`;
    el.dataset.outcome = key;

    const settle = () => {
      die.textContent = String(d).padStart(2, '0');
      verdict.textContent = `${out.mark} ${out.word}${out.note ? ` · ${out.note}` : ''}`;
      el.classList.add('is-settled');
    };

    el.classList.remove('is-settled');
    el.classList.add('is-visible');
    if (reducedMotion()) {
      settle();
    } else {
      verdict.textContent = 'rolling…';
      let ticks = 0;
      flicker = setInterval(() => {
        die.textContent = String(1 + Math.floor(Math.random() * 20)).padStart(2, '0');
        if (++ticks >= 9) {
          clearInterval(flicker);
          settle();
        }
      }, 55);
    }
    hideTimer = setTimeout(() => el.classList.remove('is-visible'), 3400);
  };
}

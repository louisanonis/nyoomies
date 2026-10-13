// Nefer: your bracer, a small snake-shaped robot. Rides your shoulder in
// menus and coils around your wrist while racing. Shows a one-line tip the
// first time you run into each new thing; seen tips persist in meta.

import { saveMeta } from './meta.js';

const TIPS = {
  map: 'This is the way up. Pick a route — every sector ends at a JUPITER checkpoint.',
  race: 'Every racer drags a neon wake. Touch one — even your own — and your racer shatters. Pass the gates in order.',
  grind: 'Feel that? Riding close beside a wake charges your boost. Closer pays more. Closer also kills more.',
  crash: 'That one cost a hull point. Your emergency shield takes the first hit each race — after that, every crash counts.',
  pickup: 'Mystery cubes: boost, credits, overdrive or repairs. I never know which either.',
  ability: 'I\'m linked to your racer\'s ability core. Press E and I\'ll fire it.',
  podium: 'Off the podium costs 2 hull. JUPITER watches the results boards.',
  draft: 'Salvage one mod. It stays bolted on until you shatter for good.',
  shop: 'Zaps! The only one down here who talks like you. Spend your credits — they\'re useless if you shatter.',
  event: 'An anomaly. The underground glitches wherever the mirror is thin. Choose carefully.',
  arena: 'A Shatter Pit. No gates — just survive. Cut parolees off with your wake for bounties.',
  boss: 'JUPITER. They think you skipped parole. Win this outright or they drag you back down.',
  ally: 'Zaps is riding with us. Their wake can\'t hurt you — use it to box the others out.',
  hullLow: 'Hull critical. Zaps can patch you up at the garage. Please visit the garage.',
};

const ICON = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M5 36 C 12 22, 20 46, 28 32 S 38 12, 41 17" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  <circle cx="41" cy="15" r="5" fill="currentColor"/>
  <circle cx="42.5" cy="13.5" r="1.4" fill="#01050b"/>
</svg>`;

export class Nefer {
  constructor(el, meta) {
    this.el = el;
    this.meta = meta;
    this.queue = [];
    this.timer = null;
    el.addEventListener('click', () => this.next());
  }

  // Show a tip once per player (persists across runs). A tip only counts
  // as seen once it is actually displayed.
  tip(key) {
    if (!TIPS[key] || this.meta.tipsSeen.includes(key) || this.queue.includes(key)) return;
    this.queue.push(key);
    if (!this.timer) this.next();
  }

  next() {
    clearTimeout(this.timer);
    this.timer = null;
    const key = this.queue.shift();
    if (!key) {
      this.el.classList.remove('visible');
      return;
    }
    const text = TIPS[key];
    this.meta.tipsSeen.push(key);
    saveMeta(this.meta);
    this.el.innerHTML = `${ICON}<div><b>NEFER</b><p></p></div>`;
    this.el.querySelector('p').textContent = text;
    this.el.classList.add('visible');
    this.timer = setTimeout(() => this.next(), 2500 + text.length * 45);
  }

  // Scene change: drop tips that haven't shown yet (they'll come up the next
  // time they're relevant) so nothing appears out of context.
  flush() {
    this.queue = [];
    this.next();
  }
}

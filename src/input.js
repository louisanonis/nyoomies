// Keyboard input mapped onto the race's control object.
//
// Race keys are only captured (and their browser defaults blocked) while a
// race is running, so menus keep normal keyboard behavior: Tab/Enter/Space
// activate buttons and arrows scroll.

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  boost: ['Space', 'ShiftLeft', 'ShiftRight'],
};
const ABILITY_KEYS = ['KeyE', 'KeyF', 'Enter'];
const RACE_KEYS = new Set([...Object.values(BINDINGS).flat(), ...ABILITY_KEYS]);

export class Input {
  constructor() {
    this.held = new Set();
    this.abilityPressed = false;
    this.capturing = false;
    this.handlers = {};
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      // System shortcuts (Cmd+Tab, Ctrl+R, Cmd+Q...) are never game input.
      // macOS also drops keyup for keys released while Cmd is down.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!e.repeat) this.handlers[e.code]?.();
      if (!this.capturing || !RACE_KEYS.has(e.code)) return;
      e.preventDefault();
      if (!e.repeat && ABILITY_KEYS.includes(e.code)) this.abilityPressed = true;
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if (e.key === 'Meta') this.held.clear();
    });
    window.addEventListener('blur', () => this.reset());
  }

  on(code, fn) {
    this.handlers[code] = fn;
  }

  setCapturing(on) {
    this.capturing = on;
    this.reset();
  }

  reset() {
    this.held.clear();
    this.abilityPressed = false;
  }

  apply(target) {
    for (const [action, codes] of Object.entries(BINDINGS)) {
      target[action] = codes.some((c) => this.held.has(c));
    }
    if (this.abilityPressed) target.ability = true;
    this.abilityPressed = false;
  }
}

// Keyboard input mapped onto the race's control object.

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  boost: ['Space', 'ShiftLeft', 'ShiftRight'],
};
const ABILITY_KEYS = ['KeyE', 'KeyF', 'Enter'];

export class Input {
  constructor() {
    this.held = new Set();
    this.abilityPressed = false;
    this.handlers = {};
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (Object.values(BINDINGS).flat().includes(e.code) || ABILITY_KEYS.includes(e.code)) e.preventDefault();
      if (!e.repeat && ABILITY_KEYS.includes(e.code)) this.abilityPressed = true;
      this.held.add(e.code);
      if (!e.repeat) this.handlers[e.code]?.();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  on(code, fn) {
    this.handlers[code] = fn;
  }

  apply(target) {
    for (const [action, codes] of Object.entries(BINDINGS)) {
      target[action] = codes.some((c) => this.held.has(c));
    }
    if (this.abilityPressed) target.ability = true;
    this.abilityPressed = false;
  }
}

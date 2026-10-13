// Active abilities (one slot, triggered with E). Logic lives in race.js.

export const ABILITIES = {
  turbo: {
    id: 'turbo',
    name: 'Turbo Surge',
    icon: '»',
    cooldown: 8,
    desc: 'A free 1.6s burst of +55% speed.',
  },
  emp: {
    id: 'emp',
    name: 'EMP Pulse',
    icon: '◎',
    cooldown: 12,
    desc: 'Rivals within 280px are slowed for 2s and lose all boost.',
  },
  missile: {
    id: 'missile',
    name: 'Derez Missile',
    icon: '➤',
    cooldown: 14,
    desc: 'Homing missile that derezzes the rival it strikes.',
  },
  phase: {
    id: 'phase',
    name: 'Phase Shift',
    icon: '◌',
    cooldown: 11,
    desc: 'Intangible to light walls for 1.6s.',
  },
  wall: {
    id: 'wall',
    name: 'Barrier Drop',
    icon: '▬',
    cooldown: 9,
    desc: 'Deploys a wide lethal light barrier behind you for 6s.',
  },
  blink: {
    id: 'blink',
    name: 'Blink Drive',
    icon: '⇥',
    cooldown: 10,
    desc: 'Teleport 200px forward, straight through anything in the way.',
  },
};

export const ABILITY_IDS = Object.keys(ABILITIES);

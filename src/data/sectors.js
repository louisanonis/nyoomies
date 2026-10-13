// Sector themes, difficulty curves, JUPITER bosses, node types and anomaly
// events. Sectors climb from the Mirror Void toward the surface; the palette
// starts in pure black/white/blue and bleeds into JUPITER red near the top.

export const SECTORS = [
  {
    name: 'The Mirror Void',
    theme: {
      bg: '#010308',
      floor: 'rgba(140, 200, 255, 0.07)',
      floorMajor: 'rgba(190, 225, 255, 0.18)',
      wall: '#bfe6ff',
      obstacle: '#050b16',
      accent: '#7fd4ff',
    },
    aiSkill: 0.5,
    aiSpeed: 0.88,
    padChance: 0.35,
    obstacleCount: 9,
    boss: {
      name: 'SGT. HALDANE',
      title: 'JUPITER Patrol Sergeant',
      color: '#ff4d5e',
      shape: 'glint',
      ability: 'wall',
      speedMult: 1.04,
      trailMult: 1.3,
    },
  },
  {
    name: 'The Undercity',
    theme: {
      bg: '#03030f',
      floor: 'rgba(120, 140, 255, 0.08)',
      floorMajor: 'rgba(150, 165, 255, 0.2)',
      wall: '#8a9dff',
      obstacle: '#0a0a22',
      accent: '#ff5a6e',
    },
    aiSkill: 0.68,
    aiSpeed: 0.95,
    padChance: 0.55,
    obstacleCount: 13,
    boss: {
      name: 'CAPT. VOSS',
      title: 'JUPITER Pursuit Captain',
      color: '#ff7a3d',
      shape: 'twinhull',
      ability: 'emp',
      speedMult: 1.1,
      trailMult: 1,
    },
  },
  {
    name: 'The Ascent',
    theme: {
      bg: '#0b0204',
      floor: 'rgba(255, 70, 90, 0.08)',
      floorMajor: 'rgba(255, 110, 120, 0.2)',
      wall: '#ff3b5c',
      obstacle: '#1d0509',
      accent: '#ffffff',
    },
    aiSkill: 0.85,
    aiSpeed: 1.0,
    padChance: 0.45,
    obstacleCount: 17,
    boss: {
      name: 'CMDR. ORRIN',
      title: 'JUPITER High Commander',
      color: '#ffffff',
      shape: 'echo',
      ability: 'missile',
      speedMult: 1.14,
      trailMult: 1.5,
    },
  },
];

// Rivals are parolees racing to work off their JUPITER sentences.
export const RIVAL_NAMES = [
  'VOLT', 'KESTREL', 'NULLBYTE', 'HEXA', 'RIPPER', 'ZEPHYR', 'ONYX', 'SPARKS',
  'GLITCH', 'TALON', 'VEGA', 'QUASAR', 'BRAKK', 'SOLA', 'MIRAGE', 'PIKE',
];

export const RIVAL_COLORS = [
  '#ff6b35', '#ff3d9a', '#ffe14d', '#7dff6b', '#b98bff', '#ff4545', '#4dffc3',
];

// Zaps: the ally who fell through the mirror the same way you did.
export const ZAPS = {
  name: 'ZAPS',
  color: '#c6ff4d',
  shape: 'needle',
  greetings: [
    'You talk funny too. Spend fast — JUPITER sweeps this alley every hour.',
    'Back in one piece? Mostly? Let\'s fix the "mostly".',
    'Every part here fell through the mirror, same as us. Take what you need.',
    'Nefer still glaring at me? Tell it I said hi.',
    'Word is JUPITER doubled the patrols upstairs. Gear up.',
  ],
};

export const NODE_TYPES = {
  race: { label: 'Circuit', icon: '▶', desc: 'Standard race. Miss the podium and take 2 hull damage.' },
  elite: { label: 'Elite Circuit', icon: '☠', desc: 'Faster, smarter rivals. Better loot.' },
  arena: { label: 'Shatter Pit', icon: '✕', desc: 'No gates. Survive 60s and shatter as many rivals as you can.' },
  shop: { label: 'Zaps\' Garage', icon: '$', desc: 'Zaps trades mods, repairs and ability cores.' },
  event: { label: 'Anomaly', icon: '?', desc: 'The mirror glitches nearby...' },
  boss: { label: 'JUPITER', icon: '▲', desc: 'A JUPITER officer blocks the way up. Win outright.' },
};

// Anomaly events. Each choice is resolved by run.js via `effect` keys.
// The first anomaly of every run is Zaps' lamp story.
export const FIRST_EVENT = 'lamp';

export const EVENTS = [
  {
    id: 'lamp',
    title: 'Zaps\' Story',
    text: 'Zaps finds you between races, voice low. "I worked it out — why you talk like me. Before I woke up down here, I touched a lamp. Old, brass, humming like it was alive. Felt... strange. You too, right?" You can\'t remember. But your hand tingles.',
    choices: [
      { label: '"Tell me everything."', detail: 'Zaps shares salvage from their own first run: gain a random Rare mod.', effect: { rareMod: 1 } },
      { label: '"Help me get out first."', detail: 'Zaps slips you their savings: +50 credits.', effect: { credits: 50 } },
    ],
  },
  {
    id: 'checkpoint',
    title: 'JUPITER Checkpoint',
    text: 'Red lights flood the tunnel. Two JUPITER officers wave a bracer scanner. "Parole check. Hold still." Nefer tightens around your wrist — the scan will not find who they think it will.',
    choices: [
      { label: 'Bribe them (40 credits)', detail: 'They wave you through.', effect: { cost: 40 } },
      { label: 'Floor it', detail: 'Lose 3 hull to their stun rounds, but grab a dropped part: gain a random Rare mod.', effect: { damage: 3, rareMod: 1 } },
    ],
  },
  {
    id: 'cache',
    title: 'Confiscated Cache',
    text: 'A JUPITER evidence locker, seals cracked, leaking something that hums like the mirror itself.',
    choices: [
      { label: 'Rip it open', detail: 'Gain a random Epic mod. Gain the cursed mod Corrupted Sector (-3 max hull).', effect: { epicMod: 1, curse: 'corrupted' } },
      { label: 'Leave it', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'mechanic',
    title: 'Back-Alley Mechanic',
    text: 'A grizzled mechanic with too many arms waves you into a garage. "I can make that frame tougher. For a price."',
    choices: [
      { label: 'Pay 45 credits', detail: '+3 max hull and full repair.', effect: { cost: 45, mod: 'plating', fullRepair: true } },
      { label: 'Haggle for a patch job', detail: 'Repair 3 hull for free.', effect: { repair: 3 } },
    ],
  },
  {
    id: 'dropin',
    title: 'Another Drop-In',
    text: 'Someone is curled up beside the track, staring at their own hands. "Where... where is everything?" You know that voice. It was yours, not long ago.',
    choices: [
      { label: 'Point them to Zaps', detail: 'They press a spare part into your hand: gain a random Common mod.', effect: { commonMod: 1 } },
      { label: 'Trade them your map', detail: 'They pay what they have: +55 credits.', effect: { credits: 55 } },
    ],
  },
  {
    id: 'gamble',
    title: 'Overclock Gamble',
    text: 'An unregulated reactor offers raw power. The safety rails were removed a long time ago.',
    choices: [
      { label: 'Plug in', detail: '60%: gain two Overclocked Cores. 40%: lose 3 hull.', effect: { gamble: true } },
      { label: 'Walk away', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'wreck',
    title: 'Abandoned Racer',
    text: 'A parolee\'s shattered chassis lies half-buried in the dark. Its ability core still glows.',
    choices: [
      { label: 'Swap ability cores', detail: 'Replace your ability with a random different one.', effect: { swapAbility: true } },
      { label: 'Strip it for parts', detail: 'Gain 30 credits and repair 3 hull.', effect: { credits: 30, repair: 3 } },
    ],
  },
  {
    id: 'wake',
    title: 'Wake Storm',
    text: 'A storm of loose neon wakes sweeps across the sector. You can ride it out or punch straight through.',
    choices: [
      { label: 'Ride the storm', detail: 'Gain Slipstream Rig. Gain cursed Unstable Wake (-30% wake length).', effect: { mod: 'slipstream', curse: 'unstable' } },
      { label: 'Punch through', detail: 'Lose 3 hull, gain a random Rare mod.', effect: { damage: 3, rareMod: 1 } },
    ],
  },
];

// Sector themes, difficulty curves, bosses, node types and anomaly events.

export const SECTORS = [
  {
    name: 'The Grid',
    theme: {
      bg: '#01050b',
      grid: 'rgba(0, 200, 255, 0.08)',
      gridMajor: 'rgba(0, 220, 255, 0.2)',
      wall: '#00e5ff',
      obstacle: '#031520',
      accent: '#00e5ff',
    },
    aiSkill: 0.5,
    aiSpeed: 0.88,
    padChance: 0.35,
    obstacleCount: 9,
    boss: {
      name: 'SENTINEL-7',
      title: 'Grid Warden',
      color: '#ff3b3b',
      shape: 'cycle',
      ability: 'wall',
      speedMult: 1.04,
      trailMult: 1.3,
    },
  },
  {
    name: 'Dune Sea Circuit',
    theme: {
      bg: '#0b0502',
      grid: 'rgba(255, 150, 40, 0.08)',
      gridMajor: 'rgba(255, 170, 60, 0.2)',
      wall: '#ffa733',
      obstacle: '#1f1006',
      accent: '#ffa733',
    },
    aiSkill: 0.68,
    aiSpeed: 0.95,
    padChance: 0.55,
    obstacleCount: 13,
    boss: {
      name: 'THE DUST BARON',
      title: 'Pod Racing Champion',
      color: '#ffe14d',
      shape: 'pod',
      ability: 'emp',
      speedMult: 1.1,
      trailMult: 1,
    },
  },
  {
    name: 'Kernel Core',
    theme: {
      bg: '#08020b',
      grid: 'rgba(255, 60, 200, 0.08)',
      gridMajor: 'rgba(255, 80, 220, 0.2)',
      wall: '#ff4fd8',
      obstacle: '#1a0420',
      accent: '#ff4fd8',
    },
    aiSkill: 0.85,
    aiSpeed: 1.0,
    padChance: 0.45,
    obstacleCount: 17,
    boss: {
      name: 'THE OVERSEER',
      title: 'Kernel Sovereign',
      color: '#ffffff',
      shape: 'wraith',
      ability: 'missile',
      speedMult: 1.14,
      trailMult: 1.5,
    },
  },
];

export const RIVAL_NAMES = [
  'VOLT', 'KESTREL', 'NULLBYTE', 'HEXA', 'RIPPER', 'ZEPHYR', 'ONYX', 'SPARKS',
  'GLITCH', 'TALON', 'VEGA', 'QUASAR', 'BRAKK', 'SOLA', 'MIRAGE', 'PIKE',
];

export const RIVAL_COLORS = [
  '#ff6b35', '#ff3d9a', '#ffe14d', '#7dff6b', '#b98bff', '#ff4545', '#4dffc3',
];

export const NODE_TYPES = {
  race: { label: 'Circuit', icon: '▶', desc: 'Standard race. Miss the podium and take 2 hull damage.' },
  elite: { label: 'Elite Circuit', icon: '☠', desc: 'Faster, smarter rivals. Better loot.' },
  arena: { label: 'Derez Arena', icon: '✕', desc: 'No gates. Survive 60s and derez as many rivals as you can.' },
  shop: { label: 'Black Market', icon: '$', desc: 'Spend credits on mods, repairs and abilities.' },
  event: { label: 'Anomaly', icon: '?', desc: 'Something strange on the grid...' },
  boss: { label: 'Sector Boss', icon: '♛', desc: 'Win outright to escape the sector.' },
};

// Anomaly events. Each choice is resolved by run.js via `effect` keys.
export const EVENTS = [
  {
    id: 'cache',
    title: 'Corrupted Data Cache',
    text: 'A cache of military-grade code pulses in a dead sector. Its seals are cracked and leaking.',
    choices: [
      { label: 'Rip it open', detail: 'Gain a random Epic mod. Gain the cursed mod Corrupted Sector (-3 max hull).', effect: { epicMod: 1, curse: 'corrupted' } },
      { label: 'Leave it', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'mechanic',
    title: 'Back-Alley Mechanic',
    text: 'A grizzled program with too many arms waves you into a garage. "I can make that frame tougher. For a price."',
    choices: [
      { label: 'Pay 45 credits', detail: '+3 max hull and full repair.', effect: { cost: 45, mod: 'plating', fullRepair: true } },
      { label: 'Haggle for a patch job', detail: 'Repair 3 hull for free.', effect: { repair: 3 } },
    ],
  },
  {
    id: 'stray',
    title: 'Stray Program',
    text: 'A lost program clings to your chassis, begging to be taken out of the sector.',
    choices: [
      { label: 'Give it a ride', detail: 'Gain 55 credits.', effect: { credits: 55 } },
      { label: 'Absorb its code', detail: 'Gain a random Common mod.', effect: { commonMod: 1 } },
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
    text: 'A derezzed racer\'s chassis lies half-buried in the grid. Its ability core still glows.',
    choices: [
      { label: 'Swap ability cores', detail: 'Replace your ability with a random different one.', effect: { swapAbility: true } },
      { label: 'Strip it for parts', detail: 'Gain 30 credits and repair 3 hull.', effect: { credits: 30, repair: 3 } },
    ],
  },
  {
    id: 'wake',
    title: 'Wake Storm',
    text: 'A storm of loose light walls sweeps across the sector. You can ride it out or punch straight through.',
    choices: [
      { label: 'Ride the storm', detail: 'Gain Slipstream Rig. Gain cursed Unstable Wake (-30% wall length).', effect: { mod: 'slipstream', curse: 'unstable' } },
      { label: 'Punch through', detail: 'Lose 3 hull, gain a random Rare mod.', effect: { damage: 3, rareMod: 1 } },
    ],
  },
];

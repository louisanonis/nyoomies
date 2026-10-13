// Run upgrades ("mods"). Drafted after races, bought at Zaps' Garage,
// or granted by anomalies. Stackable unless marked unique.

export const RARITY = {
  common: { label: 'Common', color: '#7fe7ff', price: 40, weight: 62 },
  rare: { label: 'Rare', color: '#c38bff', price: 75, weight: 29 },
  epic: { label: 'Epic', color: '#ffb547', price: 120, weight: 9 },
  cursed: { label: 'Cursed', color: '#ff4f6d', price: 0, weight: 0 },
};

export const MODS = [
  // --- Common ---
  {
    id: 'overclock',
    name: 'Overclocked Core',
    rarity: 'common',
    desc: '+8% top speed.',
    apply: (s) => { s.topSpeed *= 1.08; },
  },
  {
    id: 'gyro',
    name: 'Gyro Stabilizer',
    rarity: 'common',
    desc: '+12% turn rate.',
    apply: (s) => { s.turnRate *= 1.12; },
  },
  {
    id: 'capacitor',
    name: 'Boost Capacitor',
    rarity: 'common',
    desc: '+35 boost capacity.',
    apply: (s) => { s.boostMax += 35; },
  },
  {
    id: 'recycler',
    name: 'Ion Recycler',
    rarity: 'common',
    desc: '+50% passive boost regeneration.',
    apply: (s) => { s.boostRegen *= 1.5; },
  },
  {
    id: 'longwake',
    name: 'Long Wake',
    rarity: 'common',
    desc: 'Your wake is 35% longer. More rivals to catch.',
    apply: (s) => { s.trailLength *= 1.35; },
  },
  {
    id: 'salvager',
    name: 'Scrap Salvager',
    rarity: 'common',
    desc: '+25% credits from every source.',
    apply: (s) => { s.creditMult += 0.25; },
  },
  {
    id: 'magnet',
    name: 'Magnet Coil',
    rarity: 'common',
    desc: 'Pickup collection radius +70%.',
    apply: (s) => { s.pickupRadius *= 1.7; },
  },
  {
    id: 'plating',
    name: 'Hull Plating',
    rarity: 'common',
    desc: '+3 max hull (and repairs 3).',
    heal: 3,
    apply: (s) => { s.maxHull += 3; },
  },
  {
    id: 'thrusters',
    name: 'Launch Thrusters',
    rarity: 'common',
    desc: '+25% acceleration.',
    apply: (s) => { s.accel *= 1.25; },
  },

  // --- Rare ---
  {
    id: 'slipstream',
    name: 'Slipstream Rig',
    rarity: 'rare',
    desc: 'Wake grinding is 60% more effective.',
    apply: (s) => { s.slipstream *= 1.6; },
  },
  {
    id: 'phaseshield',
    name: 'Phase Shield',
    rarity: 'rare',
    desc: 'Absorb one extra crash per race.',
    apply: (s) => { s.shieldsPerRace += 1; },
  },
  {
    id: 'afterburner',
    name: 'Afterburner',
    rarity: 'rare',
    desc: 'Boost gives +20% more speed.',
    apply: (s) => { s.boostPower += 0.2; },
  },
  {
    id: 'quickcharge',
    name: 'Quick Charge',
    rarity: 'rare',
    desc: 'Ability cooldown -25%.',
    apply: (s) => { s.abilityCooldownMult *= 0.75; },
  },
  {
    id: 'amplifier',
    name: 'Ability Amplifier',
    rarity: 'rare',
    desc: 'Ability range, duration and size +40%.',
    apply: (s) => { s.abilityPower += 0.4; },
  },
  {
    id: 'compact',
    name: 'Compact Frame',
    rarity: 'rare',
    desc: 'Hitbox -25% and +6% turn rate.',
    apply: (s) => { s.radius *= 0.75; s.turnRate *= 1.06; },
  },
  {
    id: 'nitro',
    name: 'Nitro Cells',
    rarity: 'rare',
    desc: 'Every pickup also grants 35 boost.',
    apply: (s) => { s.flags.nitro = true; },
  },
  {
    id: 'gatewarp',
    name: 'Gate Resonator',
    rarity: 'rare',
    desc: 'Passing a checkpoint gate grants 20 boost.',
    apply: (s) => { s.flags.gateBoost = (s.flags.gateBoost || 0) + 20; },
  },
  {
    id: 'razorwake',
    name: 'Razor Wake',
    rarity: 'rare',
    unique: true,
    desc: 'Rivals shattered by your wake pay you 20 credits and refill your boost.',
    apply: (s) => { s.flags.razorWake = true; },
  },

  // --- Epic ---
  {
    id: 'ghost',
    name: 'Ghost Protocol',
    rarity: 'epic',
    unique: true,
    desc: 'Your own wake can no longer hurt you.',
    apply: (s) => { s.flags.ownTrailSafe = true; },
  },
  {
    id: 'glasscannon',
    name: 'Glass Cannon',
    rarity: 'epic',
    desc: '+20% top speed, +15% acceleration, but -3 max hull.',
    apply: (s) => { s.topSpeed *= 1.2; s.accel *= 1.15; s.maxHull -= 3; },
  },
  {
    id: 'jumpjets',
    name: 'Jump Jets',
    rarity: 'epic',
    unique: true,
    desc: 'While boosting with 25+ boost, hop over wakes instead of crashing.',
    apply: (s) => { s.flags.jumpJets = true; },
  },
  {
    id: 'failsafe',
    name: 'Failsafe Protocol',
    rarity: 'epic',
    unique: true,
    desc: 'Once per run, survive a fatal crash with 3 hull.',
    apply: (s) => { s.flags.failsafe = true; },
  },
  {
    id: 'twincore',
    name: 'Twin Core',
    rarity: 'epic',
    unique: true,
    desc: 'Your ability holds 2 charges.',
    apply: (s) => { s.flags.abilityCharges = 2; },
  },
  {
    id: 'infinite',
    name: 'Perpetual Engine',
    rarity: 'epic',
    desc: 'Boost regenerates 2.5x faster, but capacity -30.',
    apply: (s) => { s.boostRegen *= 2.5; s.boostMax -= 30; },
  },

  // --- Cursed (only from anomalies) ---
  {
    id: 'corrupted',
    name: 'Corrupted Sector',
    rarity: 'cursed',
    desc: '-3 max hull.',
    apply: (s) => { s.maxHull -= 3; },
  },
  {
    id: 'unstable',
    name: 'Unstable Wake',
    rarity: 'cursed',
    desc: 'Your wake is 30% shorter.',
    apply: (s) => { s.trailLength *= 0.7; },
  },
];

export const MOD_BY_ID = Object.fromEntries(MODS.map((m) => [m.id, m]));

export function applyMods(stats, modIds) {
  for (const id of modIds) {
    const mod = MOD_BY_ID[id];
    if (mod) mod.apply(stats);
  }
  stats.maxHull = Math.max(1, Math.round(stats.maxHull));
  stats.boostMax = Math.max(20, stats.boostMax);
  stats.radius = Math.max(4, stats.radius);
  return stats;
}

export function draftableMods(ownedIds) {
  return MODS.filter(
    (m) => m.rarity !== 'cursed' && !(m.unique && ownedIds.includes(m.id)),
  );
}

// Draws `count` distinct mods. `rarityBias` shifts weight toward rare/epic.
export function rollMods(rng, ownedIds, count, rarityBias = 0) {
  const pool = draftableMods(ownedIds);
  const picks = [];
  const weightOf = (m) => {
    const base = RARITY[m.rarity].weight;
    if (m.rarity === 'common') return base * Math.max(0.15, 1 - rarityBias);
    return base * (1 + rarityBias * (m.rarity === 'epic' ? 3 : 1.5));
  };
  while (picks.length < count && picks.length < pool.length) {
    const remaining = pool.filter((m) => !picks.includes(m));
    picks.push(rng.weighted(remaining, weightOf));
  }
  return picks;
}

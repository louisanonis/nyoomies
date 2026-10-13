// Chassis definitions. Every stat here can be modified by mods during a run.
//
// topSpeed / accel: px/s and px/s^2     turnRate: rad/s
// boostPower: extra speed fraction while boosting
// trailLength: length of the lethal light wall left behind (px)
// slipstream: multiplier on boost/speed gained by grinding near walls
// shieldsPerRace: crashes absorbed per race without hull damage (everyone
//   gets one emergency shield)

export const BASE_STATS = {
  topSpeed: 430,
  accel: 320,
  turnRate: 3.3,
  maxHull: 10,
  boostMax: 100,
  boostRegen: 10,
  boostPower: 0.55,
  trailLength: 1500,
  radius: 7,
  slipstream: 1,
  pickupRadius: 30,
  abilityCooldownMult: 1,
  abilityPower: 1,
  creditMult: 1,
  shieldsPerRace: 1,
};

export const CHASSIS = [
  {
    id: 'cycle',
    name: 'Light Cycle',
    shape: 'cycle',
    color: '#5ff4ff',
    tagline: 'The classic grid runner. Balanced, precise, and at home in the wake.',
    trait: 'Grid Runner — wake grinding yields 60% more boost and speed.',
    ability: 'turbo',
    cost: 0,
    stats: { slipstream: 1.6 },
  },
  {
    id: 'pod',
    name: 'Twin-Engine Pod',
    shape: 'pod',
    color: '#ffd166',
    tagline: 'Two monstrous engines towing a tiny cockpit. Blistering speed, steers like a freighter.',
    trait: 'Afterburners — bigger boost tank and 35% stronger boost.',
    ability: 'emp',
    cost: 0,
    stats: {
      topSpeed: 520,
      accel: 240,
      turnRate: 2.45,
      maxHull: 12,
      boostMax: 125,
      boostRegen: 9,
      boostPower: 0.75,
      trailLength: 1000,
      radius: 11,
    },
  },
  {
    id: 'interceptor',
    name: 'Interceptor',
    shape: 'interceptor',
    color: '#9dff7a',
    tagline: 'A needle of a ship. Turns on a dime, folds like paper.',
    trait: 'Hair Trigger — abilities recharge 30% faster.',
    ability: 'missile',
    cost: 40,
    stats: {
      topSpeed: 410,
      accel: 380,
      turnRate: 4.3,
      maxHull: 7,
      boostMax: 90,
      boostRegen: 13,
      boostPower: 0.5,
      trailLength: 800,
      radius: 6,
      abilityCooldownMult: 0.7,
    },
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    shape: 'juggernaut',
    color: '#ff9f43',
    tagline: 'Armored hauler converted for blood sport. Leaves a wall a mile long.',
    trait: 'Reinforced — an extra emergency shield every race.',
    ability: 'wall',
    cost: 60,
    stats: {
      topSpeed: 385,
      accel: 230,
      turnRate: 2.75,
      maxHull: 15,
      trailLength: 2100,
      radius: 10,
      shieldsPerRace: 2,
    },
  },
  {
    id: 'wraith',
    name: 'Wraith',
    shape: 'wraith',
    color: '#d68bff',
    tagline: 'Experimental phase-drive racer. Nobody is sure it is entirely here.',
    trait: 'Ethereal — passes harmlessly through its own wake.',
    ability: 'phase',
    cost: 100,
    stats: {
      topSpeed: 445,
      accel: 330,
      turnRate: 3.5,
      maxHull: 8,
      boostRegen: 11,
      trailLength: 1200,
    },
    flags: { ownTrailSafe: true },
  },
];

export const CHASSIS_BY_ID = Object.fromEntries(CHASSIS.map((c) => [c.id, c]));

export function chassisStats(chassis) {
  return {
    ...BASE_STATS,
    ...chassis.stats,
    flags: { ...(chassis.flags || {}) },
  };
}

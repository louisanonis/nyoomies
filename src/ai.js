import { clamp, lerp, wrapAngle } from './geometry.js';

const WHISKERS = [-1.3, -0.9, -0.55, -0.25, 0, 0.25, 0.55, 0.9, 1.3];

export function makeAI(rng, skill) {
  return {
    rng,
    skill,
    lane: rng.float(-0.3, 0.3),
    think: 0,
    boostHold: false,
    abilityDelay: rng.float(2, 5),
    prey: null,
    preyTimer: 0,
    wander: null,
  };
}

// Returns the racer's control state. Decisions are re-evaluated every
// "think" interval (shorter for skilled AIs), which doubles as reaction time.
export function aiThink(race, r, dt) {
  const ai = r.ai;
  const ctl = r.ctl;
  ctl.ability = false;
  ai.think -= dt;
  if (ai.think > 0) return ctl;
  const interval = lerp(0.15, 0.04, ai.skill);
  ai.think = interval;

  const [tx, ty] = race.isArena ? arenaTarget(race, r, interval) : circuitTarget(race, r);
  const desired = Math.atan2(ty - r.y, tx - r.x);
  const diff = wrapAngle(desired - r.angle);

  // Context steering: score candidate headings by clearance and by how
  // close they point to the goal, then steer toward the best one.
  const look = (90 + r.speed * 0.65) * lerp(0.7, 1.3, ai.skill);
  const goal = clamp(diff, -1.3, 1.3);
  let best = 0;
  let bestClear = 0;
  let bestScore = -Infinity;
  let front = Infinity;
  for (const a of WHISKERS) {
    const d = race.castRay(r.x, r.y, Math.cos(r.angle + a), Math.sin(r.angle + a), look * 1.5, r);
    if (Math.abs(a) <= 0.2) front = Math.min(front, d);
    const c = Math.min(d, look) / look;
    let score = c * 2.2 - Math.abs(a - goal) * 0.7;
    if (c < 0.4) score -= 3 * (0.4 - c) * 4;
    if (score > bestScore) {
      bestScore = score;
      best = a;
      bestClear = c;
    }
  }
  // When the chosen lane is open and near the goal, aim at the goal exactly.
  const heading = bestClear >= 1 && Math.abs(goal - best) <= 0.3 ? goal : best;
  let turn = clamp(heading * 3, -1, 1);
  // Lateral repulsion: keep a body-width gap from walls running alongside.
  const gap = r.stats.radius + 14;
  for (const side of [-1, 1]) {
    for (const a of [0.6, 1.5]) {
      const ang = r.angle + side * a;
      const d = race.castRay(r.x, r.y, Math.cos(ang), Math.sin(ang), gap * 2, r);
      if (d < gap * 2) turn -= side * (1 - d / (gap * 2)) * (a < 1 ? 1.6 : 1.1);
    }
  }
  // Sloppier drivers wobble.
  turn += (ai.rng.next() - 0.5) * (1 - ai.skill) * 0.6;
  ctl.turn = clamp(turn, -1, 1);
  ctl.throttle = front < look * 0.45 ? -1 : 1;

  if (!ai.boostHold && front > look * 1.3 && Math.abs(diff) < 0.3 && r.boost > 25 && ai.rng.next() < ai.skill * 0.6) {
    ai.boostHold = true;
  }
  if (front < look * 0.9 || r.boost < 5) ai.boostHold = false;
  ctl.boost = ai.boostHold;

  ai.abilityDelay -= interval;
  if (ai.abilityDelay <= 0 && r.abilityCharges > 0 && wantsAbility(race, r, front, look, diff)) {
    ctl.ability = true;
    ai.abilityDelay = ai.rng.float(2, 6) * (1.6 - ai.skill);
  }
  return ctl;
}

function circuitTarget(race, r) {
  const gates = race.track.gates;
  const g = gates[r.nextGate];
  const t = 0.5 + r.ai.lane;
  let tx = g.x1 + (g.x2 - g.x1) * t;
  let ty = g.y1 + (g.y2 - g.y1) * t;
  const d = Math.hypot(tx - r.x, ty - r.y);
  if (d < 240) {
    const g2 = gates[(r.nextGate + 1) % gates.length];
    const k = (1 - d / 240) * 0.45;
    tx = lerp(tx, g2.x, k);
    ty = lerp(ty, g2.y, k);
  }
  return [tx, ty];
}

function arenaTarget(race, r, interval) {
  const ai = r.ai;
  ai.preyTimer -= interval;
  if (ai.preyTimer <= 0 || !ai.prey || !ai.prey.alive) {
    ai.preyTimer = ai.rng.float(2, 4);
    const candidates = race.racers.filter((o) => o !== r && o.alive && !o.out);
    // Prefer hunting the player, but not exclusively.
    ai.prey = candidates.find((o) => o.isPlayer && ai.rng.next() < 0.6) || ai.rng.pick(candidates) || null;
    ai.wander = { x: ai.rng.float(200, race.track.w - 200), y: ai.rng.float(200, race.track.h - 200) };
  }
  const p = ai.prey;
  if (p && Math.hypot(p.x - r.x, p.y - r.y) < 1000) {
    // Aim ahead of the prey to cut it off.
    const lead = 0.5 + ai.skill * 0.6;
    return [p.x + Math.cos(p.angle) * p.speed * lead, p.y + Math.sin(p.angle) * p.speed * lead];
  }
  return [ai.wander.x, ai.wander.y];
}

function wantsAbility(race, r, front, look, diff) {
  const cos = Math.cos(r.angle);
  const sin = Math.sin(r.angle);
  const rivals = race.racers.filter((o) => o !== r && o.alive);
  switch (r.abilityId) {
    case 'turbo':
    case 'blink':
      return front >= look * 1.2 && Math.abs(diff) < 0.2;
    case 'phase':
      return front < look * 0.3;
    case 'emp':
      return rivals.some((o) => Math.hypot(o.x - r.x, o.y - r.y) < 220);
    case 'wall':
      return rivals.some((o) => {
        const dx = o.x - r.x, dy = o.y - r.y;
        const d = Math.hypot(dx, dy);
        return d < 320 && (dx * cos + dy * sin) / d < -0.5;
      });
    case 'missile':
      return rivals.some((o) => {
        const dx = o.x - r.x, dy = o.y - r.y;
        const d = Math.hypot(dx, dy);
        return d < 650 && (dx * cos + dy * sin) / d > 0.8;
      });
    default:
      return false;
  }
}

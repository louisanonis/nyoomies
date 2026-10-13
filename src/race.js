import {
  TAU, clamp, wrapAngle, distSq, segIntersect, segSegDistSq, raySeg, rayRect,
  rayBounds, pointRectDist, circleRect,
} from './geometry.js';
import { generateTrack } from './track.js';
import { SECTORS, RIVAL_NAMES, RIVAL_COLORS, ZAPS } from './data/sectors.js';
import { CHASSIS, CHASSIS_BY_ID, chassisStats } from './data/vehicles.js';
import { ABILITIES } from './data/abilities.js';
import { makeAI, aiThink } from './ai.js';

export const STEP = 1 / 120;
const TRAIL_SPACING = 12;
const TRAIL_HALF = 2.5;
const GRIND_DIST = 42;
const BOOST_DRAIN = 38;
const SEG_STRIDE = 7; // x1, y1, x2, y2, owner, recent, kind(0 trail / 1 barrier)
const ARENA_TIME = 60;

const PICKUP_TYPES = [
  { id: 'boost', label: 'BOOST CELL', weight: 45 },
  { id: 'credits', label: 'CREDIT CHIP', weight: 25 },
  { id: 'overdrive', label: 'OVERDRIVE', weight: 22 },
  { id: 'repair', label: 'REPAIR NANITES +2', weight: 8 },
];

// One race / arena encounter. Pure simulation: no DOM, no canvas. The
// renderer reads its state; main.js feeds `input` and drains `events`.
export class Race {
  constructor(cfg) {
    this.rng = cfg.rng;
    this.mode = cfg.mode; // 'race' | 'elite' | 'boss' | 'arena' | 'demo'
    this.sector = cfg.sector;
    this.sectorDef = SECTORS[cfg.sector];
    this.track = generateTrack(this.rng, { mode: cfg.mode === 'arena' ? 'arena' : 'circuit', sector: cfg.sector });
    this.isArena = this.track.mode === 'arena';
    this.laps = cfg.laps ?? 3;
    this.totalGates = this.laps * this.track.gates.length;
    this.countdown = cfg.countdown ?? 3;
    this.time = 0;
    this.timeLimit = this.isArena ? ARENA_TIME : 0;

    this.racers = [];
    this.missiles = [];
    this.barriers = [];
    this.particles = [];
    this.rings = [];
    this.fading = [];
    this.events = [];
    this.segs = [];
    this.pickups = this.track.pickups.map((p) => ({ ...p, active: true, timer: 0, spin: this.rng.float(0, TAU) }));

    this.input = { left: false, right: false, up: false, down: false, boost: false, ability: false };
    this.over = false;
    this.overTimer = 0;
    this.result = null;
    this.finishCount = 0;
    this.creditsEarned = 0;
    this.hullLost = 0;
    this.hullRepaired = 0;

    const p = cfg.player;
    this.playerHull = p.hull;
    this.playerMaxHull = p.stats.maxHull;
    this.failsafeAvailable = !!(p.stats.flags.failsafe && !p.failsafeUsed);
    this.failsafeUsed = false;

    this.spawnRacers(cfg);
  }

  // ---------------------------------------------------------------- setup

  spawnRacers(cfg) {
    const p = cfg.player;
    const def = this.sectorDef;
    const spawns = this.rng.shuffle(this.track.spawns);
    const names = this.rng.shuffle(RIVAL_NAMES);
    // Keep rival colors visually distinct from the player's.
    const colors = this.rng.shuffle(RIVAL_COLORS.filter((c) => hueDistance(c, p.color) > 30));

    const player = this.makeRacer({
      name: p.name || 'YOU',
      color: p.color,
      shape: p.shape,
      stats: p.stats,
      abilityId: p.abilityId,
      isPlayer: true,
    });
    if (cfg.autopilot) player.ai = makeAI(this.rng, 0.8);
    this.player = player;

    const rivals = [];
    const elite = this.mode === 'elite';
    const skill = clamp(def.aiSkill + (elite ? 0.14 : 0) + (cfg.extraSkill || 0), 0.2, 0.98);
    const speed = def.aiSpeed + (elite ? 0.05 : 0);
    const withAlly = !!cfg.ally && !this.isArena;
    let rivalCount = (this.mode === 'boss' ? 3 : 5) - (withAlly && this.mode !== 'boss' ? 1 : 0);

    // Zaps: friendly racer. Their wake can't hurt you (and yours can't hurt
    // them), but it's as lethal as anyone's to rivals and JUPITER.
    if (withAlly) {
      const base = CHASSIS.find((c) => c.shape === ZAPS.shape) || CHASSIS[0];
      const stats = chassisStats(base);
      stats.topSpeed *= def.aiSpeed + 0.04;
      stats.accel *= def.aiSpeed + 0.04;
      const ally = this.makeRacer({ name: ZAPS.name, color: ZAPS.color, shape: ZAPS.shape, stats, abilityId: base.ability, isAlly: true });
      ally.ai = makeAI(this.rng, clamp(skill + 0.1, 0.3, 0.95));
      this.ally = ally;
    }

    if (this.mode === 'boss') {
      const b = def.boss;
      const base = CHASSIS.find((c) => c.shape === b.shape) || CHASSIS[0];
      const stats = chassisStats(base);
      stats.topSpeed *= b.speedMult;
      stats.accel *= b.speedMult;
      stats.trailLength *= b.trailMult;
      stats.shieldsPerRace = 1;
      stats.abilityCooldownMult = 0.8;
      const boss = this.makeRacer({ name: b.name, color: b.color, shape: b.shape, stats, abilityId: b.ability, isBoss: true });
      boss.ai = makeAI(this.rng, 0.96);
      rivals.push(boss);
      this.boss = boss;
    }

    const pool = CHASSIS.filter((c) => c.id !== 'echo' || this.sector > 0);
    for (let i = 0; i < rivalCount; i++) {
      const base = this.rng.pick(pool);
      const stats = chassisStats(base);
      const v = speed * this.rng.float(0.97, 1.03);
      stats.topSpeed *= v;
      stats.accel *= v;
      const r = this.makeRacer({
        name: names[i % names.length],
        color: colors[i % colors.length],
        shape: base.shape,
        stats,
        abilityId: base.ability,
      });
      r.ai = makeAI(this.rng, clamp(skill + this.rng.float(-0.08, 0.08), 0.15, 0.98));
      if (this.mode === 'arena') r.shields = 1;
      rivals.push(r);
    }

    const all = [player, ...(this.ally ? [this.ally] : []), ...rivals];
    all.forEach((r, i) => {
      r.index = i;
      const s = spawns[i % spawns.length];
      r.x = r.prevX = s.x;
      r.y = r.prevY = s.y;
      r.angle = s.angle;
      r.fx.noTrail = 1.2; // launch grace: nobody leaves a wake for the first moment
    });
    this.racers = all;
  }

  makeRacer({ name, color, shape, stats, abilityId, isPlayer = false, isBoss = false, isAlly = false }) {
    const charges = stats.flags.abilityCharges || 1;
    return {
      index: 0,
      name, color, shape, stats, abilityId, isPlayer, isBoss, isAlly,
      ai: null,
      x: 0, y: 0, prevX: 0, prevY: 0, angle: 0, speed: 0,
      trail: [], trailLen: 0,
      boost: stats.boostMax * 0.5,
      boosting: false,
      grind: 0,
      shields: stats.shieldsPerRace,
      abilityCharges: charges,
      abilityMaxCharges: charges,
      abilityCd: 0,
      fx: { phase: 0, turbo: 0, slow: 0, invuln: 0, overdrive: 0, noTrail: 0, hop: 0 },
      alive: true,
      out: false,
      respawn: 0,
      progress: 0,
      nextGate: 1,
      lastGate: 0,
      finished: false,
      finishTime: 0,
      place: 0,
      takedowns: 0,
      crashes: 0,
      onPad: false,
      ctl: { turn: 0, throttle: 0, boost: false, ability: false },
    };
  }

  // ----------------------------------------------------------------- tick

  update(dt) {
    this.updateParticles(dt);
    if (this.countdown > 0) {
      this.input.ability = false; // no ability presses buffered through the countdown
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before) this.emit(after > 0 ? 'count' : 'go', { n: after });
      return;
    }
    if (this.over) this.overTimer += dt;
    this.time += dt;

    this.buildSegments();
    for (const r of this.racers) this.updateRacer(r, dt);
    this.updateMissiles(dt);
    this.updateWorld(dt);
    if (!this.over) this.checkEnd();
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  controlsFor(r) {
    if (r.ai) return aiThink(this, r, STEP);
    const i = this.input;
    r.ctl.turn = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    r.ctl.throttle = i.up ? 1 : i.down ? -1 : 0;
    r.ctl.boost = i.boost;
    r.ctl.ability = i.ability;
    i.ability = false; // edge-triggered
    return r.ctl;
  }

  updateRacer(r, dt) {
    const fx = r.fx;
    for (const k in fx) if (fx[k] > 0) fx[k] -= dt;

    if (r.abilityCharges < r.abilityMaxCharges) {
      r.abilityCd -= dt;
      if (r.abilityCd <= 0) {
        r.abilityCharges++;
        r.abilityCd = r.abilityCharges < r.abilityMaxCharges ? this.cooldownOf(r) : 0;
      }
    }

    if (!r.alive) {
      if (r.isPlayer) this.input.ability = false; // don't fire on respawn
      if (r.respawn > 0) {
        r.respawn -= dt;
        if (r.respawn <= 0) this.respawnRacer(r);
      }
      return;
    }

    const s = r.stats;
    const ctl = this.over && r.isPlayer ? { turn: 0, throttle: 0, boost: false, ability: false } : this.controlsFor(r);

    if (ctl.ability) this.useAbility(r);
    if (!r.alive) return;

    // --- speed
    let target = s.topSpeed * (ctl.throttle > 0 ? 1 : ctl.throttle < 0 ? 0.55 : 0.82);
    let accel = s.accel;
    r.boosting = false;
    if (ctl.boost && r.boost > 1) {
      r.boosting = true;
      r.boost = Math.max(0, r.boost - BOOST_DRAIN * dt);
      target = s.topSpeed * (1 + s.boostPower);
      accel *= 1.8;
    } else {
      r.boost = Math.min(s.boostMax, r.boost + s.boostRegen * dt);
    }
    if (fx.turbo > 0) { target *= 1.55; accel *= 2; }
    if (fx.overdrive > 0) { target *= 1.3; accel *= 1.5; }
    target *= 1 + 0.14 * r.grind * s.slipstream;
    if (fx.slow > 0) target *= 0.5;
    if (r.speed < target) r.speed = Math.min(target, r.speed + accel * dt);
    else r.speed = Math.max(target, r.speed - Math.max(accel * 0.8, (r.speed - target) * 1.5) * dt);

    // --- steering (slightly heavier at very high speed)
    const over = clamp((r.speed - s.topSpeed) / s.topSpeed, 0, 1);
    const turnRate = s.turnRate * (fx.slow > 0 ? 0.7 : 1) * (1 - 0.2 * over);
    r.angle = wrapAngle(r.angle + clamp(ctl.turn, -1, 1) * turnRate * dt);

    // --- move
    r.prevX = r.x;
    r.prevY = r.y;
    r.x += Math.cos(r.angle) * r.speed * dt;
    r.y += Math.sin(r.angle) * r.speed * dt;

    // --- solid geometry
    if (this.hitsSolid(r.x, r.y, s.radius)) {
      if (!this.crash(r, 'wall', null)) this.bounce(r);
      if (!r.alive) return;
    }

    // --- wakes (+ measure how close we are for grinding)
    this.collideWalls(r, dt);
    if (!r.alive) return;

    // --- boost pads
    let onPad = false;
    for (const pad of this.track.pads) {
      if (distSq(r.x, r.y, pad.x, pad.y) < (pad.r + s.radius) ** 2) {
        onPad = true;
        r.speed = Math.max(r.speed, s.topSpeed * 1.45);
        fx.overdrive = Math.max(fx.overdrive, 0.7);
        if (!r.onPad && r.isPlayer) this.emit('pad');
      }
    }
    r.onPad = onPad;

    if (!this.isArena) this.checkGate(r, r.prevX, r.prevY, r.x, r.y);
    if (r.alive) this.emitTrail(r);
  }

  cooldownOf(r) {
    return ABILITIES[r.abilityId].cooldown * r.stats.abilityCooldownMult;
  }

  // ------------------------------------------------------------ geometry

  hitsSolid(x, y, rad) {
    const t = this.track;
    if (x < rad || y < rad || x > t.w - rad || y > t.h - rad) return true;
    for (const o of t.obstacles) if (circleRect(x, y, rad, o)) return true;
    return false;
  }

  bounce(r) {
    const rad = r.stats.radius;
    const xBlocked = this.hitsSolid(r.x, r.prevY, rad);
    const yBlocked = this.hitsSolid(r.prevX, r.y, rad);
    if (xBlocked && !yBlocked) r.angle = wrapAngle(Math.PI - r.angle);
    else if (yBlocked && !xBlocked) r.angle = wrapAngle(-r.angle);
    else r.angle = wrapAngle(r.angle + Math.PI);
    r.x = r.prevX;
    r.y = r.prevY;
    r.speed *= 0.5;
    this.sparks(r.x, r.y, this.track.theme.wall, 10);
  }

  buildSegments() {
    const S = this.segs;
    S.length = 0;
    for (const r of this.racers) {
      const t = r.trail;
      const n = t.length;
      for (let i = 0; i < n - 1; i++) {
        if (t[i + 1].gap) continue;
        S.push(t[i].x, t[i].y, t[i + 1].x, t[i + 1].y, r.index, i >= n - 4 ? 1 : 0, 0);
      }
      if (r.alive && n > 0 && r.fx.noTrail <= 0) {
        S.push(t[n - 1].x, t[n - 1].y, r.x, r.y, r.index, 1, 0);
      }
    }
    for (const b of this.barriers) S.push(b.x1, b.y1, b.x2, b.y2, b.owner, 0, 1);
  }

  // The player and Zaps are on the same side.
  friendly(a, b) {
    return a !== b && (a.isPlayer || a.isAlly) && (b.isPlayer || b.isAlly);
  }

  ignoresSeg(r, owner, recent, kind) {
    if (owner !== r.index) return this.friendly(r, this.racers[owner]);
    if (kind === 1) return true;
    return recent === 1 || !!r.stats.flags.ownTrailSafe;
  }

  collideWalls(r, dt) {
    const S = this.segs;
    const s = r.stats;
    const hitR = s.radius * 0.75 + TRAIL_HALF;
    const reach = GRIND_DIST + s.radius;
    const ax = r.prevX, ay = r.prevY, bx = r.x, by = r.y;
    const minX = Math.min(ax, bx) - reach, maxX = Math.max(ax, bx) + reach;
    const minY = Math.min(ay, by) - reach, maxY = Math.max(ay, by) + reach;
    let nearest = Infinity;
    let hitOwner = -1;
    const tangible = r.fx.phase <= 0 && r.fx.invuln <= 0;
    let overlapping = false;

    for (let k = 0; k < S.length; k += SEG_STRIDE) {
      const x1 = S[k], y1 = S[k + 1], x2 = S[k + 2], y2 = S[k + 3];
      if ((x1 < minX && x2 < minX) || (x1 > maxX && x2 > maxX) || (y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY)) continue;
      const owner = S[k + 4];
      if (this.ignoresSeg(r, owner, S[k + 5], S[k + 6])) continue;
      const d2 = segSegDistSq(ax, ay, bx, by, x1, y1, x2, y2);
      if (d2 < nearest) nearest = d2;
      if (d2 < hitR * hitR) {
        overlapping = true;
        if (tangible && hitOwner < 0) hitOwner = owner;
      }
    }

    // Respawn protection lasts until the racer is clear of any wall it is
    // sitting inside, so nobody respawns into an unavoidable crash.
    if (overlapping && r.fx.invuln > 0 && r.fx.invuln < 0.1 && r.spawnGuard) r.fx.invuln = 0.1;
    if (!overlapping && r.fx.invuln <= 0) r.spawnGuard = false;

    // Solid geometry also counts for grinding.
    const t = this.track;
    let d = Math.min(r.x, r.y, t.w - r.x, t.h - r.y);
    for (const o of t.obstacles) {
      if (r.x > o.x - reach && r.x < o.x + o.w + reach && r.y > o.y - reach && r.y < o.y + o.h + reach) {
        d = Math.min(d, pointRectDist(r.x, r.y, o));
      }
    }
    d = Math.min(d, Math.sqrt(nearest));
    const g = clamp(1 - (d - s.radius) / GRIND_DIST, 0, 1);
    r.grind += (g - r.grind) * Math.min(1, dt * 10);
    if (r.grind > 0.05) {
      r.boost = Math.min(s.boostMax, r.boost + 32 * r.grind * s.slipstream * dt);
      if (this.rng.next() < r.grind * 0.5) {
        this.particles.push({
          x: r.x, y: r.y,
          vx: (this.rng.next() - 0.5) * 120, vy: (this.rng.next() - 0.5) * 120,
          life: 0.25, max: 0.25, color: '#ffffff', size: 1.5,
        });
      }
    }

    if (hitOwner >= 0) {
      if (s.flags.jumpJets && r.boosting && r.boost >= 25) {
        r.boost -= 25;
        r.fx.invuln = 0.3;
        r.fx.hop = 0.3;
        this.sparks(r.x, r.y, r.color, 14);
        if (r.isPlayer) this.emit('hop');
        return;
      }
      this.crash(r, 'trail', hitOwner);
    }
  }

  castRay(ox, oy, dx, dy, maxLen, self) {
    const t = this.track;
    let best = Math.min(maxLen, rayBounds(ox, oy, dx, dy, t.w, t.h));
    for (const o of t.obstacles) {
      const d = rayRect(ox, oy, dx, dy, o);
      if (d < best) best = d;
    }
    const ex = ox + dx * best, ey = oy + dy * best;
    const minX = Math.min(ox, ex) - 4, maxX = Math.max(ox, ex) + 4;
    const minY = Math.min(oy, ey) - 4, maxY = Math.max(oy, ey) + 4;
    const S = this.segs;
    for (let k = 0; k < S.length; k += SEG_STRIDE) {
      const x1 = S[k], y1 = S[k + 1], x2 = S[k + 2], y2 = S[k + 3];
      if ((x1 < minX && x2 < minX) || (x1 > maxX && x2 > maxX) || (y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY)) continue;
      if (this.ignoresSeg(self, S[k + 4], S[k + 5], S[k + 6])) continue;
      const d = raySeg(ox, oy, dx, dy, x1, y1, x2, y2);
      if (d < best) best = d;
    }
    return best;
  }

  emitTrail(r) {
    if (r.fx.noTrail > 0) return;
    const t = r.trail;
    const last = t[t.length - 1];
    if (!last) {
      t.push({ x: r.x, y: r.y });
      return;
    }
    const d = Math.hypot(r.x - last.x, r.y - last.y);
    if (d < TRAIL_SPACING) return;
    t.push({ x: r.x, y: r.y });
    r.trailLen += d;
    while (r.trailLen > r.stats.trailLength && t.length > 2) {
      const a = t[0], b = t[1];
      if (!b.gap) r.trailLen -= Math.hypot(b.x - a.x, b.y - a.y);
      t.shift();
    }
  }

  checkGate(r, ax, ay, bx, by) {
    const gates = this.track.gates;
    const g = gates[r.nextGate];
    if (!segIntersect(ax, ay, bx, by, g.x1, g.y1, g.x2, g.y2)) return;
    r.progress++;
    r.lastGate = r.nextGate;
    r.nextGate = (r.nextGate + 1) % gates.length;
    if (r.stats.flags.gateBoost) r.boost = Math.min(r.stats.boostMax, r.boost + r.stats.flags.gateBoost);
    if (r.isPlayer) {
      const lapDone = r.lastGate === 0;
      this.emit(lapDone ? 'lap' : 'gate', { lap: Math.floor(r.progress / gates.length) + 1 });
    }
    if (r.progress >= this.totalGates) this.finish(r);
  }

  // ------------------------------------------------------- crash / respawn

  // Returns true if the racer was shattered (false if a shield/invuln saved it).
  crash(r, cause, byIndex) {
    if (r.fx.invuln > 0) return false;
    if (r.shields > 0) {
      r.shields--;
      r.fx.invuln = 1;
      this.rings.push({ x: r.x, y: r.y, r: 10, max: 60, life: 0.4, maxLife: 0.4, color: '#ffffff' });
      if (r.isPlayer) this.emit('shield');
      return false;
    }

    r.alive = false;
    r.crashes++;
    this.explode(r.x, r.y, r.color);
    if (r.trail.length > 1) this.fading.push({ points: r.trail, color: r.color, life: 0.8, max: 0.8 });
    r.trail = [];
    r.trailLen = 0;
    this.emit('shatter', { name: r.name, isPlayer: r.isPlayer, x: r.x, y: r.y });

    if (byIndex !== null && byIndex !== r.index) {
      const killer = this.racers[byIndex];
      killer.takedowns++;
      if (killer.isPlayer) {
        let bonus = 0;
        if (killer.stats.flags.razorWake) {
          bonus = Math.round(20 * killer.stats.creditMult);
          this.creditsEarned += bonus;
          killer.boost = killer.stats.boostMax;
        }
        this.emit('kill', { name: r.name, cause, bonus });
      }
    }

    if (r.isPlayer) {
      this.playerHull--;
      this.hullLost++;
      if (this.playerHull <= 0) {
        if (this.failsafeAvailable) {
          this.failsafeAvailable = false;
          this.failsafeUsed = true;
          this.playerHull = 3;
          this.emit('failsafe');
        } else {
          this.endRace('dead');
          return true;
        }
      }
      r.respawn = 1.4;
    } else if (this.isArena) {
      r.out = true;
    } else {
      r.respawn = 2;
    }
    return true;
  }

  respawnRacer(r) {
    if (this.isArena) {
      const p = this.safeSpot();
      r.x = p.x;
      r.y = p.y;
      r.angle = p.angle;
    } else {
      const g = this.track.gates[r.lastGate];
      const lateral = this.rng.float(-70, 70);
      r.x = g.x + g.dirX * 30 - g.dirY * lateral;
      r.y = g.y + g.dirY * 30 + g.dirX * lateral;
      r.angle = g.angle;
    }
    r.prevX = r.x;
    r.prevY = r.y;
    r.alive = true;
    r.speed = r.stats.topSpeed * 0.5;
    r.fx.invuln = 2;
    r.spawnGuard = true;
    r.fx.noTrail = 0.35;
    r.trail = [];
    r.trailLen = 0;
    if (r.isPlayer) this.emit('respawn');
  }

  // Best of several random points, scored by distance to any wall.
  safeSpot() {
    const t = this.track;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const x = this.rng.float(150, t.w - 150);
      const y = this.rng.float(150, t.h - 150);
      if (this.hitsSolid(x, y, 60)) continue;
      let d = Infinity;
      const S = this.segs;
      for (let k = 0; k < S.length; k += SEG_STRIDE) {
        d = Math.min(d, segSegDistSq(x, y, x, y, S[k], S[k + 1], S[k + 2], S[k + 3]));
      }
      if (!best || d > best.d) best = { x, y, d };
    }
    best = best || { x: t.w / 2, y: t.h / 2 };
    const angle = Math.atan2(t.h / 2 - best.y, t.w / 2 - best.x);
    return { x: best.x, y: best.y, angle };
  }

  finish(r) {
    r.finished = true;
    r.finishTime = this.time;
    r.place = ++this.finishCount;
    if (r.isPlayer) {
      this.emit('finish', { place: r.place });
      this.endRace('finished');
    } else {
      r.alive = false;
      if (r.trail.length > 1) this.fading.push({ points: r.trail, color: r.color, life: 1, max: 1 });
      r.trail = [];
      r.trailLen = 0;
    }
  }

  // ------------------------------------------------------------- abilities

  useAbility(r) {
    if (r.abilityCharges <= 0) return;
    r.abilityCharges--;
    if (r.abilityCd <= 0) r.abilityCd = this.cooldownOf(r);
    const p = r.stats.abilityPower;
    const cos = Math.cos(r.angle), sin = Math.sin(r.angle);
    if (r.isPlayer) this.emit('ability', { id: r.abilityId });

    switch (r.abilityId) {
      case 'turbo':
        r.fx.turbo = 1.6 * p;
        this.sparks(r.x, r.y, r.color, 16);
        break;
      case 'emp': {
        const rad = 280 * p;
        this.rings.push({ x: r.x, y: r.y, r: 10, max: rad, life: 0.5, maxLife: 0.5, color: r.color });
        for (const o of this.racers) {
          if (o === r || !o.alive || this.friendly(r, o)) continue;
          if (distSq(o.x, o.y, r.x, r.y) < rad * rad) {
            o.fx.slow = 2 * p;
            o.boost = 0;
            this.sparks(o.x, o.y, '#9be7ff', 10);
          }
        }
        break;
      }
      case 'missile': {
        let target = null;
        let best = Infinity;
        for (const o of this.racers) {
          if (o === r || !o.alive || this.friendly(r, o)) continue;
          const dx = o.x - r.x, dy = o.y - r.y;
          const d = Math.hypot(dx, dy);
          const ahead = (dx * cos + dy * sin) / (d || 1);
          const score = d * (ahead > 0.3 ? 1 : 3);
          if (score < best) { best = score; target = o; }
        }
        this.missiles.push({
          x: r.x + cos * 14, y: r.y + sin * 14, angle: r.angle,
          speed: Math.max(r.speed + 320, 900), owner: r.index,
          target: target ? target.index : -1, ttl: 3.5,
        });
        break;
      }
      case 'phase':
        r.fx.phase = 1.6 * p;
        break;
      case 'wall': {
        const hl = 130 * p;
        const cx = r.x - cos * 50, cy = r.y - sin * 50;
        this.barriers.push({
          x1: cx - sin * hl, y1: cy + cos * hl, x2: cx + sin * hl, y2: cy - cos * hl,
          owner: r.index, ttl: 6, max: 6, color: r.color,
        });
        break;
      }
      case 'blink': {
        const dist = 200 * p;
        let land = 0;
        for (let d = 10; d <= dist; d += 10) {
          if (!this.hitsSolid(r.x + cos * d, r.y + sin * d, r.stats.radius + 2)) land = d;
        }
        if (land > 0) {
          const ox = r.x, oy = r.y;
          this.sparks(ox, oy, r.color, 12);
          r.x += cos * land;
          r.y += sin * land;
          r.prevX = r.x;
          r.prevY = r.y;
          r.fx.invuln = Math.max(r.fx.invuln, 0.15);
          if (r.trail.length) r.trail.push({ x: r.x, y: r.y, gap: true });
          if (!this.isArena) this.checkGate(r, ox, oy, r.x, r.y);
          this.sparks(r.x, r.y, r.color, 12);
        }
        break;
      }
    }
  }

  updateMissiles(dt) {
    for (const m of this.missiles) {
      m.ttl -= dt;
      const target = this.racers[m.target];
      if (target && target.alive) {
        const want = Math.atan2(target.y - m.y, target.x - m.x);
        const diff = wrapAngle(want - m.angle);
        m.angle += clamp(diff, -5 * dt, 5 * dt);
      }
      m.x += Math.cos(m.angle) * m.speed * dt;
      m.y += Math.sin(m.angle) * m.speed * dt;
      if (this.rng.next() < 0.6) {
        this.particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#ff6b6b', size: 2 });
      }
      if (this.hitsSolid(m.x, m.y, 3)) {
        m.ttl = 0;
        this.sparks(m.x, m.y, '#ff6b6b', 12);
        continue;
      }
      for (const o of this.racers) {
        if (o.index === m.owner || !o.alive || this.friendly(this.racers[m.owner], o)) continue;
        if (distSq(o.x, o.y, m.x, m.y) < (o.stats.radius + 8) ** 2) {
          m.ttl = 0;
          this.sparks(m.x, m.y, '#ff6b6b', 20);
          this.crash(o, 'missile', m.owner);
          break;
        }
      }
    }
    this.missiles = this.missiles.filter((m) => m.ttl > 0);
  }

  // ------------------------------------------------------------ world/fx

  updateWorld(dt) {
    for (const b of this.barriers) b.ttl -= dt;
    this.barriers = this.barriers.filter((b) => b.ttl > 0);

    for (const pk of this.pickups) {
      pk.spin += dt * 2;
      if (!pk.active) {
        pk.timer -= dt;
        if (pk.timer <= 0) pk.active = true;
        continue;
      }
      for (const r of this.racers) {
        if (!r.alive) continue;
        const rad = r.stats.pickupRadius + 10;
        if (distSq(r.x, r.y, pk.x, pk.y) < rad * rad) {
          pk.active = false;
          pk.timer = 9;
          this.collect(r, pk);
          break;
        }
      }
    }
  }

  collect(r, pk) {
    const type = this.rng.weighted(PICKUP_TYPES, (t) => t.weight);
    const s = r.stats;
    let id = type.id;
    if (!r.isPlayer && (id === 'credits' || id === 'repair')) id = 'boost';
    if (id === 'repair' && this.playerHull >= this.playerMaxHull) id = 'credits';
    switch (id) {
      case 'boost':
        r.boost = Math.min(s.boostMax, r.boost + 50);
        break;
      case 'credits':
        this.creditsEarned += Math.round(12 * s.creditMult);
        break;
      case 'overdrive':
        r.fx.overdrive = 3;
        break;
      case 'repair':
        this.playerHull = Math.min(this.playerMaxHull, this.playerHull + 2);
        this.hullRepaired += 2;
        break;
    }
    if (s.flags.nitro) r.boost = Math.min(s.boostMax, r.boost + 35);
    this.sparks(pk.x, pk.y, '#ffffff', 10);
    if (r.isPlayer) {
      const label = PICKUP_TYPES.find((t) => t.id === id).label;
      this.emit('pickup', { id, label: id === 'credits' ? `+${Math.round(12 * s.creditMult)} CREDITS` : label });
    }
  }

  sparks(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.float(0, TAU);
      const v = this.rng.float(60, 260);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, size: 2 });
    }
  }

  explode(x, y, color) {
    for (let i = 0; i < 70; i++) {
      const a = this.rng.float(0, TAU);
      const v = this.rng.float(40, 520);
      const life = this.rng.float(0.4, 1.2);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: i % 4 === 0 ? '#ffffff' : color, size: this.rng.float(1.5, 3.5), cube: i % 3 === 0 });
    }
    this.rings.push({ x, y, r: 8, max: 120, life: 0.5, maxLife: 0.5, color });
  }

  updateParticles(dt) {
    const P = this.particles;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
      P[w++] = p;
    }
    P.length = Math.min(w, 2000);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const f of this.fading) f.life -= dt;
    this.fading = this.fading.filter((f) => f.life > 0);
  }

  // ------------------------------------------------------------ outcome

  checkEnd() {
    if (this.isArena) {
      const rivalsLeft = this.racers.filter((r) => !r.isPlayer && !r.out).length;
      if (rivalsLeft === 0) this.endRace('cleared');
      else if (this.time >= this.timeLimit) this.endRace('survived');
    }
  }

  standings() {
    const gates = this.track.gates;
    const distToNext = (r) => {
      if (!gates.length) return 0;
      const g = gates[r.nextGate];
      return Math.hypot(g.x - r.x, g.y - r.y);
    };
    return this.racers.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.place - b.place;
      if (a.progress !== b.progress) return b.progress - a.progress;
      return distToNext(a) - distToNext(b);
    });
  }

  // Zaps races alongside you and doesn't count toward your placing.
  rankedRacers() {
    return this.standings().filter((r) => !r.isAlly);
  }

  playerPosition() {
    return this.rankedRacers().indexOf(this.player) + 1;
  }

  endRace(reason) {
    if (this.over) return;
    this.over = true;
    this.overTimer = 0;
    const order = this.standings();
    const ranked = order.filter((r) => !r.isAlly);
    const place = ranked.indexOf(this.player) + 1;
    this.result = {
      reason,
      mode: this.mode,
      dead: reason === 'dead',
      place: this.isArena ? 0 : place,
      takedowns: this.player.takedowns,
      rivalsLeft: this.racers.filter((r) => !r.isPlayer && !r.out).length,
      creditsEarned: this.creditsEarned,
      hull: this.playerHull,
      hullLost: this.hullLost,
      hullRepaired: this.hullRepaired,
      failsafeUsed: this.failsafeUsed,
      time: this.time,
      standings: order.map((r) => ({
        name: r.name,
        color: r.color,
        place: r.isAlly ? 0 : ranked.indexOf(r) + 1,
        isPlayer: r.isPlayer,
        isBoss: r.isBoss,
        isAlly: r.isAlly,
        finished: r.finished,
        time: r.finishTime,
        takedowns: r.takedowns,
        out: r.out,
      })),
    };
    this.emit('over', { reason });
  }
}

function hue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

function hueDistance(a, b) {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return Math.min(d, 360 - d);
}

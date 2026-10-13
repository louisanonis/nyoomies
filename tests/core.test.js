import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/rng.js';
import { segIntersect, segSegDistSq, raySeg, rayRect, wrapAngle } from '../src/geometry.js';
import { CHASSIS_BY_ID, chassisStats } from '../src/data/vehicles.js';
import { applyMods, rollMods, MODS } from '../src/data/mods.js';
import { EVENTS } from '../src/data/sectors.js';
import { Run, generateSectorMap, ROWS_PER_SECTOR, ordinal } from '../src/run.js';
import { Race, STEP } from '../src/race.js';

test('rng is deterministic per seed', () => {
  const a = new RNG('ABC123');
  const b = new RNG('ABC123');
  const c = new RNG('XYZ999');
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  const seqC = Array.from({ length: 5 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('geometry primitives', () => {
  assert.equal(segIntersect(0, 0, 10, 10, 0, 10, 10, 0), true);
  assert.equal(segIntersect(0, 0, 10, 0, 0, 5, 10, 5), false);
  assert.equal(segSegDistSq(0, 0, 10, 0, 0, 5, 10, 5), 25);
  assert.equal(raySeg(0, 0, 1, 0, 5, -1, 5, 1), 5);
  assert.equal(raySeg(0, 0, -1, 0, 5, -1, 5, 1), Infinity);
  assert.equal(rayRect(0, 5, 1, 0, { x: 10, y: 0, w: 5, h: 10 }), 10);
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
});

test('mods modify stats and respect floors', () => {
  const base = chassisStats(CHASSIS_BY_ID.glint);
  const s = applyMods(chassisStats(CHASSIS_BY_ID.glint), ['overclock', 'overclock', 'ghost']);
  assert.ok(Math.abs(s.topSpeed - base.topSpeed * 1.08 * 1.08) < 1e-6);
  assert.equal(s.flags.ownTrailSafe, true);
  const glass = applyMods(chassisStats(CHASSIS_BY_ID.needle), ['glasscannon', 'glasscannon', 'corrupted']);
  assert.equal(glass.maxHull, 1);
});

test('mod drafts never offer owned uniques or curses', () => {
  const rng = new RNG(1);
  for (let i = 0; i < 200; i++) {
    const picks = rollMods(rng, ['ghost', 'jumpjets'], 3, 0.8);
    assert.equal(new Set(picks).size, picks.length);
    for (const m of picks) {
      assert.notEqual(m.rarity, 'cursed');
      assert.ok(!['ghost', 'jumpjets'].includes(m.id));
    }
  }
  assert.ok(MODS.length >= 20);
});

test('sector maps end in a boss and offer a shop before it', () => {
  for (let seed = 0; seed < 50; seed++) {
    const map = generateSectorMap(new RNG(seed), seed % 3);
    assert.equal(map.length, ROWS_PER_SECTOR + 1);
    assert.equal(map.at(-1)[0].type, 'boss');
    assert.ok(map[ROWS_PER_SECTOR - 1].some((n) => n.type === 'shop'));
    for (const row of map.slice(0, -1)) assert.ok(row.length >= 2);
  }
});

test('run applies podium damage, rewards and drafts', () => {
  const run = new Run({ seed: 'T1', chassisId: 'glint' });
  const node = { type: 'race' };
  const startHull = run.hull;
  const base = { dead: false, takedowns: 1, creditsEarned: 10, hull: startHull - 1, hullLost: 1, failsafeUsed: false };
  const s1 = run.applyRaceResult(node, { ...base, place: 5 });
  // -1 from a crash during the race, +2 pit crew (capped at max), -2 for missing the podium.
  assert.equal(run.hull, Math.min(startHull, startHull - 1 + 2) - 2);
  assert.equal(s1.draft.options.length, 3);
  const credits = run.credits;
  run.applyRaceResult(node, { ...base, place: 1, hull: run.hull });
  assert.ok(run.credits > credits);
  assert.equal(run.stats.wins, 1);
});

test('losing the boss forces a retry; beating the last boss wins', () => {
  const run = new Run({ seed: 'T2', chassisId: 'twinhull' });
  const boss = { type: 'boss' };
  const res = { dead: false, takedowns: 0, creditsEarned: 0, hullLost: 0, failsafeUsed: false };
  const lose = run.applyRaceResult(boss, { ...res, place: 2, hull: run.hull });
  assert.equal(lose.retryBoss, true);
  run.sector = 2;
  const win = run.applyRaceResult(boss, { ...res, place: 1, hull: run.hull });
  assert.equal(win.success, true);
  assert.equal(run.advance(boss), 'victory');
  assert.equal(run.won, true);
});

test('failsafe saves a run once', () => {
  const run = new Run({ seed: 'T3', chassisId: 'glint' });
  run.addMod('failsafe');
  assert.equal(run.damage(999), 'failsafe');
  assert.equal(run.hull, 3);
  assert.equal(run.damage(999), 'dead');
  assert.equal(run.over, true);
});

test('every event choice resolves', () => {
  for (const ev of EVENTS) {
    for (const choice of ev.choices) {
      const run = new Run({ seed: `E-${ev.id}`, chassisId: 'bulwark' });
      run.credits = 500;
      const res = run.resolveEvent(choice.effect);
      assert.equal(res.ok, true, `${ev.id}: ${choice.label}`);
      assert.ok(run.hull <= run.maxHull);
    }
  }
});

test('ordinal suffixes', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
});

function makeRace(mode, mods = [], seed = 'R1', ally = false) {
  const run = new Run({ seed, chassisId: 'glint' });
  for (const m of mods) run.addMod(m);
  const cfg = run.raceConfig({ type: mode, ally }, 'glint', '#5ff4ff');
  cfg.autopilot = true;
  cfg.player.hull = 999;
  return new Race(cfg);
}

function simulate(race, seconds) {
  for (let t = 0; t < seconds && !race.over; t += STEP) {
    race.update(STEP);
    race.events.length = 0;
  }
}

test('an autopiloted circuit race runs to completion', () => {
  const race = makeRace('race');
  simulate(race, 240);
  assert.equal(race.over, true);
  assert.equal(race.result.reason, 'finished');
  assert.ok(race.result.place >= 1 && race.result.place <= 6);
  assert.equal(race.result.standings.length, 6);
});

test('an arena encounter ends by clear or timeout', () => {
  const race = makeRace('arena');
  simulate(race, 90);
  assert.equal(race.over, true);
  assert.ok(['cleared', 'survived'].includes(race.result.reason));
});

test('touching a wake shatters a racer; shields absorb one hit', () => {
  const race = makeRace('race', ['phaseshield']);
  race.countdown = 0;
  const [p, victim] = race.racers;
  victim.fx.invuln = 0;
  victim.shields = 0;
  // Lay a wall straight across the victim's path.
  p.trail = [{ x: victim.x + 20, y: victim.y - 100 }, { x: victim.x + 20, y: victim.y + 100 }];
  p.trailLen = 200;
  victim.angle = 0;
  victim.ai = null; // drive straight with empty input
  victim.isPlayer = false;
  race.buildSegments();
  victim.speed = 400;
  for (let i = 0; i < 20 && victim.alive; i++) {
    race.buildSegments();
    race.updateRacer(victim, STEP);
  }
  assert.equal(victim.alive, false);
  assert.equal(p.takedowns, 1);

  // Emergency shield + Phase Shield.
  assert.equal(p.shields, 2);
  assert.equal(race.crash(p, 'trail', 1), false);
  assert.equal(p.shields, 1);
});

test('Zaps: friendly wakes, excluded from placing, never targeted by your abilities', () => {
  const race = makeRace('boss', [], 'ALLY1', true);
  const { player, ally } = race;
  assert.ok(ally && ally.isAlly);
  assert.equal(race.racers.length, 6);
  const rival = race.racers.find((r) => !r.isPlayer && !r.isAlly);
  assert.equal(race.ignoresSeg(player, ally.index, 0, 0), true);
  assert.equal(race.ignoresSeg(ally, player.index, 0, 0), true);
  assert.equal(race.ignoresSeg(rival, ally.index, 0, 0), false);
  assert.equal(race.rankedRacers().includes(ally), false);
  simulate(race, 240);
  assert.equal(race.over, true);
  const allyRow = race.result.standings.find((s) => s.isAlly);
  assert.equal(allyRow.place, 0);
  const places = race.result.standings.filter((s) => !s.isAlly).map((s) => s.place).sort();
  assert.deepEqual(places, [1, 2, 3, 4, 5]);
});

test('every boss node brings Zaps; the first anomaly is the lamp story', () => {
  const run = new Run({ seed: 'LORE', chassisId: 'glint' });
  for (const map of run.maps) assert.equal(map.at(-1)[0].ally, true);
  assert.equal(run.rollEvent().id, 'lamp');
  assert.notEqual(run.rollEvent().id, 'lamp');
});

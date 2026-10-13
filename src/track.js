import { TAU, pointRectDist, pointSegDistSq } from './geometry.js';
import { SECTORS } from './data/sectors.js';

export const GATE_WIDTH = 300;

// Builds a procedurally generated arena: a loop of checkpoint gates (race
// modes) or an open killing floor (arena mode), plus obstacles, boost pads
// and pickup spawns.
export function generateTrack(rng, { mode, sector }) {
  const def = SECTORS[sector];
  return mode === 'arena' ? arenaTrack(rng, def, sector) : circuitTrack(rng, def, sector);
}

function circuitTrack(rng, def, sector) {
  const w = 3700 + sector * 300;
  const h = 2800 + sector * 220;
  const n = rng.int(6, 8);
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.37;
  const ry = h * 0.35;
  const phase = rng.float(0, TAU);

  const loop = [];
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * TAU + rng.float(-0.25, 0.25) * (TAU / n);
    const s = rng.float(0.62, 1.08);
    loop.push({ x: cx + Math.cos(t) * rx * s, y: cy + Math.sin(t) * ry * s });
  }
  // Randomize direction of travel.
  if (rng.chance(0.5)) loop.reverse();

  const gates = loop.map((p, i) => {
    const prev = loop[(i - 1 + n) % n];
    const next = loop[(i + 1) % n];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const hw = GATE_WIDTH / 2;
    return {
      idx: i,
      x: p.x,
      y: p.y,
      dirX: dx,
      dirY: dy,
      angle: Math.atan2(dy, dx),
      x1: p.x - dy * hw,
      y1: p.y + dx * hw,
      x2: p.x + dy * hw,
      y2: p.y - dx * hw,
    };
  });

  const loopSegs = loop.map((p, i) => [p, loop[(i + 1) % n]]);
  const nearLoop = (px, py, clear) => loopSegs.some(([a, b]) => pointSegDistSq(px, py, a.x, a.y, b.x, b.y) < clear * clear);

  const obstacles = placeObstacles(rng, w, h, def.obstacleCount + 3 + rng.int(-1, 2), (r) => {
    // Keep the racing line itself clear; sample the rect perimeter + center.
    for (const [a, b] of loopSegs) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 40);
      for (let s = 0; s <= steps; s++) {
        const px = a.x + ((b.x - a.x) * s) / steps;
        const py = a.y + ((b.y - a.y) * s) / steps;
        if (pointRectDist(px, py, r) < 175) return false;
      }
    }
    return true;
  });

  const pads = [];
  const pickups = [];
  loopSegs.forEach(([a, b], i) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    if (i !== n - 1 && rng.chance(def.padChance)) {
      const t = rng.float(0.35, 0.65);
      const off = rng.float(-80, 80);
      pads.push({ x: a.x + dx * t - (dy / len) * off, y: a.y + dy * t + (dx / len) * off, angle: ang, r: 34 });
    }
    const count = rng.int(1, 2);
    for (let k = 0; k < count; k++) {
      const t = rng.float(0.2, 0.8);
      const off = rng.float(-140, 140);
      pickups.push({ x: a.x + dx * t - (dy / len) * off, y: a.y + dy * t + (dx / len) * off });
    }
  });

  const start = gates[0];
  const spawns = [];
  const laneCount = 6;
  for (let i = 0; i < laneCount; i++) {
    const lateral = (i - (laneCount - 1) / 2) * 44;
    spawns.push({
      x: start.x + start.dirX * 40 - start.dirY * lateral,
      y: start.y + start.dirY * 40 + start.dirX * lateral,
      angle: start.angle,
    });
  }

  return {
    mode: 'circuit',
    w,
    h,
    gates,
    loop,
    obstacles,
    pads,
    pickups: pickups.filter((p) => p.x > 40 && p.y > 40 && p.x < w - 40 && p.y < h - 40),
    spawns,
    theme: def.theme,
    nearLoop,
  };
}

function arenaTrack(rng, def, sector) {
  const size = 2400 + sector * 200;
  const w = size;
  const h = size;
  const cx = w / 2;
  const cy = h / 2;
  const spawns = [];
  const count = 6;
  const phase = rng.float(0, TAU);
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * TAU;
    spawns.push({
      x: cx + Math.cos(a) * size * 0.32,
      y: cy + Math.sin(a) * size * 0.32,
      // Tangential, angled slightly outward so nobody starts on a collision course.
      angle: a + Math.PI / 2 - 0.5,
    });
  }

  const obstacles = placeObstacles(rng, w, h, def.obstacleCount - 2 + rng.int(0, 3), (r) =>
    spawns.every((s) => pointRectDist(s.x, s.y, r) > 260),
  );

  const free = (x, y) => obstacles.every((r) => pointRectDist(x, y, r) > 40);
  const pads = [];
  const pickups = [];
  for (let i = 0; i < 40 && pickups.length < 12; i++) {
    const x = rng.float(120, w - 120);
    const y = rng.float(120, h - 120);
    if (free(x, y)) pickups.push({ x, y });
  }
  for (let i = 0; i < 30 && pads.length < 4 + sector; i++) {
    const x = rng.float(200, w - 200);
    const y = rng.float(200, h - 200);
    if (free(x, y)) pads.push({ x, y, angle: rng.float(0, TAU), r: 34 });
  }

  return {
    mode: 'arena',
    w,
    h,
    gates: [],
    loop: [],
    obstacles,
    pads,
    pickups,
    spawns,
    theme: def.theme,
  };
}

function placeObstacles(rng, w, h, target, accept) {
  const obstacles = [];
  for (let tries = 0; tries < 600 && obstacles.length < target; tries++) {
    let rw;
    let rh;
    if (rng.chance(0.35)) {
      rw = rh = rng.float(50, 90); // pillar
    } else if (rng.chance(0.5)) {
      rw = rng.float(180, 340); // long wall
      rh = rng.float(36, 60);
      if (rng.chance(0.5)) [rw, rh] = [rh, rw];
    } else {
      rw = rng.float(90, 220);
      rh = rng.float(90, 220);
    }
    const r = { x: rng.float(90, w - 90 - rw), y: rng.float(90, h - 90 - rh), w: rw, h: rh };
    const overlaps = obstacles.some(
      (o) => r.x < o.x + o.w + 90 && r.x + r.w + 90 > o.x && r.y < o.y + o.h + 90 && r.y + r.h + 90 > o.y,
    );
    if (!overlaps && accept(r)) obstacles.push(r);
  }
  return obstacles;
}

import { TAU, clamp, lerp } from './geometry.js';
import { ABILITIES } from './data/abilities.js';

const FONT = '"Orbitron", "Segoe UI", system-ui, sans-serif';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.toasts = [];
    this.shake = 0;
    this.time = 0;
    this.lowFx = false;
    this.slowTime = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    // Cap the backing store: Safari refuses canvases over ~16.7M pixels
    // (e.g. a 6K display at 2x), and huge canvases tank frame rate anyway.
    const maxPixels = this.lowFx ? 2.1e6 : 8.3e6;
    let dpr = Math.min(window.devicePixelRatio || 1, this.lowFx ? 1 : 2);
    if (this.w * this.h * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / (this.w * this.h));
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  // Glow is the most expensive effect (software-rendered canvases on Linux,
  // Firefox); low-effects mode turns it off.
  glow(px) {
    return this.lowFx ? 0 : px;
  }

  // Switch to low effects if a race runs below ~40fps for a few seconds.
  trackPerformance(dt) {
    if (this.lowFx || dt <= 0) return;
    this.slowTime = dt > 1 / 40 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 3) {
      this.lowFx = true;
      this.resize();
      this.toast('LOW EFFECTS MODE', 'rgba(255,255,255,0.7)');
    }
  }

  toast(text, color = '#ffffff', big = false) {
    this.toasts.push({ text, color, big, life: big ? 1.6 : 1.2, max: big ? 1.6 : 1.2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  resetCamera(race, focus) {
    this.cam.x = focus.x;
    this.cam.y = focus.y;
    this.cam.zoom = this.baseZoom();
    this.toasts = [];
  }

  baseZoom() {
    return clamp(Math.min(this.w, this.h) / 820, 0.55, 1.4);
  }

  render(race, dt, { focus, hud = true, run = null } = {}) {
    this.time += dt;
    const ctx = this.ctx;
    const cam = this.cam;
    const t = race.track;

    // Camera: lead ahead of the focus racer and zoom out with speed.
    const lead = 0.35;
    const tx = focus.x + Math.cos(focus.angle) * focus.speed * lead;
    const ty = focus.y + Math.sin(focus.angle) * focus.speed * lead;
    const k = Math.min(1, dt * 4);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const zt = this.baseZoom() * clamp(1.1 - focus.speed / 1500, 0.62, 1);
    cam.zoom += (zt - cam.zoom) * Math.min(1, dt * 2);
    this.shake = Math.max(0, this.shake - dt * 30);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = t.theme.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    this.view = {
      x0: cam.x - this.w / 2 / cam.zoom,
      y0: cam.y - this.h / 2 / cam.zoom,
      x1: cam.x + this.w / 2 / cam.zoom,
      y1: cam.y + this.h / 2 / cam.zoom,
    };

    this.drawFloor(t);
    this.drawPads(t);
    this.drawGates(race, focus);
    this.drawObstacles(t);
    this.drawPickups(race);

    ctx.globalCompositeOperation = 'lighter';
    for (const f of race.fading) this.drawTrail(f.points, null, f.color, f.life / f.max);
    for (const r of race.racers) {
      if (r.trail.length) this.drawTrail(r.trail, r.alive && r.fx.noTrail <= 0 ? r : null, r.color, 1);
    }
    for (const b of race.barriers) this.drawBarrier(b);
    this.drawParticles(race);
    this.drawRings(race);
    for (const m of race.missiles) this.drawMissile(m);
    ctx.globalCompositeOperation = 'source-over';

    for (const r of race.racers) if (r.alive) this.drawRacer(r);
    ctx.restore();

    if (hud) {
      this.trackPerformance(dt);
      this.drawHud(race, run, dt);
    }
  }

  // ---------------------------------------------------------- world layers

  drawFloor(t) {
    const ctx = this.ctx;
    const v = this.view;
    const step = 80;
    const x0 = Math.max(0, Math.floor(v.x0 / step) * step);
    const x1 = Math.min(t.w, v.x1);
    const y0 = Math.max(0, Math.floor(v.y0 / step) * step);
    const y1 = Math.min(t.h, v.y1);
    ctx.lineWidth = 1 / this.cam.zoom;
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? t.theme.floorMajor : t.theme.floor;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += step) {
        if ((Math.round(x / step) % 5 === 0) !== major) continue;
        ctx.moveTo(x, Math.max(0, v.y0));
        ctx.lineTo(x, y1);
      }
      for (let y = y0; y <= y1; y += step) {
        if ((Math.round(y / step) % 5 === 0) !== major) continue;
        ctx.moveTo(Math.max(0, v.x0), y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }
    // Arena boundary.
    ctx.strokeStyle = t.theme.wall;
    ctx.shadowColor = t.theme.wall;
    ctx.shadowBlur = this.glow(18);
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, t.w, t.h);
    ctx.shadowBlur = 0;
  }

  drawObstacles(t) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.lineWidth = 3;
    for (const o of t.obstacles) {
      if (o.x > v.x1 || o.y > v.y1 || o.x + o.w < v.x0 || o.y + o.h < v.y0) continue;
      ctx.fillStyle = t.theme.obstacle;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = t.theme.wall;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.globalAlpha = 0.18;
      ctx.strokeRect(o.x + 10, o.y + 10, o.w - 20, o.h - 20);
      ctx.globalAlpha = 1;
    }
  }

  drawPads(t) {
    const ctx = this.ctx;
    for (const p of t.pads) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(120, 255, 200, 0.08)';
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, TAU);
      ctx.fill();
      const phase = (this.time * 2) % 1;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1 + phase) * 16;
        ctx.strokeStyle = `rgba(120, 255, 200, ${0.25 + 0.6 * (1 - Math.abs(off) / 32)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(off - 8, -16);
        ctx.lineTo(off + 6, 0);
        ctx.lineTo(off - 8, 16);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawGates(race, focus) {
    const ctx = this.ctx;
    const gates = race.track.gates;
    gates.forEach((g, i) => {
      const isNext = focus.isPlayer && i === focus.nextGate;
      const isStart = i === 0;
      ctx.lineCap = 'round';
      if (isStart) {
        // Checkered start/finish line.
        const n = 10;
        for (let s = 0; s < n; s++) {
          ctx.strokeStyle = s % 2 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(lerp(g.x1, g.x2, s / n), lerp(g.y1, g.y2, s / n));
          ctx.lineTo(lerp(g.x1, g.x2, (s + 1) / n), lerp(g.y1, g.y2, (s + 1) / n));
          ctx.stroke();
        }
      }
      const color = isNext ? '#ffffff' : race.track.theme.accent;
      ctx.strokeStyle = color;
      ctx.globalAlpha = isNext ? 0.55 + 0.35 * Math.sin(this.time * 8) : 0.22;
      ctx.lineWidth = isNext ? 4 : 2;
      ctx.setLineDash(isStart ? [] : [14, 12]);
      if (!isStart) {
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // Pylons.
      for (const [px, py] of [[g.x1, g.y1], [g.x2, g.y2]]) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = this.glow(isNext ? 20 : 8);
        ctx.beginPath();
        ctx.arc(px, py, isNext ? 9 : 6, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (isNext) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let c = 0; c < 2; c++) {
          const off = c * 22 + ((this.time * 40) % 22);
          ctx.beginPath();
          ctx.moveTo(off - 10, -14);
          ctx.lineTo(off + 6, 0);
          ctx.lineTo(off - 10, 14);
          ctx.lineTo(off - 4, 0);
          ctx.fill();
        }
        ctx.restore();
      }
    });
  }

  drawPickups(race) {
    const ctx = this.ctx;
    for (const p of race.pickups) {
      if (!p.active) continue;
      const bob = Math.sin(p.spin * 2) * 2;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(p.spin);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = this.glow(14);
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-9, -9, 18, 18);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.rotate(-p.spin);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 1);
      ctx.restore();
    }
  }

  drawTrail(points, live, color, alpha) {
    const ctx = this.ctx;
    if (points.length < 1) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (p.gap) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      if (live) ctx.lineTo(live.x, live.y);
    };
    path();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.16 * alpha;
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.globalAlpha = 0.45 * alpha;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.globalAlpha = 0.95 * alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawBarrier(b) {
    const ctx = this.ctx;
    const a = clamp(b.ttl / 1.5, 0, 1) * (0.7 + 0.3 * Math.sin(this.time * 20));
    ctx.lineCap = 'round';
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = 0.3 * a;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawParticles(race) {
    const ctx = this.ctx;
    for (const p of race.particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * (p.cube ? 2 : 1);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  drawRings(race) {
    const ctx = this.ctx;
    for (const r of race.rings) {
      const t = 1 - r.life / r.maxLife;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r, r.max, t), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawMissile(m) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.fillStyle = '#ff6b6b';
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = this.glow(16);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawRacer(r) {
    const ctx = this.ctx;
    const rad = r.stats.radius;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);
    if (r.fx.hop > 0) ctx.scale(1.4, 1.4);
    let alpha = 1;
    if (r.fx.invuln > 0) alpha = 0.35 + 0.35 * Math.sin(this.time * 30);
    if (r.fx.phase > 0) alpha = 0.3;
    ctx.globalAlpha = alpha;

    // Engine glow / boost flame.
    const flame = r.boosting || r.fx.turbo > 0 || r.fx.overdrive > 0;
    if (flame) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = r.color;
      ctx.shadowBlur = this.glow(20);
      const len = rad * (1.8 + Math.random() * 1.2);
      ctx.beginPath();
      ctx.moveTo(-rad * 0.9, -rad * 0.35);
      ctx.lineTo(-rad * 0.9 - len, 0);
      ctx.lineTo(-rad * 0.9, rad * 0.35);
      ctx.fill();
    }

    ctx.shadowColor = r.color;
    ctx.shadowBlur = this.glow(16);
    ctx.fillStyle = r.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    drawShape(ctx, r.shape, rad, this.time);
    ctx.shadowBlur = 0;

    if (r.shields > 0 || r.fx.phase > 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = r.fx.phase > 0 ? '#d68bff' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, rad * 2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    if (r.fx.slow > 0) {
      ctx.strokeStyle = '#9be7ff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad * 2.4 + Math.sin(this.time * 25) * 2, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (r.isPlayer) {
      // Marker so the player is never lost in the pack.
      const y = r.y - rad - 16 + Math.sin(this.time * 5) * 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(r.x, y + 7);
      ctx.lineTo(r.x - 6, y);
      ctx.lineTo(r.x + 6, y);
      ctx.fill();
    } else {
      ctx.font = `600 10px ${FONT}`;
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 0.8;
      ctx.textAlign = 'center';
      ctx.fillText(r.isBoss ? `▲ JUPITER · ${r.name}` : r.isAlly ? `${r.name} · ALLY` : r.name, r.x, r.y - rad - 14);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ HUD

  drawHud(race, run, dt) {
    const ctx = this.ctx;
    const p = race.player;
    const W = this.w;
    const H = this.h;
    const theme = race.track.theme;
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    // --- top left: position / lap / timer
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    if (race.isArena) {
      const left = race.racers.filter((r) => !r.isPlayer && !r.out).length;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`${Math.max(0, Math.ceil(race.timeLimit - race.time))}s`, 20, 46);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = theme.accent;
      ctx.fillText(`RIVALS LEFT ${left}   SHATTERED ${p.takedowns}`, 20, 70);
    } else {
      const pos = race.playerPosition();
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText(`${pos}`, 20, 52);
      const w = ctx.measureText(`${pos}`).width;
      ctx.font = `700 16px ${FONT}`;
      ctx.fillText(`/${race.rankedRacers().length}`, 24 + w, 52);
      const n = race.track.gates.length;
      const lap = Math.min(race.laps, Math.floor(p.progress / n) + 1);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = theme.accent;
      ctx.fillText(`LAP ${lap}/${race.laps}   ${formatTime(race.time)}`, 20, 76);
    }

    // --- top right: run info
    if (run) {
      ctx.textAlign = 'right';
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`¢ ${run.credits + race.creditsEarned}`, W - 20, 36);
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`SECTOR ${run.sector + 1} · ${race.sectorDef.name.toUpperCase()}`, W - 20, 56);
    }

    // --- bottom left: hull, shields, boost, ability
    const bx = 20;
    let by = H - 96;
    ctx.textAlign = 'left';
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('HULL', bx, by);
    const maxHull = race.playerMaxHull;
    const pipW = Math.min(16, 200 / maxHull - 3);
    for (let i = 0; i < maxHull; i++) {
      const filled = i < race.playerHull;
      ctx.fillStyle = filled ? (race.playerHull <= 3 ? '#ff4f6d' : '#5ff4ff') : 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx + 44 + i * (pipW + 3), by - 9, pipW, 10);
    }
    if (p.shields > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`SHIELD ×${p.shields}`, bx + 50 + maxHull * (pipW + 3), by);
    }

    by += 22;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('BOOST', bx, by);
    const bw = 200;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx + 44, by - 9, bw, 10);
    const frac = p.boost / p.stats.boostMax;
    ctx.fillStyle = p.boosting ? '#ffffff' : '#ffb547';
    ctx.fillRect(bx + 44, by - 9, bw * frac, 10);
    if (p.grind > 0.1) {
      ctx.fillStyle = `rgba(255,255,255,${p.grind})`;
      ctx.fillText('GRINDING', bx + 52 + bw, by);
    }

    // Ability box.
    by += 14;
    const ab = ABILITIES[p.abilityId];
    const ready = p.abilityCharges > 0;
    ctx.strokeStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, 40, 40);
    if (!ready) {
      const cdFrac = clamp(p.abilityCd / (ab.cooldown * p.stats.abilityCooldownMult), 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx, by + 40 * (1 - cdFrac), 40, 40 * cdFrac);
    }
    ctx.fillStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(ab.icon, bx + 20, by + 28);
    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`[E] ${ab.name.toUpperCase()}${p.abilityMaxCharges > 1 ? ` ×${p.abilityCharges}` : ''}`, bx + 50, by + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(ready ? 'READY' : `${p.abilityCd.toFixed(1)}s`, bx + 50, by + 33);

    // --- speedometer
    ctx.textAlign = 'center';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.round(p.speed / 3)}`, W / 2, H - 34);
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('KM/H', W / 2, H - 18);

    this.drawMinimap(race);
    this.drawGateArrow(race);

    // --- center messages
    if (race.countdown > 0) {
      const n = Math.ceil(race.countdown);
      const f = race.countdown % 1;
      ctx.font = `900 ${90 + f * 40}px ${FONT}`;
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = f;
      ctx.fillText(`${n}`, W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(race.isArena ? 'SURVIVE 60 SECONDS · SHATTER YOUR RIVALS' : `${race.laps} LAPS · PASS EVERY GATE IN ORDER`, W / 2, H / 2 + 10);
    } else if (race.time < 0.8) {
      ctx.font = `900 80px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 1 - race.time / 0.8;
      ctx.fillText('GO', W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
    }
    if (!p.alive && !race.over) {
      ctx.font = `800 34px ${FONT}`;
      ctx.fillStyle = '#ff4f6d';
      ctx.fillText('SHATTERED', W / 2, H / 2 - 30);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`-1 HULL · REFORMING IN ${Math.max(0, p.respawn).toFixed(1)}`, W / 2, H / 2);
    }

    let ty = 130;
    for (const t of this.toasts) {
      t.life -= dt;
      const a = clamp(t.life / t.max * 3, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.big ? 30 : 18}px ${FONT}`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, W / 2, ty);
      ty += t.big ? 40 : 28;
    }
    ctx.globalAlpha = 1;
    this.toasts = this.toasts.filter((t) => t.life > 0);
    ctx.restore();
  }

  drawMinimap(race) {
    const ctx = this.ctx;
    const t = race.track;
    const size = Math.min(190, this.w * 0.28);
    const scale = size / Math.max(t.w, t.h);
    const mw = t.w * scale;
    const mh = t.h * scale;
    const x0 = this.w - mw - 16;
    const y0 = this.h - mh - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0, y0, mw, mh);
    ctx.strokeStyle = t.theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, mw, mh);
    ctx.fillStyle = t.theme.accent;
    ctx.globalAlpha = 0.3;
    for (const o of t.obstacles) ctx.fillRect(x0 + o.x * scale, y0 + o.y * scale, Math.max(1, o.w * scale), Math.max(1, o.h * scale));
    ctx.globalAlpha = 1;
    t.gates.forEach((g, i) => {
      ctx.strokeStyle = i === race.player.nextGate ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = i === race.player.nextGate ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x0 + g.x1 * scale, y0 + g.y1 * scale);
      ctx.lineTo(x0 + g.x2 * scale, y0 + g.y2 * scale);
      ctx.stroke();
    });
    for (const r of race.racers) {
      if (!r.alive) continue;
      ctx.fillStyle = r.color;
      const s = r.isPlayer ? 5 : 3;
      ctx.fillRect(x0 + r.x * scale - s / 2, y0 + r.y * scale - s / 2, s, s);
    }
  }

  drawGateArrow(race) {
    if (race.isArena || !race.player.alive) return;
    const g = race.track.gates[race.player.nextGate];
    const cam = this.cam;
    const sx = (g.x - cam.x) * cam.zoom + this.w / 2;
    const sy = (g.y - cam.y) * cam.zoom + this.h / 2;
    const m = 50;
    if (sx > m && sy > m && sx < this.w - m && sy < this.h - m) return;
    const ang = Math.atan2(sy - this.h / 2, sx - this.w / 2);
    const ex = clamp(sx, m, this.w - m);
    const ey = clamp(sy, m, this.h - m);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.time * 6);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 10);
    ctx.fill();
    ctx.restore();
  }
}

// Vehicle silhouettes, drawn facing +x at the racer's position.
export function drawShape(ctx, shape, rad, time = 0) {
  switch (shape) {
    case 'twinhull': {
      // Two long parallel hulls welded under one swept wing, canopy on the
      // wing's leading edge, engine glow at the rear of each hull.
      const hy = rad * 0.72;
      ctx.beginPath();
      ctx.moveTo(rad * 0.5, -hy);
      ctx.lineTo(rad * 0.15, 0);
      ctx.lineTo(rad * 0.5, hy);
      ctx.lineTo(-rad * 0.7, hy);
      ctx.lineTo(-rad * 0.45, 0);
      ctx.lineTo(-rad * 0.7, -hy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        roundRect(ctx, -rad * 1.2, s * hy - rad * 0.24, rad * 2.5, rad * 0.48, rad * 0.2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(rad * 0.05, 0, rad * 0.32, rad * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.3 * Math.sin(time * 30)})`;
      for (const s of [-1, 1]) ctx.fillRect(-rad * 1.3, s * hy - rad * 0.14, rad * 0.18, rad * 0.28);
      ctx.restore();
      break;
    }
    case 'needle':
      ctx.beginPath();
      ctx.moveTo(rad * 1.8, 0);
      ctx.lineTo(-rad, -rad * 0.9);
      ctx.lineTo(-rad * 0.4, 0);
      ctx.lineTo(-rad, rad * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'bulwark':
      ctx.beginPath();
      ctx.moveTo(rad * 1.2, -rad * 0.55);
      ctx.lineTo(rad * 1.2, rad * 0.55);
      ctx.lineTo(rad * 0.6, rad * 0.9);
      ctx.lineTo(-rad * 1.1, rad * 0.9);
      ctx.lineTo(-rad * 1.1, -rad * 0.9);
      ctx.lineTo(rad * 0.6, -rad * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-rad * 0.5, -rad * 0.35, rad * 1.1, rad * 0.7);
      break;
    case 'echo':
      ctx.beginPath();
      ctx.moveTo(rad * 1.6, 0);
      ctx.quadraticCurveTo(-rad * 0.2, -rad * 0.3, -rad * 1.1, -rad * 1.1);
      ctx.quadraticCurveTo(-rad * 0.3, 0, -rad * 1.1, rad * 1.1);
      ctx.quadraticCurveTo(-rad * 0.2, rad * 0.3, rad * 1.6, 0);
      ctx.fill();
      ctx.stroke();
      break;
    case 'glint':
    default:
      ctx.beginPath();
      ctx.moveTo(rad * 1.7, 0);
      ctx.lineTo(rad * 0.3, -rad * 0.55);
      ctx.lineTo(-rad * 1.3, -rad * 0.45);
      ctx.lineTo(-rad * 1.3, rad * 0.45);
      ctx.lineTo(rad * 0.3, rad * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(rad * 0.1, 0, rad * 0.55, rad * 0.22, 0, 0, TAU);
      ctx.fill();
      break;
  }
}

// ctx.roundRect only exists in Safari 16+ / Firefox 112+; without it the
// pod would throw every frame it is drawn.
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

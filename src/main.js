import { Race, STEP } from './race.js';
import { RNG, randomSeedString } from './rng.js';
import { Run, ordinal } from './run.js';
import { Renderer, drawShape } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { loadMeta, recordRun, unlock } from './meta.js';
import { CHASSIS, CHASSIS_BY_ID, chassisStats } from './data/vehicles.js';
import { MOD_BY_ID } from './data/mods.js';
import { ABILITIES } from './data/abilities.js';
import {
  UI, titleScreen, howToScreen, selectScreen, mapScreen, resultsScreen,
  draftScreen, shopScreen, eventScreen, endScreen, pauseScreen, keyboardNoticeScreen,
} from './ui.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input();
const audio = new Audio();
const ui = new UI(document.getElementById('ui'), audio);

const state = {
  mode: 'menu', // 'menu' | 'race' | 'paused'
  meta: loadMeta(),
  run: null,
  race: null,
  node: null,
  demo: null,
  selected: null,
  seed: randomSeedString(),
};

// ------------------------------------------------------------ attract demo

function makeDemo() {
  const rng = new RNG(Math.floor(Math.random() * 1e9));
  const ch = rng.pick(CHASSIS);
  const demo = new Race({
    rng,
    mode: 'race',
    sector: rng.int(0, 2),
    laps: 99,
    countdown: 0,
    autopilot: true,
    player: { stats: chassisStats(ch), hull: 999, abilityId: ch.ability, shape: ch.shape, color: ch.color },
  });
  renderer.resetCamera(demo, demo.player);
  demo.age = 0;
  return demo;
}

// ------------------------------------------------------------------ screens

function goTitle() {
  state.mode = 'menu';
  state.run = null;
  state.race = null;
  ui.show(titleScreen(state.meta), {
    newRun: goSelect,
    howTo: () => ui.show(howToScreen(), { back: goTitle }),
  });
}

function goSelect() {
  if (!state.selected || !state.meta.unlocked.includes(state.selected)) state.selected = 'cycle';
  ui.show(selectScreen(state.meta, state.selected, state.seed), {
    pick: (id) => { state.selected = id; readSeed(); goSelect(); },
    unlock: (id) => {
      readSeed();
      if (unlock(state.meta, CHASSIS_BY_ID[id])) {
        audio.play('buy');
        state.selected = id;
      }
      goSelect();
    },
    back: goTitle,
    start: () => {
      readSeed();
      startRun();
    },
  });
  drawPreviews();
}

function readSeed() {
  const el = document.getElementById('seed-input');
  if (el) state.seed = el.value.trim().toUpperCase() || randomSeedString();
}

function drawPreviews() {
  for (const c of document.querySelectorAll('canvas.ship-preview')) {
    const ctx = c.getContext('2d');
    const chassis = CHASSIS.find((ch) => ch.shape === c.dataset.shape);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    const rad = 18 * (chassis.stats.radius ? chassis.stats.radius / 9 : 0.8);
    ctx.strokeStyle = c.dataset.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-c.width / 2, 0);
    ctx.lineTo(-rad, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = c.dataset.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = c.dataset.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    drawShape(ctx, c.dataset.shape, rad, 0);
    ctx.restore();
  }
}

function startRun() {
  state.run = new Run({ seed: state.seed, chassisId: state.selected });
  state.seed = randomSeedString();
  goMap();
}

function goMap() {
  state.mode = 'menu';
  const run = state.run;
  ui.show(mapScreen(run), {
    enter: (i) => enterNode(run.currentChoices()[Number(i)]),
    abandon: () => {
      if (confirm('Abandon this run? Progress earns Data as if you were derezzed.')) endRun();
    },
  });
}

function enterNode(node) {
  state.node = node;
  switch (node.type) {
    case 'shop': return goShop(state.run.makeShop());
    case 'event': return goEvent(state.run.rollEvent(), null);
    default: return startRace(node);
  }
}

function startRace(node) {
  const run = state.run;
  const cfg = run.raceConfig(node, run.chassis.shape, run.chassis.color);
  state.race = new Race(cfg);
  renderer.resetCamera(state.race, state.race.player);
  state.mode = 'race';
  input.setCapturing(true);
  ui.hide();
  audio.unlock();
  audio.startEngine();
  if (node.type === 'boss') renderer.toast(`BOSS: ${state.race.sectorDef.boss.name}`, state.race.sectorDef.boss.color, true);
  else if (node.type === 'elite') renderer.toast('ELITE CIRCUIT', '#ff4f6d', true);
  else if (node.type === 'arena') renderer.toast('DEREZ ARENA', '#ffb547', true);
}

function finishRace() {
  const run = state.run;
  const race = state.race;
  const node = state.node;
  state.mode = 'menu';
  input.setCapturing(false);
  audio.stopEngine();
  const summary = run.applyRaceResult(node, race.result);
  if (summary.dead) audio.play('bad');
  ui.show(resultsScreen(run, node, race.result, summary), {
    continue: () => {
      if (summary.dead) return endRun();
      if (summary.draft) return goDraft(summary.draft.options, () => afterNode(node, summary));
      afterNode(node, summary);
    },
  });
}

function afterNode(node, summary = {}) {
  if (summary.retryBoss) return goMap();
  const next = state.run.advance(node);
  if (next === 'victory') return endRun();
  goMap();
}

function goDraft(options, done) {
  const run = state.run;
  const skip = 15;
  ui.show(draftScreen(run, options, skip), {
    take: (id) => {
      run.addMod(id);
      audio.play('buy');
      done();
    },
    skip: () => {
      run.credits += skip;
      done();
    },
  });
}

function goShop(shop) {
  const run = state.run;
  const refresh = () => goShop(shop);
  ui.show(shopScreen(run, shop), {
    buyMod: (i) => {
      const item = shop.mods[Number(i)];
      if (item.sold || run.credits < item.price) return;
      run.credits -= item.price;
      run.addMod(item.mod.id);
      item.sold = true;
      audio.play('buy');
      refresh();
    },
    buyAbility: (i) => {
      const item = shop.abilities[Number(i)];
      if (item.sold || run.credits < item.price) return;
      run.credits -= item.price;
      run.abilityId = item.id;
      shop.abilities.forEach((a) => { a.sold = false; });
      item.sold = true;
      audio.play('buy');
      refresh();
    },
    repair: () => {
      if (run.credits < shop.repairPrice || run.hull >= run.maxHull) return;
      run.credits -= shop.repairPrice;
      run.repair(3);
      audio.play('buy');
      refresh();
    },
    reroll: () => {
      if (run.credits < shop.rerollPrice) return;
      run.credits -= shop.rerollPrice;
      shop.rerollPrice += 10;
      shop.mods = run.rollShopMods();
      refresh();
    },
    leave: () => afterNode(state.node),
  });
}

function goEvent(event, outcome) {
  const run = state.run;
  ui.show(eventScreen(run, event, outcome), {
    choose: (i) => {
      const res = run.resolveEvent(event.choices[Number(i)].effect);
      if (!res.ok) return;
      goEvent(event, res.log);
    },
    continue: () => {
      if (run.over || run.hull <= 0) return endRun();
      afterNode(state.node);
    },
  });
}

function endRun() {
  const run = state.run;
  run.over = true;
  state.mode = 'menu';
  input.setCapturing(false);
  state.race = null;
  audio.stopEngine();
  const earned = recordRun(state.meta, run);
  ui.show(endScreen(run, earned, state.meta), { title: goTitle });
}

function pause() {
  if (state.mode !== 'race' || state.race.over) return;
  state.mode = 'paused';
  input.setCapturing(false);
  audio.setEngine(0, false, false);
  showPause();
}

function showPause() {
  ui.show(pauseScreen(), {
    resume,
    howTo: () => ui.show(howToScreen(), { back: showPause }),
    abandon: () => {
      if (!confirm('Abandon this run?')) return;
      state.run.hull = 0;
      endRun();
    },
  });
}

function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'race';
  input.setCapturing(true);
  ui.hide();
}

// ------------------------------------------------------------------ events

function handleRaceEvents(race) {
  const laps = race.laps;
  for (const e of race.events) {
    audio.play(e.type);
    switch (e.type) {
      case 'lap':
        if (e.lap === laps) renderer.toast('FINAL LAP', '#ffffff', true);
        else if (e.lap < laps) renderer.toast(`LAP ${e.lap}`, '#ffffff');
        break;
      case 'derez':
        if (e.isPlayer) renderer.shake = 22;
        else if (Math.hypot(e.x - race.player.x, e.y - race.player.y) < 500) renderer.shake = Math.max(renderer.shake, 6);
        break;
      case 'kill':
        renderer.toast(`DEREZZED ${e.name}${e.bonus ? ` +${e.bonus}¢` : ''}`, '#ffb547');
        break;
      case 'pickup':
        renderer.toast(e.label, '#ffffff');
        break;
      case 'shield':
        renderer.toast('SHIELD ABSORBED', '#ffffff');
        break;
      case 'hop':
        renderer.toast('JUMP JETS!', '#9dff7a');
        break;
      case 'failsafe':
        renderer.toast('FAILSAFE ENGAGED', '#ffb547', true);
        break;
      case 'finish':
        renderer.toast(`${ordinal(e.place)} PLACE`, e.place <= 3 ? '#5ff4ff' : '#ff4f6d', true);
        break;
      case 'over':
        if (e.reason === 'dead') renderer.toast('HULL BREACH', '#ff4f6d', true);
        else if (e.reason === 'cleared') renderer.toast('ARENA CLEARED', '#5ff4ff', true);
        else if (e.reason === 'survived') renderer.toast('TIME — SURVIVED', '#5ff4ff', true);
        break;
      default:
        break;
    }
  }
  race.events.length = 0;
}

// --------------------------------------------------------------- main loop

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.mode === 'race') {
    const race = state.race;
    input.apply(race.input);
    acc += dt;
    while (acc >= STEP) {
      race.update(STEP);
      acc -= STEP;
    }
    handleRaceEvents(race);
    const p = race.player;
    audio.setEngine(p.speed, p.boosting, p.alive && !race.over);
    renderer.render(race, dt, { focus: p, run: state.run });
    if (race.over && race.overTimer > 2.2) finishRace();
  } else if (state.mode === 'paused') {
    renderer.render(state.race, 0, { focus: state.race.player, run: state.run });
  } else {
    if (!state.demo || state.demo.age > 45) state.demo = makeDemo();
    const demo = state.demo;
    acc += dt;
    while (acc >= STEP) {
      demo.update(STEP);
      acc -= STEP;
    }
    demo.age += dt;
    demo.events.length = 0;
    const focus = demo.player.alive ? demo.player : demo.racers.find((r) => r.alive) || demo.player;
    renderer.render(demo, dt, { focus, hud: false });
  }
  requestAnimationFrame(frame);
}

input.on('Escape', () => (state.mode === 'race' ? pause() : resume()));
input.on('KeyP', () => (state.mode === 'race' ? pause() : resume()));
input.on('KeyM', () => audio.toggleMute());
// Pause when the tab is hidden or the window loses focus (Alt-Tab,
// clicking another window): keys are released then, so the racer would
// otherwise fly on uncontrolled.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', pause);
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Debug hooks for automated smoke tests; also tells the boot guard in
// index.html that the game started (and clears its message if a slow load
// tripped it).
window.__nyoomies = { state, MOD_BY_ID, ABILITIES };
document.getElementById('boot-error').hidden = true;

// Touch-only devices (phones, tablets without a trackpad) get a notice
// first: the game has no touch controls yet.
function needsKeyboardNotice() {
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const finePointer = window.matchMedia?.('(any-pointer: fine)').matches;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('nyoomies.keyboardOk') === '1';
  } catch {
    // Storage blocked: just show the notice each visit.
  }
  return touch && !finePointer && !dismissed;
}

if (needsKeyboardNotice()) {
  ui.show(keyboardNoticeScreen(), {
    continue: () => {
      try {
        localStorage.setItem('nyoomies.keyboardOk', '1');
      } catch {
        // Ignore.
      }
      goTitle();
    },
  });
} else {
  goTitle();
}
requestAnimationFrame(frame);

import { RARITY } from './data/mods.js';
import { ABILITIES } from './data/abilities.js';
import { CHASSIS, chassisStats } from './data/vehicles.js';
import { NODE_TYPES, SECTORS } from './data/sectors.js';
import { ordinal } from './run.js';
import { formatTime } from './render.js';

// DOM overlay for every non-racing screen. Buttons declare
// data-act="handlerName" (and optional data-arg) and are dispatched to the
// handler map passed to show().
export class UI {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    this.handlers = {};
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled || el.classList.contains('disabled')) return;
      this.audio.unlock();
      this.audio.play('click');
      const fn = this.handlers[el.dataset.act];
      if (fn) fn(el.dataset.arg, el);
    });
  }

  show(html, handlers = {}) {
    this.handlers = handlers;
    this.root.innerHTML = `<div class="screen">${html}</div>`;
    this.root.classList.add('visible');
    this.root.scrollTop = 0;
  }

  hide() {
    this.root.classList.remove('visible');
    this.root.innerHTML = '';
    this.handlers = {};
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------- pieces

export function hullBar(hull, max) {
  let pips = '';
  for (let i = 0; i < max; i++) pips += `<i class="${i < hull ? (hull <= 3 ? 'low' : 'on') : ''}"></i>`;
  return `<span class="hull-bar">${pips}</span>`;
}

export function modCard(mod, { footer = '', act = '', arg = '', disabled = false } = {}) {
  const r = RARITY[mod.rarity];
  const attrs = act ? `data-act="${act}" data-arg="${esc(arg)}"` : '';
  return `<button class="card mod-card ${disabled ? 'disabled' : ''}" style="--c:${r.color}" ${attrs}>
    <div class="rarity">${r.label}${mod.unique ? ' · Unique' : ''}</div>
    <h3>${esc(mod.name)}</h3>
    <p>${esc(mod.desc)}</p>
    ${footer}
  </button>`;
}

export function runPanel(run) {
  const s = run.computeStats();
  const ab = ABILITIES[run.abilityId];
  const mods = run.modCounts();
  const chips = mods.length
    ? mods.map(({ mod, n }) => `<span class="mod-chip" style="--c:${RARITY[mod.rarity].color}" title="${esc(mod.desc)}">${esc(mod.name)}${n > 1 ? ` ×${n}` : ''}</span>`).join('')
    : '<span class="muted">No mods yet</span>';
  return `<aside class="panel run-panel">
    <div class="rp-head"><span class="chassis-name" style="--c:${run.chassis.color}">${esc(run.chassis.name)}</span><span class="muted">SEED ${esc(run.seedString)}</span></div>
    <div class="rp-row"><label>Hull</label>${hullBar(run.hull, s.maxHull)}<b>${run.hull}/${s.maxHull}</b></div>
    <div class="rp-row"><label>Credits</label><b class="gold">¢ ${run.credits}</b></div>
    <div class="rp-row"><label>Ability</label><b>${ab.icon} ${esc(ab.name)}</b></div>
    <div class="rp-row"><label>Trait</label><span class="small">${esc(run.chassis.trait)}</span></div>
    <div class="rp-mods">${chips}</div>
  </aside>`;
}

function statBar(label, value, min, max) {
  const f = Math.max(0.06, Math.min(1, (value - min) / (max - min)));
  return `<div class="stat"><label>${label}</label><span class="bar"><i style="width:${(f * 100).toFixed(0)}%"></i></span></div>`;
}

// ---------------------------------------------------------------- screens

export function titleScreen(meta) {
  return `
  <div class="title-wrap">
    <h1 class="logo">NYOOMIES</h1>
    <div class="tagline">Roguelike light-cycle racing on a hostile grid</div>
    <div class="menu">
      <button class="btn primary" data-act="newRun">New Run</button>
      <button class="btn" data-act="howTo">How to Play</button>
    </div>
    <div class="meta-line">
      <span>◆ ${meta.data} DATA</span>
      <span>RUNS ${meta.runs}</span>
      <span>WINS ${meta.wins}</span>
      <span>BEST SECTOR ${Math.min(meta.bestSector + 1, SECTORS.length)}${meta.wins ? ' ✓' : ''}</span>
    </div>
  </div>`;
}

export function keyboardNoticeScreen() {
  return `
  <div class="panel narrow center">
    <h2>Keyboard Required</h2>
    <p class="flavor">Nyoomies is played with a keyboard for now. Open this page on a Mac, Windows or Linux computer — touch controls are coming later.</p>
    <p class="muted">Using an iPad with a keyboard attached? You're good to go.</p>
    <div class="menu"><button class="btn primary" data-act="continue">I have a keyboard</button></div>
  </div>`;
}

export function howToScreen() {
  return `
  <div class="panel narrow">
    <h2>How to Play</h2>
    <div class="howto">
      <div><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd><span>Steer</span></div>
      <div><kbd>↑</kbd> / <kbd>W</kbd><span>Full throttle (otherwise you cruise)</span></div>
      <div><kbd>↓</kbd> / <kbd>S</kbd><span>Brake</span></div>
      <div><kbd>Space</kbd> / <kbd>Shift</kbd><span>Boost (drains the boost meter)</span></div>
      <div><kbd>E</kbd><span>Use your ability</span></div>
      <div><kbd>Esc</kbd><span>Pause</span> <kbd>M</kbd><span>Mute</span></div>
    </div>
    <h3>The Grid</h3>
    <ul class="rules">
      <li>Every racer leaves a <b>lethal light wall</b>. Touch one — anyone's, even your own — and you <b>derez</b>, costing <b>1 hull</b>. Your emergency shield absorbs the first crash each race.</li>
      <li><b>Wake grinding:</b> ride close alongside walls and obstacles to recharge boost and gain speed. The closer, the better — and the deadlier.</li>
      <li>Circuits: pass every <b>gate</b> in order for 3 laps. Finish on the podium or take 2 hull damage.</li>
      <li>Derez Arenas: no gates. Survive 60 seconds and cut rivals off with your wall for bounties.</li>
      <li><b>?</b> cubes give boost, credits, overdrive or repairs. Green chevrons are boost pads.</li>
      <li>Hull carries across the whole run (your pit crew patches 2 after each race). Reach 0 and the run is over. Beat 3 sector bosses to win.</li>
      <li>Runs earn <b>◆ Data</b> that unlocks new chassis.</li>
    </ul>
    <div class="menu"><button class="btn primary" data-act="back">Back</button></div>
  </div>`;
}

export function selectScreen(meta, selected, seed) {
  const cards = CHASSIS.map((c) => {
    const s = chassisStats(c);
    const unlocked = meta.unlocked.includes(c.id);
    const ab = ABILITIES[c.ability];
    const sel = selected === c.id;
    const action = unlocked
      ? `data-act="pick" data-arg="${c.id}"`
      : meta.data >= c.cost ? `data-act="unlock" data-arg="${c.id}"` : '';
    return `<button class="card chassis-card ${sel ? 'selected' : ''} ${unlocked ? '' : 'locked'}" style="--c:${c.color}" ${action}>
      <canvas class="ship-preview" data-shape="${c.shape}" data-color="${c.color}" width="160" height="80"></canvas>
      <h3>${esc(c.name)}</h3>
      <p class="small">${esc(c.tagline)}</p>
      ${statBar('Speed', s.topSpeed, 340, 540)}
      ${statBar('Handling', s.turnRate, 2.2, 4.4)}
      ${statBar('Hull', s.maxHull, 5, 15)}
      ${statBar('Boost', s.boostMax * (1 + s.boostPower), 100, 230)}
      ${statBar('Wall', s.trailLength, 700, 2100)}
      <div class="trait">${esc(c.trait)}</div>
      <div class="ability-line">${ab.icon} ${esc(ab.name)}<span class="small muted"> — ${esc(ab.desc)}</span></div>
      ${unlocked ? '' : `<div class="lock">${meta.data >= c.cost ? `UNLOCK FOR ◆ ${c.cost}` : `LOCKED · ◆ ${c.cost}`}</div>`}
    </button>`;
  }).join('');
  return `
  <h2 class="screen-title">Choose Your Ride</h2>
  <div class="muted center">◆ ${meta.data} Data available</div>
  <div class="chassis-grid">${cards}</div>
  <div class="start-row">
    <label class="seed">Seed <input id="seed-input" maxlength="12" value="${esc(seed)}" spellcheck="false"></label>
    <button class="btn" data-act="back">Back</button>
    <button class="btn primary" data-act="start" ${selected ? '' : 'disabled'}>Launch</button>
  </div>`;
}

export function mapScreen(run) {
  const def = SECTORS[run.sector];
  const cols = run.map.map((row, r) => {
    const isBossRow = r === run.map.length - 1;
    const nodes = row.map((node, i) => {
      const t = NODE_TYPES[node.type];
      const current = r === run.row;
      const cls = node.done ? 'done' : current ? 'current' : r < run.row ? 'skipped' : 'future';
      const label = isBossRow ? def.boss.name : t.label;
      const act = current ? `data-act="enter" data-arg="${i}"` : '';
      return `<button class="node node-${node.type} ${cls}" ${act} title="${esc(t.desc)}">
        <span class="icon">${t.icon}</span>
        <span class="label">${esc(label)}</span>
        ${current ? `<span class="desc">${esc(isBossRow ? `${def.boss.title}. ${t.desc}` : t.desc)}</span>` : ''}
      </button>`;
    }).join('');
    return `<div class="map-col">${nodes}</div>`;
  }).join('<div class="map-link"></div>');

  return `
  <div class="map-layout">
    <div class="map-main">
      <div class="sector-head" style="--c:${def.theme.accent}">
        <div class="muted">SECTOR ${run.sector + 1} / ${SECTORS.length}</div>
        <h2>${esc(def.name)}</h2>
      </div>
      <div class="map" style="--c:${def.theme.accent}">${cols}</div>
      <div class="muted center small">Choose your next destination.</div>
    </div>
    ${runPanel(run)}
  </div>
  <div class="corner"><button class="btn small-btn" data-act="abandon">Abandon Run</button></div>`;
}

export function resultsScreen(run, node, result, summary) {
  let title;
  let cls = 'good';
  if (result.dead) { title = 'DEREZZED'; cls = 'bad'; }
  else if (node.type === 'arena') title = result.reason === 'cleared' ? 'ARENA CLEARED' : 'SURVIVED';
  else {
    title = `${ordinal(result.place)} PLACE`;
    if (node.type === 'boss' ? result.place !== 1 : result.place > 3) cls = 'bad';
  }
  const rows = result.standings.map((s) => {
    const status = node.type === 'arena'
      ? (s.isPlayer ? (result.dead ? 'DEREZZED' : 'ALIVE') : s.out ? 'OUT' : 'ALIVE')
      : s.finished ? formatTime(s.time) : (s.isPlayer && result.dead ? 'DEREZZED' : '—');
    return `<tr class="${s.isPlayer ? 'me' : ''}">
      <td>${node.type === 'arena' ? '' : s.place}</td>
      <td style="color:${s.color}">${s.isBoss ? '♛ ' : ''}${esc(s.isPlayer ? 'YOU' : s.name)}</td>
      <td>${status}</td>
      <td>${s.derezzes ? `${s.derezzes} ✕` : ''}</td>
    </tr>`;
  }).join('');
  const lines = summary.lines.map(([text, c]) => `<li class="${c}">${esc(text)}</li>`).join('');
  return `
  <div class="panel narrow">
    <h2 class="result-title ${cls}">${title}</h2>
    <table class="standings">${rows}</table>
    <ul class="summary">${lines}</ul>
    <div class="rp-row center-row"><label>Hull</label>${hullBar(run.hull, run.maxHull)}<b>${run.hull}/${run.maxHull}</b><label>Credits</label><b class="gold">¢ ${run.credits}</b></div>
    <div class="menu"><button class="btn primary" data-act="continue">Continue</button></div>
  </div>`;
}

export function draftScreen(run, options, skipCredits) {
  const cards = options.map((m) => modCard(m, { act: 'take', arg: m.id })).join('');
  return `
  <h2 class="screen-title">Salvage an Upgrade</h2>
  <div class="muted center">Pick one mod to install. It lasts for the rest of the run.</div>
  <div class="card-row">${cards}</div>
  <div class="menu"><button class="btn" data-act="skip">Skip (+${skipCredits} credits)</button></div>
  ${runPanel(run)}`;
}

export function shopScreen(run, shop) {
  const mods = shop.mods.map((item, i) => modCard(item.mod, {
    act: item.sold ? '' : 'buyMod',
    arg: i,
    disabled: item.sold || run.credits < item.price,
    footer: `<div class="price">${item.sold ? 'SOLD' : `¢ ${item.price}`}</div>`,
  })).join('');
  const abilities = shop.abilities.map((item, i) => {
    const ab = ABILITIES[item.id];
    const disabled = item.sold || run.credits < item.price;
    return `<button class="card ability-card ${disabled ? 'disabled' : ''}" ${item.sold ? '' : `data-act="buyAbility" data-arg="${i}"`}>
      <div class="rarity">Ability Core</div>
      <h3>${ab.icon} ${esc(ab.name)}</h3>
      <p>${esc(ab.desc)}</p>
      <p class="small muted">Replaces ${esc(ABILITIES[run.abilityId].name)} · ${ab.cooldown}s cooldown</p>
      <div class="price">${item.sold ? 'INSTALLED' : `¢ ${item.price}`}</div>
    </button>`;
  }).join('');
  const full = run.hull >= run.maxHull;
  return `
  <h2 class="screen-title">Black Market</h2>
  <div class="muted center">"No refunds. No questions. No warranty."</div>
  <div class="shop-layout">
    <div>
      <h3 class="section">Mods</h3>
      <div class="card-row wrap">${mods}</div>
      <h3 class="section">Ability Cores</h3>
      <div class="card-row wrap">${abilities}</div>
      <div class="menu">
        <button class="btn" data-act="repair" ${full || run.credits < shop.repairPrice ? 'disabled' : ''}>Repair 3 Hull · ¢ ${shop.repairPrice}</button>
        <button class="btn" data-act="reroll" ${run.credits < shop.rerollPrice ? 'disabled' : ''}>Reroll Mods · ¢ ${shop.rerollPrice}</button>
        <button class="btn primary" data-act="leave">Leave</button>
      </div>
    </div>
    ${runPanel(run)}
  </div>`;
}

export function eventScreen(run, event, outcome) {
  const body = outcome
    ? `<ul class="summary">${outcome.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
       <div class="menu"><button class="btn primary" data-act="continue">Continue</button></div>`
    : `<div class="choices">${event.choices.map((c, i) => {
        const cantAfford = c.effect.cost && run.credits < c.effect.cost;
        return `<button class="choice ${cantAfford ? 'disabled' : ''}" data-act="choose" data-arg="${i}">
          <b>${esc(c.label)}</b><span>${esc(c.detail)}</span></button>`;
      }).join('')}</div>`;
  return `
  <div class="event-layout">
    <div class="panel narrow event">
      <div class="muted">ANOMALY DETECTED</div>
      <h2>${esc(event.title)}</h2>
      <p class="flavor">${esc(event.text)}</p>
      ${body}
    </div>
    ${runPanel(run)}
  </div>`;
}

export function endScreen(run, earned, meta) {
  const s = run.stats;
  const won = run.won;
  return `
  <div class="panel narrow">
    <h2 class="result-title ${won ? 'good' : 'bad'}">${won ? 'GRID CHAMPION' : 'END OF LINE'}</h2>
    <p class="center flavor">${won ? 'All three sectors conquered. The grid bows to you.' : `Derezzed in Sector ${run.sector + 1}: ${esc(SECTORS[run.sector].name)}.`}</p>
    <table class="standings stats">
      <tr><td>Chassis</td><td>${esc(run.chassis.name)}</td></tr>
      <tr><td>Nodes cleared</td><td>${s.nodes}</td></tr>
      <tr><td>Races / podiums / wins</td><td>${s.races} / ${s.podiums} / ${s.wins}</td></tr>
      <tr><td>Bosses defeated</td><td>${s.bosses}</td></tr>
      <tr><td>Rivals derezzed</td><td>${s.derezzes}</td></tr>
      <tr><td>Mods installed</td><td>${run.mods.length}</td></tr>
      <tr><td>Seed</td><td>${esc(run.seedString)}</td></tr>
    </table>
    <div class="earned">+ ◆ ${earned} DATA <span class="muted">(total ${meta.data})</span></div>
    <div class="menu"><button class="btn primary" data-act="title">Back to Title</button></div>
  </div>`;
}

export function pauseScreen() {
  return `
  <div class="panel narrow center">
    <h2>Paused</h2>
    <div class="menu column">
      <button class="btn primary" data-act="resume">Resume</button>
      <button class="btn" data-act="howTo">Controls</button>
      <button class="btn danger" data-act="abandon">Abandon Run</button>
    </div>
  </div>`;
}

import { RNG } from './rng.js';
import { CHASSIS_BY_ID, chassisStats } from './data/vehicles.js';
import { MOD_BY_ID, RARITY, applyMods, draftableMods, rollMods } from './data/mods.js';
import { ABILITY_IDS } from './data/abilities.js';
import { SECTORS, EVENTS, FIRST_EVENT, ZAPS } from './data/sectors.js';

export const ROWS_PER_SECTOR = 4;
export const PODIUM_DAMAGE = 2;
export const BOSS_DAMAGE = 3;
export const PIT_REPAIR = 2;
const PLACE_CREDITS = [60, 42, 28, 14, 8, 4];

// A single roguelike run: chassis, mods, hull, credits and the sector maps.
export class Run {
  constructor({ seed, chassisId }) {
    this.seedString = seed;
    this.rng = new RNG(seed);
    this.chassisId = chassisId;
    this.chassis = CHASSIS_BY_ID[chassisId];
    this.abilityId = this.chassis.ability;
    this.mods = [];
    this.credits = 25;
    this.sector = 0;
    this.row = 0;
    this.failsafeUsed = false;
    this.seenEvents = [];
    this.over = false;
    this.won = false;
    this.stats = { races: 0, podiums: 0, wins: 0, takedowns: 0, crashes: 0, bosses: 0, nodes: 0 };
    this.maps = SECTORS.map((_, i) => generateSectorMap(this.rng.fork(), i));
    this.hull = this.computeStats().maxHull;
  }

  computeStats() {
    return applyMods(chassisStats(this.chassis), this.mods);
  }

  get maxHull() {
    return this.computeStats().maxHull;
  }

  get map() {
    return this.maps[this.sector];
  }

  currentChoices() {
    return this.map[this.row] || [];
  }

  addMod(id) {
    const mod = MOD_BY_ID[id];
    if (!mod) return;
    this.mods.push(id);
    if (mod.heal) this.hull += mod.heal;
    this.clampHull();
  }

  clampHull() {
    this.hull = Math.min(this.hull, this.maxHull);
  }

  repair(n) {
    this.hull = Math.min(this.maxHull, this.hull + n);
  }

  damage(n) {
    this.hull -= n;
    if (this.hull <= 0) {
      if (this.computeStats().flags.failsafe && !this.failsafeUsed) {
        this.failsafeUsed = true;
        this.hull = 3;
        return 'failsafe';
      }
      this.hull = 0;
      this.over = true;
      return 'dead';
    }
    return 'ok';
  }

  modCounts() {
    const counts = new Map();
    for (const id of this.mods) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts.entries()].map(([id, n]) => ({ mod: MOD_BY_ID[id], n }));
  }

  // Configuration for a race node; consumed by the Race constructor.
  raceConfig(node, playerShape, playerColor) {
    return {
      rng: this.rng.fork(),
      mode: node.type === 'race' ? 'race' : node.type,
      sector: this.sector,
      laps: node.type === 'arena' ? 0 : 3,
      extraSkill: this.row * 0.02,
      ally: !!node.ally,
      player: {
        stats: this.computeStats(),
        hull: this.hull,
        abilityId: this.abilityId,
        shape: playerShape,
        color: playerColor,
        failsafeUsed: this.failsafeUsed,
      },
    };
  }

  // Applies a race result to the run and returns a summary for the UI.
  applyRaceResult(node, result) {
    const s = this.computeStats();
    const summary = { lines: [], credits: 0, damage: 0, success: true, draft: null, dead: false, retryBoss: false };
    this.hull = Math.min(result.hull, this.maxHull);
    if (result.failsafeUsed) this.failsafeUsed = true;
    this.stats.races++;
    this.stats.takedowns += result.takedowns;
    this.stats.crashes += result.hullLost;

    if (result.dead) {
      this.hull = 0;
      this.over = true;
      summary.dead = true;
      summary.success = false;
      summary.lines.push(['Hull integrity lost. Your racer shattered.', 'bad']);
      return summary;
    }

    if (this.hull < this.maxHull) {
      const before = this.hull;
      this.repair(PIT_REPAIR);
      summary.lines.push([`Pit crew patched ${this.hull - before} hull`, 'good']);
    }

    if (result.creditsEarned) {
      summary.credits += result.creditsEarned;
      summary.lines.push([`Pickups & bounties: +${result.creditsEarned} credits`, 'good']);
    }

    if (node.type === 'arena') {
      const bounty = Math.round(result.takedowns * 18 * s.creditMult);
      const surviveBonus = Math.round((result.reason === 'cleared' ? 45 : 25) * s.creditMult);
      summary.credits += bounty + surviveBonus;
      summary.lines.push([`Shattered ${result.takedowns} rival${result.takedowns === 1 ? '' : 's'}: +${bounty} credits`, 'good']);
      summary.lines.push([result.reason === 'cleared' ? `Pit cleared: +${surviveBonus}` : `Survived: +${surviveBonus}`, 'good']);
      summary.draft = { count: 3, bias: 0.15 + result.takedowns * 0.08 };
    } else {
      const place = result.place;
      const base = PLACE_CREDITS[place - 1] || 0;
      const mult = node.type === 'elite' ? 1.5 : node.type === 'boss' ? 2 : 1;
      const prize = Math.round(base * mult * s.creditMult);
      summary.credits += prize;
      summary.lines.push([`Finished ${ordinal(place)}: +${prize} credits`, place <= 3 ? 'good' : 'bad']);
      if (place <= 3) this.stats.podiums++;
      if (place === 1) this.stats.wins++;

      if (node.type === 'boss') {
        if (place === 1) {
          this.stats.bosses++;
          summary.lines.push([`${SECTORS[this.sector].boss.name} left in your wake!`, 'good']);
          summary.lines.push(['Sector escape: hull repaired by 4', 'good']);
          this.repair(4);
          summary.draft = { count: 3, bias: 0.9 };
        } else {
          summary.success = false;
          summary.retryBoss = true;
          summary.damage = BOSS_DAMAGE;
          summary.lines.push([`The boss must be beaten outright. -${BOSS_DAMAGE} hull.`, 'bad']);
        }
      } else {
        if (place > 3) {
          summary.damage = PODIUM_DAMAGE;
          summary.lines.push([`Missed the podium: -${PODIUM_DAMAGE} hull`, 'bad']);
        }
        const bias = (node.type === 'elite' ? 0.45 : 0.05) + (place === 1 ? 0.25 : place <= 3 ? 0.1 : 0);
        summary.draft = { count: 3, bias };
      }
    }

    this.credits += summary.credits;
    if (summary.damage) {
      const outcome = this.damage(summary.damage);
      if (outcome === 'dead') {
        summary.dead = true;
        summary.draft = null;
        summary.lines.push(['Your chassis falls apart.', 'bad']);
      } else if (outcome === 'failsafe') {
        summary.lines.push(['Failsafe Protocol engaged! Restored to 3 hull.', 'good']);
      }
    }
    if (summary.draft) summary.draft.options = rollMods(this.rng, this.mods, summary.draft.count, summary.draft.bias);
    return summary;
  }

  // Advances past the node just completed. Returns 'map', 'victory'.
  advance(node) {
    this.stats.nodes++;
    if (node.type === 'boss') {
      if (this.sector === SECTORS.length - 1) {
        this.won = true;
        this.over = true;
        return 'victory';
      }
      this.sector++;
      this.row = 0;
      return 'map';
    }
    node.done = true;
    this.row++;
    return 'map';
  }

  // ---------------------------------------------------------------- shop

  modPrice(mod) {
    return Math.round(RARITY[mod.rarity].price * (1 + this.sector * 0.15));
  }

  rollShopMods() {
    return rollMods(this.rng, this.mods, 4, 0.25).map((m) => ({ kind: 'mod', mod: m, price: this.modPrice(m), sold: false }));
  }

  makeShop() {
    const mods = this.rollShopMods();
    const otherAbilities = this.rng.shuffle(ABILITY_IDS.filter((a) => a !== this.abilityId)).slice(0, 2);
    return {
      mods,
      abilities: otherAbilities.map((id) => ({ kind: 'ability', id, price: 55, sold: false })),
      greeting: this.rng.pick(ZAPS.greetings),
      repairPrice: 25 + this.sector * 5,
      rerollPrice: 15,
    };
  }

  // ---------------------------------------------------------------- events

  rollEvent() {
    if (!this.seenEvents.includes(FIRST_EVENT)) {
      this.seenEvents.push(FIRST_EVENT);
      return EVENTS.find((e) => e.id === FIRST_EVENT);
    }
    const fresh = EVENTS.filter((e) => !this.seenEvents.includes(e.id));
    const event = this.rng.pick(fresh.length ? fresh : EVENTS);
    this.seenEvents.push(event.id);
    return event;
  }

  resolveEvent(effect) {
    const log = [];
    if (effect.cost) {
      if (this.credits < effect.cost) return { ok: false, log: ['Not enough credits.'] };
      this.credits -= effect.cost;
      log.push(`-${effect.cost} credits`);
    }
    const grant = (rarity) => {
      const pool = draftableMods(this.mods).filter((m) => m.rarity === rarity);
      if (!pool.length) return;
      const m = this.rng.pick(pool);
      this.addMod(m.id);
      log.push(`Gained ${m.name}`);
    };
    if (effect.epicMod) grant('epic');
    if (effect.rareMod) grant('rare');
    if (effect.commonMod) grant('common');
    if (effect.mod) {
      this.addMod(effect.mod);
      log.push(`Gained ${MOD_BY_ID[effect.mod].name}`);
    }
    if (effect.curse) {
      this.addMod(effect.curse);
      log.push(`Cursed: ${MOD_BY_ID[effect.curse].name}`);
    }
    if (effect.credits) {
      this.credits += effect.credits;
      log.push(`+${effect.credits} credits`);
    }
    if (effect.fullRepair) {
      this.hull = this.maxHull;
      log.push('Hull fully repaired');
    }
    if (effect.repair) {
      this.repair(effect.repair);
      log.push(`Repaired ${effect.repair} hull`);
    }
    if (effect.damage) {
      this.damage(effect.damage);
      log.push(`-${effect.damage} hull`);
    }
    if (effect.gamble) {
      if (this.rng.chance(0.6)) {
        this.addMod('overclock');
        this.addMod('overclock');
        log.push('The reactor holds! Gained 2× Overclocked Core');
      } else {
        this.damage(3);
        log.push('The reactor blows. -3 hull');
      }
    }
    if (effect.swapAbility) {
      const next = this.rng.pick(ABILITY_IDS.filter((a) => a !== this.abilityId));
      this.abilityId = next;
      log.push(`Ability swapped to ${next.toUpperCase()}`);
    }
    this.clampHull();
    if (!log.length) log.push('You move on.');
    return { ok: true, log };
  }

  // Mirror shards (meta currency) earned when the run ends.
  shardsEarned() {
    const st = this.stats;
    return st.nodes * 2 + st.bosses * 15 + st.podiums * 2 + st.takedowns + (this.won ? 40 : 0);
  }
}

export function generateSectorMap(rng, sector) {
  const rows = [];
  const weights = { race: 40, elite: 12, arena: 18, shop: 15, event: 15 };
  for (let r = 0; r < ROWS_PER_SECTOR; r++) {
    let types;
    if (r === 0) {
      types = rng.chance(0.5) ? ['race', 'arena'] : ['race', 'race'];
    } else {
      const count = rng.int(2, 3);
      types = [];
      for (let tries = 0; types.length < count && tries < 30; tries++) {
        const t = rng.weighted(Object.keys(weights), (k) => (k === 'elite' && r === 1 && sector === 0 ? 0 : weights[k]));
        if (!types.includes(t) || (t === 'race' && types.filter((x) => x === 'race').length < 2)) types.push(t);
      }
      // A shop is always reachable right before the boss.
      if (r === ROWS_PER_SECTOR - 1 && !types.includes('shop')) types[types.length - 1] = 'shop';
    }
    // Zaps rides along in some circuits.
    rows.push(types.map((type) => ({ type, done: false, ally: type === 'race' && rng.chance(0.3) })));
  }
  // ...and always backs you up against JUPITER.
  rows.push([{ type: 'boss', done: false, ally: true }]);
  return rows;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

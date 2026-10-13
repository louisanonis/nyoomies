// Headless balance check: runs AI-driven races and prints outcome stats.
import { Race, STEP } from '../src/race.js';
import { RNG } from '../src/rng.js';
import { CHASSIS_BY_ID, chassisStats } from '../src/data/vehicles.js';

const races = Number(process.argv[2] || 6);
const modes = ['race', 'elite', 'boss', 'arena'];
for (const mode of modes) {
  for (let sector = 0; sector < 3; sector++) {
    let totalTime = 0, playerCrashes = 0, aiCrashes = 0, places = [], unfinished = 0;
    for (let i = 0; i < races; i++) {
      const rng = new RNG(`sim-${mode}-${sector}-${i}`);
      const ch = CHASSIS_BY_ID[i % 2 ? 'twinhull' : 'glint'];
      const stats = chassisStats(ch);
      const race = new Race({
        rng, mode, sector, laps: 3, autopilot: true,
        player: { stats, hull: 99, abilityId: ch.ability, shape: ch.shape, color: ch.color },
      });
      let t = 0;
      while (!race.over && t < 300) { race.update(STEP); t += STEP; race.events.length = 0; }
      if (!race.over) unfinished++;
      totalTime += race.time;
      playerCrashes += race.player.crashes;
      aiCrashes += race.racers.filter(r => !r.isPlayer).reduce((a, r) => a + r.crashes, 0);
      places.push(race.result ? race.result.place : '-');
    }
    console.log(`${mode.padEnd(6)} s${sector + 1}  avgTime ${(totalTime / races).toFixed(1)}s  playerCrashes/race ${(playerCrashes / races).toFixed(1)}  aiCrashes/race ${(aiCrashes / races).toFixed(1)}  places ${places.join(',')}  unfinished ${unfinished}`);
  }
}

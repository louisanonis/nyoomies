// Headless roguelike-run simulator: an autopilot plays whole runs so we can
// tune hull/damage economy. Usage: node scripts/runsim.js [runs] [skill]
import { Race, STEP } from '../src/race.js';
import { Run } from '../src/run.js';
import { makeAI } from '../src/ai.js';

const runs = Number(process.argv[2] || 10);
const skill = Number(process.argv[3] || 0.85);
const chassisList = ['cycle', 'pod'];
let totalNodes = 0, wins = 0;
const reach = [0, 0, 0, 0];
for (let i = 0; i < runs; i++) {
  const run = new Run({ seed: `RS${i}`, chassisId: chassisList[i % 2] });
  let crashes = 0, races = 0;
  while (!run.over) {
    const choices = run.currentChoices();
    const node = choices.find((n) => !['shop', 'event'].includes(n.type)) || choices[0];
    if (node.type === 'shop' || node.type === 'event') {
      if (node.type === 'shop' && run.credits >= 30 && run.hull < run.maxHull) { run.credits -= 30; run.repair(3); }
      run.advance(node);
      continue;
    }
    const cfg = run.raceConfig(node, run.chassis.shape, run.chassis.color);
    const race = new Race(cfg);
    race.player.ai = makeAI(race.rng, skill);
    let t = 0;
    while (!race.over && t < 400) { race.update(STEP); t += STEP; race.events.length = 0; }
    crashes += race.hullLost; races++;
    const sum = run.applyRaceResult(node, race.result);
    if (sum.dead) break;
    if (sum.draft) run.addMod(sum.draft.options[0].id);
    if (!sum.retryBoss && run.advance(node) === 'victory') break;
  }
  totalNodes += run.stats.nodes;
  if (run.won) wins++;
  reach[run.won ? 3 : run.sector]++;
  console.log(`run ${i} ${run.chassisId.padEnd(6)} sector ${run.sector + 1} nodes ${run.stats.nodes} races ${races} crashes/race ${(crashes / races).toFixed(1)} podiums ${run.stats.podiums} ${run.won ? 'WON' : 'dead'}`);
}
console.log(`avg nodes ${(totalNodes / runs).toFixed(1)}  wins ${wins}/${runs}  died in sector [1,2,3,won] = ${reach.join(',')}`);

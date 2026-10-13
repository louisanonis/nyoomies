# Nyoomies

A roguelike light-cycle racer for the browser. Think futuristic racing: you race on a neon grid against AI rivals, and every racer leaves a **lethal light wall** behind it. Each run is a fresh, seeded climb through three sectors. You draft upgrades, trade at the Black Market, risk strange anomalies and race sector bosses. Your hull carries over between races.

There's no build step and there are no dependencies: plain JavaScript modules and Canvas 2D.

## Play

```bash
npm start          # serves the game at http://localhost:8080
```

You can serve the folder with any static file server instead. ES modules need http://, so opening `index.html` directly as `file://` won't work.

### Controls

| Key | Action |
| --- | --- |
| `←` `→` / `A` `D` | Steer |
| `↑` / `W` | Full throttle (otherwise you cruise at ~80%) |
| `↓` / `S` | Brake |
| `Space` / `Shift` | Boost |
| `E` | Use ability |
| `Esc` / `P` | Pause |
| `M` | Mute |

## How it plays

### Racing
- **Light walls:** every vehicle trails a solid wall of light. Touch any wall, including your own, and you **derez**: you lose 1 hull and respawn at the last gate you passed.
- **Emergency shield:** each chassis absorbs its first crash every race. The Juggernaut absorbs two.
- **Wake grinding:** riding close alongside walls and obstacles refills boost and adds speed. The closer you ride, the bigger the payoff and the deadlier it gets.
- **Circuits:** pass every checkpoint gate in order for 3 laps.
- **Derez Arenas:** there are no gates. Survive 60 seconds and cut rivals off with your wall to collect bounties.
- **Track features:** **?** cubes randomly give boost, credits, overdrive or repairs. Green chevron pads give you a speed burst.

### The run
- **Structure:** three sectors (*The Grid*, *Dune Sea Circuit*, *Kernel Core*). Each one is a branching map of 4 rows of choices followed by a **boss**.
- **Node types:** Circuit, Elite Circuit, Derez Arena, Black Market (shop) and Anomaly (event).
- **Hull:** carries across the whole run.
  - Missing the podium costs 2 hull.
  - Losing to a boss costs 3, and you have to race it again.
  - Your pit crew repairs 2 hull after every race.
  - At 0 hull the run is over.
- **Upgrades:** after each race you **draft 1 of 3 mods**. Elite races, wins and bosses bias the draft toward rare and epic mods.
- **Meta progression:** finished runs earn **◆ Data**, which persists in `localStorage` and unlocks new chassis.
- **Seeds:** every run has a seed. Type one on the vehicle select screen to replay a specific map.

### Vehicles

| Chassis | Style | Trait | Ability | Unlock |
| --- | --- | --- | --- | --- |
| Light Cycle | Balanced | Grid Runner: wake grinding is 60% stronger | Turbo Surge | Free |
| Twin-Engine Pod | Pod racer: fastest, poor handling | Afterburners: bigger, stronger boost | EMP Pulse | Free |
| Interceptor | Agile glass needle | Hair Trigger: abilities recharge 30% faster | Derez Missile | ◆ 40 |
| Juggernaut | Armored, huge wall | Reinforced: extra emergency shield | Barrier Drop | ◆ 60 |
| Wraith | Experimental | Ethereal: passes through its own wall | Phase Shift | ◆ 100 |

### Abilities
Turbo Surge, EMP Pulse, Derez Missile (homing), Phase Shift (intangible to walls), Barrier Drop (deployable wall), Blink Drive (short teleport). You can swap ability cores at the Black Market or through anomalies.

### Mods (selection)
- **Common:** Overclocked Core, Gyro Stabilizer, Boost Capacitor, Long Wake, Magnet Coil, Hull Plating…
- **Rare:** Slipstream Rig, Phase Shield, Afterburner, Razor Wake (bounties for walling rivals), Gate Resonator, Nitro Cells…
- **Epic:** Ghost Protocol (immune to your own wall), Jump Jets (boost to hop walls), Twin Core (2 ability charges), Failsafe Protocol (cheat death once), Glass Cannon…
- **Cursed:** these only come from anomalies, as the price of their rewards.

All mod definitions are in [`src/data/mods.js`](src/data/mods.js). Each mod is just a function that edits the stats object, so adding new ones is easy.

## Project layout

```
index.html, style.css      page shell and UI styling
src/main.js                game controller: screens, loop, input → race
src/race.js                race simulation (physics, walls, gates, abilities, pickups)
src/ai.js                  rival AI (context steering with raycast whiskers)
src/track.js               procedural circuits and arenas
src/run.js                 roguelike run: maps, rewards, shop, events, hull economy
src/render.js              canvas renderer + HUD
src/ui.js                  DOM menu screens
src/meta.js                persistent unlocks
src/audio.js               synthesized WebAudio sound effects
src/data/*.js              vehicles, mods, abilities, sectors and events
```

`Race` is a pure simulation with no DOM access, so it runs headless in Node for tests and balancing.

## Development

```bash
npm test                   # unit + headless race tests (node:test)
npm run sim                # per-mode race stats (time, crash rates, placings)
node scripts/runsim.js 10 0.85   # autopilot plays 10 full runs at AI skill 0.85
```

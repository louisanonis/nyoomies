# Hull Bracers

A roguelike neon racer for the browser. You race against parolees and corrupt police in a mirrored underground, and every racer drags a **lethal neon wake** behind it. Each run is a fresh, seeded climb through three sectors toward the surface. You draft upgrades, trade at Zaps' Garage, risk anomalies and outrace JUPITER officers. Your hull carries over between races.

There's no build step and there are no dependencies: plain JavaScript modules and Canvas 2D.

## Story

You arrive from a mirrored plane. What was once the material world is now a black void, its skyline painted in white and blue neon. You have no idea how you got here, but you know one thing: you have to get out. The only road out of the underground is a series of races. What's above ground? Nobody down here knows.

- **Nefer**, your guide: a small snake-shaped robot that rides your shoulder and coils around your wrist as a bionic bracelet while you race. Every racer needs a **bracer** like Nefer to link to a vehicle. In game, Nefer narrates the intro and gives one-time tips the first time you meet something new.
- **JUPITER**, the authorities: a crew of corrupt police convinced you're a parolee who skipped out. You're not that person. Your crime is worse: you don't belong in this world at all. Each sector ends with a JUPITER officer of rising rank: Sgt. Haldane, then Capt. Voss, then Cmdr. Orrin.
- **Zaps**, the ally: the first person who understood why you talk differently, because they share your story. They dropped into this world after touching a strange lamp. Zaps runs the garage (shop), appears in story events, and races alongside you against every JUPITER officer and in some circuits. Zaps' wake can't hurt you, and Zaps doesn't count against your placing.
- **Rivals:** parolees racing to work off their JUPITER sentences.

Beating the final officer ends on a cliffhanger, to be continued.

## Play

```bash
npm start          # serves the game at http://localhost:8080
```

You can serve the folder with any static file server instead. ES modules need http://, so opening `index.html` directly as `file://` won't work (the page explains this if you try).

The game runs in current Chrome, Edge, Firefox and Safari (16+) on macOS, Windows and Linux. It's keyboard-only for now; touch-only devices see a notice.

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
- **Wakes:** every vehicle drags a solid neon wake. Touch any wake, including your own, and your racer **shatters**: you lose 1 hull and re-form at the last gate you passed.
- **Emergency shield:** each racer absorbs its first crash every race. The Bulwark absorbs two.
- **Wake grinding:** riding close alongside wakes and walls refills boost and adds speed. The closer you ride, the bigger the payoff and the deadlier it gets.
- **Circuits:** pass every checkpoint gate in order for 3 laps.
- **Shatter Pits:** there are no gates. Survive 60 seconds and cut rivals off with your wake to collect bounties.
- **Track features:** **?** cubes randomly give boost, credits, overdrive or repairs. Green chevron pads give you a speed burst.

### The run
- **Structure:** three sectors (*The Mirror Void*, *The Undercity*, *The Ascent*). Each one is a branching map of 4 rows of choices ending at a **JUPITER** officer. The palette starts in black, white and blue and bleeds into JUPITER red as you climb.
- **Node types:** Circuit, Elite Circuit, Shatter Pit, Zaps' Garage (shop) and Anomaly (event). The first anomaly of every run is Zaps' lamp story. Nodes marked **+ ZAPS** mean Zaps races with you.
- **Hull:** carries across the whole run.
  - Missing the podium costs 2 hull.
  - Losing to a JUPITER officer costs 3, and you have to race them again.
  - Your hull is patched by 2 after every race.
  - At 0 hull the run is over.
- **Upgrades:** after each race you **draft 1 of 3 mods**. Elite races, wins and JUPITER wins bias the draft toward rare and epic mods.
- **Meta progression:** finished runs earn **◆ Mirror Shards**, which persist in `localStorage` and unlock new racers.
- **Seeds:** every run has a seed. Type one on the racer select screen to replay a specific map.

### Racers

| Racer | Style | Trait | Ability | Unlock |
| --- | --- | --- | --- | --- |
| Glint | Balanced | Wake Rider: wake grinding is 60% stronger | Turbo Surge | Free |
| Twinhull | Fastest, poor handling | Afterburners: bigger, stronger boost | EMP Pulse | Free |
| Needle | Agile, fragile | Hair Trigger: abilities recharge 30% faster | Seeker Spike | ◆ 40 |
| Bulwark | Ex-JUPITER riot sled, huge wake | Reinforced: extra emergency shield | Barrier Drop | ◆ 60 |
| Echo | Built from the mirror | Reflection: passes through its own wake | Phase Shift | ◆ 100 |

### Abilities
Turbo Surge, EMP Pulse, Seeker Spike (homing), Phase Shift (intangible to wakes), Barrier Drop (deployable barrier), Blink Drive (short teleport). You can swap ability cores at Zaps' Garage or through anomalies.

### Mods (selection)
- **Common:** Overclocked Core, Gyro Stabilizer, Boost Capacitor, Long Wake, Magnet Coil, Hull Plating…
- **Rare:** Slipstream Rig, Phase Shield, Afterburner, Razor Wake (bounties for walling rivals in), Gate Resonator, Nitro Cells…
- **Epic:** Ghost Protocol (immune to your own wake), Jump Jets (boost to hop wakes), Twin Core (2 ability charges), Failsafe Protocol (cheat death once), Glass Cannon…
- **Cursed:** these only come from anomalies, as the price of their rewards.

All mod definitions are in [`src/data/mods.js`](src/data/mods.js). Each mod is just a function that edits the stats object, so adding new ones is easy.

## Project layout

```
index.html, style.css      page shell and UI styling
src/main.js                game controller: screens, loop, input → race
src/race.js                race simulation (physics, wakes, gates, abilities, pickups, Zaps)
src/ai.js                  rival AI (context steering with raycast whiskers)
src/track.js               procedural circuits and Shatter Pits
src/run.js                 roguelike run: maps, rewards, garage, events, hull economy
src/nefer.js               Nefer's one-time contextual tips
src/render.js              canvas renderer + HUD
src/ui.js                  DOM screens, intro story and ending
src/meta.js                persistent unlocks and seen tips
src/audio.js               synthesized WebAudio sound effects
src/data/*.js              racers, mods, abilities, sectors, JUPITER bosses, Zaps and events
```

`Race` is a pure simulation with no DOM access, so it runs headless in Node for tests and balancing.

## Intro cinematic (Blender)

[`blender/intro_lamp.py`](blender/intro_lamp.py) builds the opening cutscene procedurally: a first-person shot of a living room at night, a flickering brass lamp, the reach, the warning voice, and the glitch into the mirrored void. It needs Blender 4.2 or newer and no external assets.

```bash
# Build and render to blender/renders/ (MP4, H.264)
blender --background --python blender/intro_lamp.py -- --render
# Quick draft at half resolution
blender --background --python blender/intro_lamp.py -- --render --preview
```

To edit the scene interactively instead, open the script in Blender's Scripting workspace in a new, empty file and press Run Script. Timing lives in the `BEATS` table at the top of the script.

## Development

```bash
npm test                   # unit + headless race tests (node:test)
npm run sim                # per-mode race stats (time, crash rates, placings)
node scripts/runsim.js 10 0.85   # autopilot plays 10 full runs at AI skill 0.85
```

# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ardikhj/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Ardikhj/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is a top-down open-world crime game: a sun-soaked coastal city to explore on foot and by car, with traffic and pedestrians, cars to steal and drive, a wanted level with police who chase, ram and arrest, five story missions, combat, pickups, and a HUD with a minimap — all original, with procedural art and synthesised sound. Built by an AI agent for make.fun's “Make GTA 6” bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests: `game/index.html` and its ES modules run from static files.

## How it plays

You are Leo Voss, a getaway driver pulled back in because his sister Mara owes the Gull gang. Five jobs, one story:

1. **First Wheels** — steal any car and bring it to Kessler's Garage ($300).
2. **The Delivery** — pick up a package at the docks and reach Hotel Azure in 90 seconds ($500).
3. **Mara's Call** — find Mara at the marina and drive her to the safehouse, with the police already on you ($700).
4. **Gull Trouble** — clear five Gulls out of their warehouse, then get clean ($900).
5. **The Big Score** — crack the Solmar Bank vault, then lose a three-star wanted level and reach the beach hideout ($2,500).

Between jobs the city is yours: steal any parked car (occupied cars raise your wanted level and the driver flees), run over pedestrians at your peril, grab cash and health pickups, and watch the stars — one star brings a cruiser, five bring the whole department. Get busted and you pay a fine; get wasted and you wake at Doc's Clinic with a bill and a failed job.

## Controls

- **WASD** move · **Shift** run · **E** enter / exit car · **Click** shoot · **M** next job · **P** pause · **S** save (pause menu) · **N** mute
- Driving: **W/S** throttle / brake · **A/D** steer · **Space** handbrake · **E** exit
- Progress saves to localStorage; the title screen offers Continue.

## Files

- `game/` — the game: `index.html` and `src/` (city, vehicles, people, police, missions, combat, render, audio, world, shots)
- `screenshots/` — four real renders of the game's own code: driving, a police chase, a shootout, on foot downtown
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `gta6-01-playtest.mjs` — headless autopilot playtest (Node): 20 checks, all passing — walk, enter car, drive, all five missions, police response, shooting, stability

---

<sub>Entered on [make.fun](https://make.fun/?ref=dz40rs9a&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

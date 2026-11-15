# Open Road

A browser based 3D open world arcade driving game built with **Three.js**,
**TypeScript**, **Vite** and **Rapier** physics.

Drive a car through a large procedurally generated world: downtown
skyscrapers, suburbs, highways, countryside, mountains, desert and a coast.

> Status: **Phases 0 - 4 complete.** The world streams in, the road network
> connects every region, the city is filled with buildings and props and the
> minimap shows the roads around you. Traffic, day/night and the menus are
> still to come.

---

## Quick start

```bash
npm install
npm run dev        # development server on http://localhost:5173
npm run build      # type check + production build into dist/
npm run preview    # serve the production build locally
```

The production build is a plain static site - it can be hosted on Vercel,
GitHub Pages, Netlify or any static host.

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel: **Add New -> Project** and import the repository.
3. Vercel detects Vite automatically. Build command `npm run build`,
   output directory `dist`.
4. Done. Every push produces a new preview URL.

No environment variables are required for the current phase.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Throttle | `W` / `Up` | Pedal button |
| Brake / reverse | `S` / `Down` | Pedal button |
| Steer | `A` `D` / `Left` `Right` | Arrow buttons |
| Handbrake (drift) | `Space` | Button |
| Change camera | `C` | Button |
| Reset car | `R` | Button |
| Headlights | `L` | Button |
| Horn | `H` | Button |
| Pause | `Esc` | Button |
| Photo mode | `P` | Menu |
| Debug overlay | `F3` | - |
| Handling tuning panel | `T` | - |
| Minimap north-up / rotating | `M` | - |

Cameras: chase (default), far chase, hood and cockpit.

## The world

| Region | What you find there |
|---|---|
| Downtown | A street grid with avenues, skyscrapers and lane markings |
| Suburbs | Detached houses, street lamps and small gardens |
| Countryside | Farms, barns, haystacks, fields and long rural roads |
| Mountains | Rocky ridges, pine forests and switchback roads |
| Desert | Dunes, cacti and rocks |
| Coast | A beach, palm trees and a lighthouse |

Five landmarks are placed by hand: **The Spire** (a tower in the middle of
the city), **Kestrel Light** (a lighthouse on the coast), **Old Mill** and
**Hill Mill** (windmills in the countryside) and **Beacon Hill** (a radio
mast in the mountains). They are drawn on the minimap.

Everything is generated from one seed (currently `1337`), so the world is
the same every time you start the game.

## Project layout

See `PROJECT.md` for the full design document and `DECISIONS.md` for the
technical decisions that were made along the way.

```
src/
  core/       Game loop, renderer, input, settings, event bus
  physics/    Rapier wrapper and collision groups
  vehicles/   Vehicle physics, car data, procedural car mesh, cameras
  ui/         HUD, minimap, tuning panel, styles
  utils/      Math, seeded random, object pool, debug overlay
  world/      Terrain, regions, chunk streaming, roads, buildings, props
  ai/         (Phase 5+) Traffic and race rivals
  environment/(Phase 6+) Sky, day/night cycle, weather
  audio/      (Phase 7+) Engine and ambient sound
  save/       (Phase 7+) Local and cloud saves
```

## Development helpers

The test harnesses live in `tools/`. They are bundled with rolldown before
they run in Node, so the real game code is exercised without a browser.

```bash
npm run test:vehicle   # the car accelerates, steers, drifts and brakes
npm run test:terrain   # ASCII map of the world and the region heights
npm run test:roads     # the road graph: length, connectivity, flat roads
npm run test:world     # drives the car over the generated terrain colliders
npm run test:rapier    # the official Rapier vehicle example, for comparison
```

### Head-less browser test

There is also a test that opens the real game in a head-less browser, drives
it and takes a screenshot. It needs a Chromium build, so install the two
extra packages first:

```bash
npm i -D @sparticuz/chromium playwright-core
npm run build
npm run preview &          # serves the build on http://127.0.0.1:4173
npm run test:smoke         # loads the game, drives it, prints the stats
npm run test:tour          # a screenshot of every region
```

This is how most of the bugs in the world were found - the camera pointed
the wrong way, the roads were invisible and the car fell through the
terrain, none of that shows up in a unit test.

## Performance

The default quality preset is **Low** so the game runs on weak hardware.
Press `F3` for the debug overlay (FPS, draw calls, triangles, chunk count).

The world is streamed in 256 m chunks. A chunk is generated in a Web Worker
and turned into a mesh plus a Rapier collider on the main thread, with a
budget of 4 ms per frame. Buildings and props are instanced, so a whole
city block costs a handful of draw calls.

> The FPS numbers in the head-less test are not representative: the test
> browser renders with the software rasteriser (SwiftShader), which is about
> twenty times slower than a real GPU. The draw call and triangle counts in
> the overlay are the useful numbers.

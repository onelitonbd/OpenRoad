# Open Road

A browser based 3D open world arcade driving game built with **Three.js**,
**TypeScript**, **Vite** and **Rapier** physics.

Drive a car through a large procedurally generated world: downtown
skyscrapers, suburbs, highways, countryside, mountains, desert and a coast.

> Status: **Phase 1 complete** - the car drives, steers, drifts and can be
> reset. The world streaming is coming in the next phases.

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

Cameras: chase (default), far chase, hood and cockpit.

## Project layout

See `PROJECT.md` for the full design document and `DECISIONS.md` for the
technical decisions that were made along the way.

```
src/
  core/       Game loop, renderer, input, settings, event bus
  physics/    Rapier wrapper and collision groups
  vehicles/   Vehicle physics, car data, procedural car mesh, cameras
  ui/         HUD, tuning panel, styles
  utils/      Math, seeded random, object pool, debug overlay
  world/      (Phase 2+) Terrain, regions, chunk streaming
  ai/         (Phase 5+) Traffic and race rivals
  environment/(Phase 6+) Sky, day/night cycle, weather
  audio/      (Phase 7+) Engine and ambient sound
  save/       (Phase 7+) Local and cloud saves
```

## Development helpers

```bash
# Head-less physics test: prints the telemetry of the car while it drives.
npm run test:vehicle
```

The test harness lives in `tools/` and is bundled with rolldown before it
runs in Node, so the real physics code is exercised without a browser.

## Performance

The default quality preset is **Low** so the game runs on weak hardware.
Press `F3` for the debug overlay (FPS, draw calls, triangles, chunk count).

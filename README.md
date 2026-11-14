# Open Road — 3D Open-World Arcade Driving (Browser)

Free, cartoon, low-poly open world driving. Procedural 8km² world, traffic, racing, day/night, weather.

**Live:** `npm run dev` → http://localhost:5173 — Vercel static deploy from `dist`

## Quick Start
```bash
npm install
npm run dev      # dev server with HMR
npm run build    # production build → dist/
npm run preview  # preview build
```

## Controls
- **WASD / Arrows** steer, **Space** handbrake, **C** camera (chase/far/hood/cockpit), **R** reset / **R near marker** start race, **Esc** pause, **P** photo mode, **T** tuning, **F3** debug, **F5** weather, **F6** time pause
- Touch: auto pedals + steer buttons, handbrake, camera, reset

## Features (All Phases)
- **Car feel:** 12 cars (sports/super/muscle/hatch/sedan/suv/truck) with distinct mass/engine/steer/suspension/friction/downforce; Rapier raycast vehicle + arcade aids (anti-roll, stability, air control)
- **World 64 km²:** terrain chunks 256m, regions downtown/suburbs/countryside/mountains/desert/coast, floating origin at 2km, fog hides pop-in
- **Roads:** downtown grid, suburb clusters, 8 highways, rural, mountain switchbacks, coastal road — terrain flattened, drivable across chunks
- **Buildings/props:** instanced skyscrapers/houses/barns + trees/pines/palms/cacti/lamps/rocks per region, 3 landmarks (tower/lighthouse/bridge), minimap from road graph
- **Traffic:** spawn 150–400m ring, cap Low15/Med30/High50, lane follow, curve slowdown, following distance, traffic lights downtown
- **Environment:** Three.js Sky + stars/moon/clouds, 20 min day cycle, dynamic weather Clear/Cloudy/Rain/Fog with rain particles and 0.75x wet grip
- **Menus/saves/audio:** MainMenu, Garage (stats/color), Pause (quality/time/weather), LocalSave versioned + CloudSave stub (Supabase ready), Web Audio oscillator engine + ambient, autosave 30s
- **Racing:** 2–5 rivals, checkpoint chain, rubber-banding, results + best times, recovery
- **Touch/photo:** thumb pedals, photo mode free camera + FOV/time + screenshot, quality presets + adaptive Low if <30fps 5s

## Perf Budget (Low)
FPS 60 mid /30 weak, draw <400, tris <500k, 1 dir light, shadows off Low, pixelRatio 1, instancing, chunk budget 4ms, compressed bundle ~937 KB gzip

## Deploy to Vercel
Import GitHub repo → Framework Vite → Build `npm run build`, Output `dist`. Env later: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase)

## Tech
Three.js 0.160, Rapier 0.15, Vite 5, TypeScript 5, simplex-noise 4. No React.

## Assets
All procedural fallbacks now; see `ASSETS.md` for future CC0 sources (Kenney, Quaternius, Poly Pizza). No real brands.

## Project Structure
See `PROJECT.md` Sec 4. Phase checklist below — all done:
- [x] Phase 0 Setup
- [x] Phase 1 Car driving
- [x] Phase 2 Terrain & chunks
- [x] Phase 3 Roads
- [x] Phase 4 Buildings & regions
- [x] Phase 5 Traffic
- [x] Phase 6 Sky/day-night/weather
- [x] Phase 7 Garage/menus/saves/audio
- [x] Phase 8 Rival racing
- [x] Phase 9 Touch/photo/optimization
- [x] Phase 10 Polish & release

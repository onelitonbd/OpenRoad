# Open Road — 3D Open-World Arcade Driving (Browser)

Free, cartoon-style, Three.js + Rapier open-world driving. Procedural world, huge map, day/night + weather.

Phase 2 — Chunked terrain streaming complete. Drive across 8km map with heightfield physics.

## Run locally
```bash
npm install
npm run dev   # http://localhost:5173
npm run build # output dist/
npm run preview
```

## Controls
- **WASD / Arrows**: steer/throttle/brake
- **Space**: handbrake drift
- **C**: cycle camera (chase / far / hood / cockpit)
- **R**: reset car
- **T**: tuning panel (engine/grip/steer/suspension)
- **F3**: debug overlay (FPS, chunks, quality)

## World
- Seed-based 8km×8km terrain with regions: downtown flat, suburbs hills, countryside plains, mountains (NE), desert (NW), coast (south sea -3.5m)
- 256m chunks, radius 3 Low /4 Med /6 High, vertex colors per region
- Rapier heightfield colliders per chunk, floating origin at >2km
- Water plane with wobble, fog hides pop-in

## Deploy to Vercel
Import repo from GitHub → Framework Vite → Build `npm run build`, Output `dist`.

## Roadmap
- [x] Phase 0 Setup
- [x] Phase 1 Car driving (Rapier + tuning)
- [x] Phase 2 Terrain & chunks
- [ ] Phase 3 Roads
- [ ] Phase 4 Buildings & props
- [ ] Phase 5 Traffic
- [ ] Phase 6 Sky/day-night/weather
- [ ] Phase 7 Garage/menus/saves/audio
- [ ] Phase 8 Rival racing
- [ ] Phase 9 Touch/photo/optimization
- [ ] Phase 10 Polish & release

## Tech
Three.js 0.160, Rapier 0.15, Vite 5, TypeScript 5, simplex-noise 4.

## Perf budgets
Draw calls <400 Low, triangles <500k Low, shadows off Low, pixelRatio cap 1 Low.

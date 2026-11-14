# Open Road — 3D Open-World Arcade Driving (Browser)

Free, cartoon-style, Three.js + Rapier open-world driving. Procedural world, huge map, day/night + weather.

> Phase 0 — setup complete. Drive a Comet GT on a flat test ground.

## Run locally
```bash
npm install
npm run dev   # http://localhost:5173
npm run build # output dist/
npm run preview
```

## Controls
- **WASD / Arrows**: steer/throttle/brake
- **Space**: handbrake
- **C**: cycle camera (chase / far / hood / cockpit)
- **R**: reset car
- **F3**: debug overlay (FPS, draw calls)
- **L/H**: headlights/horn (stub)

## Deploy to Vercel
- Import repo from GitHub → Framework: Vite → Build `npm run build`, Output `dist`
- Or `vercel --prod` from repo root.

## Roadmap
- [x] Phase 0 Setup
- [ ] Phase 1 Car driving (Rapier vehicle)
- [ ] Phase 2 Terrain & chunks
- [ ] Phase 3 Roads
- [ ] Phase 4 Buildings & props
- [ ] Phase 5 Traffic
- [ ] Phase 6 Sky/day-night/weather
- [ ] Phase 7 Garage/menus/saves/audio
- [ ] Phase 8 Rival racing
- [ ] Phase 9 Touch/photo/optimization
- [ ] Phase 10 Polish & release

## Tech
Three.js 0.160, Rapier 0.14, Vite 5, TypeScript 5, simplex-noise.

## Assets
No external assets in Phase 0. Procedural car + ground only.

## License
CC0-friendly. No real car brands/trademarks.

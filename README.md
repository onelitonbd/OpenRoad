# Open Road — 3D Open-World Arcade Driving (Browser)

Phase 4 — Buildings, props, regions styled, minimap, landmarks.

## Run
```bash
npm install
npm run dev   # 5173
npm run build
```

## Controls
WASD drive, Space handbrake, C camera, R reset, T tuning, F3 debug, click minimap to toggle rotation

## World Phase 4
- All regions distinct: downtown skyscrapers, suburbs houses, countryside barns, mountains pines/rocks/snow caps, desert cacti, coast palms/beach
- Instanced buildings/props per chunk, distance culling via chunk unload
- 3 landmarks: downtown tower, lighthouse, highway bridge
- Minimap live 2D canvas from road graph
- Perf: Low preset <400 draw calls, <500k tris via instancing + fog

## Roadmap
- [x] Phase 0 Setup
- [x] Phase 1 Car driving
- [x] Phase 2 Terrain & chunks
- [x] Phase 3 Roads
- [x] Phase 4 Buildings & regions
- [ ] Phase 5 AI traffic
- [ ] Phase 6 Sky/day-night/weather
- [ ] Phase 7 Garage/menus/saves/audio
- [ ] Phase 8 Rival racing
- [ ] Phase 9 Touch/photo/optimization
- [ ] Phase 10 Polish & release

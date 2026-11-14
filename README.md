# Open Road — 3D Open-World Arcade Driving (Browser)

Free, cartoon-style, Three.js + Rapier open-world driving. Procedural world, huge map.

Phase 3 — Roads complete. Drive downtown grid, suburbs, highways, rural, mountain, coast.

## Run locally
```bash
npm install
npm run dev
npm run build
```

## Controls
WASD/Arrows drive, Space handbrake, C camera, R reset, T tuning, F3 debug

## World Phase 3
- 8km map with regions + terrain chunks (256m, heightfield physics, floating origin)
- RoadNetwork: downtown grid, suburb clusters, highways (8), rural offshoots, mountain switchbacks, coastal road
- Ribbon road meshes with lane markings + downtown sidewalks, intersections flat patches
- Terrain flattened under roads, roads 0.05m above terrain, drivable smooth across chunks

## Roadmap
- [x] Phase 0 Setup
- [x] Phase 1 Car driving
- [x] Phase 2 Terrain & chunks
- [x] Phase 3 Roads
- [ ] Phase 4 Buildings & props
- [ ] Phase 5 Traffic
- [ ] Phase 6 Sky/day-night/weather
- [ ] Phase 7 Garage/menus/saves/audio
- [ ] Phase 8 Rival racing
- [ ] Phase 9 Touch/photo/optimization
- [ ] Phase 10 Polish & release

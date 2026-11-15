# AGENT_PROMPTS.md — Build Prompts, Phase by Phase

How to use: give the agent `PROJECT.md` first (it must read it fully), then paste **one phase prompt at a time**. Do not start the next phase until the current one runs and is deployed.

---

## Master Prompt (paste once at the very start)

```
You are building a browser-based 3D open-world arcade driving game. Read PROJECT.md completely before doing anything. It contains the full design, tech stack (Three.js + TypeScript + Vite + Rapier), folder structure, performance budget and rules. Follow it exactly.

Rules:
- Build in phases, in order. After each phase: make sure `npm run build` passes, the game runs, and summarize what you did and any known issues.
- The developer is a beginner: write simple, readable code with short comments explaining why.
- Low-end PC target: optimize from the start (instancing, chunk streaming, no per-frame allocations, no point lights).
- Everything must work without external assets first (procedural low-poly fallbacks).
- Don't ask questions unless truly blocked; choose sensible defaults and log them in DECISIONS.md.
- Update the progress checklist in PROJECT.md after each phase.

Start with Phase 0 when I send it.
```

---

## Phase 0 — Setup (Day 1)

```
PHASE 0: Project setup.
1. Create a Vite + TypeScript project named "open-road" with the folder structure from PROJECT.md section 4 (empty module files with TODO comments are fine).
2. Install three, @types/three, @dimforge/rapier3d-compat, simplex-noise.
3. Create core/Game.ts with a main loop using requestAnimationFrame and a fixed 60 Hz physics accumulator (core/Time.ts). Create core/Renderer.ts (WebGLRenderer, antialias off by default, pixel ratio cap from Settings, resize handling).
4. Create core/Settings.ts with Low/Medium/High presets from PROJECT.md section 13; default to Low in development; persist choice in localStorage.
5. Add a debug overlay (F3): FPS, draw calls, triangles, memory.
6. Show a simple scene: sky-colored background, a ground plane, a rotating cube, to prove the loop works.
7. Add README.md (how to run, build, deploy) and vercel-friendly build config.
Done when: `npm run dev` shows the scene at 60 fps, `npm run build` passes.
```

## Phase 1 — Drivable Car (Days 2–4)

```
PHASE 1: Vehicle physics and driving.
1. Implement physics/PhysicsWorld.ts (Rapier init, step with fixed dt, a flat ground collider).
2. Implement vehicles/VehicleConfig.ts and vehicles/cars.ts with ONE car (Comet GT) first, but keep the data structure ready for 10+.
3. Implement vehicles/Vehicle.ts using Rapier DynamicRayCastVehicleController with 4 wheels: engine force, braking, steering, suspension, friction per axle, handbrake with reduced rear grip, speed-sensitive steering, simple automatic gearbox producing RPM and gear values.
4. Implement vehicles/CarFactory.ts: build a procedural low-poly cartoon car mesh (body, cabin, 4 wheels as separate objects) with a path to load GLB later.
5. Implement core/Input.ts (WASD/arrows, space, C, R, L, H, Esc) and vehicles/PlayerController.ts.
6. Implement vehicles/CameraRig.ts with chase, far chase and hood cameras (C cycles), smooth follow and speed-based FOV.
7. Add arcade aids: anti-roll, stability assist, auto-reverse, reset-car (R), air control.
8. Add a basic HUD (ui/HUD.ts): speed in km/h, gear, RPM bar.
9. Add a tuning panel (hidden by default, key T) with sliders for key handling parameters, to tune feel live.
Done when: the car drives, drifts with handbrake, can be reset, and feels fun on a large flat plane. Spend effort on feel.
```

## Phase 2 — Terrain & Chunk Streaming (Days 4–7)

```
PHASE 2: Terrain and streaming.
1. Implement world/Terrain.ts: deterministic height(x,z) from a seed using simplex-noise; support region-based amplitude (flat city, rolling countryside, tall mountains, dunes, coast sloping to sea level).
2. Implement world/Regions.ts: a function regionAt(x,z) returning region id + blend weights (downtown center, suburb ring, countryside, mountains in one corner, desert in another, coast along one edge). World size 8 km x 8 km.
3. Implement world/Chunk.ts and world/ChunkManager.ts: 256 m chunks, load/unload around the player by quality radius. Build terrain meshes with vertex colors by region/slope. Create one Rapier heightfield collider per chunk. Dispose everything on unload.
4. Move chunk geometry generation into a Web Worker (workers/chunkWorker.ts) and spread main-thread work across frames with a time budget (< 4 ms per frame).
5. Add world/Water.ts: sea plane for the coast.
6. Add distance fog tuned to the chunk radius to hide pop-in.
7. Handle floating-point precision (floating origin or camera-relative rendering). Document the choice in DECISIONS.md.
8. Spawn the player at the downtown/suburb border.
Done when: you can drive across the whole 8 km map with no stutters, no falling through the ground, and chunks stream smoothly. Debug overlay shows chunk count.
```

## Phase 3 — Roads (Days 7–11)

```
PHASE 3: Road network and meshes.
1. Implement world/RoadNetwork.ts: a seeded, deterministic road graph (nodes, edges as splines, lane count, speed limit). Generate: a downtown grid, suburb street clusters, highways connecting all region centers (smooth, avoiding steep slopes), rural roads, mountain switchbacks, a coastal road.
2. Make Terrain query RoadNetwork so terrain is flattened/blended under and beside roads.
3. Implement world/RoadMesh.ts: extrude road ribbons along splines per chunk, with lane markings, curbs/sidewalks in the city, no gaps or z-fighting at chunk borders (offset +0.05 m). Road surfaces must be properly drivable and smooth.
4. Make chunk building request only the road edges that intersect that chunk.
5. Intersections: generate clean junction geometry (flat patches) for 3- and 4-way nodes.
6. Add a spatial index so road queries are fast (grid hash).
7. Provide an API for later phases: getNearestRoad(pos), getLanePath(edgeId, lane), getRoadsInRadius(pos, r).
8. Update the player spawn to a road.
Done when: the player can drive along highways, through the downtown grid and suburbs; roads are smooth across chunk borders; the debug overlay can draw the road graph.
```

## Phase 4 — Buildings, Props, Regions, Minimap (Days 11–15)

```
PHASE 4: Fill the world.
1. Implement world/Buildings.ts: procedural buildings (box/L footprints, floors, roof types) placed along roads with setbacks; downtown skyscrapers 30–150 m; suburb houses; farm barns/silos. Use InstancedMesh per archetype with per-instance color. Add a simple window texture/shader with emissive support for night.
2. Add box colliders for buildings only in near chunks.
3. Implement world/Props.ts (instanced): trees, streetlamps, signs, fences, guardrails, cacti, rocks, pines, palm trees, haystacks, windmills, crop-field patches. Use distance culling.
4. Style each region with the cartoon palette (see PROJECT.md section 6.2).
5. Add 3–5 hand-placed landmarks (e.g., a tall tower downtown, a lighthouse on the coast, a big bridge-like highway section if time allows).
6. Implement ui/Minimap.ts: draw the road graph and the player arrow on a 2D canvas around the player; north-up/rotating toggle.
7. Run a performance pass: draw calls and triangle counts must stay within the Low budget.
Done when: all regions look distinct and alive, and the Low preset holds ≥ 30 fps on a weak GPU.
```

## Phase 5 — AI Traffic (Days 15–19)

```
PHASE 5: Traffic.
1. Implement ai/TrafficManager.ts: spawn AI cars only in a 150–400 m ring around the player, despawn when far; cap by quality preset; never spawn in view of the player on top of anything.
2. Implement ai/TrafficCar.ts: follow lane paths from RoadNetwork.getLanePath, obey speed limits, slow for curves, keep following distance with forward raycasts/lookahead, stop for obstacles, drive in the correct lane direction.
3. Implement ai/Intersection.ts: timed traffic lights in downtown; yield/priority elsewhere.
4. Performance: the ~10 nearest AI cars use full Vehicle physics; farther cars are kinematic path followers; swap by distance with no visible pop.
5. Collisions with the player respond physically for near cars; AI brakes/honks.
6. Use a variety of non-racing car models (sedans, hatches, trucks, local vehicles) with random colors.
7. Add debug visualization (F3) for AI paths.
Done when: traffic flows believably on all road types for 10 minutes with no stuck cars piling up and no frame-rate drops.
```

## Phase 6 — Sky, Day/Night, Weather (Days 19–22)

```
PHASE 6: Environment.
1. Implement environment/SkySystem.ts with Three.js Sky, procedural stars, a moon, and cheap drifting clouds.
2. Implement environment/DayNight.ts: 24 h cycle (default 20 real minutes/day, pausable) controlling sun/moon, light color/intensity, hemisphere light, fog color, sky, streetlight emissive, building window emissive, automatic car headlights.
3. Implement environment/Weather.ts: states Clear, Cloudy, Rain, Fog with smooth transitions; random changes; manual override via pause menu.
4. Rain: GPU particles near the camera, wetter/darker roads, grip multiplier 0.75 in Vehicle, rain sound hook.
5. Add a clock and weather icon to the HUD.
6. Respect quality presets (particle counts, shadows).
Done when: a full day cycle looks good, weather changes are smooth, and performance stays within budget.
```

## Phase 7 — Garage, Menus, Saves, Audio (Days 22–25)

```
PHASE 7: Content and UX.
1. Complete vehicles/cars.ts with 10–12 cars from PROJECT.md section 7.2, each with distinct handling stats and a procedural low-poly model (GLB optional if assets exist). Keep own invented names.
2. ui/MainMenu.ts (orbiting car background), ui/Garage.ts (carousel, stat bars, color picker), ui/PauseMenu.ts (resume, settings, respawn, time/weather, quit).
3. save/SaveManager.ts interface + save/LocalSave.ts (selected car, colors, best times, settings, last position, time of day, seed, version number). Autosave every 30 s and on tab hide. Stub save/CloudSave.ts.
4. audio/AudioManager.ts with unlock-on-gesture; audio/EngineSound.ts (RPM → pitch/volume; fallback to oscillator synth if no file), skid, crash one-shots, ambient layers (city, wind, birds, waves, rain). Volume sliders in Settings.
5. Loading screen with progress.
Done when: you can pick any car, play, quit, reload the page, and continue with your car and settings.
```

## Phase 8 — Rival Racing (Days 25–27)

```
PHASE 8: Races.
1. Implement ai/RivalRacer.ts: follows a racing line along the road centerline with offsets, brakes before corners via curvature lookahead, mild rubber-banding, difficulty Easy/Normal/Hard.
2. Implement ai/RaceManager.ts: race markers placed in the world and on the minimap; starting a race creates a checkpoint chain along roads, 2–5 rivals on the same physics, countdown, positions, lap/finish detection, results screen, best times saved.
3. Add race HUD (position, checkpoint, time).
4. Rivals must recover when stuck (auto-reset to the road).
Done when: you can start, finish and restart races reliably with rivals that are challenging but fair.
```

## Phase 9 — Touch, Photo Mode, Optimization (Days 27–29)

```
PHASE 9: Platform polish.
1. ui/TouchControls.ts: auto-show on touch devices; large pedals, steer buttons, handbrake, camera, reset, pause.
2. ui/PhotoMode.ts: pause the sim, free camera, FOV slider, time-of-day slider, hide HUD, save screenshot.
3. Add Low/Medium/High quality settings UI and an optional adaptive quality mode that lowers settings if FPS stays below 30 for 5 seconds.
4. Full optimization pass: check draw calls, triangles, memory leaks (drive 10 minutes, watch heap), compress models/audio, lazy-load non-essential assets, tune chunk time budget.
Done when: it runs well on Low settings on a weak GPU and is playable on a phone.
```

## Phase 10 — Polish & Release (Days 29–30)

```
PHASE 10: Release.
1. Fix remaining bugs from the PROJECT.md testing checklist (section 18).
2. Make sure there are no console errors; handle tab switching, resize and orientation changes.
3. Add ASSETS.md with every asset's source and license; add a credits screen.
4. Final README (controls, run, build, deploy to Vercel).
5. Production build, test the Vercel deployment, and report final bundle size and performance numbers.
Done when: the public Vercel URL works on desktop Chrome/Firefox and Android Chrome.
```

---

## Later Prompts

### Cloud Saves (Supabase)
```
Add Supabase cloud saves. Create a profiles table and a saves table (user_id, version, data jsonb, updated_at) with row-level security so users only read/write their own rows. Implement save/CloudSave.ts with the same interface as LocalSave, email + Google login UI, merge logic (newer updated_at wins, with a conflict prompt), and VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env variables. Never commit secrets. Local save stays as an offline fallback.
```

### Multiplayer Preparation
```
Audit the codebase for multiplayer readiness: separate input from simulation, make game state serializable, remove hidden globals, keep the world deterministic from the seed. Do not implement networking yet; write a MULTIPLAYER_PLAN.md proposing a simple approach (e.g., WebSocket/WebRTC room with client-authoritative cars + interpolation).
```

### Bug-Fix Prompt (use anytime)
```
Bug: [describe what happens, when, and on which device/browser]. Reproduce it, find the root cause, fix it without changing unrelated behavior, add a short note in DECISIONS.md if the fix involved a design choice, and confirm `npm run build` passes.
```

### Performance Prompt (use anytime)
```
The game runs slowly at [describe]. Profile using the F3 overlay and Chrome Performance. Report draw calls, triangles, chunk work per frame and memory. Find the top 3 bottlenecks and fix them (instancing, merging, culling, lowering update frequency, smaller textures) while keeping visuals acceptable on the Low preset.
```

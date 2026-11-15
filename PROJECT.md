# PROJECT.md — 3D Open World Arcade-Sim Driving Game (Browser)

> Working title: **Open Road**. Alternatives: *Turbo Town*, *Skyline Drift*, *Horizon Rush*, *Wheelspin World*, *Roadrunner Valley*, *Neon Highway*.

This file is both the **design document** and the **instruction manual for an AI coding agent**. The agent must read this whole file first, then build the project phase by phase using `AGENT_PROMPTS.md`.

---

## 1. Vision

A free, browser-playable, cartoon/arcade-style 3D open-world driving game. The player drives a large collection of cars through a huge procedurally generated world with downtown skyscrapers, suburbs, highways, countryside and farms, and mountain/desert/coast regions. The world has AI traffic, AI racing rivals, a day/night cycle, dynamic weather and a realistic sky. Driving feels like an **arcade-sim hybrid**: cars have weight, grip and suspension but are forgiving and fun.

### Core pillars
1. **Driving feel first.** If driving is not fun, nothing else matters.
2. **Huge world, cheap to render.** Procedural generation + chunk streaming + instancing so it runs on low-end PCs.
3. **Always playable.** Every phase ends with a working, deployable build.
4. **Free to host.** Static site on Vercel; cloud saves (Supabase) added later.

### Confirmed requirements (from the developer)
| Topic | Decision |
|---|---|
| Platform | Web browser (desktop first; touch controls included) |
| Tech | Three.js |
| Art style | Cartoon / arcade, low-poly |
| Developer | Solo beginner, low-end PC |
| Timeline | Under 1 month (full scope kept; see phasing & cut list) |
| World size | Large (50+ km²) |
| World build | Procedural generation + a few hand-placed landmarks (agent's call: hybrid) |
| Regions | Downtown skyscrapers, suburbs & highways, countryside & farms, mountains/desert/coast |
| Driving | Arcade-sim hybrid |
| Cars | 10+ cars, sports/supercar focus |
| Assets | Mix: free assets, own Blender tweaks, code-generated shapes |
| AI | Traffic + racing rivals |
| Environment | Day/night cycle, dynamic weather, realistic sky |
| Gameplay | Free roam only (races vs rivals are free-roam style events, no story) |
| Controls | Keyboard (WASD) + touch controls, multiple cameras |
| Audio | Engine, tire/skid/crash, ambient city sounds |
| UI | Speedometer, minimap, main menu, garage, save progress, photo mode |
| Multiplayer | Maybe later (architecture must not block it) |
| Saves | Local first, cloud later |
| Hosting | Vercel (static) now; Supabase for auth/saves later |
| Perf | Optimized by default + Low/Med/High quality presets |
| Dev tool | AI agent (arena.ai agent mode) reads this file and builds |

---

## 2. Honest scope warning (read this, agent)

The full vision is very large. To protect the one-month deadline:

- **Never** leave the project in a broken state. Commit/deploy after each phase.
- Build **vertical slices**: a drivable car first, then terrain, then roads, etc.
- If time runs short, cut in this order (last items first):
  1. Cloud saves / Supabase
  2. Photo mode
  3. Touch controls polish
  4. Rain/fog variety (keep simple rain)
  5. Rival racing AI (keep traffic)
  6. Cars beyond 5 (keep variety in handling, not count)
  7. Mountain/desert/coast detail (keep as simple terrain tints)
- Core that must survive: **drive a car in a big procedural world with roads, buildings, sky, and traffic.**

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Rendering | **Three.js** (latest stable) | Largest community, flexible, great for AI-agent coding |
| Language | **TypeScript** | Catches bugs in a large codebase; agents handle it well |
| Build | **Vite** | Fast dev server, simple static build for Vercel |
| Physics | **Rapier** (`@dimforge/rapier3d-compat`) with `DynamicRayCastVehicleController` | Fast WASM physics, built-in raycast vehicle |
| Noise | `simplex-noise` | Deterministic terrain/regions from a seed |
| Sky | Three.js `Sky` addon + custom clouds/stars | Realistic, cheap |
| Audio | Web Audio API (no heavy lib) | Pitch-shifted engine loop, one-shots |
| UI | Plain HTML/CSS overlay + small TS UI layer | No framework overhead |
| Models | GLTF/GLB, compressed with `gltf-transform` (Draco/meshopt) | Small downloads |
| Saves | `localStorage`/IndexedDB now → Supabase later | Free tier |
| Hosting | **Vercel** (static deploy from GitHub) | Free, easy |
| Workers | Web Workers for chunk generation | Keep frame rate smooth |

Dependencies must stay minimal. No React/Vue. No game engine on top of Three.js.

---

## 4. Project Structure

```
open-road/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ PROJECT.md
├─ AGENT_PROMPTS.md
├─ public/
│  ├─ models/            # .glb cars, props (compressed)
│  ├─ textures/
│  ├─ audio/             # engine.ogg, skid.ogg, crash.ogg, ambient_*.ogg
│  └─ favicon.svg
└─ src/
   ├─ main.ts                    # entry: boots Game
   ├─ core/
   │  ├─ Game.ts                 # main loop, state machine (menu/garage/play/photo)
   │  ├─ Renderer.ts             # WebGLRenderer setup, resize, pixel ratio cap
   │  ├─ Input.ts                # keyboard + touch + (future gamepad) → InputState
   │  ├─ Time.ts                 # fixed-step physics accumulator
   │  ├─ Settings.ts             # quality presets, volume, controls
   │  └─ EventBus.ts             # tiny pub/sub
   ├─ physics/
   │  ├─ PhysicsWorld.ts         # Rapier init, step, helpers
   │  └─ Colliders.ts            # terrain heightfield + building colliders
   ├─ vehicles/
   │  ├─ Vehicle.ts              # raycast vehicle wrapper (player + AI share it)
   │  ├─ VehicleConfig.ts        # per-car tuning data type
   │  ├─ cars.ts                 # list of 10+ car definitions
   │  ├─ PlayerController.ts     # InputState → throttle/steer/brake
   │  ├─ CameraRig.ts            # chase / hood / cockpit / far-chase
   │  └─ CarFactory.ts           # builds mesh from GLB or code-generated fallback
   ├─ world/
   │  ├─ World.ts                # owns chunk manager, seed, region map
   │  ├─ ChunkManager.ts         # load/unload chunks around the player
   │  ├─ Chunk.ts                # one 256 m tile: terrain mesh + roads + props
   │  ├─ Terrain.ts              # height(x,z) deterministic function
   │  ├─ Regions.ts              # which biome/zone at (x,z)
   │  ├─ RoadNetwork.ts          # road graph (nodes/edges/lanes) + generation
   │  ├─ RoadMesh.ts             # builds road geometry along splines
   │  ├─ Buildings.ts            # procedural buildings (instanced)
   │  ├─ Props.ts                # trees, lamps, signs, fences, farms (instanced)
   │  ├─ Water.ts                # sea/coast plane
   │  └─ workers/chunkWorker.ts  # off-thread generation
   ├─ ai/
   │  ├─ TrafficManager.ts       # spawn/despawn AI cars near the player
   │  ├─ TrafficCar.ts           # lane following, speed limit, stops
   │  ├─ Intersection.ts         # signals / priority
   │  ├─ RivalRacer.ts           # racing AI with rubber-banding
   │  └─ RaceManager.ts          # race start/checkpoints/results
   ├─ environment/
   │  ├─ SkySystem.ts            # sun/moon, sky color, stars, clouds
   │  ├─ DayNight.ts             # time of day → lighting, streetlights
   │  ├─ Weather.ts              # clear/cloudy/rain/fog state machine
   │  └─ Lighting.ts
   ├─ audio/
   │  ├─ AudioManager.ts
   │  ├─ EngineSound.ts          # RPM → pitch/volume
   │  └─ Ambient.ts
   ├─ ui/
   │  ├─ HUD.ts                  # speedometer, gear, minimap, time/weather
   │  ├─ Minimap.ts
   │  ├─ MainMenu.ts
   │  ├─ Garage.ts               # car select, colors
   │  ├─ PauseMenu.ts
   │  ├─ PhotoMode.ts
   │  ├─ TouchControls.ts
   │  └─ styles.css
   ├─ save/
   │  ├─ SaveManager.ts          # interface
   │  ├─ LocalSave.ts            # localStorage/IndexedDB
   │  └─ CloudSave.ts            # Supabase (later, stub first)
   └─ utils/
      ├─ math.ts  ├─ random.ts (seeded RNG)  ├─ pool.ts (object pools)  └─ debug.ts
```

---

## 5. Architecture Rules

1. **Fixed-timestep physics** (60 Hz) with render interpolation. Rendering is decoupled.
2. **One `Vehicle` class** for player, traffic and rivals; controllers differ (`PlayerController`, `TrafficCar`, `RivalRacer`).
3. **Deterministic world:** all generation uses a global `seed` + chunk coordinates. Same seed → same world. Required for save/load and future multiplayer.
4. **No per-frame allocations** in hot paths (reuse vectors, matrices; use object pools).
5. **Everything instanced:** buildings, trees, lamps, road markings, AI-car wheels where possible.
6. **Systems are modules** with `init()`, `update(dt)`, `dispose()`.
7. **Data-driven cars:** car stats live in `cars.ts`, not hard-coded in logic.
8. **Quality settings** read from `Settings.ts`; every expensive feature must check them.
9. **Single-player now, multiplayer-ready:** keep game state serializable, separate input from simulation, avoid hidden globals.
10. **Always typed.** No `any` unless commented why.

---

## 6. World Design

### 6.1 Size & coordinates
- World: **8 km × 8 km = 64 km²** (square, centered on origin). Beyond the edge: ocean on one side, mountains on others, soft invisible boundary + "turn back" message.
- **Chunk size: 256 m.** Grid ≈ 32 × 32 = 1024 chunks.
- Load radius by quality: Low 3, Medium 4, High 6 chunks (Chebyshev). Fog hides pop-in.
- Floating-point safety: use a **floating origin** (shift the world when the player is > 2 km from origin) or keep camera-relative rendering. Agent chooses; document the choice.

### 6.2 Regions (`Regions.ts`)
Computed from low-frequency noise + distance functions, deterministic from seed.

| Region | Location idea | Terrain | Roads | Buildings / props |
|---|---|---|---|---|
| **Downtown** | World center | Flat | Dense grid, multi-lane, traffic lights | Skyscrapers (30–150 m), shops, billboards, streetlights |
| **Suburbs** | Ring around downtown | Gentle hills | Curvy streets, cul-de-sacs, a few avenues | Houses, small apartments, trees, fences |
| **Highways** | Connect all regions | Follow terrain smoothly | Wide, multi-lane, long curves, overpasses (stretch goal) | Guardrails, signs, lamps |
| **Countryside / farms** | Mid-distance | Rolling plains | Narrow two-lane roads, dirt tracks | Barns, silos, crop fields, haystacks, windmills |
| **Mountains** | One corner/edge | High noise amplitude | Switchback roads | Pine trees, rocks, snow caps |
| **Desert** | Another corner | Dunes | Long straight roads | Cacti, rocks, sand color |
| **Coast** | One full edge | Slopes to sea level | Coastal road | Sea plane, beach, palms, lighthouse |

Use a **low-poly cartoon palette** with flat/gradient colors; few textures.

### 6.3 Terrain (`Terrain.ts`)
- `height(x, z)` = blend of fractal simplex noise per region (flat in downtown, tall in mountains), then **flatten under/near roads** (blend toward road height).
- Chunk mesh: 64×64 vertices per 256 m chunk on High, 32×32 on Low. Vertex colors by region/slope (grass, sand, rock, snow).
- Physics: **one Rapier heightfield collider per loaded chunk**.
- Distant terrain: optional low-res far ring (stretch goal) or fog.

### 6.4 Roads (`RoadNetwork.ts`, `RoadMesh.ts`)
- World-level **road graph**: nodes (intersections) + edges (road segments as splines) + lane metadata (lane count, speed limit, one-way).
- Generation order (all seeded):
  1. Place downtown grid.
  2. Place suburb street clusters off grid edges.
  3. Connect region centers with **highways** (smooth splines avoiding steep slopes).
  4. Add rural roads branching from highways.
  5. Add mountain switchbacks and a coastal road.
- Each chunk asks the graph for edges that intersect it and builds meshes for those only.
- Road mesh: extrude a ribbon along the spline with sidewalk/curb in cities; lane markings via a tiled texture or instanced dashes.
- Roads sit slightly above terrain (+0.05 m) to avoid z-fighting; terrain is flattened to match.
- **Requirement: roads must be properly drivable** — smooth surface, no gaps at chunk borders, correct banking disabled for simplicity, collision matches visuals.
- The graph also feeds AI navigation and the minimap.

### 6.5 Buildings (`Buildings.ts`)
- Procedural: footprint (box/L-shape) × floors × roof type. Windows via a small tiled texture atlas or shader (emissive at night).
- Downtown: tall towers with variety; use **InstancedMesh** per building archetype and per-instance color.
- Colliders: simple boxes, only for chunks near the player.
- Placement rules: along road edges, setback from curb, no overlap with roads/other buildings.

### 6.6 Props
Trees, lamps, signs, fences, barns, cacti, rocks, guardrails: instanced, with distance culling. Streetlights turn on at night (emissive + optional few real lights; **never** many real point lights).

### 6.7 Sea
Single large animated plane (simple shader, vertex wobble). Low depth, no reflections on Low/Medium.

---

## 7. Vehicle System

### 7.1 Physics model (arcade-sim hybrid)
- Rapier rigid body + `DynamicRayCastVehicleController` with 4 wheels.
- Per-car `VehicleConfig`:
  ```ts
  interface VehicleConfig {
    id: string; name: string; class: 'sports'|'super'|'muscle'|'hatch'|'sedan'|'suv'|'truck'|'local';
    mass: number; engineForce: number; brakeForce: number; maxSpeedKmh: number;
    steerMax: number; steerSpeedFalloff: number;
    suspension: { stiffness: number; damping: number; travel: number; restLength: number };
    friction: { front: number; rear: number; driftSlip: number };
    centerOfMassY: number; downforce: number;
    gearRatios: number[]; finalDrive: number; redlineRpm: number;
    wheelRadius: number; dimensions: [number, number, number];
    model: string; // GLB path or 'procedural'
    color: string;
  }
  ```
- Aids that make it arcade-friendly: speed-sensitive steering, anti-roll, light stability/countersteer assist, handbrake drift, auto-reverse, auto gearbox, air control.
- Damage: cosmetic only (optional wobble/body dents are stretch goals). No car destruction.
- Reset button: flip car upright at the nearest road.

### 7.2 Cars (10+)
Mostly sports/supercars with distinct handling; a few extras for variety.

| # | Car (own invented names, avoid real brands/trademarks) | Class | Feel |
|---|---|---|---|
| 1 | Comet GT | sports | Balanced starter |
| 2 | Vortex R | super | Very fast, twitchy |
| 3 | Apex Speedster | super | Grippy, high downforce |
| 4 | Bolt Coupe | sports | Light, nimble |
| 5 | Thunder V8 | muscle | Powerful, loose rear |
| 6 | Drift King | sports | Easy slides |
| 7 | Phantom X | super | Top speed beast |
| 8 | Rally Fox | hatch | Good on dirt/hills |
| 9 | Hyper Wing | super | Extreme downforce |
| 10 | Street Racer | sedan | Everyday, forgiving |
| 11 | Dune Runner | suv | Off-road, high suspension |
| 12 | Iron Hauler | truck | Heavy, slow, sturdy |

Optional local variety (stretch): CNG auto, bus, rickshaw (traffic only or drivable).

### 7.3 Cameras (`CameraRig.ts`)
Chase (default), far chase, hood, cockpit (simple), free orbit in photo mode. Key `C` cycles. Smooth follow with speed-based FOV and slight shake at high speed.

### 7.4 Controls
| Action | Keyboard | Touch |
|---|---|---|
| Throttle / Brake-Reverse | W/↑, S/↓ | On-screen pedals |
| Steer | A/D, ←/→ | Left/right buttons or tilt (optional) |
| Handbrake | Space | Button |
| Camera | C | Button |
| Reset car | R | Button |
| Headlights | L | Button |
| Horn | H | Button |
| Pause | Esc | Button |
| Photo mode | P | Menu |

---

## 8. AI

### 8.1 Traffic (`TrafficManager`, `TrafficCar`)
- Spawn **AI cars only near the player** (e.g., 150–400 m ring), despawn when far. Cap by quality (Low 15, Med 30, High 50).
- Cars follow **lane paths** from the road graph, obey speed limits, keep a following distance (raycast/lookahead), slow in curves.
- Intersections: simple traffic lights (timed phases) in downtown; yield/priority elsewhere.
- Use the **same `Vehicle`** physics only for the nearest ~10 cars; farther ones are **kinematic** (move along path, no physics) to save CPU. Swap automatically by distance.
- Collisions with player: physical response for near cars; they brake/horn.
- Vehicle variety: random from traffic subset of `cars.ts` (sedans, hatches, trucks, local vehicles).

### 8.2 Rival racers (`RivalRacer`, `RaceManager`)
- Player can start a race from **race markers** placed in the world (or via a menu / key).
- Race = checkpoint chain along roads; 2–5 rivals with the same car physics.
- Rivals follow a racing line (road center offset), brake before corners using curvature lookahead.
- **Rubber-banding** (mild) so races stay close; difficulty levels Easy/Normal/Hard.
- Results screen with position and time. Free-roam only: no money/progression required, but record best times in saves.

### 8.3 Pedestrians
Not required. Skip unless everything else is done.

---

## 9. Environment

### 9.1 Day/night (`DayNight.ts`)
- 24 h cycle; default 20 real minutes per day; configurable/pausable.
- Drives: sun/moon position, directional light color/intensity, ambient/hemisphere color, fog color, sky, streetlight emissive, car headlights auto-on, building window emissive.
- Tied to HUD clock.

### 9.2 Sky (`SkySystem.ts`)
- Three.js `Sky` shader for sunrise/sunset gradients, plus procedural stars at night and a moon.
- Clouds: cheap billboard/dome layer with slow drift; thicker in cloudy/rain.

### 9.3 Weather (`Weather.ts`)
States: **Clear, Cloudy, Rain, Fog** (storm optional). Smooth transitions over 20–60 s.
- Rain: GPU particle streaks near camera, darker lighting, lower sky brightness, wet road (lower roughness/darker), reduced tire grip multiplier (e.g., 0.75), rain audio.
- Fog: scene fog density up, visibility reduced.
- Random weather changes with weighted probabilities; manual override in menu.

---

## 10. Audio
- `AudioManager` unlocks audio on first user gesture (browser rule).
- **Engine:** looped engine sample; pitch/volume mapped to RPM and throttle (fallback: oscillator-based synthesized engine so the game works without assets). Different pitch ranges per car.
- **Tires:** skid loop when slip > threshold.
- **Collisions:** impact one-shots scaled by impact velocity.
- **Ambient:** city hum near downtown, wind at high speed, birds in countryside, waves near coast, rain loop.
- Master/SFX/Music volume sliders; mute toggle.
- Use short OGG/MP3 files, free-license sources (record license per asset in `public/audio/LICENSES.md`).

---

## 11. UI / UX

- **HUD:** speed (km/h), gear, RPM bar, minimap, clock, weather icon, race info (position/checkpoint) when racing, small controls hint.
- **Minimap:** 2D canvas drawn from the road graph around the player, rotating or north-up toggle, player arrow, rivals/race markers.
- **Main menu:** Play / Garage / Settings / (Credits). Shows a slowly orbiting car.
- **Garage:** carousel of 10+ cars, stat bars (speed, accel, handling), color picker, "Select".
- **Pause menu:** resume, settings, respawn, time/weather, quit to menu.
- **Photo mode:** pauses sim, free camera, FOV, time-of-day slider, hide HUD, save screenshot (`canvas.toBlob`).
- **Touch controls:** appear automatically on touch devices; large, thumb-friendly.
- **Loading screen:** progress while initial chunks and assets load; tips.
- Style: bold, bright, rounded, cartoon-friendly.

---

## 12. Saving

`SaveManager` interface with two implementations:
- **Phase now — `LocalSave`:** `localStorage` (small data) / IndexedDB (if larger). Saves: selected car, car colors, unlocked cars (all unlocked by default), best race times, settings, last position & time of day, world seed.
- **Later — `CloudSave` (Supabase):** email/Google login, a `profiles` table + `saves` JSON column with row-level security. Same interface, so switching is trivial. Include save versioning (`version: number`) and migration.

Autosave every 30 s and on tab hide/close.

---

## 13. Performance Budget (low-end PC target)

| Item | Target |
|---|---|
| FPS | 60 on mid laptop (Medium), ≥ 30 on weak iGPU (Low) |
| Draw calls | < 400 (Low), < 800 (High) |
| Triangles on screen | < 500k (Low), < 1.5M (High) |
| Real-time lights | 1 directional + ambient only; no point lights |
| Shadows | Low: off or 1 small cascade; Med: 1024 map near car; High: 2048 |
| Pixel ratio | Cap at 1 (Low), 1.5 (Med), 2 (High) |
| Initial download | < 25 MB, ideally < 15 MB |
| Memory | Dispose geometries/materials/textures of unloaded chunks |

Techniques the agent must use: instancing, chunk streaming in Web Workers, geometry merging per chunk where useful, frustum culling, LOD/distance culling, fog to hide far plane, object pools, texture atlases, compressed GLBs, avoiding per-frame allocations, adaptive quality (optional auto-drop on low FPS).

### Quality presets (`Settings.ts`)
| Setting | Low | Medium | High |
|---|---|---|---|
| Chunk radius | 3 | 4 | 6 |
| Terrain verts/chunk | 32² | 48² | 64² |
| Traffic cap | 15 | 30 | 50 |
| Shadows | off | 1024 | 2048 |
| Rain particles | 1500 | 4000 | 8000 |
| Pixel ratio cap | 1 | 1.5 | 2 |
| Building window shader | simple | simple | emissive detail |

---

## 14. Hosting & Deployment

- **Vercel** (static site): push repo to GitHub → import to Vercel → build command `npm run build`, output `dist`. Free tier is sufficient.
- Large audio/model files: keep total small; use compression. If assets grow, host them on Supabase Storage or Cloudflare R2 free tier.
- **Supabase** (later): auth + Postgres for cloud saves. Use only the public anon key client-side with RLS enabled. Never commit secrets; use `.env` + Vercel env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Firebase is a valid alternative; Supabase chosen for SQL + RLS simplicity.

---

## 15. Asset Strategy (mix)

1. **Code-generated first:** every car, building and prop must have a **procedural low-poly fallback** so the game runs before any asset exists.
2. **Free assets:** Kenney.nl (CC0), Poly Pizza, Quaternius (CC0), Sketchfab (check each license), freesound.org / Pixabay for audio. Prefer **CC0**.
3. **Blender tweaks:** recolor, simplify, rename wheel nodes (`wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`), set origin at car center, export GLB.
4. **Rules:** record every asset's source + license in `ASSETS.md`. Avoid real car brands/logos. Keep each car < 5k triangles, < 500 KB compressed.

---

## 16. Roadmap (phases, ~4 weeks)

| Phase | Days | Deliverable (must be playable & deployable) |
|---|---|---|
| 0 | 1 | Project setup, Vite+TS+Three, game loop, Vercel deploy |
| 1 | 2–4 | One drivable car on flat ground, keyboard, chase camera, basic HUD |
| 2 | 4–7 | Terrain with chunk streaming + physics colliders, regions, fog |
| 3 | 7–11 | Road network + road meshes (highways + downtown grid), roads drivable |
| 4 | 11–15 | Buildings, props, all regions styled, minimap |
| 5 | 15–19 | AI traffic with lanes, speed limits, lights |
| 6 | 19–22 | Sky, day/night, weather, headlights, streetlights |
| 7 | 22–25 | Garage + 10+ cars, main menu, pause, saves (local), audio |
| 8 | 25–27 | Rival racing, race markers, results |
| 9 | 27–29 | Touch controls, photo mode, quality presets, optimization pass |
| 10 | 29–30 | Bug fixing, polish, final deploy, README |
| Later | — | Cloud saves (Supabase), pedestrians, overpasses, multiplayer |

---

## 17. Definition of Done (per phase)
- `npm run build` passes with no TypeScript errors.
- Runs at the quality target on Low preset.
- No console errors/warnings during normal play.
- Feature works via keyboard (and touch where relevant).
- Code commented where non-obvious; new systems documented in `README.md`.
- Deployed to Vercel preview.

## 18. Testing Checklist
- Drive 5 minutes without crash or memory growth (check Chrome Performance/Memory).
- Cross region boundaries and chunk borders without gaps, snags or road holes.
- Flip/reset works; car never falls through terrain.
- Traffic never spawns inside the player or on top of other cars.
- Weather and time transitions have no flicker.
- Audio unlocks properly and doesn't stack/leak.
- Resize window, orientation change, tab switch (pause + resume correctly).
- Test on Chrome, Firefox, Safari (desktop) and Chrome Android.

## 19. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Scope too large for 1 month | Phased plan + cut list (Section 2) |
| Low-end PC dev machine | Optimize early; Low preset is the default dev setting |
| Car physics feels bad | Spend extra time in Phase 1; tune with debug sliders |
| Chunk hitches / stutter | Workers + spread work across frames (time-budgeted queue) |
| Road/terrain mismatch | Single source of truth: `RoadNetwork` is queried by `Terrain` for flattening |
| Float precision at distance | Floating origin / camera-relative rendering |
| Asset licenses | Track in `ASSETS.md`, prefer CC0 |
| Huge downloads | Compress GLB/audio, lazy-load non-essential assets |

## 20. Agent Working Rules
1. Read this file fully, then `AGENT_PROMPTS.md`; do phases **in order**.
2. After each phase: run build, fix errors, summarize what changed, list known issues, and update `README.md` and the checklist below.
3. Don't skip ahead; don't rewrite finished phases unless fixing a bug.
4. Prefer simple, readable code over clever code (the developer is a beginner). Add short comments explaining *why*.
5. Ask the developer only when blocked; otherwise choose a sensible default and note it in `DECISIONS.md`.
6. Keep a `DEBUG` overlay (toggle `F3`): FPS, draw calls, triangles, chunks loaded, AI count, memory.

### Progress checklist
- [x] Phase 0 Setup - project, loop, renderer, settings, F3 overlay, build + preview
- [x] Phase 1 Car driving - Rapier ray cast vehicle, gear box, HUD, cameras, assists
- [x] Phase 2 Terrain & chunks - seeded terrain, regions, worker streaming, water, fog
- [x] Phase 3 Roads - road graph, terrain flattening, road ribbons, junctions, spatial index
- [x] Phase 4 Buildings & regions - instanced buildings and props, landmarks, minimap
- [ ] Phase 5 AI traffic
- [ ] Phase 6 Sky, day/night, weather
- [ ] Phase 7 Garage, menus, saves, audio
- [ ] Phase 8 Rival racing
- [ ] Phase 9 Touch, photo mode, optimization
- [ ] Phase 10 Polish & release
- [ ] Later: Supabase cloud saves, multiplayer prep

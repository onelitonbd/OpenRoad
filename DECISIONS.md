# DECISIONS.md — Log of agent choices

- **Phase 0**: Default Low (dev), fog 120–600m, antialias off, flat ground placeholder.
- **Phase 1**: Rapier DynamicRayCastVehicleController RWD, speed-sensitive steering, handbrake reduces rear frictionSlip, downforce, air control torque, anti-roll damping, Tuning panel live scales.
- **Phase 2**: Floating origin >2km vs camera-relative (simpler for Rapier), noise fractal terrain per region, 4ms chunk budget, heightfield colliders, Water at -3.5m.
- **Phase 3**: RoadNetwork deterministic: downtown 5x5 grid, suburb clusters, 8 highways, rural branches, mountain switchbacks, coastal road; spatial index 512m; RoadMesh ribbons + markings + sidewalks; terrain flatten via cubic blend; intersection discs.
- **Phase 4**: Buildings instanced per archetype (skyscraper/house/barn) along roads with setbacks; props instanced (tree/pine/palm/cactus/lamp/rock) per region; 3 landmarks (tower 165m, lighthouse, bridge); minimap 160px canvas.
- **Phase 5**: TrafficManager ring spawn 140-420m, cap per quality, lane follow with curve slowdown, following distance + traffic lights downtown timed 6/1.5/6, kinematic for perf.
- **Phase 6**: SkySystem Three.js Sky + 1500 stars + moon + cloud dome (drifting); DayNight 20min/day drives sun position, light color, fog; Weather Clear/Cloudy/Rain/Fog with transitions, rain particles near camera (count per quality), grip 0.75 in rain, cloud opacity; F5 cycle weather, F6 pause time.
- **Phase 7**: 12 cars distinct handling; MainMenu orbiting preview, Garage carousel with stats + color presets, PauseMenu (resume/respawn/quality/timescale/weather/volume), LocalSave interface (versioned) + CloudSave stub (Supabase later), AudioManager unlock + EngineSound oscillator (RPM→pitch/volume) + Ambient wind, autosave 30s + visibilitychange.
- **Phase 8**: RivalRacer follows racing line with curvature brake, rubber-banding, difficulty Easy/Normal/Hard; RaceManager places markers, builds checkpoint chain along roads, 2-5 rivals same physics, countdown/positions/finish, best times saved, stuck recovery via reset to road.
- **Phase 9**: TouchControls auto on touch, large pedals/steer/handbrake/camera/reset; PhotoMode pause sim, free orbit camera, FOV/time sliders, screenshot via canvas.toBlob; Quality presets UI + adaptive auto-drop to Low if FPS <28 for 5s.
- **Phase 10**: Bugfix checklist, resize/orientation/tab handling, ASSETS.md, final README, Vercel static deploy (dist), bundle ~2.7 MB (rapier ~2.1 MB), gzip ~937 KB.

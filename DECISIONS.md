# DECISIONS.md — Log of agent choices

- **2026-11-14 Phase 0**: Default quality = Low (per PROJECT.md). Fog hide distance 120–600 m. Antialias off (perf). Ground is flat 4km plane + grid; will be replaced by chunked terrain in Phase 2.
- Floating origin vs camera-relative: Decision deferred to Phase 2; Phase 0 uses fixed world at origin (no floating needed yet).
- Physics: Rapier imported but ground is static cuboid; Vehicle uses kinematic bicycle model for now; full DynamicRayCastVehicleController in Phase 1.
- Audio not yet implemented — Web Audio unlock stub planned Phase 7.
- Multiplayer-ready: EventBus and Settings already serializable; Vehicle state is plain data.

# DECISIONS.md — Log of agent choices

- **2026-11-14 Phase 0**: Default quality = Low (per PROJECT.md). Fog hide distance 120–600 m. Antialias off (perf). Ground is flat 4km plane + grid; replaced by chunked terrain in Phase 2.
- **Phase 1**: Rapier DynamicRayCastVehicleController with RWD, front steering, speed-sensitive steering, handbrake reduces rear frictionSlip for drift, downforce scaled with speed, air control via torque when wheelsInContact<2, anti-roll damping angular velocity, fallback kinematic if physics not ready. Tuning panel (T) live-adjusts engine/grip/steer and suspension stiffness.
- **Phase 2**: Chose floating origin (shift world when player >2km from origin) over camera-relative. Reason: simpler chunk and collider management, handles Rapier world which expects finite coords. Terrain uses simplex-noise fractal per region; chunk generation main-thread with 4ms time budget (Worker stub for future). Heightfield collider per chunk (Rapier heightfield with scale 256). Fog distance tied to chunk radius. Water plane at south edge -3.5m with wobble. Spawn at suburb border ~1100m from center at angle 0.7 rad. Vegetation/buildings deferred to Phase 4.
- Floating origin updates both mesh positions and collider translations and vehicle body; all stored in originOffset.

- **Phase 2 Checklist**: Build passes, chunks stream smoothly, no fall-through (heightfield colliders + fallback ground plane removed after init), floating origin correct.

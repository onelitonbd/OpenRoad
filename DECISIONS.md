# DECISIONS.md

Short notes about the technical decisions taken while building the game.
Every entry explains *why* something was done a certain way, so a future
reader (or a future agent) does not have to rediscover it.

---

## Phase 0 - Project setup

### Vite 8 + TypeScript 5.9, no UI framework
Plain HTML/CSS overlay for the UI. The game only needs a handful of panels
and a HUD, so a framework would add more weight than it saves.

### Rapier `compat` build instead of the plain build
`@dimforge/rapier3d-compat` inlines the WASM module as base64. That makes the
bundle bigger (about 1.7 MB gzipped instead of about 1.2 MB) but it removes
every "serve the .wasm with the right MIME type" problem on static hosts.
Decision: reliability first. Revisit in the optimisation phase if the
download size becomes a problem.

### Fixed 60 Hz physics with a render interpolation factor
The car handling must not depend on the monitor refresh rate, so the
simulation always runs in 1/60 s steps and rendering happens once per frame.
If the browser cannot keep up, at most 5 steps run per frame and the
remaining time is dropped (no spiral of death).

### Debug overlay on `F3`
FPS, draw calls, triangles, memory and chunk counters. Needed for every
performance decision later on.

---

## Phase 1 - Drivable car

### The car faces local **+Z**
Three.js models usually face -Z, but building the procedural mesh around +Z
means the forward vector is `(0, 0, 1)` and the maths stays readable.
Consequence: with +Y up and +Z forward, the driver's **right is -X**.

### Every wheel uses the axle `(-1, 0, 0)`
Rapier derives the rolling direction of a wheel from `contactNormal x axle`.
If the left and right wheels use mirrored axles, they roll in opposite
directions and the car spins on the spot. All four wheels therefore share
the same axle direction.

### The Rapier steering angle is negated
Rapier turns the car to the **left** for a positive steering angle (the
rotation is applied around the up axis). Since our input convention is
"positive = right", the value is negated before it is handed to Rapier.

### Mass properties are set explicitly
`ColliderDesc.setMassProperties()` is used instead of a density, because the
game wants an exact mass (1350 kg) and a **low centre of mass** (0.36 m above
the road). A low centre of mass is what stops the car from tipping over in
corners. The inertia tensor is the box approximation.

### The suspension numbers are "per unit of mass"
Rapier computes the suspension force as
`stiffness * (restLength - currentLength) * chassisMass`.
That means the static compression is `g / (4 * stiffness)` and does *not*
depend on the car's mass - a heavier car just sits a little lower for the
same stiffness. The numbers in `cars.ts` were chosen with that formula in
mind (stiffness 45 -> about 5.5 cm of static compression).

### Brake force is stored in newtons
Rapier expects a brake **impulse**, so the code multiplies the configured
brake force (newtons) by the time step before handing it over. The engine
force is already a force and is used as-is.

### `applyImpulse` instead of `addForce`
**Important:** in Rapier, `addForce` / `addTorque` keep adding to the body's
accumulated force and are *never* reset automatically - the downforce and the
assist torques piled up every frame and pinned the car to the ground after
a few seconds. Everything in the vehicle now uses impulses
(`applyImpulse`, `applyTorqueImpulse`), which are applied exactly once.

### Ride height is computed, not guessed
The wheel connection point is derived from the wanted ground clearance:

```
staticCompression = g / (4 * stiffness)
wheelCentreY     = wheelRadius - (groundClearance + halfHeight)
connectionY      = wheelCentreY + restLength - staticCompression
```

This keeps the visual mesh, the collision box and the physics in agreement
for every car in the catalogue.

### Anti bottom-out guard
When the suspension is more than 65 % compressed the engine force is reduced.
Without it, a hard launch squats the car onto its body panel and the drive
force is cancelled by the friction of the body against the road.

### Head-less physics test harness
`tools/vehicle-test.ts` boots the real Rapier world and prints the car's
telemetry while it accelerates, steers and drifts. All the handling numbers
were tuned with this tool - it is much faster than a browser and it caught
several physics bugs that were invisible on screen.

---

## Phase 2 - Terrain and chunk streaming

### Floating origin is **not** used
The world is 8 km x 8 km, which fits comfortably into a 32 bit float
mantissa: at 4000 m the precision is around 0.0005 m, far below what the
player can see. A floating origin would add complexity (re-basing every
mesh, collider and entity) for no visible benefit, so the world stays
centred on the origin and the player simply drives away from it.

### Terrain colliders are trimeshes built from the render mesh
A Rapier heightfield cannot be aligned exactly with the rendered vertices,
which would make the car float above or sink into the road. Building a
trimesh from the same vertex buffer guarantees that the visual surface and
the collision surface are identical. `TriMeshFlags.FIX_INTERNAL_EDGES` stops
the car from catching on the internal triangle edges.

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

### The chunk worker gets the road network too
The terrain under a road is flattened, so the worker needs the road
geometry to build the same heights as the main thread. The network is sent
once (as plain arrays of points, heights and widths) when the worker starts.
`RoadFlattener` exists only for this: it is a stripped down copy of the road
network without the graph, so the worker does not need the whole class.

### The land is lifted five metres above the sea
The city was exactly at sea level, so the water plane was drawn on top of
the streets. The whole continent now starts at `+5 m` and the coast slope
takes it back down below the water.

### The chunk heights are sampled with a ring of extra vertices
The colour of a vertex depends on the slope, and the slope needs the height
of the neighbouring chunk. Without the extra ring the border vertices got a
one sided slope, which showed up as a visible seam between the chunks.
The ring costs about 25 % more noise samples and removes the seam.

---

## Phase 3 - Roads

### The road network is a graph of edges, not a list of splines
Every edge has two nodes, a list of centre line points and the matching
heights. The nodes are what makes the traffic lights, the AI paths and the
junctions possible later on.

### The road heights are the raw terrain heights
An earlier version smoothed the height profile. That made two crossing roads
sit at different heights, which produced a visible step in the middle of the
junction. Without the smoothing the roads use the terrain height directly,
so crossing roads always meet at the same height.

### The network is connected after it is generated
The regions are built separately, so the highways started as islands that
nothing could reach. `connectComponents()` links the parts with the
shortest connection, so the whole network is one graph (287 of 287 nodes are
reachable).

### The roads are drawn as ribbons, not as road meshes per chunk
One mesh per road edge is simpler than splitting the roads at the chunk
border and it cannot produce gaps. The roads are built in world space and
offset `+6 cm` above the terrain, which is enough to avoid z-fighting.

### The ribbon winding has to face up
The first version of the ribbon was wound the other way round, so Three.js
culled the whole road and the streets were invisible. The junction patches
had the same problem.

---

## Phase 4 - Buildings, props and the minimap

### Buildings stand clear of the road
The setback is calculated from the size of the building: the edge of the
building is `pavement` metres behind the kerb. The first version placed the
*centre* of the tower next to the road, so the tower stood on the street and
the player spawned inside it.

### Instanced meshes need their bounding sphere recomputed
Three.js caches the bounding sphere of an `InstancedMesh`. The mesh was
built while the player was in the city, where there are no props, so the
sphere stayed empty and the props were culled for the whole game.
`computeBoundingSphere()` is called after every update now.

### The colours are converted from sRGB to linear
The terrain colours and the canvas textures are picked like in a colour
picker (sRGB), but the renderer works with linear values. Without the
conversion everything looked washed out.

### The head-less browser test is part of the workflow
`tools/smoke/` loads the real game in a head-less browser, drives it and
takes a screenshot. It found the camera bug, the invisible roads, the
buildings on top of the road and the car falling through the world - none
of those show up in a unit test.

### The camera rig drives the camera of the renderer
There used to be two cameras: one in the renderer and one in the camera rig.
Only the renderer one was used for the picture, so the car was never in
view. The rig now configures the camera of the renderer.

---

## Phase 5 - AI traffic

### The lane paths are resampled at four metres
The centre line of a road is a coarse polyline - a short street can have
only three points over 27 m. The pure pursuit controller aims at a point a
few metres ahead on the lane, so a coarse lane made the AI cars steer in
the wrong direction and drive off the road. `getLanePath()` now resamples
the lane in even four metre steps (and caches the result).

### The lanes of the opposite direction run from `b` to `a`
The first version built the reversed lane in the same order as the normal
one, so the distance along the lane did not match the direction of travel.
The cars drove backwards on half of the roads. The lane points are now
built in the direction of travel.

### The steering sign is the opposite of the heading error
The heading of a car is `atan2(x, z)`, so a **bigger** heading means a turn
to the **left**. The pure pursuit error therefore has to be negated, and
the lateral offset (the distance to the lane, measured to the right) is
added. Getting this wrong is invisible in the code and very visible in the
game: the cars steered away from their lane.

### The AI cars never engage the reverse gear
The `Vehicle` class uses the brake key to reverse when the car is nearly
stopped. The AI cars brake a lot (for red lights and for the car in
front), so they rolled backwards. `Vehicle.allowReverse` is `false` for the
traffic.

### The traffic has its own collision group
The AI cars got wedged into each other in the junctions and piled up. They
now use their own collision group (`GROUP.TRAFFIC`): they hit the world and
the player, but not each other. The traffic still keeps its distance to the
other cars - that is done by the AI, not by the physics.

### A car that is stuck is put back on its lane
If a car wants to drive but does not move (and neither waits for a light
nor queues up behind another car), it has been rammed or wedged. After six
seconds it is rebuilt at a free place on its lane. Rebuilding the vehicle
is safer than moving the running one: a body that is teleported makes the
suspension explode.

### A car only drives with physics when the ground is ready
Switching a car from the cheap movement to the full physics makes it a
dynamic body. If the chunk below it is still streaming in, there is no
collider and the car falls through the world. The traffic manager asks the
chunk manager whether the ground is ready before it switches.

### The traffic lights are instanced
There are over a hundred junctions with a light in the city. As separate
meshes they cost about 150 draw calls; as two instanced meshes (the poles
and the lamps) they cost two. The lamps use a per instance colour, so they
can change their colour without a new draw call.

### The pole stands in the corner of the junction
The first version put the pole on the centre line of the junction - the
cars drove through it. The pole now searches for the closest spot that is
at least 1.3 m away from the kerb of every road around the junction.

### Ten minutes of traffic are part of the test suite
`tools/traffic-test.ts` simulates ten minutes of traffic and checks that the
cars stay on the roads, do not fall through the world, do not get stuck and
keep moving. The head-less test found every one of the bugs above.

### The deployed build is checked on a GitHub runner
The machine that develops the game can only reach GitHub, npm and PyPI: a
request to the deployment host is closed by the network before the TLS
handshake. A browser check against the live URL is therefore not possible
from the sandbox, so `tools/smoke/production-smoke.mjs` runs in the
workflow `.github/workflows/production-smoke.yml` on a GitHub runner, which
has a normal internet connection. The workflow keeps the report and the
screenshot in the branch, so the result of the check is part of the
repository.

### The smoke test drives before it looks at the traffic
A freshly loaded game has no traffic yet: the cars spawn in a ring around
the player after the first frames. The production smoke test therefore
drives for a few seconds before it reads the traffic, otherwise it would
report an empty street for a working build.

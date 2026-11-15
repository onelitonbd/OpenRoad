# Open Road

A browser based 3D open world arcade driving game built with **Three.js**,
**TypeScript**, **Vite** and **Rapier** physics.

Drive a car through a large procedurally generated world: downtown
skyscrapers, suburbs, highways, countryside, mountains, desert and a coast.

> Status: **Phases 0 - 5 complete.** The world streams in, the road network
> connects every region, the city is filled with buildings and props, the
> minimap shows the roads around you and the traffic drives on the roads
> next to you. Day/night, weather and the menus are still to come.

---

## Quick start

```bash
npm install
npm run dev        # development server on http://localhost:5173
npm run build      # type check + production build into dist/
npm run preview    # serve the production build locally
```

The production build is a plain static site - it can be hosted on Vercel,
GitHub Pages, Netlify or any static host.

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel: **Add New -> Project** and import the repository.
3. Vercel detects Vite automatically. Build command `npm run build`,
   output directory `dist`.
4. Done. Every push produces a new preview URL.

No environment variables are required for the current phase.

### Live build

The current build is deployed on the production alias:

**https://openroad-six-ivory.vercel.app/**

It is served by Vercel deployment `dpl_A4jtFaXGRB2Z4QLdHMcKZseFra91`
(built from commit `bccb9ab`, state `READY`, substate `PROMOTED`, aliases
`openroad-six-ivory.vercel.app`, `openroad-onelitonbds-projects.vercel.app`
and the branch alias). The deployment is checked with the production smoke
test below - on the desktop **and** as a phone.

The smoke test also checks the two things that were broken: the road
network has to stay exactly the same while the player drives (no road
may appear out of nowhere), and the brake has to stop the car without
engaging the reverse gear.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Throttle | `W` / `Up` | **GAS** pedal |
| Brake | `S` / `Down` | **BRAKE** pedal |
| Reverse | `X` | **REV** pedal |
| Steer | `A` `D` / `Left` `Right` | **◀ ▶** buttons or drag on the left half |
| Handbrake (drift) | `Space` | **HAND BRAKE** |
| Change camera | `C` | **CAM** |
| Headlights | `L` | **LGT** |
| Horn | `H` | **HORN** |
| Reset car | `R` | **RST** |
| Pause | `Esc` | **II** |
| Full screen | - | **FULL** |
| Photo mode | `P` | Menu |
| Debug overlay | `F3` | - |
| Handling tuning panel | `T` | - |
| Minimap north-up / rotating | `M` | - |

Cameras: chase (default), far chase, hood and cockpit.

The brake only ever stops the car - it never pushes you backwards. The
reverse is a pedal of its own: press `X` (or the **REV** button on a
phone) and the car drives backwards at up to 29 km/h. Press the throttle
to drive forward again.

## On a phone

The game detects a phone or a tablet and then shows the on-screen controls:
big pedals in the bottom right corner, the steering buttons and a drag
area in the bottom left corner and the small buttons (camera, lights,
horn, reset, pause, full screen) in the top left corner. The keyboard
hint disappears, because it is useless on a phone.

The game is played in **landscape**:

- The **FULL** button puts the page into the full screen mode and asks the
  browser to lock the screen to landscape. That works on Android.
- iOS has no full screen and no orientation lock for web pages, so the
  phone has to be turned by hand. While the phone is held upright a
  "Turn your phone" screen covers the game and the simulation waits.
- Every button uses pointer events with a pointer capture, so the gas
  pedal stays pressed when the thumb slides and the car can be steered
  and accelerated at the same time.



## The world

| Region | What you find there |
|---|---|
| Downtown | A street grid with avenues, skyscrapers and lane markings |
| Suburbs | Detached houses, street lamps and small gardens |
| Countryside | Farms, barns, haystacks, fields and long rural roads |
| Mountains | Rocky ridges, pine forests and switchback roads |
| Desert | Dunes, cacti and rocks |
| Coast | A beach, palm trees and a lighthouse |

Five landmarks are placed by hand: **The Spire** (a tower in the middle of
the city), **Kestrel Light** (a lighthouse on the coast), **Old Mill** and
**Hill Mill** (windmills in the countryside) and **Beacon Hill** (a radio
mast in the mountains). They are drawn on the minimap.

Everything is generated from one seed (currently `1337`), so the world is
the same every time you start the game.

The map is **fixed**: 8 km by 8 km, built once when the game starts. No
road is ever created while you drive - what appears in front of you is
the terrain streaming in (the fog hides the border). The edge of the map
is drawn on the minimap, and the land falls into the sea there, so you
can see where the world ends. `tools/smoke/shots/map.png` is the whole
road network in one picture.

## The traffic

The AI traffic spawns in a ring of 150 - 400 m around the player and is
removed again when it is more than 520 m away. The number of cars depends
on the quality preset (Low 15, Medium 30, High 50).

Every car drives on a **lane** of the road network: it follows the lane,
keeps to the right side, obeys the speed limit of the road, slows down
before a sharp corner and keeps a distance to the car in front of it. At a
junction in the city it waits for the traffic light, everywhere else the
car with the priority goes first.

The nearest ten cars are simulated with the full vehicle physics, so the
player can hit them and they react to the hit. All the other cars only
follow their lane, which is much cheaper. The switch happens without a
visible jump.

The traffic lights are drawn as poles at the kerb of the junctions. The
poles and the lamps are instanced, so the whole city only costs a couple of
draw calls. Press `F3` to see the lanes the AI cars drive on.

## Project layout

See `PROJECT.md` for the full design document and `DECISIONS.md` for the
technical decisions that were made along the way.

```
src/
  core/       Game loop, renderer, input, settings, event bus
  physics/    Rapier wrapper and collision groups
  vehicles/   Vehicle physics, car data, procedural car mesh, cameras
  ui/         HUD, minimap, tuning panel, styles
  utils/      Math, seeded random, object pool, debug overlay
  world/      Terrain, regions, chunk streaming, roads, buildings, props
  ai/         Traffic manager, AI cars and the traffic lights
  environment/(Phase 6+) Sky, day/night cycle, weather
  audio/      (Phase 7+) Engine and ambient sound
  save/       (Phase 7+) Local and cloud saves
```

## Development helpers

The test harnesses live in `tools/`. They are bundled with rolldown before
they run in Node, so the real game code is exercised without a browser.

```bash
npm run test:vehicle   # the car accelerates, steers, drifts and brakes
npm run test:terrain   # ASCII map of the world and the region heights
npm run test:roads     # the road graph: length, connectivity, flat roads
npm run test:world     # drives the car over the generated terrain colliders
npm run test:rapier    # the official Rapier vehicle example, for comparison

npm run test:traffic         # ten minutes of AI traffic: no jams, no crashes
npm run test:traffic-poles   # the traffic lights stand next to the road
npm run test:traffic-player  # the player can hit an AI car and it reacts
npm run test:mobile          # the touch controls on a phone in landscape
npm run test:map-shot        # a picture of the whole road network
```

### Head-less browser test

There is also a test that opens the real game in a head-less browser, drives
it and takes a screenshot. It needs a Chromium build, which comes from the
`@sparticuz/chromium` package (a development dependency):

```bash
npm install
npm run build
npm run preview &          # serves the build on http://127.0.0.1:4173
npm run test:smoke         # loads the game, drives it, prints the stats
npm run test:tour          # a screenshot of every region
npm run test:traffic-shot  # a screenshot of the traffic on the road
npm run test:light-shot    # a screenshot of a traffic light
npm run test:debug-shot    # a screenshot of the F3 debug view
npm run test:mobile        # the touch controls, as an Android phone
```

This is how most of the bugs in the world were found - the camera pointed
the wrong way, the roads were invisible and the car fell through the
terrain, none of that shows up in a unit test.

### Production smoke test

`tools/smoke/production-smoke.mjs` does the same thing against the
**deployed** build: it loads the Vercel URL in Chromium, drives for a few
seconds and checks that there are no console errors, that something was
drawn and that the AI traffic is driving (cars, cars with physics, moving
cars, no car under the ground). It writes a JSON report and a screenshot.

The machine that develops the game can only reach GitHub, npm and PyPI, so
the browser check against the deployment runs on a GitHub runner:

```bash
gh workflow run production-smoke --ref arena/5e01b9ed-openroad
gh run watch
```

The workflow keeps the report in `tools/smoke/production-report.json` and
the screenshot in `tools/smoke/shots/production-phase5.png`. The last run
against the live build reported 15 AI cars (3 with physics), all of them
moving, 103 traffic lights, 162 draw calls, no console errors - and on a
phone: the touch controls with 11 buttons, the full screen button and the
"turn your phone" screen in portrait.

## Performance

The default quality preset is **Low** so the game runs on weak hardware.
Press `F3` for the debug overlay (FPS, draw calls, triangles, chunk count).

The world is streamed in 256 m chunks. A chunk is generated in a Web Worker
and turned into a mesh plus a Rapier collider on the main thread, with a
budget of 4 ms per frame. Buildings, props and the traffic lights are
instanced, so a whole city block costs a handful of draw calls.

Only the ten AI cars closest to the player use the vehicle physics; the
rest of the traffic is moved along the lane, which costs almost nothing.

> The FPS numbers in the head-less test are not representative: the test
> browser renders with the software rasteriser (SwiftShader), which is about
> twenty times slower than a real GPU. The draw call and triangle counts in
> the overlay are the useful numbers.

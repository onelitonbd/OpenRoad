# Assets

Every 3D file that ships with Open Road, where it comes from and what may be
done with it.

---

## Kenney Car Kit 3.1

| | |
|---|---|
| **Author** | Kenney (www.kenney.nl) |
| **Source** | https://kenney.nl/assets/car-kit |
| **Mirror used** | https://github.com/Arslan12216775/kenney_car-kit |
| **Licence** | Creative Commons Zero (CC0 1.0) - public domain, no attribution required |
| **Licence file** | `public/models/kenney-car-kit-license.txt` |
| **Format** | GLB (glTF 2.0), one colour atlas per file, Y up / Z forward |

The kit contains about 40 low poly cars, vans and trucks. The models that
are used in Open Road:

| File | Used for | Paint |
|---|---|---|
| `public/models/sedan-sports.glb` | the player car (Comet GT) | `#ff5d5d` |
| `public/models/sedan.glb` | traffic: sedan | `#c8ccd4` |
| `public/models/hatchback-sports.glb` | traffic: hatchback | `#9fd0b0` |
| `public/models/van.glb` | traffic: van | `#e2e6ea` |
| `public/models/truck-flat.glb` | traffic: pickup | `#9fb0c4` |
| `public/models/taxi.glb` | traffic: taxi | `#f0c33c` |
| `public/models/suv.glb` | traffic: compact | `#7f96ad` |

### How the files were prepared

The kit is not modified by hand. `tools/prepare-car-model.mjs` takes a model
of the kit and writes a new GLB in which the **paint swatch of the colour
atlas is replaced** with the colour of the car:

```bash
node tools/prepare-car-model.mjs \
  "<kit>/Models/GLB format/sedan-sports.glb" \
  public/models/sedan-sports.glb "#ff5d5d"
```

The script

1. finds the swatch of the atlas that the body mesh uses the most (that is
   the paint),
2. replaces that swatch with the wanted colour and keeps the shading of the
   atlas,
3. writes the PNG and the GLB again.

The geometry is **not** changed by the script - the game stretches and bends
the model when it is loaded (see `CarFactory.ts`).

### Rules for new models

- Only CC0 (or equally free) models may be used.
- The four wheels have to be separate objects. The names
  `wheel-front-left`, `wheel-front-right`, `wheel-back-left` and
  `wheel-back-right` are understood, as are `wheel_fl` and friends. When the
  names are useless the position of the wheels is used instead.
- The model has to face **+Z** and stand on **y = 0** (the bottom of the
  tyres).
- The car must look right without a logo or a brand.

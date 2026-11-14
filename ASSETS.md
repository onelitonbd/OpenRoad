# ASSETS.md — sources & licenses

## Code-generated (no external download)
- Car meshes: procedural low-poly via Three.js Box/Cylinder in `CarFactory` (own)
- Terrain: simplex-noise heightfield, vertex colors
- Roads: extruded ribbons, lane markings instanced
- Buildings/props: instanced Boxes, Cones, Cylinders, Dodecahedron (own)
- Sky: Three.js Sky shader (MIT, Three.js), stars points, moon sphere, cloud dome
- Audio fallback: Web Audio oscillator engine (no files)

## Free external (CC0 where noted, kept total <15 MB)
- No GLB models in bundle yet — all procedural fallbacks satisfy gameplay.
- When adding assets, prefer:
  - Kenney.nl (CC0) — car kits, buildings
  - Quaternius (CC0) — vehicles
  - Poly Pizza (CC0) — props
  - freesound.org / Pixabay — engine.ogg, skid.ogg, crash.ogg, ambient_*.ogg (record per file)
- Current audio: synthesized oscillator + filtered noise (no files, no license needed)

## Record format for future assets
| File | Source | License | Link |
|------|--------|---------|------|
| (none yet) | — | — | — |

All invented car names avoid real brands/trademarks. Keep each car <5k tris, <500 KB compressed.

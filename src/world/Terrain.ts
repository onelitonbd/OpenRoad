import { createNoise2D } from 'simplex-noise';
import { makeRandom } from '../utils/random';
import { regionWeights, dominantRegion, type RegionId, type RegionWeights } from './Regions';
import type { RoadFlattener } from './RoadFlattener';

/** World constants shared by the terrain, the chunk manager and the roads. */
export const WORLD_SIZE = 8000;
export const WORLD_HALF = WORLD_SIZE / 2;
export const CHUNK_SIZE = 256;
export const SEA_LEVEL = 0;
/** Where the land ends and the sea begins (along +Z). */
export const COAST_LINE = 3000;

/**
 * The terrain height function.
 *
 * `height(x, z)` is the single source of truth for the shape of the world.
 * The mesh, the physics collider and the road flattening all use it, which
 * guarantees that the car never floats above or sinks into the ground.
 */
export class Terrain {
  /** Seed of the world (the same seed always builds the same map). */
  readonly seed: number;

  /**
   * The roads of the world. When it is set, `groundHeight()` flattens the
   * terrain under the roads so they are always drivable.
   */
  flattener: RoadFlattener | null = null;

  private readonly noiseA: (x: number, y: number) => number;
  private readonly noiseB: (x: number, y: number) => number;
  private readonly noiseC: (x: number, y: number) => number;

  constructor(seed: number) {
    this.seed = seed;
    // Three independent noise fields, each with its own random source.
    this.noiseA = createNoise2D(makeRandom(seed));
    this.noiseB = createNoise2D(makeRandom(seed ^ 0x9e3779b9));
    this.noiseC = createNoise2D(makeRandom(seed ^ 0x85ebca6b));
  }

  /** Fractal brownian motion in the range [-1, 1]. */
  private fbm(
    noise: (x: number, y: number) => number,
    x: number,
    z: number,
    octaves: number,
    frequency: number,
  ): number {
    let amplitude = 1;
    let sum = 0;
    let norm = 0;
    let freq = frequency;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, z * freq) * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  /** Region weights at a position (used for colouring and for the terrain). */
  weightsAt(x: number, z: number): RegionWeights {
    const warp = this.noiseC(x * 0.0009, z * 0.0009);
    return regionWeights(x, z, warp);
  }

  /** The dominant region at a position. */
  regionAt(x: number, z: number): RegionId {
    return dominantRegion(this.weightsAt(x, z));
  }

  /**
   * The terrain height at a position (before roads flatten it).
   * Metres above sea level.
   */
  height(x: number, z: number): number {
    const w = this.weightsAt(x, z);

    // Base landscape: large rolling hills.
    const base = this.fbm(this.noiseA, x, z, 4, 0.00085);
    // Medium detail.
    const detail = this.fbm(this.noiseB, x, z, 3, 0.006);
    // Ridged noise - sharp mountain ridges.
    const ridgeNoise = this.fbm(this.noiseB, x + 5000, z - 3000, 4, 0.0016);
    const ridge = 1 - Math.abs(ridgeNoise) * 2;

    let h = 0;

    // Downtown is completely flat.
    h += w.downtown * 0;

    // Suburbs: gentle rolling hills.
    h += w.suburb * (base * 3.5 + detail * 0.9);

    // Countryside: rolling plains with gentle hills.
    h += w.countryside * (base * 11 + detail * 2.4);

    // Mountains: tall ridges with rocky detail.
    h += w.mountain * (ridge * 78 + base * 16 + detail * 3.5);

    // Desert: smooth dunes.
    const dunes = Math.sin(x * 0.012 + this.noiseA(x * 0.0004, z * 0.0004) * 4) * 0.5 + 0.5;
    h += w.desert * (dunes * 6 + base * 4 + detail * 0.6);

    // Coast: the land slopes down into the sea.
    const coastT = Math.max(0, (z - (COAST_LINE - 350)) / 350);
    const coastHeight = -Math.pow(coastT, 1.6) * 26 - base * 1.5;
    h += w.coast * coastHeight;

    // Beyond the coast line the ground keeps going down.
    if (z > COAST_LINE) {
      h -= (z - COAST_LINE) * 0.05;
    }

    // The world edge falls away so the player can see the boundary.
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > WORLD_HALF - 600) {
      const t = (edge - (WORLD_HALF - 600)) / 600;
      h -= t * t * 40;
    }

    return h;
  }

  /**
   * The height of the ground the player drives on: the terrain height with
   * the roads flattened into it.
   */
  groundHeight(x: number, z: number): number {
    const raw = this.height(x, z);
    if (!this.flattener) return raw;
    return this.flattener.groundHeight(x, z, raw);
  }

  /**
   * The colour of the ground at a position.
   * Returns an RGB triple in the 0..1 range.
   */
  colorAt(x: number, z: number, height: number, slope: number): [number, number, number] {
    const w = this.weightsAt(x, z);

    // Grass / ground base colours per region.
    const grass: [number, number, number] = [0.42, 0.62, 0.27];
    const suburb: [number, number, number] = [0.45, 0.65, 0.3];
    const field: [number, number, number] = [0.55, 0.66, 0.32];
    const rock: [number, number, number] = [0.48, 0.45, 0.42];
    const sand: [number, number, number] = [0.88, 0.76, 0.52];
    const city: [number, number, number] = [0.5, 0.51, 0.53];

    let r = grass[0];
    let g = grass[1];
    let b = grass[2];

    r = r * (1 - w.suburb) + suburb[0] * w.suburb;
    g = g * (1 - w.suburb) + suburb[1] * w.suburb;
    b = b * (1 - w.suburb) + suburb[2] * w.suburb;

    r = r * (1 - w.countryside) + field[0] * w.countryside;
    g = g * (1 - w.countryside) + field[1] * w.countryside;
    b = b * (1 - w.countryside) + field[2] * w.countryside;

    r = r * (1 - w.mountain) + rock[0] * w.mountain;
    g = g * (1 - w.mountain) + rock[1] * w.mountain;
    b = b * (1 - w.mountain) + rock[2] * w.mountain;

    r = r * (1 - w.desert) + sand[0] * w.desert;
    g = g * (1 - w.desert) + sand[1] * w.desert;
    b = b * (1 - w.desert) + sand[2] * w.desert;

    r = r * (1 - w.coast) + sand[0] * w.coast;
    g = g * (1 - w.coast) + sand[1] * w.coast;
    b = b * (1 - w.coast) + sand[2] * w.coast;

    // The city centre is paved.
    r = r * (1 - w.downtown) + city[0] * w.downtown;
    g = g * (1 - w.downtown) + city[1] * w.downtown;
    b = b * (1 - w.downtown) + city[2] * w.downtown;

    // Steep slopes turn into rock.
    if (slope > 0.35) {
      const t = Math.min(1, (slope - 0.35) / 0.4);
      r = r * (1 - t) + rock[0] * t;
      g = g * (1 - t) + rock[1] * t;
      b = b * (1 - t) + rock[2] * t;
    }

    // Snow on the high mountain peaks.
    if (height > 52) {
      const t = Math.min(1, (height - 52) / 22);
      r = r * (1 - t) + 0.94 * t;
      g = g * (1 - t) + 0.95 * t;
      b = b * (1 - t) + 0.98 * t;
    }

    // The beach right at the water line.
    if (height < 1.6 && height > -3 && w.coast > 0.2) {
      const t = 1 - Math.min(1, Math.max(0, height) / 1.6);
      r = r * (1 - t) + 0.9 * t;
      g = g * (1 - t) + 0.84 * t;
      b = b * (1 - t) + 0.66 * t;
    }

    // A little per-vertex variation so large areas are not completely flat.
    const v = this.noiseC(x * 0.08, z * 0.08) * 0.035;
    return [r + v, g + v, b + v];
  }
}

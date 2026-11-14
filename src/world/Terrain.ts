// Terrain.ts — deterministic height(x,z) using simplex-noise, region-modulated, road-flattened via callback
import { createNoise2D } from 'simplex-noise';
import { seededRng } from '../utils/random';
import type { Regions } from './Regions';

export class Terrain {
  private noise2D: ReturnType<typeof createNoise2D>;
  private noise2D_2: ReturnType<typeof createNoise2D>;
  private noise2D_3: ReturnType<typeof createNoise2D>;
  private seed: number;
  private regions: Regions;

  // Optional road height provider for flattening — set by World after RoadNetwork init
  roadHeightAt: ((x:number, z:number)=>number | null) | null = null;

  constructor(seedStr: string, regions: Regions) {
    const rng = seededRng(seedStr);
    this.seed = Math.floor(rng()*1e9);
    this.noise2D = createNoise2D(rng);
    this.noise2D_2 = createNoise2D(rng);
    this.noise2D_3 = createNoise2D(rng);
    this.regions = regions;
  }

  // Base height without road flattening — used for road network generation (avoid circular)
  rawHeight(x:number, z:number): number {
    const region = this.regions.regionAt(x,z).id;
    // Downtown flat: near 0
    if (region === 'downtown') {
      // small undulation 0.5m
      return this.noise2D(x*0.008, z*0.008) * 0.5;
    }
    if (region === 'coast') {
      // slope down to sea level -4 to 2m as we go south
      const south = Math.max(0, -2800 - z); // 0 at -2800, up to 1200
      const seaLevel = -4 + (2 - (-4)) * (1 - Math.min(1, south/900));
      // beach flat, then descend
      return seaLevel + this.noise2D(x*0.012, z*0.012)*0.6;
    }
    if (region === 'mountains') {
      // fractal high terrain
      const n1 = this.noise2D(x*0.0012, z*0.0012) * 55;
      const n2 = this.noise2D_2(x*0.004, z*0.004) * 18;
      const n3 = this.noise2D_3(x*0.015, z*0.015) * 6;
      // corner peak boost
      const peak = Math.max(0, (1200 - Math.hypot(x-3000, z-3000))/1200);
      return n1 + n2 + n3 + peak * 45;
    }
    if (region === 'desert') {
      // dunes
      const dune = this.noise2D(x*0.003, z*0.003) * 8 + this.noise2D_2(x*0.02, z*0.02)*1.5;
      return dune;
    }
    if (region === 'suburbs') {
      // gentle hills 3-7m
      return this.noise2D(x*0.004, z*0.004)*4 + this.noise2D_2(x*0.012, z*0.012)*1.2;
    }
    // countryside rolling plains 2-10m
    return this.noise2D(x*0.0025, z*0.0025)*7 + this.noise2D_2(x*0.01, z*0.01)*1.8 + this.noise2D_3(x*0.03, z*0.03)*0.6;
  }

  // Public height with road flattening blend
  height(x:number, z:number): number {
    const base = this.rawHeight(x,z);
    if (!this.roadHeightAt) return base;
    const roadH = this.roadHeightAt(x,z);
    if (roadH === null) return base;
    // roadH is object with {height, dist}? For now callback returns height if near road else null
    // But we want blending: near road flatten toward road height
    // We overload callback to return flattened height directly
    return roadH;
  }

  // Helper to compute normal via finite differences (fallback when not using mesh normals)
  normal(x:number, z:number): { x:number, y:number, z:number } {
    const eps = 0.5;
    const hL = this.height(x - eps, z);
    const hR = this.height(x + eps, z);
    const hD = this.height(x, z - eps);
    const hU = this.height(x, z + eps);
    const dx = (hR - hL) / (2*eps);
    const dz = (hU - hD) / (2*eps);
    const n = { x: -dx, y: 1, z: -dz };
    const len = Math.hypot(n.x, n.y, n.z);
    n.x/=len; n.y/=len; n.z/=len;
    return n;
  }

  // Utility to sample height for an array of positions (for chunk generation)
  sampleGrid(minX:number, minZ:number, size:number, verts:number): Float32Array {
    const heights = new Float32Array(verts*verts);
    const step = size / (verts - 1);
    for (let iz=0; iz<verts; iz++) {
      for (let ix=0; ix<verts; ix++) {
        const x = minX + ix*step;
        const z = minZ + iz*step;
        heights[iz*verts + ix] = this.height(x,z);
      }
    }
    return heights;
  }
}

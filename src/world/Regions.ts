// Regions.ts — deterministic region map from seed
import { createNoise2D } from 'simplex-noise';
import { seededRng } from '../utils/random';

export type RegionId = 'downtown' | 'suburbs' | 'countryside' | 'highway' | 'mountains' | 'desert' | 'coast';

export interface RegionInfo {
  id: RegionId;
  weight: number; // 0..1 confidence
  blend: Partial<Record<RegionId, number>>; // normalized weights if blended
  color: string;
}

const REGION_COLORS: Record<RegionId, string> = {
  downtown: '#94a3b8',
  suburbs: '#86efac',
  countryside: '#7ec96a',
  highway: '#52525b',
  mountains: '#a8a29e',
  desert: '#fde68a',
  coast: '#7dd3fc',
};

// World size 8000, centered at 0
const HALF = 4000;

export class Regions {
  private noise: ReturnType<typeof createNoise2D>;
  private seed: number;

  constructor(seedStr: string) {
    const rng = seededRng(seedStr);
    this.seed = Math.floor(rng() * 1e9);
    this.noise = createNoise2D(rng);
  }

  // Low-freq region noise
  private lowNoise(x: number, z: number): number {
    // scale ~ 0.0015 for large features
    return this.noise(x * 0.0012, z * 0.0012);
  }

  regionAt(x: number, z: number): RegionInfo {
    // Distance from center
    const distCenter = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    // Edge distances
    const distToEdgeX = HALF - Math.abs(x);
    const distToEdgeZ = HALF - Math.abs(z);
    const nearEdge = Math.min(distToEdgeX, distToEdgeZ);

    // --- Base region by distance rings + corner overrides ---
    // Coast: south edge (z < -2800) slopes to sea
    if (z < -2800) {
      // Coast weight increases southward
      const coastW = clamp01(( -2800 - z) / 1200 );
      if (coastW > 0.35) return { id: 'coast', weight: coastW, blend: { coast: coastW, countryside: 1-coastW }, color: REGION_COLORS.coast };
    }
    // Mountains: NE corner (x>1800 && z>1800)
    const mountainScore = clamp01( ( (x - 1200)/2800 + (z - 1200)/2800) * 0.5 );
    if (x > 1500 && z > 1500 && mountainScore > 0.3) {
      return { id: 'mountains', weight: mountainScore, blend: { mountains: mountainScore, countryside: 1-mountainScore }, color: REGION_COLORS.mountains };
    }
    // Desert: SW corner (x< -1500 && z> 1500?) or NW? let's pick SW (-x positive west, south is -z, so desert in SE: x>1500, z<-800? choose NW for variety)
    // Use two desert corners: west (-x) and north-west
    const desertScore = clamp01( ( (-1200 - x)/2600 + (z - 800)/2600 ) * 0.6 );
    if (x < -1600 && z > 900 && desertScore > 0.32) {
      return { id: 'desert', weight: desertScore, blend: { desert: desertScore, countryside: 1-desertScore }, color: REGION_COLORS.desert };
    }

    // Downtown: center 0-1100
    if (distCenter < 900) return { id: 'downtown', weight: 1, blend: { downtown: 1 }, color: REGION_COLORS.downtown };
    if (distCenter < 1300) {
      const t = (distCenter - 900) / 400; // 0..1 blend downtown->suburbs
      return { id: 'suburbs', weight: 1, blend: { downtown: 1-t, suburbs: t }, color: REGION_COLORS.suburbs };
    }
    // Suburbs ring 1300-2300
    if (distCenter < 2100) return { id: 'suburbs', weight: 1, blend: { suburbs: 1 }, color: REGION_COLORS.suburbs };
    if (distCenter < 2700) {
      const t = (distCenter - 2100) / 600;
      return { id: 'countryside', weight: 1, blend: { suburbs: 1-t, countryside: t }, color: REGION_COLORS.countryside };
    }

    // Default countryside with noise variation to allow highway pockets
    const n = this.lowNoise(x, z);
    // Highway corridors: long noise ridges (we mark as highway where n ~ 0 narrow band)
    if (Math.abs(n) < 0.08 && distCenter > 1400 && distCenter < 3600) {
      // Highways will be handled by RoadNetwork, but region hints help terrain flattening
      return { id: 'highway', weight: 0.7, blend: { highway: 0.7, countryside: 0.3 }, color: REGION_COLORS.highway };
    }

    return { id: 'countryside', weight: 1, blend: { countryside: 1 }, color: REGION_COLORS.countryside };
  }

  colorFor(id: RegionId): string { return REGION_COLORS[id]; }
}

function clamp01(v:number){ return Math.max(0, Math.min(1, v)); }

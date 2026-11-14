/**
 * The regions of the world.
 *
 * The world is 8 km x 8 km and centred on the origin:
 *
 *   - the **downtown** grid sits in the middle,
 *   - a ring of **suburbs** surrounds it,
 *   - the **coast** with the sea is along the +Z edge,
 *   - the **mountains** are on the -X edge,
 *   - the **desert** is on the +X edge,
 *   - everything else is **countryside**.
 *
 * Every value is a pure function of the position and the world seed, so the
 * whole map is reproducible.
 */

export type RegionId = 'downtown' | 'suburb' | 'countryside' | 'mountain' | 'desert' | 'coast';

export const REGION_IDS: RegionId[] = [
  'downtown',
  'suburb',
  'countryside',
  'mountain',
  'desert',
  'coast',
];

export type RegionWeights = Record<RegionId, number>;

export function emptyWeights(): RegionWeights {
  return { downtown: 0, suburb: 0, countryside: 0, mountain: 0, desert: 0, coast: 0 };
}

/** Smoothstep helper (kept local so this file has no imports). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Region weights at a position.
 *
 * `warp` is a small noise value (-1..1) that makes the borders between the
 * regions look organic instead of like circles.
 */
export function regionWeights(x: number, z: number, warp: number): RegionWeights {
  const w = emptyWeights();

  const dx = x + warp * 180;
  const dz = z + warp * 180;
  const d = Math.hypot(dx, dz);

  w.downtown = 1 - smoothstep(430, 820, d);
  w.suburb = smoothstep(430, 820, d) * (1 - smoothstep(1350, 1950, d));

  // The outer bands. They overlap in the corners on purpose - the weights are
  // normalised afterwards.
  w.mountain = smoothstep(-1500, -2700, dx);
  w.desert = smoothstep(1500, 2700, dx);
  w.coast = smoothstep(1850, 2950, dz);

  let sum = w.downtown + w.suburb + w.mountain + w.desert + w.coast;
  if (sum > 1) {
    // Scale the outer regions down so the centre keeps its full weight.
    const outer = sum - w.downtown - w.suburb;
    const target = 1 - w.downtown - w.suburb;
    const k = outer > 0.0001 ? target / outer : 0;
    w.mountain *= k;
    w.desert *= k;
    w.coast *= k;
    sum = 1;
  }

  w.countryside = Math.max(0, 1 - sum);
  return w;
}

/** The dominant region at a position (used for colours and gameplay). */
export function dominantRegion(w: RegionWeights): RegionId {
  let best: RegionId = 'countryside';
  let bestValue = -1;
  for (const id of REGION_IDS) {
    if (w[id] > bestValue) {
      bestValue = w[id];
      best = id;
    }
  }
  return best;
}

/** Human readable name for the HUD / minimap. */
export const REGION_NAMES: Record<RegionId, string> = {
  downtown: 'Downtown',
  suburb: 'Suburbs',
  countryside: 'Countryside',
  mountain: 'Mountains',
  desert: 'Desert',
  coast: 'Coast',
};

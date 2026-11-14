import { clamp01, lerp } from '../utils/math';

/**
 * A lightweight version of the road network that only knows about the
 * geometry (centre lines, widths and heights).
 *
 * The full `RoadNetwork` stays on the main thread; this stripped down copy is
 * sent to the chunk worker so the terrain can be flattened under the roads
 * without shipping the whole graph.
 */

export interface FlatRoad {
  /** Centre line, flat array of x,z pairs. */
  points: number[];
  /** Height of every centre line point. */
  heights: number[];
  /** Total width of the road in metres. */
  width: number;
}

interface FlatSegment {
  roadIndex: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h0: number;
  h1: number;
  width: number;
}

export interface FlatRoadHit {
  roadIndex: number;
  distance: number;
  height: number;
  x: number;
  z: number;
  /** Position along the segment (0..1). */
  t: number;
  /** Width of the road that was hit. */
  width: number;
}

/** Size of one cell of the spatial index. */
const CELL_SIZE = 64;

/** How far the terrain is flattened next to a road. */
export const ROAD_SHOULDER = 9;

export class RoadFlattener {
  private readonly segments: FlatSegment[] = [];
  private readonly grid = new Map<string, number[]>();

  constructor(roads: FlatRoad[]) {
    for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
      const road = roads[roadIndex];
      const count = road.points.length / 2;
      for (let i = 0; i < count - 1; i++) {
        this.segments.push({
          roadIndex,
          x0: road.points[i * 2],
          z0: road.points[i * 2 + 1],
          x1: road.points[i * 2 + 2],
          z1: road.points[i * 2 + 3],
          h0: road.heights[i],
          h1: road.heights[i + 1],
          width: road.width,
        });
      }
    }
    this.buildIndex();
  }

  private buildIndex(): void {
    this.grid.clear();
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      const margin = s.width / 2 + ROAD_SHOULDER;
      const minX = Math.min(s.x0, s.x1) - margin;
      const maxX = Math.max(s.x0, s.x1) + margin;
      const minZ = Math.min(s.z0, s.z1) - margin;
      const maxZ = Math.max(s.z0, s.z1) + margin;

      for (let cz = Math.floor(minZ / CELL_SIZE); cz <= Math.floor(maxZ / CELL_SIZE); cz++) {
        for (let cx = Math.floor(minX / CELL_SIZE); cx <= Math.floor(maxX / CELL_SIZE); cx++) {
          const key = `${cx},${cz}`;
          let list = this.grid.get(key);
          if (!list) {
            list = [];
            this.grid.set(key, list);
          }
          list.push(i);
        }
      }
    }
  }

  /** The closest road to a position. */
  nearest(x: number, z: number, maxDistance = 80): FlatRoadHit | null {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const cells = Math.max(1, Math.ceil(maxDistance / CELL_SIZE));
    let best: FlatRoadHit | null = null;
    let bestDistance = maxDistance;

    for (let dz = -cells; dz <= cells; dz++) {
      for (let dx = -cells; dx <= cells; dx++) {
        const list = this.grid.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const index of list) {
          const s = this.segments[index];
          const ex = s.x1 - s.x0;
          const ez = s.z1 - s.z0;
          const lenSq = ex * ex + ez * ez;
          const t = lenSq > 1e-9 ? clamp01(((x - s.x0) * ex + (z - s.z0) * ez) / lenSq) : 0;
          const px = s.x0 + ex * t;
          const pz = s.z0 + ez * t;
          const distance = Math.hypot(x - px, z - pz);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = {
              roadIndex: s.roadIndex,
              distance,
              height: lerp(s.h0, s.h1, t),
              x: px,
              z: pz,
              t,
              width: s.width,
            };
          }
        }
      }
    }
    return best;
  }

  /**
   * The ground height including the road flattening.
   * `rawHeight` is the height of the untouched terrain.
   */
  groundHeight(x: number, z: number, rawHeight: number): number {
    const hit = this.nearest(x, z, 80);
    if (!hit) return rawHeight;
    const halfWidth = hit.width / 2;
    if (hit.distance <= halfWidth) return hit.height;
    if (hit.distance >= halfWidth + ROAD_SHOULDER) return rawHeight;
    const t = (hit.distance - halfWidth) / ROAD_SHOULDER;
    return lerp(hit.height, rawHeight, t * t * (3 - 2 * t));
  }
}

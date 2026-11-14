import type { Terrain } from './Terrain';
import { Rng } from '../utils/random';
import { clamp, clamp01, lerp } from '../utils/math';
import { RoadFlattener } from './RoadFlattener';

/** The kind of road - decides the width, the lanes and the speed limit. */
export type RoadType = 'highway' | 'avenue' | 'street' | 'rural' | 'coastal' | 'switchback';

export interface RoadNode {
  id: number;
  x: number;
  z: number;
}

export interface RoadEdge {
  id: number;
  /** Node ids of the two ends. */
  a: number;
  b: number;
  type: RoadType;
  /** Lanes per direction. */
  lanes: number;
  /** Speed limit in km/h. */
  speed: number;
  /** Total width of the road in metres (including the kerb). */
  width: number;
  /** Centre line, flat array of x,z pairs. */
  points: number[];
  /** Terrain height at every centre line point. */
  heights: number[];
  /** Length of the road in metres. */
  length: number;
}

export interface RoadHit {
  edgeId: number;
  edge: RoadEdge;
  /** Distance from the query point to the centre line. */
  distance: number;
  /** Interpolated height of the road at the closest point. */
  height: number;
  /** The closest point on the centre line. */
  x: number;
  z: number;
  /** Position along the edge (0..1). */
  t: number;
}

/** Road widths and speed limits per type. */
const ROAD_SPECS: Record<RoadType, { lanes: number; speed: number; width: number }> = {
  highway: { lanes: 2, speed: 110, width: 17 },
  avenue: { lanes: 2, speed: 60, width: 14 },
  street: { lanes: 1, speed: 40, width: 9 },
  rural: { lanes: 1, speed: 70, width: 8 },
  coastal: { lanes: 1, speed: 60, width: 9 },
  switchback: { lanes: 1, speed: 50, width: 8 },
};

/**
 * A Catmull-Rom spline through the control points, sampled into a polyline.
 * The result is a flat array of x,z pairs.
 */
function sampleSpline(control: number[][], spacing: number): number[] {
  if (control.length < 2) return control.flat();
  const out: number[] = [];
  const n = control.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = control[Math.max(0, i - 1)];
    const p1 = control[i];
    const p2 = control[i + 1];
    const p3 = control[Math.min(n - 1, i + 2)];

    const approxLength = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(approxLength / spacing));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push(x, z);
    }
  }
  const last = control[n - 1];
  out.push(last[0], last[1]);
  return out;
}

/**
 * The road graph of the world.
 *
 * The network is generated from the world seed, so it is identical every time
 * the game starts with the same seed. It is used for:
 * - flattening the terrain under the roads,
 * - drawing the road meshes,
 * - the AI navigation (lane paths),
 * - the minimap.
 */
export class RoadNetwork {
  readonly nodes: RoadNode[] = [];
  readonly edges: RoadEdge[] = [];

  /** Spatial index for the road geometry. */
  private flattener: RoadFlattener | null = null;

  /** The terrain the network was built on (used for the road heights). */
  private terrain: Terrain | null = null;

  /** Number of road segments in the spatial index. */
  get segmentCount(): number {
    return this.edges.reduce((sum, edge) => sum + edge.points.length / 2 - 1, 0);
  }

  /** Generate the whole network. */
  build(seed: number, terrain: Terrain): void {
    this.nodes.length = 0;
    this.edges.length = 0;
    this.terrain = terrain;

    const rng = new Rng(seed ^ 0x51ed270b);
    this.buildDowntown(rng);
    this.buildSuburbs(rng);
    this.buildHighways(rng, terrain);
    this.buildRural(rng);
    this.buildMountains(rng);
    this.buildCoast(rng);
    this.connectComponents();
    this.finalize();
  }

  // ---------------------------------------------------------------- helpers

  private addNode(x: number, z: number): number {
    this.nodes.push({ id: this.nodes.length, x, z });
    return this.nodes.length - 1;
  }

  /** Add an edge between two nodes (the centre line is a straight line). */
  private addStraightEdge(
    a: number,
    b: number,
    type: RoadType,
    spacing = 12,
  ): RoadEdge | null {
    const na = this.nodes[a];
    const nb = this.nodes[b];
    const points = sampleSpline(
      [
        [na.x, na.z],
        [nb.x, nb.z],
      ],
      spacing,
    );
    return this.addEdge(a, b, type, points);
  }

  /** Add an edge with an explicit centre line. */
  private addEdge(a: number, b: number, type: RoadType, points: number[]): RoadEdge | null {
    if (points.length < 4) return null;
    const spec = ROAD_SPECS[type];
    let length = 0;
    for (let i = 0; i < points.length - 2; i += 2) {
      length += Math.hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1]);
    }
    const edge: RoadEdge = {
      id: this.edges.length,
      a,
      b,
      type,
      lanes: spec.lanes,
      speed: spec.speed,
      width: spec.width,
      points,
      heights: new Array(points.length / 2).fill(0),
      length,
    };
    this.edges.push(edge);
    return edge;
  }

  /** Find the node closest to a position (used to connect new roads). */
  private nearestNode(x: number, z: number, maxDistance = 400): RoadNode | null {
    let best: RoadNode | null = null;
    let bestDistance = maxDistance;
    for (const node of this.nodes) {
      const d = Math.hypot(node.x - x, node.z - z);
      if (d < bestDistance) {
        bestDistance = d;
        best = node;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ generation

  /** A regular street grid in the middle of the map. */
  private buildDowntown(rng: Rng): void {
    const spacing = 130;
    const half = 3; // 7 x 7 intersections
    const grid: number[][] = [];

    for (let iz = -half; iz <= half; iz++) {
      const row: number[] = [];
      for (let ix = -half; ix <= half; ix++) {
        const x = ix * spacing + rng.range(-6, 6);
        const z = iz * spacing + rng.range(-6, 6);
        row.push(this.addNode(x, z));
      }
      grid.push(row);
    }

    for (let iz = 0; iz < grid.length; iz++) {
      for (let ix = 0; ix < grid[iz].length; ix++) {
        // Streets along X.
        if (ix < grid[iz].length - 1) {
          const avenue = iz % 3 === 0;
          this.addStraightEdge(grid[iz][ix], grid[iz][ix + 1], avenue ? 'avenue' : 'street');
        }
        // Streets along Z.
        if (iz < grid.length - 1) {
          const avenue = ix % 3 === 1;
          this.addStraightEdge(grid[iz][ix], grid[iz + 1][ix], avenue ? 'avenue' : 'street');
        }
      }
    }
  }

  /** Ring roads and radial streets around the downtown. */
  private buildSuburbs(rng: Rng): void {
    const rings = [
      { radius: 620, count: 14 },
      { radius: 1050, count: 18 },
      { radius: 1520, count: 22 },
    ];

    const ringNodes: number[][] = [];

    for (const ring of rings) {
      const nodes: number[] = [];
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const wobble = 1 + rng.range(-0.12, 0.12);
        const x = Math.cos(angle) * ring.radius * wobble;
        const z = Math.sin(angle) * ring.radius * wobble;
        nodes.push(this.addNode(x, z));
      }
      ringNodes.push(nodes);

      // The ring itself is a series of curved streets.
      for (let i = 0; i < nodes.length; i++) {
        const next = nodes[(i + 1) % nodes.length];
        this.addStraightEdge(nodes[i], next, 'street', 16);
      }
    }

    // Radial connectors between the rings.
    for (let r = 0; r < ringNodes.length - 1; r++) {
      const inner = ringNodes[r];
      const outer = ringNodes[r + 1];
      const step = Math.max(1, Math.round(inner.length / outer.length));
      for (let i = 0; i < inner.length; i += step) {
        const outerIndex = Math.floor((i / inner.length) * outer.length) % outer.length;
        this.addStraightEdge(inner[i], outer[outerIndex], 'street', 16);
      }
    }

    // Connect the inner ring to the downtown grid.
    const inner = ringNodes[0];
    for (let i = 0; i < inner.length; i += 3) {
      const node = this.nearestNode(this.nodes[inner[i]].x, this.nodes[inner[i]].z, 500);
      if (node && node.id !== inner[i]) {
        this.addStraightEdge(node.id, inner[i], 'avenue', 16);
      }
    }
  }

  /** The big highways that connect the regions. */
  private buildHighways(rng: Rng, terrain: Terrain): void {
    // Start and end points of the highways.
    const routes: { from: [number, number]; to: [number, number]; via: [number, number][] }[] = [
      // Downtown -> desert.
      {
        from: [420, -120],
        to: [3100, 420],
        via: [
          [1100, -260],
          [1800, -80],
          [2450, 260],
        ],
      },
      // Downtown -> mountains.
      {
        from: [-420, -120],
        to: [-3050, -620],
        via: [
          [-1150, -260],
          [-1900, -80],
          [-2500, -420],
        ],
      },
      // Downtown -> coast.
      {
        from: [0, 430],
        to: [420, 2450],
        via: [
          [-260, 900],
          [220, 1500],
          [-120, 2050],
        ],
      },
      // A ring highway around the city.
      {
        from: [1750, 1750],
        to: [-1750, 1750],
        via: [
          [900, 2050],
          [-200, 2150],
          [-1100, 2000],
        ],
      },
    ];

    for (const route of routes) {
      const control: number[][] = [route.from, ...route.via, route.to];
      const smoothed = this.relaxSpline(control, terrain);
      const points = sampleSpline(smoothed, 18);

      const a = this.addNode(route.from[0], route.from[1]);
      const b = this.addNode(route.to[0], route.to[1]);
      const edge = this.addEdge(a, b, 'highway', points);
      if (edge) {
        // Connect the highway to the closest existing node so the network is
        // one connected graph.
        const startNode = this.nearestNode(route.from[0], route.from[1], 600);
        if (startNode && startNode.id !== a) {
          this.addStraightEdge(startNode.id, a, 'avenue', 16);
        }
      }
    }

    // A couple of random country lanes so the map does not look too perfect.
    for (let i = 0; i < 6; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const x = Math.cos(angle) * rng.range(700, 1400);
      const z = Math.sin(angle) * rng.range(700, 1400);
      const node = this.nearestNode(x, z, 400);
      if (node) {
        const a = this.addNode(node.x, node.z);
        const b = this.addNode(
          node.x + rng.range(-500, 500),
          node.z + rng.range(-500, 500),
        );
        this.addStraightEdge(a, b, 'street', 14);
      }
    }
  }

  /**
   * Push the control points of a spline up and down so the road does not
   * climb a mountain that is too steep.
   */
  private relaxSpline(control: number[][], terrain: Terrain): number[][] {
    const out = control.map((p) => [p[0], p[1]] as number[]);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < out.length - 1; i++) {
        const prev = out[i - 1];
        const next = out[i + 1];
        const h0 = terrain.height(prev[0], prev[1]);
        const h2 = terrain.height(next[0], next[1]);
        const slope = Math.abs(h2 - h0) / Math.max(1, Math.hypot(next[0] - prev[0], next[1] - prev[1]));
        if (slope > 0.07) {
          // Move the point towards the lower side.
          const dx = out[i][0] - (prev[0] + next[0]) / 2;
          const dz = out[i][1] - (prev[1] + next[1]) / 2;
          out[i][0] -= dx * 0.25;
          out[i][1] -= dz * 0.25;
        }
      }
    }
    return out;
  }

  /** Small country roads branching away from the highways. */
  private buildRural(rng: Rng): void {
    for (const edge of this.edges) {
      if (edge.type !== 'highway' && edge.type !== 'avenue') continue;
      const count = edge.type === 'highway' ? 4 : 2;
      for (let i = 0; i < count; i++) {
        const index = Math.floor(rng.range(0.15, 0.85) * (edge.points.length / 2 - 1)) * 2;
        const x = edge.points[index];
        const z = edge.points[index + 1];
        const angle = rng.range(0, Math.PI * 2);
        const length = rng.range(220, 620);
        const a = this.addNode(x, z);
        const b = this.addNode(x + Math.cos(angle) * length, z + Math.sin(angle) * length);
        this.addStraightEdge(a, b, 'rural', 18);
      }
    }
  }

  /** A zig-zag road that climbs the mountains. */
  private buildMountains(rng: Rng): void {
    let x = -1700;
    let z = -300;
    let previous = this.addNode(x, z);
    const direction = -1;

    for (let i = 0; i < 9; i++) {
      z += direction * rng.range(260, 420);
      x += rng.range(-420, -260);
      const node = this.addNode(x, z);
      this.addStraightEdge(previous, node, 'switchback', 16);
      previous = node;
    }
  }

  /** A road that follows the coastline. */
  private buildCoast(rng: Rng): void {
    const control: number[][] = [];
    for (let i = 0; i <= 10; i++) {
      const x = -2600 + (i / 10) * 5200;
      const z = 2350 + Math.sin(i * 0.9) * 130 + rng.range(-40, 40);
      control.push([x, z]);
    }
    const points = sampleSpline(control, 20);
    const a = this.addNode(control[0][0], control[0][1]);
    const b = this.addNode(control[control.length - 1][0], control[control.length - 1][1]);
    this.addEdge(a, b, 'coastal', points);
  }

  /**
   * Make sure the whole network is one connected graph.
   *
   * The regions are generated separately, so without this step the highways
   * would be islands that the AI traffic could never reach.
   */
  private connectComponents(): void {
    const adjacency = new Map<number, number[]>();
    const link = (a: number, b: number): void => {
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a)!.push(b);
      adjacency.get(b)!.push(a);
    };
    for (const edge of this.edges) link(edge.a, edge.b);

    // Find the connected components.
    const component = new Int32Array(this.nodes.length).fill(-1);
    let componentCount = 0;
    for (let start = 0; start < this.nodes.length; start++) {
      if (component[start] !== -1) continue;
      const stack = [start];
      component[start] = componentCount;
      while (stack.length > 0) {
        const node = stack.pop()!;
        for (const next of adjacency.get(node) ?? []) {
          if (component[next] === -1) {
            component[next] = componentCount;
            stack.push(next);
          }
        }
      }
      componentCount++;
    }

    if (componentCount <= 1) return;

    // Connect every component to the first one with the shortest link.
    for (let c = 1; c < componentCount; c++) {
      let bestA = -1;
      let bestB = -1;
      let bestDistance = Infinity;
      for (let a = 0; a < this.nodes.length; a++) {
        if (component[a] !== 0) continue;
        for (let b = 0; b < this.nodes.length; b++) {
          if (component[b] !== c) continue;
          const distance = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestA = a;
            bestB = b;
          }
        }
      }
      if (bestA >= 0) {
        this.addStraightEdge(bestA, bestB, 'rural', 20);
        link(bestA, bestB);
        component[bestB] = 0;
      }
    }
  }

  // ------------------------------------------------------------- finishing

  /** Compute the road heights and build the spatial index. */
  private finalize(): void {
    const terrain = this.terrain;
    if (!terrain) return;

    for (const edge of this.edges) {
      const count = edge.points.length / 2;
      for (let i = 0; i < count; i++) {
        edge.heights[i] = terrain.height(edge.points[i * 2], edge.points[i * 2 + 1]);
      }
      // The road height is the raw terrain height. No smoothing is applied
      // on purpose: two roads that cross then have exactly the same height
      // where they meet, so there is no bump at the junction.
    }

    this.buildIndex();
  }

  /** Build the spatial index over the road segments. */
  private buildIndex(): void {
    this.flattener = new RoadFlattener(
      this.edges.map((edge) => ({
        points: edge.points,
        heights: edge.heights,
        width: edge.width,
      })),
    );
  }

  /** The closest road to a position (null when nothing is close enough). */
  nearestRoad(x: number, z: number, maxDistance = 120): RoadHit | null {
    if (!this.flattener) return null;
    const hit = this.flattener.nearest(x, z, maxDistance);
    if (!hit) return null;
    const edge = this.edges[hit.roadIndex];
    if (!edge) return null;
    return {
      edgeId: edge.id,
      edge,
      distance: hit.distance,
      height: hit.height,
      x: hit.x,
      z: hit.z,
      t: hit.t,
    };
  }

  /** All edges whose geometry is within a radius of a position. */
  roadsInRadius(x: number, z: number, radius: number): RoadEdge[] {
    const result: RoadEdge[] = [];
    if (!this.flattener) return result;
    const seen = new Set<number>();
    const steps = Math.max(1, Math.ceil(radius / 120));

    // Sample a grid of points around the query and collect the roads that are
    // close to them. Roads are long, so a handful of samples is enough.
    for (let dz = -steps; dz <= steps; dz++) {
      for (let dx = -steps; dx <= steps; dx++) {
        const hit = this.flattener.nearest(x + dx * 120, z + dz * 120, radius);
        if (!hit) continue;
        if (seen.has(hit.roadIndex)) continue;
        seen.add(hit.roadIndex);
        const edge = this.edges[hit.roadIndex];
        if (edge) result.push(edge);
      }
    }
    return result;
  }

  /**
   * The centre line of one lane of a road.
   * `lane` 0 is the right hand lane, 1 the next one and so on.
   */
  lanePath(edgeId: number, lane: number): number[] {
    const edge = this.edges[edgeId];
    if (!edge) return [];
    const laneWidth = 3.6;
    const offset = laneWidth * (lane + 0.5);
    const halfWidth = edge.width / 2;
    const out: number[] = [];

    for (let i = 0; i < edge.points.length / 2; i++) {
      const x = edge.points[i * 2];
      const z = edge.points[i * 2 + 1];
      const prev = Math.max(0, i - 1);
      const next = Math.min(edge.points.length / 2 - 1, i + 1);
      const dx = edge.points[next * 2] - edge.points[prev * 2];
      const dz = edge.points[next * 2 + 1] - edge.points[prev * 2 + 1];
      const len = Math.hypot(dx, dz) || 1;
      // The right hand normal (the road runs along +direction).
      const nx = dz / len;
      const nz = -dx / len;
      const shift = Math.min(offset, Math.max(0, halfWidth - 1.2));
      out.push(x + nx * shift, z + nz * shift);
    }
    return out;
  }

  /** The height of the road at a given point of its centre line. */
  heightAt(edgeId: number, t: number): number {
    const edge = this.edges[edgeId];
    if (!edge) return 0;
    const count = edge.points.length / 2;
    const index = clamp(Math.floor(t * (count - 1)), 0, count - 2);
    const local = clamp01(t * (count - 1) - index);
    return lerp(edge.heights[index], edge.heights[index + 1], local);
  }

  /** Total length of all roads (for the statistics). */
  get totalLength(): number {
    let sum = 0;
    for (const edge of this.edges) sum += edge.length;
    return sum;
  }

  /**
   * The height of the ground including the road flattening.
   * Used by the terrain mesh, the colliders and the camera.
   */
  groundHeight(x: number, z: number, terrain: Terrain): number {
    const raw = terrain.height(x, z);
    if (!this.flattener) return raw;
    return this.flattener.groundHeight(x, z, raw);
  }

  /** Serialisable version used to send the network to the chunk worker. */
  toTransferData(): { points: number[]; heights: number[]; width: number }[] {
    return this.edges.map((edge) => ({
      points: edge.points,
      heights: edge.heights,
      width: edge.width,
    }));
  }
}

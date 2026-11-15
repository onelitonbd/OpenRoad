import type { Terrain } from './Terrain';
import { Rng } from '../utils/random';
import { clamp, clamp01, lerp } from '../utils/math';
import { RoadFlattener } from './RoadFlattener';
import { WORLD_HALF } from './Terrain';

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

/**
 * One point of a lane.
 *
 * A lane is a polyline that runs along one side of the road. The traffic
 * uses it to know where to drive.
 */
export interface LanePoint {
  x: number;
  y: number;
  z: number;
  /** The direction of travel in radians (the same as the car heading). */
  heading: number;
  /** The distance from the start of the lane in metres. */
  distance: number;
}

export interface LanePath {
  edgeId: number;
  /** The lane inside the edge (0 is the right hand lane of a -> b). */
  lane: number;
  /** True when the lane runs from b to a (the oncoming traffic). */
  reversed: boolean;
  points: LanePoint[];
  /** The length of the lane in metres. */
  length: number;
  /** The speed limit of the road in km/h. */
  speed: number;
}

/** Road widths and speed limits per type. */
/** The distance between two points of a lane (in metres). */
const LANE_STEP = 4;

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

/** The length of a polyline that is stored as a flat list of x and z. */
function polylineLength(points: number[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 2; i += 2) {
    length += Math.hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1]);
  }
  return length;
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

  /** The lane paths (they never change, so they are cached). */
  private readonly laneCache = new Map<string, LanePath>();

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
    this.laneCache.clear();
    this.terrain = terrain;

    const rng = new Rng(seed ^ 0x51ed270b);
    // The order matters: the coast and the mountain road are built first,
    // so the highways can end exactly at their junctions. Every road is
    // part of the network from the start - nothing is invented later.
    this.buildDowntown(rng);
    this.buildSuburbs(rng);
    const coast = this.buildCoast(rng);
    const mountain = this.buildMountains(rng);
    this.buildHighways(terrain, coast, mountain);
    this.buildRural(rng);
    this.connectComponents();
    this.finalize();
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Add a node. The position is clamped into the world: the map has a
   * fixed border and no road may lead out of it.
   */
  private addNode(x: number, z: number): number {
    const limit = WORLD_HALF - 60;
    this.nodes.push({
      id: this.nodes.length,
      x: clamp(x, -limit, limit),
      z: clamp(z, -limit, limit),
    });
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
    // The centre line may never leave the world either.
    const limit = WORLD_HALF - 60;
    for (let i = 0; i < points.length; i += 2) {
      points[i] = clamp(points[i], -limit, limit);
      points[i + 1] = clamp(points[i + 1], -limit, limit);
    }
    const spec = ROAD_SPECS[type];
    const length = polylineLength(points);
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
        const x = ix * spacing + rng.range(-4, 4);
        const z = iz * spacing + rng.range(-4, 4);
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
        // Only a small wobble: the ring roads should be round, not a
        // polygon with random corners.
        const wobble = 1 + rng.range(-0.04, 0.04);
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

    // Radial connectors between the rings. The outer node is picked by
    // angle, so the connector really points away from the centre - before
    // that they were skewed by up to 15 degrees.
    for (let r = 0; r < ringNodes.length - 1; r++) {
      const inner = ringNodes[r];
      const outer = ringNodes[r + 1];
      for (const innerId of inner) {
        const innerNode = this.nodes[innerId];
        const innerAngle = Math.atan2(innerNode.z, innerNode.x);
        let bestId = -1;
        let bestDelta = Infinity;
        for (const outerId of outer) {
          const outerNode = this.nodes[outerId];
          const outerAngle = Math.atan2(outerNode.z, outerNode.x);
          let delta = Math.abs(outerAngle - innerAngle);
          if (delta > Math.PI) delta = Math.PI * 2 - delta;
          if (delta < bestDelta) {
            bestDelta = delta;
            bestId = outerId;
          }
        }
        if (bestId >= 0) this.addStraightEdge(innerId, bestId, 'street', 16);
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

  /**
   * The big highways that connect the regions.
   *
   * The highways end exactly at the junctions of the coast and of the
   * mountain road, so the whole network is one piece from the start.
   */
  private buildHighways(
    terrain: Terrain,
    coast: { west: number; east: number; junction: number },
    mountain: { bottom: number },
  ): void {
    // The highways: where they start, where they end and where they turn.
    const routes: {
      from: [number, number];
      to: [number, number];
      via: [number, number][];
      fromNode?: number;
      toNode?: number;
    }[] = [
      // Downtown -> the desert in the east -> the coast in the south east.
      {
        from: [420, -120],
        to: [2600, 2439],
        via: [
          [1100, -260],
          [1900, -40],
          [2500, 600],
          [2680, 1500],
        ],
        toNode: coast.east,
      },
      // Downtown -> the mountains in the west.
      {
        from: [-420, -120],
        to: [-1700, -300],
        via: [
          [-1150, -260],
          [-1450, -180],
        ],
        toNode: mountain.bottom,
      },
      // Downtown -> the coast in the south. It ends at the junction in
      // the middle of the coastal road.
      {
        from: [0, 430],
        to: [400, 2460],
        via: [
          [-260, 900],
          [220, 1500],
          [-120, 2050],
        ],
        toNode: coast.junction,
      },
      // The ring highway in the south, from the city to the west coast.
      {
        from: [1750, 1750],
        to: [-2600, 2370],
        via: [
          [900, 2050],
          [-200, 2150],
          [-1100, 2100],
        ],
        toNode: coast.west,
      },
    ];

    for (const route of routes) {
      const control: number[][] = [route.from, ...route.via, route.to];
      const smoothed = this.relaxSpline(control, terrain);
      const points = sampleSpline(smoothed, 18);

      const a = route.fromNode ?? this.addNode(route.from[0], route.from[1]);
      const b = route.toNode ?? this.addNode(route.to[0], route.to[1]);
      const edge = this.addEdge(a, b, 'highway', points);
      if (edge && route.fromNode === undefined) {
        // The highway has to start in the network. The node of the route
        // itself does not count - it would be a road of zero length.
        this.attachRoadEnd(a, 'avenue', 1400, [a, b]);
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
    // The country roads leave the highways at a right angle and the highway
    // is split at that point, so the branch is a real T-junction. Before
    // that the roads started in the middle of the highway without touching
    // it - they looked like they were invented while you were driving.
    for (const edge of [...this.edges]) {
      if (edge.type !== 'highway') continue;
      const half = edge.points.length / 2;
      const spots: { index: number; nx: number; nz: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const index = Math.max(1, Math.min(half - 2, Math.floor(rng.range(0.15, 0.85) * (half - 1))));
        // The direction of the highway at that point.
        const dx = edge.points[index * 2 + 2] - edge.points[index * 2];
        const dz = edge.points[index * 2 + 3] - edge.points[index * 2 + 1];
        const length = Math.hypot(dx, dz) || 1;
        // The side the country road grows to.
        const side = rng.range(0, 1) < 0.5 ? 1 : -1;
        spots.push({ index, nx: (-dz / length) * side, nz: (dx / length) * side });
      }
      // Split from the back, so the other points keep their index.
      spots.sort((a, b) => b.index - a.index);
      for (const spot of spots) {
        const nodeId = this.splitEdgeAt(edge, spot.index);
        const node = this.nodes[nodeId];
        const length = rng.range(320, 760);
        const end = this.addNode(node.x + spot.nx * length, node.z + spot.nz * length);
        this.addStraightEdge(nodeId, end, 'rural', 18);
      }
    }
  }

  /**
   * Split an edge at one of its points and return the id of the new node.
   *
   * The first half keeps the id of the edge, the second half becomes a new
   * edge. That way a road can branch off in the middle of another road.
   */
  private splitEdgeAt(edge: RoadEdge, index: number): number {
    const originalEnd = edge.b;
    const nodeId = this.addNode(edge.points[index * 2], edge.points[index * 2 + 1]);
    const head = edge.points.slice(0, (index + 1) * 2);
    const tail = edge.points.slice(index * 2);

    edge.points = head;
    edge.b = nodeId;
    edge.length = polylineLength(head);
    edge.heights = new Array(head.length / 2).fill(0);

    const second: RoadEdge = {
      ...edge,
      id: this.edges.length,
      a: nodeId,
      b: originalEnd,
      points: tail,
      length: polylineLength(tail),
      heights: new Array(tail.length / 2).fill(0),
    };
    this.edges.push(second);
    return nodeId;
  }

  /** A zig-zag road that climbs the mountains. */
  private buildMountains(rng: Rng): { bottom: number; top: number } {
    let x = -1700;
    let z = -300;
    const first = this.addNode(x, z);
    let previous = first;
    const direction = -1;
    // The road climbs towards the corner of the map and stops before the
    // border - it must not lead out of the world.
    const limit = WORLD_HALF - 320;

    for (let i = 0; i < 9; i++) {
      z += direction * rng.range(260, 420);
      x += rng.range(-420, -260);
      if (Math.max(Math.abs(x), Math.abs(z)) > limit) break;
      const node = this.addNode(x, z);
      this.addStraightEdge(previous, node, 'switchback', 16);
      previous = node;
    }

    // The bottom of the mountain road is a junction with the highway
    // from downtown, the top is a dead end at a viewpoint.
    return { bottom: first, top: previous };
  }

  /**
   * A road that follows the coastline.
   *
   * The road is built first, so the highways can end at its junctions.
   */
  private buildCoast(rng: Rng): { west: number; east: number; junction: number } {
    const control: number[][] = [];
    for (let i = 0; i <= 10; i++) {
      const x = -2600 + (i / 10) * 5200;
      const z = 2350 + Math.sin(i * 0.9) * 130 + rng.range(-40, 40);
      control.push([x, z]);
    }
    const points = sampleSpline(control, 20);
    const west = this.addNode(control[0][0], control[0][1]);
    const east = this.addNode(control[control.length - 1][0], control[control.length - 1][1]);
    const edge = this.addEdge(west, east, 'coastal', points);

    // In the middle of the coastal road the highway from downtown joins
    // in. The road is split there, so it is a real junction.
    let junction = east;
    if (edge) {
      const index = this.nearestPointIndex(edge, 400, 2460);
      junction = this.splitEdgeAt(edge, index);
    }
    return { west, east, junction };
  }

  /** The index of the point of an edge that is nearest to a position. */
  private nearestPointIndex(edge: RoadEdge, x: number, z: number): number {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < edge.points.length; i += 2) {
      const distance = Math.hypot(edge.points[i] - x, edge.points[i + 1] - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i / 2;
      }
    }
    return best;
  }

  /**
   * Connect the end of a road to the network.
   *
   * The road keeps its own node, so the new road really starts there.
   * Without this, a road that was built on its own would hang in the air
   * and the component fixer would later build a long diagonal road to
   * join it - that is how roads used to appear out of nowhere.
   */
  private attachRoadEnd(
    nodeId: number,
    type: RoadType,
    maxDistance: number,
    exclude: number[] = [],
  ): void {
    const node = this.nodes[nodeId];
    if (!node) return;
    let best: RoadNode | null = null;
    let bestDistance = maxDistance;
    for (const candidate of this.nodes) {
      if (candidate.id === nodeId || exclude.includes(candidate.id)) continue;
      const distance = Math.hypot(candidate.x - node.x, candidate.z - node.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    if (!best) return;
    this.addStraightEdge(nodeId, best.id, type, 16);
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

    // Every road that comes within the radius - not only the closest one
    // at a few sample points. A road that is missing from this list would
    // be built later, while the player is looking at it.
    for (const index of this.flattener.roadsNear(x, z, radius)) {
      const edge = this.edges[index];
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * The path of one lane of a road.
   *
   * `lane` 0 is the right hand lane when driving from a to b, `lane` 1 the
   * next one and so on. The lanes behind `edge.lanes` belong to the opposite
   * direction and run from b to a.
   */
  getLanePath(edgeId: number, lane: number): LanePath | null {
    const edge = this.edges[edgeId];
    if (!edge) return null;

    // The lane paths never change, so they are cached.
    const key = `${edgeId}:${lane}`;
    const cached = this.laneCache.get(key);
    if (cached) return cached;

    const lanesPerSide = Math.max(1, edge.lanes);
    const reversed = lane >= lanesPerSide;
    const index = reversed ? lane - lanesPerSide : lane;
    const laneWidth = edge.width / 2 / lanesPerSide;
    // The distance of the lane centre from the middle of the road.
    const offset = edge.width / 2 - (index + 0.5) * laneWidth;

    const count = edge.points.length / 2;
    if (count < 2) return null;

    // --- the centre line of the road, with the distance along it ---
    const centreX: number[] = [];
    const centreZ: number[] = [];
    const centreY: number[] = [];
    const centreDistance: number[] = [0];
    for (let i = 0; i < count; i++) {
      centreX.push(edge.points[i * 2]);
      centreZ.push(edge.points[i * 2 + 1]);
      centreY.push(edge.heights[i]);
      if (i > 0) {
        centreDistance.push(
          centreDistance[i - 1] +
            Math.hypot(centreX[i] - centreX[i - 1], centreZ[i] - centreZ[i - 1]),
        );
      }
    }
    const total = centreDistance[count - 1];

    // --- resample the centre line in even steps ---
    // The centre line of the road can be very coarse (a short street only
    // has a few points), so the lane is resampled. Without this the AI cars
    // would steer in the wrong direction on the short roads.
    const steps = Math.max(1, Math.round(total / LANE_STEP));
    const sampleX: number[] = [];
    const sampleZ: number[] = [];
    const sampleY: number[] = [];
    const sampleDX: number[] = [];
    const sampleDZ: number[] = [];
    let segment = 0;

    for (let s = 0; s <= steps; s++) {
      const distance = (s / steps) * total;
      // Find the segment this distance belongs to.
      while (segment < count - 2 && centreDistance[segment + 1] < distance) {
        segment++;
      }
      const d0 = centreDistance[segment];
      const d1 = centreDistance[segment + 1];
      const t = d1 - d0 > 1e-6 ? (distance - d0) / (d1 - d0) : 0;
      sampleX.push(centreX[segment] + (centreX[segment + 1] - centreX[segment]) * t);
      sampleZ.push(centreZ[segment] + (centreZ[segment + 1] - centreZ[segment]) * t);
      sampleY.push(centreY[segment] + (centreY[segment + 1] - centreY[segment]) * t);

      // The direction of the road (the tangent of the centre line).
      let dx = centreX[segment + 1] - centreX[segment];
      let dz = centreZ[segment + 1] - centreZ[segment];
      const len = Math.hypot(dx, dz) || 1;
      sampleDX.push(dx / len);
      sampleDZ.push(dz / len);
    }

    // The lanes of the other direction drive from b to a, so their points
    // are in the opposite order.
    const order = reversed ? sampleX.length - 1 : 0;
    const step = reversed ? -1 : 1;

    const points: LanePoint[] = [];
    for (let i = 0; i < sampleX.length; i++) {
      const index0 = order + step * i;
      // The direction of travel.
      const dx = sampleDX[index0] * step;
      const dz = sampleDZ[index0] * step;
      // The right hand side of the driving direction.
      const nx = dz;
      const nz = -dx;

      points.push({
        x: sampleX[index0] + nx * offset,
        y: sampleY[index0],
        z: sampleZ[index0] + nz * offset,
        // The heading of the car: 0 points to +Z.
        heading: Math.atan2(dx, dz),
        distance: (i / steps) * total,
      });
    }

    // The heading of the first and the last point is taken from the
    // neighbour, so the car does not turn sharply at the end of the road.
    for (let i = 0; i < points.length; i++) {
      const prev = Math.max(0, i - 1);
      const next = Math.min(points.length - 1, i + 1);
      const dx = points[next].x - points[prev].x;
      const dz = points[next].z - points[prev].z;
      if (Math.hypot(dx, dz) > 1e-6) {
        points[i].heading = Math.atan2(dx, dz);
      }
    }

    const path: LanePath = {
      edgeId,
      lane: index,
      reversed,
      points,
      length: total,
      speed: edge.speed,
    };
    this.laneCache.set(key, path);
    return path;
  }

  /** All the roads that start or end at a node. */
  edgesAtNode(nodeId: number): RoadEdge[] {
    const result: RoadEdge[] = [];
    for (const edge of this.edges) {
      if (edge.a === nodeId || edge.b === nodeId) result.push(edge);
    }
    return result;
  }

  /** The node at the end of an edge (the one the car drives towards). */
  endNode(edgeId: number, reversed: boolean): number {
    const edge = this.edges[edgeId];
    if (!edge) return -1;
    return reversed ? edge.a : edge.b;
  }

  /** The start node of an edge for a driving direction. */
  startNode(edgeId: number, reversed: boolean): number {
    const edge = this.edges[edgeId];
    if (!edge) return -1;
    return reversed ? edge.b : edge.a;
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

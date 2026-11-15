import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoadNetwork } from '../world/RoadNetwork';

/** The state of one traffic light. */
interface LightState {
  /** 0 = the north-south traffic has green, 1 = the east-west traffic. */
  phase: number;
  /** Seconds left in the current phase. */
  timer: number;
  /** The length of the green phase in seconds. */
  green: number;
  /** True while the phase is yellow (the cars may not enter). */
  yellow: boolean;
}

/** How long the yellow phase lasts (in seconds). */
const YELLOW_TIME = 2.5;

/** The colour of a green lamp. */
const GREEN = new THREE.Color(0x35d07f);
/** The colour of a red lamp. */
const RED = new THREE.Color(0xff3b30);

/** How much room the pole needs between the road and its kerb. */
const POLE_MARGIN = 1.3;

/** The priority of the road types (the bigger road goes first). */
const PRIORITY: Record<string, number> = {
  highway: 4,
  avenue: 3,
  street: 2,
  rural: 1,
  coastal: 1,
  switchback: 0,
};

/**
 * The traffic lights of the city.
 *
 * Every junction with three or more roads gets a light. The lights run in
 * two phases: first the north-south traffic may go, then the east-west
 * traffic. The phases of the different junctions are offset, so the whole
 * city does not blink at the same time.
 */
export class IntersectionManager {
  /** The traffic light poles of the city. */
  readonly group = new THREE.Group();

  private readonly lights = new Map<number, LightState>();
  private readonly nodes: number[] = [];
  /** The road network (needed for the priority rule). */
  private readonly network: RoadNetwork;

  // The poles are drawn with instancing, so all the traffic lights of the
  // city only cost a couple of draw calls.
  /** The lamps (their colour shows the state of the light). */
  private lampMesh: THREE.InstancedMesh | null = null;
  /** The place of every pole (so the lamps can be placed on it). */
  private readonly spots: { x: number; y: number; z: number }[] = [];


  constructor(network: RoadNetwork) {
    this.network = network;
    // Only the junctions in the city get a light.
    for (const node of network.nodes) {
      const edges = network.edgesAtNode(node.id);
      if (edges.length < 3) continue;
      const inCity = edges.some((edge) => edge.type === 'street' || edge.type === 'avenue');
      if (!inCity) continue;
      this.nodes.push(node.id);
      // The pole stands on the ground, so it needs the height of the road.
      const height = this.heightAtNode(network, node.id);
      this.lights.set(node.id, {
        phase: 0,
        // The junctions do not all switch at the same time.
        timer: 4 + (node.id % 7),
        green: 11,
        yellow: false,
      });
      const spot = this.poleSpot(network, node.id);
      this.spots.push({ x: spot.x, y: height, z: spot.z });
    }

    this.buildMeshes();
  }

  /** The height of the ground at a junction. */
  private heightAtNode(network: RoadNetwork, nodeId: number): number {
    for (const edge of network.edgesAtNode(nodeId)) {
      const count = edge.points.length / 2;
      for (let i = 0; i < count; i++) {
        return edge.heights[i];
      }
    }
    return 0;
  }

  /**
   * The place of the pole: on the corner of the junction, next to the road.
   *
   * At a crossing the pole has to stand in the corner between the roads,
   * not on one of them. The pole is placed as close to the junction as
   * possible, but far enough from every road that it stands on the kerb.
   */
  private poleSpot(network: RoadNetwork, nodeId: number): { x: number; z: number } {
    const node = network.nodes[nodeId];
    // All the roads around the junction (not only the ones that end
    // there - a road can also run past it). The search is only done once
    // per junction, so the whole network is fine.
    const edges = network.edges;

    // The distance from a point to the kerb of the closest road.
    const clearance = (x: number, z: number): number => {
      let best = Infinity;
      for (const edge of edges) {
        const count = edge.points.length / 2;
        for (let i = 0; i < count - 1; i++) {
          const ax = edge.points[i * 2];
          const az = edge.points[i * 2 + 1];
          const bx = edge.points[(i + 1) * 2];
          const bz = edge.points[(i + 1) * 2 + 1];
          const ex = bx - ax;
          const ez = bz - az;
          const lengthSquared = ex * ex + ez * ez;
          let t = lengthSquared > 1e-9
            ? ((x - ax) * ex + (z - az) * ez) / lengthSquared
            : 0;
          t = Math.max(0, Math.min(1, t));
          const px = ax + ex * t;
          const pz = az + ez * t;
          const toKerb = Math.hypot(x - px, z - pz) - edge.width / 2;
          if (toKerb < best) best = toKerb;
        }
      }
      return best;
    };

    // The spot that is the closest to the junction but still clear of the
    // roads (the pole stands on the kerb, not on the road).
    let best: { x: number; z: number } | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      for (let step = 1; step <= 24; step++) {
        const reach = step * 0.75;
        const x = node.x + dx * reach;
        const z = node.z + dz * reach;
        if (clearance(x, z) < POLE_MARGIN) continue;
        if (reach < bestDistance) {
          bestDistance = reach;
          best = { x, z };
        }
        break;
      }
    }

    return best ?? { x: node.x, z: node.z };
  }

  /**
   * Builds the instanced poles and lamps.
   *
   * Every pole is the same, so they are all drawn in one go. The lamps use
   * a per instance colour, so the traffic lights can change their colour
   * without a new draw call.
   */
  private buildMeshes(): void {
    const count = this.spots.length;
    if (count === 0) return;

    // --- the pole: the post and the box ---
    const poleGeometry = new THREE.CylinderGeometry(0.13, 0.18, 5, 5);
    poleGeometry.translate(0, 2.5, 0);
    const boxGeometry = new THREE.BoxGeometry(0.62, 1.5, 0.46);
    boxGeometry.translate(0, 5.3, 0);
    const merged = mergeGeometries([poleGeometry, boxGeometry]);
    poleGeometry.dispose();
    boxGeometry.dispose();
    if (!merged) return;

    const poleMesh = new THREE.InstancedMesh(
      merged,
      new THREE.MeshLambertMaterial({ color: 0x3c4149 }),
      count,
    );
    poleMesh.name = 'traffic-light-poles';

    // --- the lamps ---
    // The lamps are tiny on the screen, so a low poly sphere is enough.
    const lampGeometry = new THREE.SphereGeometry(0.3, 6, 4);
    const lampMesh = new THREE.InstancedMesh(
      lampGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      count * 2,
    );
    lampMesh.name = 'traffic-light-lamps';

    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const spot = this.spots[i];
      matrix.makeTranslation(spot.x, spot.y, spot.z);
      poleMesh.setMatrixAt(i, matrix);

      // The north-south lamp (higher) and the east-west lamp.
      matrix.makeTranslation(spot.x, spot.y + 5.55, spot.z + 0.26);
      lampMesh.setMatrixAt(i * 2, matrix);
      matrix.makeTranslation(spot.x, spot.y + 5.05, spot.z + 0.26);
      lampMesh.setMatrixAt(i * 2 + 1, matrix);
      colour.setHex(0x35d07f);
      lampMesh.setColorAt(i * 2, colour);
      colour.setHex(0xff3b30);
      lampMesh.setColorAt(i * 2 + 1, colour);
    }
    poleMesh.instanceMatrix.needsUpdate = true;
    lampMesh.instanceMatrix.needsUpdate = true;
    if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;

    this.lampMesh = lampMesh;
    this.group.add(poleMesh);
    this.group.add(lampMesh);
  }

  /** The number of junctions with a traffic light. */
  get count(): number {
    return this.lights.size;
  }

  /** Advance the lights. */
  update(dt: number): void {
    for (const [nodeId, light] of this.lights) {
      light.timer -= dt;
      if (light.timer <= 0) {
        if (light.yellow) {
          // The yellow phase is over: the other direction gets the green.
          light.yellow = false;
          light.phase = light.phase === 0 ? 1 : 0;
          light.timer = light.green;
        } else {
          // The green phase is over: first yellow, then the other side.
          light.yellow = true;
          light.timer = YELLOW_TIME;
        }
      }
      // The lamps show the colour of the north-south traffic (the first
      // lamp) and of the east-west traffic (the second lamp).
      const index = this.nodes.indexOf(nodeId);
      if (index < 0) continue;
      const northSouthGreen = light.phase === 0 && !light.yellow;
      const a = northSouthGreen ? GREEN : RED;
      const b = northSouthGreen ? RED : GREEN;
      const lamp = this.lampMesh;
      if (lamp && lamp.instanceColor) {
        lamp.instanceColor.setXYZ(index * 2, a.r, a.g, a.b);
        lamp.instanceColor.setXYZ(index * 2 + 1, b.r, b.g, b.b);
        lamp.instanceColor.needsUpdate = true;
      }
    }
  }

  /**
   * Is the light red for a car that drives towards a node with this heading?
   *
   * The heading is the direction of travel: 0 points to +Z, PI/2 to +X.
   */
  isRed(nodeId: number, heading: number): boolean {
    const light = this.lights.get(nodeId);
    if (!light) return false;
    // The north-south axis (along Z) is phase 0.
    const alongZ = Math.abs(Math.sin(heading)) < 0.707;
    const greenForAxis = light.phase === 0 ? alongZ : !alongZ;
    // During the yellow phase nobody may enter the junction.
    return !greenForAxis || light.yellow;
  }

  /** The junctions that have a light (used by the debug view). */
  get junctions(): readonly number[] {
    return this.nodes;
  }

  /** The places where the poles stand (used by the tests). */
  get poleSpots(): readonly { x: number; y: number; z: number }[] {
    return this.spots;
  }

  /** Does this junction have a traffic light? */
  hasLight(nodeId: number): boolean {
    return this.lights.has(nodeId);
  }

  /**
   * The priority of a car at a junction without a traffic light.
   *
   * The rule is simple: the road with the higher priority goes first. The
   * bigger roads (highways and avenues) have the priority, and between two
   * equal roads the one that comes from the south wins (so the traffic
   * does not deadlock).
   */
  priority(nodeId: number, heading: number): number {
    const edges = this.network.edgesAtNode(nodeId);
    let best = -1;
    for (const edge of edges) {
      // The priority grows with the size of the road.
      const rank = PRIORITY[edge.type] ?? 0;
      if (rank > best) best = rank;
    }
    // Between two equal roads the direction decides: the traffic from the
    // south (and from the east) goes first.
    const fromSouth = Math.abs(Math.sin(heading)) < 0.707;
    return best * 10 + (fromSouth ? 1 : 0);
  }

  dispose(): void {
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (mesh as THREE.InstancedMesh).material;
      if (material && !Array.isArray(material)) material.dispose();
    });
    this.group.clear();
    this.lampMesh = null;
  }
}

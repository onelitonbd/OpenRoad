import * as THREE from 'three';
import { Rng } from '../utils/random';
import { clamp } from '../utils/math';
import { settings } from '../core/Settings';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RoadNetwork, LanePath, RoadEdge } from '../world/RoadNetwork';
import { TrafficCar } from './TrafficCar';
import { IntersectionManager } from './Intersection';
import { AI_CARS, AI_PAINT_COLORS } from '../vehicles/aiCars';

/** The cars are spawned in this ring around the player. */
const SPAWN_MIN = 150;
const SPAWN_MAX = 380;
/** Cars that are further away than this are removed. */
const DESPAWN_DISTANCE = 520;
/** Inside this radius the cars use the full rigid body physics. */
const PHYSICS_RADIUS = 220;
/** How many cars use the full rigid body physics at the same time. */
const PHYSICS_CARS = 10;
/** A car must never appear closer than this to the player. */
const MIN_PLAYER_DISTANCE = 70;
/** How far the traffic looks for cars in front of it. */
const OBSTACLE_RANGE = 80;
/** How wide the corridor is in which a car counts as an obstacle. */
const LANE_CORRIDOR = 3.2;
/** The length of a car (used for the gap to the car in front). */
const CAR_LENGTH = 4.6;
/** A car that stands still for this long is put back on its lane. */
const STUCK_TIME = 6;

/**
 * The traffic.
 *
 * The manager keeps a pool of cars around the player. New cars are spawned
 * on the roads in a ring around the player (but never right in front of the
 * camera) and removed again when they are too far away.
 */
export class TrafficManager {
  readonly group = new THREE.Group();
  /** The lines that show where the AI cars want to drive (debug view). */
  readonly debugLines: THREE.LineSegments;

  readonly cars: TrafficCar[] = [];
  private readonly network: RoadNetwork;
  private readonly intersections: IntersectionManager;
  private readonly rng = new Rng(0x5eed1a7e);
  private spawnTimer = 0;
  private obstacleTimer = 0;
  private readonly obstacleDistances = new Map<TrafficCar, number | null>();
  /** How long the cars have been standing still (for the stuck car rescue). */
  private readonly stopTimes = new Map<TrafficCar, number>();

  /** The debug geometry for the AI paths. */
  private readonly debugPositions: number[] = [];

  constructor(
    private readonly physics: PhysicsWorld,
    network: RoadNetwork,
    /**
     * Tells the manager whether the ground under a position is ready.
     *
     * A car can only drive with the full physics when the chunk below it
     * has a collider - otherwise it would fall through the world while the
     * chunk is still streaming in.
     */
    private readonly groundReady: (x: number, z: number) => boolean = () => true,
  ) {
    this.network = network;
    this.intersections = new IntersectionManager(network);
    this.group.name = 'traffic';
    this.group.add(this.intersections.group);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.debugLines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x4fe0a0 }),
    );
    this.debugLines.visible = false;
    this.debugLines.frustumCulled = false;
  }

  /** How many cars are alive right now. */
  get count(): number {
    return this.cars.length;
  }

  /** How many cars had to be rescued (a counter for the debug view). */
  rescueCount = 0;

  /**
   * Called when an AI car honks at the player.
   *
   * The sound comes with the audio system in a later phase; for now the
   * game shows a message and the hook is there for the sound.
   */
  onHonk: (() => void) | null = null;

  /** The cars that honked at the player (the cooldown is per car). */
  private readonly honkTimes = new Map<TrafficCar, number>();

  /** How many cars use the full physics. */
  get physicsCount(): number {
    return this.cars.filter((car) => car.physicsMode).length;
  }

  /** The positions of the AI cars (for the minimap). */
  mapPositions(): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];
    for (const car of this.cars) {
      const position = car.position;
      result.push({ x: position.x, z: position.z });
    }
    return result;
  }

  /** The distance to the car in front of a car (null when the road is free). */
  obstacleDistance(car: TrafficCar): number | null {
    return this.obstacleDistances.get(car) ?? null;
  }

  /** The traffic lights of the city. */
  get lights(): IntersectionManager {
    return this.intersections;
  }

  /** Called once per frame. */
  update(dt: number, playerX: number, playerZ: number): void {
    this.intersections.update(dt);

    // The obstacle distances only change slowly, so they are updated every
    // few frames instead of every frame.
    this.obstacleTimer -= dt;
    if (this.obstacleTimer <= 0) {
      this.obstacleTimer = 0.2;
      this.updateObstacles(playerX, playerZ);
    }

    // The nearest cars use the full physics, the far away ones only follow
    // their lane (that saves a lot of CPU).
    const distances: { car: TrafficCar; distance: number }[] = [];
    for (const car of this.cars) {
      const position = car.position;
      distances.push({
        car,
        distance: Math.hypot(position.x - playerX, position.z - playerZ),
      });
    }
    distances.sort((a, b) => a.distance - b.distance);
    for (let i = 0; i < distances.length; i++) {
      const car = distances[i].car;
      const position = car.position;
      const ready = this.groundReady(position.x, position.z);
      car.setPhysicsMode(
        ready && i < PHYSICS_CARS && distances[i].distance < PHYSICS_RADIUS,
      );
    }

    for (const car of this.cars) {
      const obstacle = this.obstacleDistances.get(car) ?? null;
      const redLight = this.checkRedLight(car);

      car.update(dt, obstacle, redLight);

      // At the end of the lane the car picks the next road.
      if (car.atEnd) {
        this.continueRoute(car);
      }

      // A car that is stuck behind the player honks after a moment.
      this.checkHonk(car, dt, playerX, playerZ);

      // A car that fell through the world (the ground was not ready yet)
      // is put back on its lane.
      const position = car.position;
      if (position.y < -20) {
        this.rescueCar(car);
        this.stopTimes.set(car, 0);
        continue;
      }

      // A car that wants to drive but does not move has been rammed or is
      // wedged: it is put back on its lane. (A car that waits for a red
      // light or queues up behind another car is not stuck.)
      if (car.speed < 0.4 && car.wantedSpeed > 2) {
        const time = (this.stopTimes.get(car) ?? 0) + dt;
        this.stopTimes.set(car, time);
        if (time > STUCK_TIME) {
          this.rescueCar(car);
          this.stopTimes.set(car, 0);
        }
      } else {
        this.stopTimes.set(car, 0);
      }
    }

    this.removeFarCars(playerX, playerZ);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      this.spawnCars(playerX, playerZ);
    }
  }

  /** Copy the physics state of the cars onto their meshes. */
  syncVisuals(dt: number): void {
    for (const car of this.cars) car.syncVisual(dt);
  }

  /** Remove the cars that are too far away. */
  private removeFarCars(playerX: number, playerZ: number): void {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const distance = Math.hypot(
        car.position.x - playerX,
        car.position.z - playerZ,
      );
      if (distance > DESPAWN_DISTANCE) {
        this.removeCar(i);
      }
    }
  }

  private removeCar(index: number): void {
    const car = this.cars[index];
    this.cars.splice(index, 1);
    this.obstacleDistances.delete(car);
    this.stopTimes.delete(car);
    this.honkTimes.delete(car);
    car.dispose();
  }

  /** Spawn new cars on the roads around the player. */
  private spawnCars(playerX: number, playerZ: number): void {
    const cap = settings.preset.trafficCap;
    let attempts = 0;
    while (this.cars.length < cap && attempts < 12) {
      attempts++;
      if (!this.spawnOne(playerX, playerZ)) break;
    }
  }

  /** Try to place one new car. */
  private spawnOne(playerX: number, playerZ: number): boolean {
    // Only the roads that are roughly in the ring around the player.
    const edges = this.network.roadsInRadius(playerX, playerZ, SPAWN_MAX).filter((edge) => {
      const middle = this.positionOnPath(
        this.network.getLanePath(edge.id, 0)!,
        edge.length * 0.5,
      );
      const distance = Math.hypot(middle.x - playerX, middle.z - playerZ);
      return distance > SPAWN_MIN && distance < SPAWN_MAX;
    });
    if (edges.length === 0) return false;

    // Try a few roads and lanes until one of them works.
    for (let attempt = 0; attempt < 6; attempt++) {
      const edge = edges[this.rng.int(0, edges.length - 1)];
      const lanesPerSide = Math.max(1, edge.lanes);
      // Half of the cars drive in the opposite direction.
      const reversed = this.rng.chance(0.45);
      const laneIndex = this.rng.int(0, lanesPerSide - 1);
      const lane = reversed ? lanesPerSide + laneIndex : laneIndex;

      const path = this.network.getLanePath(edge.id, lane);
      if (!path || path.points.length < 2) continue;

      // A random place on the lane.
      const distance = this.rng.range(2, Math.max(3, path.length - 2));
      const position = this.positionOnPath(path, distance);

      // Never spawn right in front of the player.
      const playerDistance = Math.hypot(position.x - playerX, position.z - playerZ);
      if (playerDistance < MIN_PLAYER_DISTANCE) continue;
      if (playerDistance > SPAWN_MAX) continue;

      // The car needs dry land.
      if (position.y < 1) continue;

      // Do not put a car on top of another one.
      let blocked = false;
      for (const car of this.cars) {
        if (Math.hypot(car.position.x - position.x, car.position.z - position.z) < 12) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const config = AI_CARS[this.rng.int(0, AI_CARS.length - 1)];
      const color =
        config.id === 'taxi'
          ? config.color
          : AI_PAINT_COLORS[this.rng.int(0, AI_PAINT_COLORS.length - 1)];

      const car = new TrafficCar(this.physics, config, path, distance, color);
      // The new cars start in the cheap mode, they switch to the full
      // physics when they come close to the player.
      car.setPhysicsMode(false);
      this.cars.push(car);
      this.group.add(car.mesh.group);
      return true;
    }
    return false;
  }

  /** The position on a lane at a distance. */
  private positionOnPath(path: LanePath, distance: number): { x: number; y: number; z: number } {
    const points = path.points;
    let index = 0;
    while (index < points.length - 2 && points[index + 1].distance < distance) {
      index++;
    }
    const a = points[index];
    const b = points[Math.min(points.length - 1, index + 1)];
    const span = b.distance - a.distance;
    const t = span > 0.001 ? (distance - a.distance) / span : 0;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  /** Let the car continue on another road when it reaches the end of a lane. */
  private continueRoute(car: TrafficCar): void {
    const oldPath = car.path;
    const nodeId = this.network.endNode(oldPath.edgeId, oldPath.reversed);
    const candidates = this.network.edgesAtNode(nodeId).filter(
      (edge) => edge.id !== oldPath.edgeId,
    );
    if (candidates.length === 0) {
      // Dead end: drive back the way we came.
      const lanesPerSide = Math.max(1, this.network.edges[oldPath.edgeId]?.lanes ?? 1);
      const other = oldPath.reversed
        ? oldPath.lane
        : lanesPerSide + oldPath.lane;
      car.path = this.network.getLanePath(oldPath.edgeId, other) ?? oldPath;
      car.distance = 0;
      return;
    }

    // Pick the road that continues the current direction best.
    const last = oldPath.points[oldPath.points.length - 1];
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const edge of candidates) {
      const path = this.network.getLanePath(edge.id, this.laneFor(edge, oldPath, nodeId));
      if (!path || path.points.length < 2) continue;
      const next = path.points[0];
      const dx = next.x - last.x;
      const dz = next.z - last.z;
      const len = Math.hypot(dx, dz) || 1;
      // The dot product of the old and the new direction.
      const score = (dx / len) * Math.sin(last.heading) + (dz / len) * Math.cos(last.heading);
      if (score > bestScore) {
        bestScore = score;
        best = edge;
      }
    }

    const lane = this.laneFor(best, oldPath, nodeId);
    const nextPath = this.network.getLanePath(best.id, lane);
    if (!nextPath) return;
    car.path = nextPath;
    // Start at the point of the new lane that is closest to the car, so the
    // car does not jump when it turns into the next road.
    const position = car.position;
    car.distance = this.closestDistanceOnPath(nextPath, position.x, position.z);
  }

  /**
   * Lets the car honk at the player when the player blocks its way.
   */
  private checkHonk(car: TrafficCar, dt: number, playerX: number, playerZ: number): void {
    const position = car.position;
    const distance = Math.hypot(position.x - playerX, position.z - playerZ);
    // Only close to the player and only when the car wants to drive.
    if (distance > 25 || car.speed > 3 || car.wantedSpeed < 1) {
      this.honkTimes.delete(car);
      return;
    }
    const time = (this.honkTimes.get(car) ?? 0) + dt;
    this.honkTimes.set(car, time);
    // The first honk comes after a second, then every few seconds.
    if (time > 1.5 && (time - 1.5) % 4 < dt) {
      this.onHonk?.();
    }
  }

  /**
   * Puts a stuck car back onto its lane.
   *
   * The car keeps its lane but is placed in the middle of it again, so the
   * traffic does not pile up behind a car that cannot move.
   */
  private rescueCar(car: TrafficCar): void {
    const path = car.path;
    if (path.points.length < 2) return;
    // Find a free spot on the lane (not too close to the other cars).
    const spacing = 14;
    for (let attempt = 0; attempt < 8; attempt++) {
      const distance = (car.distance + attempt * spacing) % Math.max(1, path.length - 1);
      const position = this.positionOnPath(path, distance);
      let blocked = false;
      for (const other of this.cars) {
        if (other === car) continue;
        if (Math.hypot(other.position.x - position.x, other.position.z - position.z) < 10) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      car.rescueTo(distance);
      this.rescueCount++;
      return;
    }
  }

  /** The distance along a lane of the point closest to a position. */
  private closestDistanceOnPath(path: LanePath, x: number, z: number): number {
    const points = path.points;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const lengthSquared = ex * ex + ez * ez;
      let t = lengthSquared > 1e-9
        ? ((x - a.x) * ex + (z - a.z) * ez) / lengthSquared
        : 0;
      t = clamp(t, 0, 1);
      const px = a.x + ex * t;
      const pz = a.z + ez * t;
      const distance = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = a.distance + (b.distance - a.distance) * t;
      }
    }
    return best;
  }

  /** The lane the car uses on the next road. */
  private laneFor(edge: RoadEdge, oldPath: LanePath, nodeId: number): number {
    const lanesPerSide = Math.max(1, edge.lanes);
    // If the new road starts at our node we keep driving in the same
    // direction, otherwise we are driving against it.
    const drivesForward = this.network.startNode(edge.id, false) === nodeId;
    const index = Math.min(oldPath.lane, lanesPerSide - 1);
    return drivesForward ? index : lanesPerSide + index;
  }

  /**
   * Does the car have to stop at the end of its lane?
   *
   * In the city that is the traffic light, everywhere else it is the
   * priority rule: the car with the lower priority waits.
   */
  private checkRedLight(car: TrafficCar): boolean {
    const remaining = car.distanceToEnd();
    if (remaining > 30) return false;
    const nodeId = this.network.endNode(car.path.edgeId, car.path.reversed);
    if (nodeId < 0) return false;
    const points = car.path.points;
    if (points.length === 0) return false;
    const last = points[points.length - 1];

    if (this.intersections.hasLight(nodeId)) {
      return this.intersections.isRed(nodeId, last.heading);
    }

    // No traffic light: the car yields to the traffic with the priority.
    const myPriority = this.intersections.priority(nodeId, last.heading);
    for (const other of this.cars) {
      if (other === car) continue;
      // The other car must be on a road that ends at the same junction.
      if (this.network.endNode(other.path.edgeId, other.path.reversed) !== nodeId) {
        continue;
      }
      const otherPoints = other.path.points;
      if (otherPoints.length === 0) continue;
      const otherLast = otherPoints[otherPoints.length - 1];
      // Only the cars that are close to the junction matter.
      if (other.distanceToEnd() > 30) continue;
      const otherPriority = this.intersections.priority(nodeId, otherLast.heading);
      // The car with the smaller priority has to wait.
      if (otherPriority < myPriority) return true;
      // Two cars of the same priority: the one from the south goes first.
      if (
        otherPriority === myPriority &&
        otherLast.heading !== last.heading &&
        other.distanceToEnd() < car.distanceToEnd()
      ) {
        return true;
      }
    }
    return false;
  }

  /** Work out how far the car in front is. */
  private updateObstacles(playerX: number, playerZ: number): void {
    for (const car of this.cars) {
      let nearest: number | null = null;

      const position = car.position;
      const heading = car.vehicle.heading;
      // The forward direction of the car (0 = +Z).
      const forwardX = Math.sin(heading);
      const forwardZ = Math.cos(heading);

      const consider = (dx: number, dz: number, range: number) => {
        const distance = Math.hypot(dx, dz);
        if (distance > range || distance < 0.01) return;
        // The car has to be in front of us...
        const ahead = (dx * forwardX + dz * forwardZ) / distance;
        if (ahead < 0.5) return;
        // ...and roughly in our lane.
        const lateral = Math.abs(-dx * forwardZ + dz * forwardX);
        if (lateral > LANE_CORRIDOR) return;
        // The gap is measured from the front of our car.
        const gap = distance - CAR_LENGTH;
        // A car that is already touching us is an obstacle with no gap.
        const value = gap > 0.5 ? gap : 0;
        if (nearest === null || value < nearest) nearest = value;
      };

      for (const other of this.cars) {
        if (other === car) continue;
        const otherPosition = other.position;
        consider(
          otherPosition.x - position.x,
          otherPosition.z - position.z,
          OBSTACLE_RANGE,
        );
      }

      // The player is an obstacle too.
      consider(playerX - position.x, playerZ - position.z, OBSTACLE_RANGE);

      this.obstacleDistances.set(car, nearest);
    }
  }

  /** Show the lanes the AI cars drive on (debug view). */
  updateDebugLines(): void {
    this.debugPositions.length = 0;
    for (const car of this.cars) {
      const points = car.path.points;
      for (let i = 0; i < points.length - 1; i++) {
        this.debugPositions.push(
          points[i].x, points[i].y + 0.4, points[i].z,
          points[i + 1].x, points[i + 1].y + 0.4, points[i + 1].z,
        );
      }
    }
    const geometry = this.debugLines.geometry;
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.debugPositions), 3),
    );
  }

  setDebugVisible(visible: boolean): void {
    this.debugLines.visible = visible;
  }

  dispose(): void {
    for (const car of this.cars) car.dispose();
    this.cars.length = 0;
    this.obstacleDistances.clear();
    this.intersections.dispose();
    this.debugLines.geometry.dispose();
    (this.debugLines.material as THREE.Material).dispose();
    this.group.clear();
  }
}

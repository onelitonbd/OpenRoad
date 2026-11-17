import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { LanePath } from '../world/RoadNetwork';
import { TRAFFIC_GROUPS, type PhysicsWorld } from '../physics/PhysicsWorld';
import { Vehicle } from '../vehicles/Vehicle';
import {
  buildCarMesh,
  buildCarMeshFromModel,
  getCarModel,
  type CarMesh,
} from '../vehicles/CarFactory';
import type { VehicleConfig } from '../vehicles/VehicleConfig';
import { clamp, damp } from '../utils/math';

/** How far the car looks ahead for the path, per m/s of speed. */
const LOOK_AHEAD_TIME = 0.9;
/** The minimum distance to the car in front that the AI keeps. */
const GAP_DISTANCE = 9;
/** The distance in front of a junction where the cars wait for the light. */
const STOP_LINE = 9;

/**
 * One AI car.
 *
 * The car drives along a lane of the road network. It uses a "pure pursuit"
 * controller: it looks a bit ahead on the lane and steers towards that point.
 * The speed is limited by the speed limit of the road, by the sharpness of
 * the next corner and by the car in front.
 */
export class TrafficCar {
  readonly mesh: CarMesh;
  /** The vehicle of the car (rebuilt when the car is rescued). */
  vehicle: Vehicle;

  /** The lane the car is driving on. */
  path: LanePath;
  /** The distance along the lane in metres. */
  distance = 0;
  /** The current speed in m/s. */
  speed = 0;

  /** True while the car is simulated with the full rigid body physics. */
  physicsMode = true;
  /** True while the car waits for a red light. */
  waiting = false;
  /** False once the car has been removed from the world. */
  alive = true;
  /** The speed the AI would like to drive (m/s). */
  wantedSpeed = 0;
  /** True when the last frame had a red light (for the debug view). */
  lastRedLight = false;
  /** The distance to the car in front in the last frame. */
  lastObstacle: number | null = null;

  private readonly physics: PhysicsWorld;
  private readonly config: VehicleConfig;
  private readonly tmpVec = new THREE.Vector3();

  constructor(
    physics: PhysicsWorld,
    config: VehicleConfig,
    path: LanePath,
    startDistance: number,
    color: string,
  ) {
    this.physics = physics;
    this.config = config;
    this.path = path;
    this.distance = startDistance;

    // The traffic uses the 3D model of the car when it is loaded. If the
    // model is missing the procedural car is used instead.
    const model = getCarModel(config.model, config);
    this.mesh = model
      ? buildCarMeshFromModel(config, model)
      : buildCarMesh(config, color);
    this.vehicle = new Vehicle(physics, config, this.mesh.group, TRAFFIC_GROUPS);
    this.vehicle.setWheelMeshes(this.mesh.wheels);
    // The AI cars never drive backwards.
    this.vehicle.allowReverse = false;

    // Put the car on its lane right away.
    const start = this.positionAt(startDistance);
    this.vehicle.resetTo(start.x, start.y + 1, start.z, start.heading);
  }

  /** The position of the car on the lane. */
  positionAt(distance: number): { x: number; y: number; z: number; heading: number } {
    const points = this.path.points;
    if (points.length === 0) {
      return { x: 0, y: 0, z: 0, heading: 0 };
    }
    let index = 0;
    while (
      index < points.length - 2 &&
      points[index + 1].distance < distance
    ) {
      index++;
    }
    const a = points[index];
    const b = points[Math.min(points.length - 1, index + 1)];
    const span = b.distance - a.distance;
    const t = span > 0.001 ? clamp((distance - a.distance) / span, 0, 1) : 0;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      heading: a.heading + shortestAngle(a.heading, b.heading) * t,
    };
  }

  /** The point on the lane at a distance ahead of the car. */
  private lookAhead(distance: number): { x: number; z: number } {
    const p = this.positionAt(distance);
    return { x: p.x, z: p.z };
  }

  /**
   * One simulation step.
   *
   * `obstacleDistance` is the distance to the nearest car in front (or
   * `null` when the road is free). `redLight` is true when the traffic light
   * at the next junction is red.
   */
  update(
    dt: number,
    obstacleDistance: number | null,
    redLight: boolean,
  ): void {
    const path = this.path;
    this.lastRedLight = redLight;
    this.lastObstacle = obstacleDistance;
    if (path.points.length < 2) return;

    // --- steering: aim at a point ahead on the lane ---
    const lookAheadDistance = 7 + this.speed * LOOK_AHEAD_TIME;
    const target = this.lookAhead(this.distance + lookAheadDistance);

    const position = this.vehicle.body.translation();
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    // The car faces +Z, so the heading is atan2(x, z).
    const wanted = Math.atan2(dx, dz);
    const heading = this.vehicle.heading;
    let error = wanted - heading;
    // Keep the error in -PI..PI.
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;

    // How far is the car away from the middle of its lane? The car pulls
    // back to the lane when it drifts to the side.
    const onPath = this.positionAt(this.distance);
    const toPathX = onPath.x - position.x;
    const toPathZ = onPath.z - position.z;
    // The right hand side of the car (with up = +Y) is (-cos, sin). A
    // positive lateral value means the lane is on the right of the car.
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);
    const lateral = toPathX * rightX + toPathZ * rightZ;

    // The pure pursuit term aims at the point ahead (a bigger heading is a
    // turn to the left, so the error has to be negated), the lateral term
    // pulls the car back to the middle of the lane.
    const steer = clamp(-error * 2.2 + lateral * 0.3, -1, 1);

    // --- the speed we would like to drive ---
    const limit = (path.speed / 3.6) * 0.92;
    let wanted_speed = limit;

    // The cars with the full physics are heavy and need a little more time
    // to turn, so they drive a bit slower.
    if (this.physicsMode) wanted_speed *= 0.8;

    // Slow down for the next corner.
    const curve = this.cornerSpeed(lookAheadDistance);
    if (curve < wanted_speed) wanted_speed = curve;

    // Slow down for the car in front and for a red light.
    if (obstacleDistance !== null) {
      const safe = Math.max(0, obstacleDistance - GAP_DISTANCE);
      wanted_speed = Math.min(wanted_speed, safe * 0.6);
    }
    if (redLight) {
      // The car stops at the stop line in front of the junction.
      const toLight = Math.max(0, this.distanceToEnd() - STOP_LINE);
      wanted_speed = Math.min(wanted_speed, toLight * 0.5);
    }

    // The AI is a bit careful around the player: it does not drive straight
    // into the player. (The player is handled as an obstacle, so the car
    // keeps rolling instead of standing still forever.)

    this.wantedSpeed = wanted_speed;

    // --- throttle and brake ---
    let throttle = 0;
    let brake = 0;
    if (this.speed < wanted_speed - 0.4) {
      throttle = clamp((wanted_speed - this.speed) * 0.5, 0, 1);
    } else if (this.speed > wanted_speed + 0.6) {
      brake = clamp((this.speed - wanted_speed) * 0.35, 0, 1);
    }
    this.waiting = redLight && this.speed < 0.6;

    this.vehicle.setControls(throttle, brake, steer, false);

    // --- move the car along the lane ---
    if (this.physicsMode) {
      this.vehicle.prepareStep(dt);
      this.vehicle.applyPhysics(dt);
    } else {
      // Far away cars are simply moved along the lane.
      this.speed = damp(this.speed, wanted_speed, 1.5, dt);
      this.distance += this.speed * dt;
      const p = this.positionAt(this.distance);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.heading, 0));
      this.vehicle.body.setNextKinematicTranslation({ x: p.x, y: p.y + 1, z: p.z });
      this.vehicle.body.setNextKinematicRotation({
        x: q.x, y: q.y, z: q.z, w: q.w,
      });
    }
  }

  /** The speed that is safe for the next corner. */
  private cornerSpeed(lookAhead: number): number {
    const points = this.path.points;
    let index = 0;
    while (index < points.length - 2 && points[index + 1].distance < this.distance + lookAhead) {
      index++;
    }
    const a = points[Math.max(0, index - 1)];
    const b = points[index];
    const c = points[Math.min(points.length - 1, index + 1)];
    // The angle between the two road directions.
    const angle = Math.abs(shortestAngle(a.heading, b.heading) + shortestAngle(b.heading, c.heading));
    if (angle < 0.08) return 999;
    // The sharper the corner, the slower the car goes.
    return clamp(24 / angle, 4, 999);
  }

  /** The distance to the end of the lane. */
  distanceToEnd(): number {
    return Math.max(0, this.path.length - this.distance);
  }

  /** The car reached the end of its lane. */
  get atEnd(): boolean {
    return this.distance >= this.path.length - 1;
  }

  /**
   * Switch between the full physics and the cheap movement.
   *
   * The car keeps its place on the lane, so the switch is not visible.
   */
  setPhysicsMode(enabled: boolean): void {
    if (enabled === this.physicsMode) return;
    this.physicsMode = enabled;
    const body = this.vehicle.body;
    if (enabled) {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      // The car keeps the place it had on the lane (and the speed it had),
      // so the switch is not visible to the player.
      const p = this.positionAt(this.distance);
      body.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true);
      // Continue with the speed of the lane.
      const heading = p.heading;
      body.setLinvel(
        {
          x: Math.sin(heading) * this.speed,
          y: 0,
          z: Math.cos(heading) * this.speed,
        },
        true,
      );
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();
    } else {
      // The cheap cars drive along the lane, so the physics car has to
      // give its place back to the lane first.
      const position = body.translation();
      const p = this.positionAt(this.distance);
      this.distance = this.closestOnPath(position.x, position.z);
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      body.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /**
   * Puts the car back onto its lane (used when it got stuck).
   *
   * The old vehicle is thrown away and a new one is built at the wanted
   * place. Moving a running vehicle around makes the suspension explode,
   * so a fresh car is much safer.
   */
  rescueTo(distance: number): void {
    this.distance = distance;
    const p = this.positionAt(distance);

    const wasPhysics = this.physicsMode;
    this.vehicle.dispose(this.physics);
    this.vehicle = new Vehicle(this.physics, this.config, this.mesh.group, TRAFFIC_GROUPS);
    this.vehicle.setWheelMeshes(this.mesh.wheels);
    this.vehicle.allowReverse = false;
    this.vehicle.resetTo(p.x, p.y + 1, p.z, p.heading);
    this.physicsMode = wasPhysics;
    this.speed = 0;
  }

  /** Copy the physics state onto the mesh (called after the world step). */
  syncVisual(dt: number): void {
    if (this.physicsMode) {
      this.vehicle.update(dt);
      // The physics car is not exactly on the lane, so the distance along
      // the lane is measured again from its real position.
      const position = this.vehicle.body.translation();
      this.distance = this.closestOnPath(position.x, position.z);
      this.speed = Math.max(0, this.vehicle.forwardSpeed);
    } else {
      // The cheap cars have no wheels on the ground, so only the body moves.
      this.vehicle.syncVisual();
    }
  }

  /**
   * The distance along the lane of the point that is closest to a position.
   */
  private closestOnPath(x: number, z: number): number {
    const points = this.path.points;
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

  /** The world position of the car. */
  get position(): THREE.Vector3 {
    const p = this.vehicle.body.translation();
    this.tmpVec.set(p.x, p.y, p.z);
    return this.tmpVec;
  }

  dispose(): void {
    this.alive = false;
    this.vehicle.dispose(this.physics);
    this.mesh.group.removeFromParent();
  }
}

/** The smallest difference between two angles. */
function shortestAngle(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// TrafficManager.ts — spawn/despawn AI cars near player
import * as THREE from 'three';
import { TrafficCar } from './TrafficCar';
import { Intersection } from './Intersection';
import type { RoadNetwork } from '../world/RoadNetwork';
import { settings } from '../core/Settings';
import { seededRng } from '../utils/random';

export class TrafficManager {
  private cars: TrafficCar[] = [];
  private scene: THREE.Scene;
  private roads: RoadNetwork;
  private rng: () => number;
  private spawnTimer = 0;
  private intersections: Intersection;

  constructor(scene: THREE.Scene, roads: RoadNetwork, seed: string) {
    this.scene = scene;
    this.roads = roads;
    this.rng = seededRng(seed + ':traffic');
    this.intersections = new Intersection(roads, seed);
  }

  update(playerPos: THREE.Vector3, dt: number, physicsWorld: unknown) {
    this.spawnTimer += dt;
    this.intersections.update(dt);

    // Update existing cars
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const keep = car.update(dt, playerPos, this.cars, this.intersections);
      if (!keep) {
        car.dispose(this.scene);
        this.cars.splice(i, 1);
      }
    }

    // Spawn logic every 0.4s
    if (this.spawnTimer > 0.4) {
      this.spawnTimer = 0;
      this.trySpawn(playerPos);
    }

    // Perf swap: mark nearest 10 as physics-enabled (future) — currently all kinematic so no-op
  }

  private trySpawn(playerPos: THREE.Vector3) {
    const cap = settings.preset.trafficCap;
    if (this.cars.length >= cap) return;

    // Find road edges within 150-400m ring around player (excluding those too close in view)
    const candidates = this.roads.getRoadsInRadius(playerPos, 400).filter(edge=>{
      const mid = edge.points[Math.floor(edge.points.length/2)];
      const d = Math.hypot(mid.x - playerPos.x, mid.z - playerPos.z);
      return d >= 140 && d <= 420 && edge.type !== 'mountain';
    });
    if (!candidates.length) return;

    // Pick random edge
    const edge = candidates[Math.floor(this.rng()*candidates.length)];
    // Don't spawn if too close to player line-of-sight: check if edge centroid is in front of player? simplify ignore
    // Also avoid spawning on top of existing cars
    const spawnPos = edge.points[Math.floor(edge.points.length/2)];
    for (const other of this.cars) if (other.group.position.distanceTo(spawnPos) < 28) return;

    // Lane index random
    const lane = Math.floor(this.rng()*edge.laneCount);
    const path = this.roads.getLanePath(edge.id, lane);
    if (!path.length) return;

    const car = new TrafficCar(edge, lane, path, this.rng, this.scene);
    // Spawn slightly offset along path to avoid exact overlap
    const offsetIdx = Math.floor(this.rng()*Math.min(2, path.length));
    car.group.position.copy(path[offsetIdx].clone().add(new THREE.Vector3(0,0.35,0)));
    // Heading from path direction
    if (path.length >= 2) {
      const next = path[Math.min(1, path.length-1)];
      const dir = new THREE.Vector3(next.x - path[0].x, 0, next.z - path[0].z).normalize();
      const heading = Math.atan2(dir.z, dir.x);
      car.group.rotation.y = heading;
      car.heading = heading;
    }
    this.cars.push(car);
  }

  getCars(): TrafficCar[] { return this.cars; }

  getCount(): number { return this.cars.length; }

  dispose() {
    for (const c of this.cars) c.dispose(this.scene);
    this.cars = [];
  }
}

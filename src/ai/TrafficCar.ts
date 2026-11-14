// TrafficCar.ts — lane following, speed limit, stops
import * as THREE from 'three';
import { TrafficManager } from './TrafficManager';
import { Intersection } from './Intersection';
import { CarFactory } from '../vehicles/CarFactory';
import type { RoadEdge } from '../world/RoadNetwork';
import { clamp, lerp } from '../utils/math';
import { seededRng } from '../utils/random';

export class TrafficCar {
  group: THREE.Group;
  heading = 0;
  private edge: RoadEdge;
  private lane: number;
  private path: THREE.Vector3[];
  private pathIdx = 0;
  private speed = 0;
  private targetSpeed: number;
  private rng: () => number;
  private lifetime = 0;
  private maxLifetime = 85; // despawn after 85s if not recycled
  private width: number;
  private color: string;

  constructor(edge: RoadEdge, lane:number, path: THREE.Vector3[], rng:()=>number, scene: THREE.Scene) {
    this.edge = edge;
    this.lane = lane;
    this.path = path;
    this.rng = rng;
    this.targetSpeed = (edge.speedLimit * (0.78 + rng()*0.32)) / 3.6; // m/s
    this.width = edge.width;

    // Create procedural car mesh with random color
    const palette = ['#e5e7eb','#94a3b8','#64748b','#f87171','#60a5fa','#34d399','#fbbf24','#a78bfa','#38bdf8','#fb7185'];
    this.color = palette[Math.floor(rng()*palette.length)];
    const dims: [number,number,number] = [4.2 + rng()*0.6, 1.85, 1.25];
    const mesh = CarFactory.createProcedural(this.color, dims);
    this.group = mesh.root;
    this.group.position.copy(path[0]);
    // Wheels already in mesh
    scene.add(this.group);
  }

  // Returns false if should be despawned
  update(dt:number, playerPos: THREE.Vector3, others: TrafficCar[], intersections: Intersection): boolean {
    this.lifetime += dt;
    if (this.lifetime > this.maxLifetime) return false;
    if (this.group.position.distanceTo(playerPos) > 520) return false; // despawn far

    // Slow for curves: curvature lookahead
    const lookAhead = this.path[Math.min(this.path.length-1, this.pathIdx+5)];
    const cur = this.path[this.pathIdx];
    const next = this.path[Math.min(this.path.length-1, this.pathIdx+1)];
    if (cur && next && lookAhead) {
      const dir1 = new THREE.Vector3(next.x-cur.x,0,next.z-cur.z).normalize();
      const dir2 = new THREE.Vector3(lookAhead.x-next.x,0,lookAhead.z-next.z).normalize();
      const angle = Math.acos(clamp(dir1.dot(dir2), -1,1));
      if (angle > 0.35) this.targetSpeed = Math.min(this.targetSpeed, (this.edge.speedLimit*0.55)/3.6);
      else if (angle > 0.18) this.targetSpeed = Math.min(this.targetSpeed, (this.edge.speedLimit*0.82)/3.6);
    }

    // Intersection stop handling
    const distToIntersection = this.distanceToNearestIntersection();
    if (distToIntersection !== null && distToIntersection < 9) {
      const edgeId = this.edge.id;
      const canGo = intersections.canGo(edgeId, this.group.position);
      if (!canGo) {
        this.speed = lerp(this.speed, 0, dt*4);
        // brake lights could be emissive
      } else {
        this.speed = lerp(this.speed, this.targetSpeed, dt*1.5);
      }
    } else {
      this.speed = lerp(this.speed, this.targetSpeed, dt*1.2);
    }

    // Keep following distance: check others ahead
    const aheadDist = 11 + this.speed*0.6;
    let minAhead = Infinity;
    for (const other of others) {
      if (other===this) continue;
      const d = this.group.position.distanceTo(other.group.position);
      if (d < aheadDist) {
        // Are they ahead? dot product
        const toOther = new THREE.Vector3(other.group.position.x - this.group.position.x, 0, other.group.position.z - this.group.position.z).normalize();
        const forward = new THREE.Vector3(Math.cos(this.heading),0,Math.sin(this.heading));
        if (toOther.dot(forward) > 0.25 && d < minAhead) minAhead = d;
      }
    }
    if (minAhead < 9) {
      const brakeFactor = clamp((9 - minAhead)/9, 0, 1);
      this.speed = lerp(this.speed, Math.max(0, this.targetSpeed*0.15), dt* (3+brakeFactor*4));
      if (minAhead < 3.5) this.speed = 0;
    }

    // Also check player ahead
    const toPlayer = new THREE.Vector3(playerPos.x - this.group.position.x, 0, playerPos.z - this.group.position.z);
    const forward = new THREE.Vector3(Math.cos(this.heading),0,Math.sin(this.heading));
    const distToPlayer = toPlayer.length();
    if (distToPlayer < aheadDist && toPlayer.normalize().dot(forward) > 0.3 && distToPlayer < 18) {
      this.speed = lerp(this.speed, 0, dt*5);
    }

    // Move along path
    if (this.pathIdx >= this.path.length-1) {
      // Reached end of edge — pick next edge
      if (!this.chooseNextEdge()) return false; // despawn if dead end
    }

    const target = this.path[this.pathIdx];
    const toTarget = new THREE.Vector3(target.x - this.group.position.x, 0, target.z - this.group.position.z);
    const dist = toTarget.length();
    if (dist < 2.2) {
      this.pathIdx++;
    } else {
      const dir = toTarget.normalize();
      const desiredHeading = Math.atan2(dir.z, dir.x);
      // Smooth steering
      let dHeading = desiredHeading - this.heading;
      while(dHeading > Math.PI) dHeading-=Math.PI*2;
      while(dHeading < -Math.PI) dHeading+=Math.PI*2;
      this.heading += dHeading * dt * 2.8;
      // Move
      const move = forward.multiplyScalar(this.speed * dt);
      // Add slight bob for suspension visual
      this.group.position.add(move);
      this.group.position.y = target.y + 0.35 + Math.sin(this.lifetime*8)*0.015;
      this.group.rotation.y = this.heading;
      // Body roll in curves
      this.group.rotation.z = clamp(-dHeading*0.5, -0.18, 0.18);
      // Wheel rotation
      const wheelSpin = (this.speed / 0.34) * dt;
      (this.group.children as THREE.Object3D[]).forEach(child=>{
        // Wheels are Groups inside root; we stored them as meshes but we can traverse to find wheel groups
        child.traverse(obj=>{
          if ((obj as THREE.Group).isGroup && obj.children.length===2) {
            // wheel container has 2 meshes (tire+rim)
            // spin is around Z (due to cylinder orientation)
            obj.rotation.z += wheelSpin;
          }
        });
      });
      // Steer front wheels visually: find first two wheel groups (heuristic)
      // We skip detailed steering for traffic for perf
    }

    return true;
  }

  private distanceToNearestIntersection(): number | null {
    // Simplified: if edge is connected to a node that is intersection, compute distance to node
    // We don't have node map here, assume any edge with downtown type near intersection
    // For now, use dummy: if path length large and we're near end, treat as intersection
    if (this.pathIdx > this.path.length-4) return this.group.position.distanceTo(this.path[this.path.length-1]);
    return null;
  }

  private chooseNextEdge(): boolean {
    // For simplicity, despawn at dead end and let manager respawn elsewhere
    // In future we could query RoadNetwork for connected edges and pick random
    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse(obj=>{
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(x=> (x as THREE.Material).dispose());
        else (m.material as THREE.Material).dispose();
      }
    });
  }
}

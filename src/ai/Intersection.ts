// Intersection.ts — timed traffic lights in downtown
import type { RoadNetwork } from '../world/RoadNetwork';
import * as THREE from 'three';
import { seededRng } from '../utils/random';

type LightState = 'green' | 'yellow' | 'red';

export class Intersection {
  private roads: RoadNetwork;
  private lights = new Map<string, { state: LightState, timer:number, phase:number }>();
  private rng: () => number;

  constructor(roads: RoadNetwork, seed:string) {
    this.roads = roads;
    this.rng = seededRng(seed + ':lights');
    // Initialize lights for downtown intersections
    for (const node of roads.nodes.values()) {
      if (node.isIntersection && node.pos.length() < 1200) {
        this.lights.set(node.id, { state:'green', timer: this.rng()*6, phase: this.rng()*3 });
      }
    }
  }

  update(dt:number) {
    for (const [id, light] of this.lights) {
      light.timer += dt;
      const cycle = 10; // green 6, yellow 1.5, red 6? cycle 13.5 but we use simple 10
      if (light.state==='green' && light.timer > 6) { light.state='yellow'; light.timer=0; }
      else if (light.state==='yellow' && light.timer > 1.5) { light.state='red'; light.timer=0; }
      else if (light.state==='red' && light.timer > 6) { light.state='green'; light.timer=0; }
    }
  }

  canGo(edgeId: string, pos: THREE.Vector3): boolean {
    // Find nearest downtown intersection within 14m
    let nearest: string | null = null;
    let bestDist = Infinity;
    for (const [nid, node] of this.roads.nodes) {
      if (!this.lights.has(nid)) continue;
      const d = Math.hypot(node.pos.x - pos.x, node.pos.z - pos.z);
      if (d < 14 && d < bestDist) { bestDist=d; nearest=nid; }
    }
    if (!nearest) return true; // yield priority: go
    const light = this.lights.get(nearest)!;
    // Simple: allow if green
    return light.state === 'green';
  }

  getState(nodeId:string): LightState | undefined { return this.lights.get(nodeId)?.state; }
}

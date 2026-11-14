// World.ts — owns chunk manager, seed, region map, terrain, road network
import * as THREE from 'three';
import { Regions } from './Regions';
import { Terrain } from './Terrain';
import { ChunkManager } from './ChunkManager';
import { RoadNetwork } from './RoadNetwork';
import { Water } from './Water';

export class World {
  seed: string;
  regions: Regions;
  terrain: Terrain;
  roads: RoadNetwork;
  chunkManager: ChunkManager;
  water: Water | null = null;

  constructor(seed = 'open-road-seed-0', scene: THREE.Scene, physicsWorld: unknown) {
    this.seed = seed;
    this.regions = new Regions(seed);
    this.terrain = new Terrain(seed, this.regions);
    // Road network must be created after terrain (needs rawHeight)
    this.roads = new RoadNetwork(seed, this.terrain);
    // Tell terrain to flatten under roads
    this.terrain.roadHeightAt = (x,z)=> this.roads.roadHeightAt(x,z);
    this.chunkManager = new ChunkManager(this.terrain, this.regions, this.roads, scene, physicsWorld as never);
    this.water = new Water();
    this.water.addToScene(scene);

    // Expose for debug / minimap
    (window as unknown as Record<string,unknown>).__world = this as unknown;
  }

  update(playerPos: THREE.Vector3, dt:number) {
    this.chunkManager.update(playerPos);
    this.water?.update(dt, playerPos);
  }

  getSpawnPosition(): THREE.Vector3 {
    // Prefer a road spawn: find nearest downtown road to border
    const candidates = [...this.roads.edges.values()].filter(e=>e.type==='downtown' || e.type==='suburb');
    if (candidates.length) {
      const edge = candidates[Math.floor(Math.random()*Math.min(3,candidates.length))];
      const mid = edge.points[Math.floor(edge.points.length/2)];
      return new THREE.Vector3(mid.x, mid.y+0.7, mid.z);
    }
    const angle = 0.7;
    const dist = 900;
    const x = Math.cos(angle)*dist;
    const z = Math.sin(angle)*dist;
    const y = this.terrain.height(x,z) + 0.7;
    return new THREE.Vector3(x,y,z);
  }

  dispose() {
    this.chunkManager.dispose();
    this.water?.dispose();
  }
}

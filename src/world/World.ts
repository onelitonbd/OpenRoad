// World.ts — owns chunk manager, seed, region map, terrain, road network
import * as THREE from 'three';
import { Regions } from './Regions';
import { Terrain } from './Terrain';
import { ChunkManager } from './ChunkManager';
import { Water } from './Water';

export class World {
  seed: string;
  regions: Regions;
  terrain: Terrain;
  chunkManager: ChunkManager;
  water: Water | null = null;

  constructor(seed = 'open-road-seed-0', scene: THREE.Scene, physicsWorld: unknown) {
    this.seed = seed;
    this.regions = new Regions(seed);
    this.terrain = new Terrain(seed, this.regions);
    this.chunkManager = new ChunkManager(this.terrain, this.regions, scene, physicsWorld as never);
    // Water for coast
    this.water = new Water();
    this.water.addToScene(scene);
  }

  // Set road-aware height callback later
  setRoadHeightProvider(fn: (x:number,z:number)=>number|null) {
    this.terrain.roadHeightAt = fn;
  }

  update(playerPos: THREE.Vector3, dt:number) {
    this.chunkManager.update(playerPos);
    this.water?.update(dt, playerPos);
  }

  getSpawnPosition(): THREE.Vector3 {
    // Spawn at downtown/suburb border: approx (800, 0) on road if exists else flat
    // For Phase 2: find flat suburb edge at distance ~1100
    const angle = 0.7;
    const dist = 1100;
    const x = Math.cos(angle)*dist;
    const z = Math.sin(angle)*dist;
    const y = this.terrain.height(x,z) + 0.6;
    return new THREE.Vector3(x,y,z);
  }

  dispose() {
    this.chunkManager.dispose();
    this.water?.dispose();
  }
}

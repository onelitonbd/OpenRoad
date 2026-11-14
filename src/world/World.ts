// World.ts — owns chunk manager, seed, region map, terrain, road network, buildings, props, landmarks
import * as THREE from 'three';
import { Regions } from './Regions';
import { Terrain } from './Terrain';
import { ChunkManager } from './ChunkManager';
import { RoadNetwork } from './RoadNetwork';
import { Buildings } from './Buildings';
import { Props } from './Props';
import { Water } from './Water';

export class World {
  seed: string;
  regions: Regions;
  terrain: Terrain;
  roads: RoadNetwork;
  buildings: Buildings;
  props: Props;
  chunkManager: ChunkManager;
  water: Water | null = null;

  constructor(seed = 'open-road-seed-0', scene: THREE.Scene, physicsWorld: unknown) {
    this.seed = seed;
    this.regions = new Regions(seed);
    this.terrain = new Terrain(seed, this.regions);
    this.roads = new RoadNetwork(seed, this.terrain);
    this.terrain.roadHeightAt = (x,z)=> this.roads.roadHeightAt(x,z);
    // Buildings & props need roads
    this.buildings = new Buildings(scene, this.roads, seed);
    this.props = new Props(scene, this.roads, seed);
    this.chunkManager = new ChunkManager(this.terrain, this.regions, this.roads, this.buildings, this.props, scene, physicsWorld as never);
    this.water = new Water();
    this.water.addToScene(scene);
    this.addLandmarks(scene);
    (window as unknown as Record<string,unknown>).__world = this as unknown;
  }

  private addLandmarks(scene: THREE.Scene) {
    // 1) Downtown tall tower
    const towerH = 165;
    const towerGeo = new THREE.BoxGeometry(22, towerH, 22);
    towerGeo.translate(0, towerH/2, 0);
    const towerMat = new THREE.MeshStandardMaterial({ color:'#0ea5e9', emissive:'#38bdf8', emissiveIntensity:0.12 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    const tx = 140, tz = -120;
    const ty = this.terrain.height(tx, tz);
    tower.position.set(tx, ty, tz);
    tower.castShadow = true;
    scene.add(tower);
    // 2) Lighthouse on coast
    const lightGeo = new THREE.CylinderGeometry(3,4,22,12);
    lightGeo.translate(0,11,0);
    const lightMat = new THREE.MeshStandardMaterial({ color:'#fef3c7' });
    const lighthouse = new THREE.Mesh(lightGeo, lightMat);
    const lx = 800, lz = -3350;
    const ly = this.terrain.height(lx, lz);
    lighthouse.position.set(lx, ly, lz);
    scene.add(lighthouse);
    // beacon light
    const beacon = new THREE.PointLight(0xffffcc, 1, 80);
    beacon.position.set(lx, ly+22, lz);
    // only on High, but we add with low intensity to avoid perf hit — disable shadows
    scene.add(beacon);
    // 3) Big highway bridge-like section (visual only: raised road segment)
    // We'll add a simple elevated frame over a valley near (600, 800)
    const bridgeGeo = new THREE.BoxGeometry(140, 4, 18);
    const bridgeMat = new THREE.MeshStandardMaterial({ color:'#334155' });
    const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
    const bx = 620, bz = 780;
    const by = this.terrain.height(bx,bz) + 10;
    bridge.position.set(bx, by, bz);
    bridge.rotation.y = 0.6;
    scene.add(bridge);
    // Pillars
    for (let i=-1;i<=1;i++) {
      const pillarGeo = new THREE.CylinderGeometry(1.2,1.4, by - this.terrain.height(bx+i*40, bz) + 10, 8);
      pillarGeo.translate(0, (by - this.terrain.height(bx+i*40,bz))/2 + 5, 0);
      const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color:'#475569' }));
      pillar.position.set(bx+i*40, this.terrain.height(bx+i*40,bz), bz);
      scene.add(pillar);
    }
  }

  update(playerPos: THREE.Vector3, dt:number) {
    this.chunkManager.update(playerPos);
    this.water?.update(dt, playerPos);
  }

  getSpawnPosition(): THREE.Vector3 {
    const candidates = [...this.roads.edges.values()].filter(e=>e.type==='downtown' || e.type==='suburb');
    if (candidates.length) {
      const edge = candidates[Math.floor(Math.random()*Math.min(3,candidates.length))];
      const mid = edge.points[Math.floor(edge.points.length/2)];
      return new THREE.Vector3(mid.x, mid.y+0.7, mid.z);
    }
    const angle = 0.7; const dist=900;
    const x=Math.cos(angle)*dist, z=Math.sin(angle)*dist;
    const y=this.terrain.height(x,z)+0.7;
    return new THREE.Vector3(x,y,z);
  }

  dispose() {
    this.chunkManager.dispose();
    this.buildings.dispose();
    this.props.dispose();
    this.water?.dispose();
  }
}

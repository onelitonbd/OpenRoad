// Buildings.ts — procedural buildings via InstancedMesh per archetype
import * as THREE from 'three';
import type { RoadNetwork } from './RoadNetwork';
import { seededRng, randomRange } from '../utils/random';

export interface BuildingInstance {
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  rotY: number;
  color: THREE.Color;
  archetype: number;
}

export class Buildings {
  private scene: THREE.Scene;
  private roads: RoadNetwork;
  private rng: () => number;
  private instanced: Map<number, THREE.InstancedMesh> = new Map();
  private dummy = new THREE.Object3D();
  private instancesByChunk = new Map<string, BuildingInstance[]>();

  // Archetype geometries
  private geometries: THREE.BoxGeometry[] = [];
  private materials: THREE.MeshStandardMaterial[] = [];

  constructor(scene: THREE.Scene, roads: RoadNetwork, seed: string) {
    this.scene = scene;
    this.roads = roads;
    this.rng = seededRng(seed + ':buildings');
    this.createArchetypes();
  }

  private createArchetypes() {
    // 0: skyscraper (tall box)
    const g0 = new THREE.BoxGeometry(1,1,1);
    g0.translate(0,0.5,0);
    const m0 = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness:0.7 });
    this.geometries.push(g0); this.materials.push(m0);
    // 1: house (with roof)
    const g1 = new THREE.BoxGeometry(1,1,1);
    g1.translate(0,0.5,0);
    const m1 = new THREE.MeshStandardMaterial({ color: '#e7b07b', roughness:0.85 });
    this.geometries.push(g1); this.materials.push(m1);
    // 2: barn/silo (box)
    const g2 = new THREE.BoxGeometry(1,1,1);
    g2.translate(0,0.5,0);
    const m2 = new THREE.MeshStandardMaterial({ color: '#a16207', roughness:0.8 });
    this.geometries.push(g2); this.materials.push(m2);
  }

  // Generate for a chunk
  generateForChunk(key:string, minX:number, minZ:number, size:number) {
    if (this.instancesByChunk.has(key)) return;
    const instances: BuildingInstance[] = [];
    const edges = this.roads.getEdgesInChunk(minX, minZ, size);
    // Determine region via center
    const cx = minX+size/2, cz = minZ+size/2;
    const regionHint = (Math.hypot(cx,cz) < 900 ? 'downtown' : Math.hypot(cx,cz) < 2200 ? 'suburbs' : 'countryside') as string;

    edges.forEach(edge=>{
      // Only place along downtown/suburb/highway edges, not mountain/coast too dense
      if (edge.type==='mountain' || edge.type==='coast') return;
      const density = edge.type==='downtown' ? 0.9 : edge.type==='suburb' ? 0.55 : edge.type==='highway' ? 0.12 : 0.35;
      if (this.rng() > density) return;
      // Sample points along edge
      for (let i=0; i<edge.points.length-1; i++) {
        if (this.rng() > 0.42) continue;
        const p = edge.points[i];
        const next = edge.points[i+1];
        const dir = new THREE.Vector3(next.x-p.x,0,next.z-p.z).normalize();
        const perp = new THREE.Vector3(-dir.z,0,dir.x);
        for (const side of [-1,1] as const) {
          if (this.rng()>0.65) continue;
          // No overlap check simplified: random offset
          const setback = edge.type==='downtown' ? 11 + this.rng()*4 : edge.type==='suburb' ? 9+this.rng()*5 : 14+this.rng()*6;
          const x = p.x + perp.x*setback*side + randomRange(this.rng,-3,3);
          const z = p.z + perp.z*setback*side + randomRange(this.rng,-3,3);
          // Must be inside chunk expanded bounds
          if (x < minX-20 || x > minX+size+20 || z < minZ-20 || z > minZ+size+20) continue;
          // Avoid road overlap: distance to road center already setback, ok
          const y = p.y; // use road height as base
          const archetype = regionHint==='downtown' ? 0 : (regionHint==='suburbs' ? (this.rng()<0.8?1:2) : 2);
          let h: number, w:number, d:number;
          let color: THREE.Color;
          if (archetype===0) {
            h = randomRange(this.rng, 30, 110);
            if (this.rng()<0.12) h = randomRange(this.rng, 110, 155); // landmark tall
            w = randomRange(this.rng, 12, 18);
            d = randomRange(this.rng, 12, 18);
            const palette = ['#475569','#64748b','#334155','#0ea5e9','#e2e8f0'];
            color = new THREE.Color(palette[Math.floor(this.rng()*palette.length)]);
          } else if (archetype===1) {
            h = randomRange(this.rng, 5.5, 9);
            w = randomRange(this.rng, 7, 11);
            d = randomRange(this.rng, 7, 10);
            const palette = ['#fde68a','#fca5a5','#86efac','#93c5fd','#fda4af'];
            color = new THREE.Color(palette[Math.floor(this.rng()*palette.length)]);
          } else {
            h = randomRange(this.rng, 6, 11);
            w = randomRange(this.rng, 9, 16);
            d = randomRange(this.rng, 9, 14);
            const palette = ['#a16207','#92400e','#854d0e','#78350f'];
            color = new THREE.Color(palette[Math.floor(this.rng()*palette.length)]);
          }
          instances.push({ pos: new THREE.Vector3(x,y,z), scale: new THREE.Vector3(w,h,d), rotY: this.rng()<0.7 ? Math.atan2(dir.z,dir.x) : randomRange(this.rng, -0.2,0.2), color, archetype });
        }
      }
    });
    // Add a few random countryside props (barn clusters) away from roads
    if (regionHint!=='downtown' && instances.length<2 && this.rng()<0.35) {
      for(let k=0;k<randomRange(this.rng,1,3);k++){
        const x = minX + randomRange(this.rng, 20, size-20);
        const z = minZ + randomRange(this.rng, 20, size-20);
        const y = this.roads.getNearestRoad(new THREE.Vector3(x,0,z))?.closest.y ?? 0;
        instances.push({ pos: new THREE.Vector3(x,y,z), scale: new THREE.Vector3(randomRange(this.rng,10,14), randomRange(this.rng,7,10), randomRange(this.rng,10,14)), rotY: randomRange(this.rng,0,Math.PI*2), color: new THREE.Color('#a16207'), archetype:2 });
      }
    }

    this.instancesByChunk.set(key, instances);
    // Push to instanced meshes (create if needed)
    instances.forEach(inst=>{
      let im = this.instanced.get(inst.archetype);
      if (!im) {
        // Create with initial capacity 500
        im = new THREE.InstancedMesh(this.geometries[inst.archetype], this.materials[inst.archetype], 2000);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = true;
        im.receiveShadow = true;
        this.scene.add(im);
        this.instanced.set(inst.archetype, im);
      }
      // We manage count via updating instance matrices by rebuilding buffers per chunk? For simplicity we dynamically expand and setMatrixAt
      // Instead we collect all instances globally and update once per generation via rebuild
      this.rebuildArchetype(inst.archetype);
    });
  }

  private rebuildArchetype(archetype:number) {
    const im = this.instanced.get(archetype);
    if (!im) return;
    // Gather all instances of this archetype across all chunks
    const all: BuildingInstance[] = [];
    for (const list of this.instancesByChunk.values()) for (const inst of list) if (inst.archetype===archetype) all.push(inst);
    if (im.count < all.length) {
      // need larger — recreate
      const newCount = Math.max(all.length, im.count*2);
      const newIm = new THREE.InstancedMesh(this.geometries[archetype], this.materials[archetype], newCount);
      newIm.castShadow = true;
      newIm.receiveShadow = true;
      this.scene.remove(im);
      this.scene.add(newIm);
      this.instanced.set(archetype, newIm);
      this.rebuildArchetype(archetype);
      return;
    }
    all.forEach((inst,i)=>{
      this.dummy.position.copy(inst.pos);
      this.dummy.scale.copy(inst.scale);
      this.dummy.rotation.y = inst.rotY;
      this.dummy.updateMatrix();
      im.setMatrixAt(i, this.dummy.matrix);
      im.setColorAt(i, inst.color);
    });
    // hide unused
    for (let i=all.length;i<im.count;i++) {
      this.dummy.position.set(0,-1000,0);
      this.dummy.updateMatrix();
      im.setMatrixAt(i, this.dummy.matrix);
    }
    im.count = all.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  removeChunk(key:string) {
    if (!this.instancesByChunk.has(key)) return;
    this.instancesByChunk.delete(key);
    // rebuild all archetypes that had instances
    for (const arch of this.instanced.keys()) this.rebuildArchetype(arch);
  }

  dispose() {
    for (const im of this.instanced.values()) {
      this.scene.remove(im);
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
    }
    this.instanced.clear();
    this.instancesByChunk.clear();
  }

  // Colliders — create box colliders for near chunks (called externally for chunks within 400m)
  createCollidersForChunk(chunkKey:string, physicsWorld: unknown) {
    // TODO Phase 4: create Rapier box colliders for buildings in near chunks
    // Stub: will be implemented to prevent driving through buildings
  }
}

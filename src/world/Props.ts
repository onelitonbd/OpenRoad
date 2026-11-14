// Props.ts — instanced trees, lamps, etc.
import * as THREE from 'three';
import type { RoadNetwork } from './RoadNetwork';
import { seededRng, randomRange } from '../utils/random';

type PropType = 'tree' | 'pine' | 'palm' | 'cactus' | 'lamp' | 'rock';

export class Props {
  private scene: THREE.Scene;
  private roads: RoadNetwork;
  private rng: () => number;
  private instanced = new Map<PropType, THREE.InstancedMesh>();
  private dummy = new THREE.Object3D();
  private instancesByChunk = new Map<string, Array<{type:PropType,pos:THREE.Vector3,scale:number,rotY:number}>>();
  private geometries = new Map<PropType, THREE.BufferGeometry>();
  private materials = new Map<PropType, THREE.Material>();

  constructor(scene: THREE.Scene, roads: RoadNetwork, seed:string) {
    this.scene = scene;
    this.roads = roads;
    this.rng = seededRng(seed+':props');
    this.createArchetypes();
  }

  private createArchetypes() {
    // Tree: low-poly cone + cylinder trunk
    const treeGeo = new THREE.ConeGeometry(1.6, 4, 6);
    treeGeo.translate(0,2,0);
    const treeMat = new THREE.MeshStandardMaterial({ color:'#22c55e' });
    this.geometries.set('tree', treeGeo); this.materials.set('tree', treeMat);
    // Pine
    const pineGeo = new THREE.ConeGeometry(1.2, 6, 6);
    pineGeo.translate(0,3,0);
    const pineMat = new THREE.MeshStandardMaterial({ color:'#15803d' });
    this.geometries.set('pine', pineGeo); this.materials.set('pine', pineMat);
    // Palm
    const palmGeo = new THREE.CylinderGeometry(0.2,0.22,5,6);
    palmGeo.translate(0,2.5,0);
    const palmMat = new THREE.MeshStandardMaterial({ color:'#a3e635' });
    this.geometries.set('palm', palmGeo); this.materials.set('palm', palmMat);
    // Cactus
    const cactusGeo = new THREE.CylinderGeometry(0.35,0.4,2.5,6);
    cactusGeo.translate(0,1.25,0);
    const cactusMat = new THREE.MeshStandardMaterial({ color:'#65a30d' });
    this.geometries.set('cactus', cactusGeo); this.materials.set('cactus', cactusMat);
    // Lamp (simple pole + light box)
    const lampGeo = new THREE.CylinderGeometry(0.08,0.08,5,6);
    lampGeo.translate(0,2.5,0);
    const lampMat = new THREE.MeshStandardMaterial({ color:'#1e293b', emissive:'#facc15', emissiveIntensity:0.18 });
    this.geometries.set('lamp', lampGeo); this.materials.set('lamp', lampMat);
    // Rock
    const rockGeo = new THREE.DodecahedronGeometry(0.9,0);
    rockGeo.scale(1,0.7,1);
    rockGeo.translate(0,0.5,0);
    const rockMat = new THREE.MeshStandardMaterial({ color:'#78716c', flatShading:true });
    this.geometries.set('rock', rockGeo); this.materials.set('rock', rockMat);
  }

  generateForChunk(key:string, minX:number, minZ:number, size:number, regionHint: string) {
    if (this.instancesByChunk.has(key)) return;
    const instances: Array<{type:PropType,pos:THREE.Vector3,scale:number,rotY:number}> = [];
    const edges = this.roads.getEdgesInChunk(minX, minZ, size);

    // For each edge, sprinkle props
    edges.forEach(edge=>{
      const count = edge.type==='highway' ? 6 : edge.type==='downtown' ? 10 : 5;
      for (let i=0;i<count;i++) {
        if (this.rng()>0.62) continue;
        const t = this.rng();
        const pts = edge.points;
        const idx = Math.floor(t*(pts.length-1));
        const p = pts[idx];
        const next = pts[Math.min(pts.length-1, idx+1)];
        const dir = new THREE.Vector3(next.x-p.x,0,next.z-p.z).normalize();
        const perp = new THREE.Vector3(-dir.z,0,dir.x);
        const side = this.rng()<0.5?-1:1;
        const dist = edge.type==='highway'? randomRange(this.rng, 6,9) : randomRange(this.rng, 7,12);
        const x = p.x + perp.x*dist*side;
        const z = p.z + perp.z*dist*side;
        if (x < minX-30 || x>minX+size+30 || z < minZ-30 || z>minZ+size+30) continue;
        const y = p.y;
        // Choose type by region
        let type: PropType = 'tree';
        if (edge.type==='highway') type = this.rng()<0.5 ? 'lamp' : 'tree';
        else if (regionHint==='mountains') type = 'pine';
        else if (regionHint==='desert') type = this.rng()<0.6 ? 'cactus' : 'rock';
        else if (regionHint==='coast') type = this.rng()<0.5 ? 'palm' : 'tree';
        else type = this.rng()<0.12 ? 'lamp' : 'tree';

        instances.push({ type, pos:new THREE.Vector3(x,y,z), scale: type==='lamp'?1: randomRange(this.rng,0.85,1.22), rotY: randomRange(this.rng,0,Math.PI*2) });
      }
    });

    // Random scatter off-road for forests/farms
    const scatterCount = regionHint==='mountains'? 18 : regionHint==='desert'? 8 : 12;
    for(let i=0;i<scatterCount;i++){
      if (this.rng()>0.5) continue;
      const x = minX + randomRange(this.rng, 15, size-15);
      const z = minZ + randomRange(this.rng, 15, size-15);
      const y = this.roads.getNearestRoad(new THREE.Vector3(x,0,z))?.closest.y ?? 0;
      // keep away from roads
      const nearest = this.roads.getNearestRoad(new THREE.Vector3(x,0,z));
      if (nearest && nearest.dist < 14) continue;
      let type: PropType = regionHint==='mountains' ? 'pine' : regionHint==='desert' ? (this.rng()<0.5?'cactus':'rock') : regionHint==='coast' ? 'palm' : 'tree';
      instances.push({ type, pos:new THREE.Vector3(x,y,z), scale: randomRange(this.rng,0.8,1.3), rotY: randomRange(this.rng,0,Math.PI*2) });
    }

    this.instancesByChunk.set(key, instances);
    // Update instanced meshes per type
    const types = new Set(instances.map(i=>i.type));
    types.forEach(t=> this.rebuildType(t));
  }

  private rebuildType(type:PropType) {
    let im = this.instanced.get(type);
    const all: Array<{pos:THREE.Vector3,scale:number,rotY:number}> = [];
    for (const list of this.instancesByChunk.values()) for (const inst of list) if (inst.type===type) all.push(inst);
    if (!im) {
      const cap = Math.max(800, all.length*2);
      im = new THREE.InstancedMesh(this.geometries.get(type)!, this.materials.get(type)!, cap);
      im.castShadow = type!=='lamp';
      im.receiveShadow = true;
      this.scene.add(im);
      this.instanced.set(type, im);
    }
    if (im.count < all.length) {
      const newCount = Math.max(all.length, im.count*2);
      const newIm = new THREE.InstancedMesh(this.geometries.get(type)!, this.materials.get(type)!, newCount);
      newIm.castShadow = type!=='lamp';
      this.scene.remove(im!);
      this.scene.add(newIm);
      this.instanced.set(type, newIm);
      im = newIm;
    }
    all.forEach((inst,i)=>{
      this.dummy.position.copy(inst.pos);
      this.dummy.scale.setScalar(inst.scale);
      this.dummy.rotation.y = inst.rotY;
      this.dummy.updateMatrix();
      im!.setMatrixAt(i, this.dummy.matrix);
    });
    for (let i=all.length;i<im.count;i++) { this.dummy.position.set(0,-1000,0); this.dummy.updateMatrix(); im.setMatrixAt(i,this.dummy.matrix); }
    im.count = all.length;
    im.instanceMatrix.needsUpdate = true;
  }

  removeChunk(key:string) {
    if (!this.instancesByChunk.has(key)) return;
    this.instancesByChunk.delete(key);
    for (const t of this.instanced.keys()) this.rebuildType(t);
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
}

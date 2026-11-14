// ChunkManager.ts — terrain + roads + buildings + props
import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { Chunk } from './Chunk';
import type { Terrain } from './Terrain';
import type { Regions } from './Regions';
import type { RoadNetwork } from './RoadNetwork';
import { RoadMesh } from './RoadMesh';
import type { Buildings } from './Buildings';
import type { Props } from './Props';
import { settings } from '../core/Settings';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

type ChunkEntry = { chunk: Chunk; collider?: RAPIER.Collider };

export class ChunkManager {
  private chunks = new Map<string, ChunkEntry>();
  private pending = new Map<string, Promise<void>>();
  private queue: Array<{x:number,z:number}> = [];
  private scene: THREE.Scene;
  private physicsWorld: PhysicsWorld;
  private terrain: Terrain;
  private regions: Regions;
  private roads: RoadNetwork;
  private buildings: Buildings;
  private props: Props;
  private originOffset = new THREE.Vector3();
  private floatingOriginEnabled = true;
  loadedCount = 0;

  constructor(terrain: Terrain, regions: Regions, roads: RoadNetwork, buildings: Buildings, props: Props, scene: THREE.Scene, physicsWorld: PhysicsWorld) {
    this.terrain=terrain; this.regions=regions; this.roads=roads; this.buildings=buildings; this.props=props; this.scene=scene; this.physicsWorld=physicsWorld;
  }

  private key(x:number,z:number){ return `${x},${z}`; }
  private chunkCoordFromWorld(pos: THREE.Vector3): {x:number,z:number} {
    const cx=Math.floor((pos.x+this.originOffset.x)/256);
    const cz=Math.floor((pos.z+this.originOffset.z)/256);
    return { x:cx, z:cz };
  }

  update(playerPos: THREE.Vector3) {
    if (this.floatingOriginEnabled) {
      const dist=Math.hypot(playerPos.x,playerPos.z);
      if (dist>2000) this.shiftOrigin(playerPos);
    }
    const center=this.chunkCoordFromWorld(playerPos);
    const radius=settings.preset.chunkRadius;
    const needed=new Set<string>();
    for (let dz=-radius; dz<=radius; dz++) for (let dx=-radius; dx<=radius; dx++) {
      if (Math.max(Math.abs(dx),Math.abs(dz))>radius) continue;
      const k=this.key(center.x+dx,center.z+dz);
      needed.add(k);
      if (!this.chunks.has(k)&&!this.pending.has(k)) this.queue.push({x:center.x+dx,z:center.z+dz});
    }
    for (const [k,entry] of this.chunks) if (!needed.has(k)) this.unloadChunk(k, entry);
    const start=performance.now(); const budget=4;
    while(this.queue.length && (performance.now()-start)<budget){
      const coord=this.queue.shift()!;
      const k=this.key(coord.x,coord.z);
      if (this.chunks.has(k)||this.pending.has(k)) continue;
      this.createChunkAsync(coord);
    }
    this.loadedCount=this.chunks.size;
  }

  private async createChunkAsync(coord:{x:number,z:number}) {
    const k=this.key(coord.x,coord.z);
    const verts=settings.preset.terrainVerts;
    const promise=(async()=>{
      const data=Chunk.generateData(coord,this.terrain,this.regions,verts);
      const chunk=new Chunk(coord);
      const mesh=chunk.buildMesh(data);
      mesh.position.sub(this.originOffset);
      this.scene.add(mesh);
      // Roads
      const edges=this.roads.getEdgesInChunk(data.minX,data.minZ,data.size);
      const roadMeshes: THREE.Object3D[]=[];
      for (const edge of edges){
        const meshes=RoadMesh.buildEdgeMeshesForChunk(edge,data.minX,data.minZ,data.size,this.originOffset);
        for (const m of meshes){ this.scene.add(m); roadMeshes.push(m); }
      }
      // Intersections
      for (const node of this.roads.nodes.values()){
        if (!node.isIntersection) continue;
        if (node.pos.x < data.minX-10 || node.pos.x > data.minX+data.size+10 || node.pos.z < data.minZ-10 || node.pos.z > data.minZ+data.size+10) continue;
        const patchGeo=new THREE.CircleGeometry(9,12); patchGeo.rotateX(-Math.PI/2);
        const patchMat=new THREE.MeshStandardMaterial({ color:'#2e3440', roughness:0.85 });
        const patch=new THREE.Mesh(patchGeo, patchMat);
        patch.position.set(node.pos.x-this.originOffset.x, node.pos.y+0.06, node.pos.z-this.originOffset.z);
        patch.receiveShadow=true;
        this.scene.add(patch); roadMeshes.push(patch);
      }
      chunk.roadMeshes=roadMeshes;

      // Buildings & props
      // Determine region hint for props
      const regionHint = this.regions.regionAt(data.minX+128, data.minZ+128).id;
      this.buildings.generateForChunk(k, data.minX, data.minZ, data.size);
      this.props.generateForChunk(k, data.minX, data.minZ, data.size, regionHint);

      // Heightfield collider
      let collider:RAPIER.Collider|undefined;
      if (this.physicsWorld?.world){
        try{
          const heights=data.heights;
          const scale=new RAPIER.Vector3(data.size,1,data.size);
          const desc=RAPIER.ColliderDesc.heightfield(verts, verts, heights, scale).setTranslation(data.minX-this.originOffset.x,0,data.minZ-this.originOffset.z);
          collider=this.physicsWorld.world.createCollider(desc);
        } catch(e){ console.warn('Heightfield fail',k,e); }
      }
      this.chunks.set(k,{chunk,collider});
      this.pending.delete(k);
    })();
    this.pending.set(k,promise); await promise;
  }

  private unloadChunk(key:string, entry:ChunkEntry){
    if (entry.collider && this.physicsWorld?.world){ try{ this.physicsWorld.world.removeCollider(entry.collider,true); } catch{} }
    entry.chunk.dispose(this.scene);
    this.buildings.removeChunk(key);
    this.props.removeChunk(key);
    this.chunks.delete(key);
  }

  private shiftOrigin(playerPos: THREE.Vector3){
    const shift=new THREE.Vector3().copy(playerPos); shift.y=0;
    this.originOffset.add(shift);
    for (const {chunk,collider} of this.chunks.values()){
      if (chunk.mesh) chunk.mesh.position.sub(shift);
      for (const m of chunk.roadMeshes) m.position.sub(shift);
      if (collider){ try{ const t=collider.translation(); collider.setTranslation(new RAPIER.Vector3(t.x-shift.x,t.y,t.z-shift.z)); } catch{} }
    }
    // Buildings & props are instanced; they need global shift — easier: rebuild offsets by shifting instanced matrices
    // For simplicity, we shift their instanced meshes by moving dummy offset per instance would require rebuild.
    // Instead we shift each InstancedMesh position
    // But our buildings instanced meshes are not per-chunk positioned; they are global. We'll handle by shifting each InstancedMesh's position by -shift
    // However our buildings were created with world positions not offset; after origin shift we need to subtract shift from their matrices.
    // We do a brute force: iterate over all instances and subtract shift from matrices, then rebuild is expensive but okay for few buildings.
    // Instead we just move the root instanced meshes' parents — easiest: each InstancedMesh at 0,0,0, we shift its position.
    // But that would affect future chunks generated with offset. After shift, new chunks are generated with -originOffset applied.
    // So existing instanced meshes should be shifted by -shift as well: we set their position to -originOffset.
    // Since they were generated with world coords (not offset), we need to correct.
    // For now, we just update each instanced mesh position to -originOffset
    const buildings = (this.buildings as unknown as { instanced: Map<number,THREE.InstancedMesh> }).instanced;
    const propsInst = (this.props as unknown as { instanced: Map<string,THREE.InstancedMesh> }).instanced;
    [...buildings.values(), ...propsInst.values()].forEach((im:THREE.InstancedMesh)=> im.position.copy(this.originOffset.clone().negate()));
    window.dispatchEvent(new CustomEvent('floating-origin-shift',{detail:{shift}}));
    console.log(`[ChunkManager] Origin shift ${shift.x.toFixed(0)},${shift.z.toFixed(0)} off ${this.originOffset.x.toFixed(0)},${this.originOffset.z.toFixed(0)}`);
  }

  dispose(){ for(const [k,entry] of this.chunks) this.unloadChunk(k,entry); this.chunks.clear(); this.queue=[]; this.pending.clear(); }
  getChunkCount(){ return this.chunks.size; }
  getOriginOffset(){ return this.originOffset.clone(); }
}

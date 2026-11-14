// Chunk.ts — one 256m tile: terrain mesh + roads + props
import * as THREE from 'three';
import type { Terrain } from './Terrain';
import type { Regions } from './Regions';
import { settings } from '../core/Settings';

export interface ChunkCoord { x:number; z:number; } // grid coords

export class Chunk {
  key: string;
  coord: ChunkCoord;
  worldX: number; // min corner
  worldZ: number;
  size = 256;
  mesh: THREE.Mesh | null = null;
  collider: unknown | null = null; // Rapier collider handle
  disposed = false;

  constructor(coord: ChunkCoord) {
    this.coord = coord;
    this.key = `${coord.x},${coord.z}`;
    this.worldX = coord.x * this.size;
    this.worldZ = coord.z * this.size;
  }

  // Generate geometry data (vertex positions, colors, indices) without touching Three/physics — can be done in worker
  static generateData(coord: ChunkCoord, terrain: Terrain, regions: Regions, verts:number) {
    const size = 256;
    const minX = coord.x * size;
    const minZ = coord.z * size;
    const step = size / (verts - 1);
    const vertCount = verts * verts;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];
    const heights = new Float32Array(vertCount);

    let idx = 0;
    for (let iz=0; iz<verts; iz++) {
      for (let ix=0; ix<verts; ix++) {
        const x = minX + ix*step;
        const z = minZ + iz*step;
        const y = terrain.height(x,z);
        heights[iz*verts+ix] = y;
        positions[idx*3+0] = x;
        positions[idx*3+1] = y;
        positions[idx*3+2] = z;

        // Vertex color by region/slope
        const region = regions.regionAt(x,z).id;
        const slope = Math.abs(terrain.rawHeight(x+0.5,z) - terrain.rawHeight(x-0.5,z)) + Math.abs(terrain.rawHeight(x,z+0.5) - terrain.rawHeight(x,z-0.5));
        let col = colorForRegion(region, y, slope);
        colors[idx*3+0]=col.r;
        colors[idx*3+1]=col.g;
        colors[idx*3+2]=col.b;
        idx++;
      }
    }
    // Indices (two triangles per quad)
    for (let iz=0; iz<verts-1; iz++) {
      for (let ix=0; ix<verts-1; ix++) {
        const a = iz*verts+ix;
        const b = iz*verts+ix+1;
        const c = (iz+1)*verts+ix;
        const d = (iz+1)*verts+ix+1;
        // winding CCW
        indices.push(a,c,b);
        indices.push(b,c,d);
      }
    }
    return { positions, colors, indices: new Uint32Array(indices), heights, minX, minZ, size, verts };
  }

  // Build Three mesh from data
  buildMesh(data: ReturnType<typeof Chunk.generateData>) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.mesh = mesh;
    return mesh;
  }

  dispose(scene?: THREE.Scene, physicsWorld?: unknown) {
    if (this.disposed) return;
    this.disposed = true;
    if (this.mesh) {
      if (scene) scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    // Remove physics collider if any — handled by ChunkManager using world API
  }
}

function colorForRegion(region:string, y:number, slope:number): {r:number,g:number,b:number} {
  // cartoon palette flat colors
  switch(region) {
    case 'downtown': return { r:0.62, g:0.64, b:0.66 }; // light asphalt/concrete tint for ground (roads will overlay)
    case 'suburbs': return { r:0.55, g:0.82, b:0.52 };
    case 'countryside': return { r:0.44, g:0.72, b:0.32 };
    case 'mountains': {
      if (y > 35) return { r:0.92, g:0.96, b:1.0 }; // snow
      if (y > 22) return { r:0.62, g:0.60, b:0.58 }; // rock
      return { r:0.36, g:0.52, b:0.30 };
    }
    case 'desert': return { r:0.96, g:0.86, b:0.55 };
    case 'coast': {
      if (y < -1) return { r:0.96, g:0.88, b:0.55 }; // sand
      return { r:0.53, g:0.80, b:0.46 };
    }
    case 'highway': return { r:0.38, g:0.38, b:0.40 };
    default: return { r:0.5, g:0.8, b:0.5 };
  }
}

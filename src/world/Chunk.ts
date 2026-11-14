import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CHUNK_SIZE } from './Terrain';
import type { ChunkData } from './chunkData';

export type { ChunkData } from './chunkData';
export { generateChunkData } from './chunkData';

/**
 * A loaded chunk: the terrain mesh plus its physics collider.
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly key: string;

  mesh: THREE.Mesh | null = null;
  collider: RAPIER.Collider | null = null;
  body: RAPIER.RigidBody | null = null;

  /** True once the chunk is fully built and added to the scene. */
  ready = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.key = `${cx},${cz}`;
  }

  /** World position of the chunk centre. */
  get centerX(): number {
    return (this.cx + 0.5) * CHUNK_SIZE;
  }

  get centerZ(): number {
    return (this.cz + 0.5) * CHUNK_SIZE;
  }

  /** Build the render mesh from the worker data. */
  buildMesh(data: ChunkData, material: THREE.Material): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.mesh = mesh;
    return mesh;
  }

  /** Remove the mesh and free the GPU memory. */
  disposeMesh(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}

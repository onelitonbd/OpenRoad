// ChunkManager.ts — load/unload chunks around player with time budget + heightfield colliders
import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { Chunk } from './Chunk';
import type { Terrain } from './Terrain';
import type { Regions } from './Regions';
import { settings } from '../core/Settings';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

type ChunkEntry = { chunk: Chunk; collider?: RAPIER.Collider };

export class ChunkManager {
  private chunks = new Map<string, ChunkEntry>();
  private pending = new Map<string, Promise<void>>(); // dedup
  private queue: Array<{x:number,z:number}> = [];
  private scene: THREE.Scene;
  private physicsWorld: PhysicsWorld;
  private terrain: Terrain;
  private regions: Regions;

  // Floating origin — when player far from 0, shift world
  private originOffset = new THREE.Vector3();
  private floatingOriginEnabled = true;

  // Stats
  loadedCount = 0;

  // Heightfield collider handling: Rapier heightfield requires scale
  private heightfieldScale = new RAPIER.Vector3(256, 1, 256); // y scale applied via heights

  constructor(terrain: Terrain, regions: Regions, scene: THREE.Scene, physicsWorld: PhysicsWorld) {
    this.terrain = terrain;
    this.regions = regions;
    this.scene = scene;
    this.physicsWorld = physicsWorld;
  }

  private key(x:number,z:number){ return `${x},${z}`; }

  private chunkCoordFromWorld(pos: THREE.Vector3): {x:number,z:number} {
    const cx = Math.floor((pos.x + this.originOffset.x) / 256);
    const cz = Math.floor((pos.z + this.originOffset.z) / 256);
    return { x: cx, z: cz };
  }

  update(playerPos: THREE.Vector3) {
    // Handle floating origin shift when player > 2000m from origin
    if (this.floatingOriginEnabled) {
      const dist = Math.hypot(playerPos.x, playerPos.z);
      if (dist > 2000) {
        this.shiftOrigin(playerPos);
      }
    }

    const center = this.chunkCoordFromWorld(playerPos);
    const radius = settings.preset.chunkRadius;
    const needed = new Set<string>();

    // Gather needed chunks
    for (let dz=-radius; dz<=radius; dz++) {
      for (let dx=-radius; dx<=radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) continue;
        const k = this.key(center.x+dx, center.z+dz);
        needed.add(k);
        if (!this.chunks.has(k) && !this.pending.has(k)) {
          this.queue.push({ x: center.x+dx, z: center.z+dz });
        }
      }
    }

    // Unload far chunks
    for (const [k, entry] of this.chunks) {
      if (!needed.has(k)) {
        this.unloadChunk(k, entry);
      }
    }

    // Time-budgeted creation: process queue with <4ms per frame
    const start = performance.now();
    const budget = 4;
    while (this.queue.length && (performance.now() - start) < budget) {
      const coord = this.queue.shift()!;
      const k = this.key(coord.x, coord.z);
      if (this.chunks.has(k) || this.pending.has(k)) continue;
      this.createChunkAsync(coord);
    }

    this.loadedCount = this.chunks.size;
  }

  private async createChunkAsync(coord:{x:number,z:number}) {
    const k = this.key(coord.x, coord.z);
    const verts = settings.preset.terrainVerts;
    const promise = (async () => {
      // Generate data (could be in Worker — here main thread but cheap)
      const data = Chunk.generateData(coord, this.terrain, this.regions, verts);
      // Build mesh
      const chunk = new Chunk(coord);
      const mesh = chunk.buildMesh(data);
      // Apply floating origin offset to mesh
      mesh.position.sub(this.originOffset);
      this.scene.add(mesh);

      // Create heightfield collider if physics ready
      let collider: RAPIER.Collider | undefined;
      if (this.physicsWorld?.world) {
        try {
          const heights = data.heights;
          // Rapier heightfield: nrows = verts, ncols = verts, heights, scale
          // Scale maps integer grid to world: x and z scales = size, y scale = 1 (heights already in meters)
          const scale = new RAPIER.Vector3(data.size, 1, data.size);
          const desc = RAPIER.ColliderDesc.heightfield(verts, verts, heights, scale)
            // Place heightfield so its origin aligns with chunk min corner
            .setTranslation(data.minX - this.originOffset.x, 0, data.minZ - this.originOffset.z);
          collider = this.physicsWorld.world.createCollider(desc);
        } catch (e) {
          console.warn('Heightfield collider failed for', k, e);
        }
      }

      this.chunks.set(k, { chunk, collider });
      this.pending.delete(k);
    })();
    this.pending.set(k, promise);
    await promise;
  }

  private unloadChunk(key:string, entry: ChunkEntry) {
    // Remove collider
    if (entry.collider && this.physicsWorld?.world) {
      try { this.physicsWorld.world.removeCollider(entry.collider, true); } catch {}
    }
    entry.chunk.dispose(this.scene);
    this.chunks.delete(key);
  }

  private shiftOrigin(playerPos: THREE.Vector3) {
    // Shift world so player is near origin. Move originOffset, reposition all chunks and physics.
    const shift = new THREE.Vector3().copy(playerPos);
    // keep Y 0
    shift.y = 0;
    this.originOffset.add(shift);
    // Move player back? Vehicle should be moved by caller to keep world consistent.
    // For now, just move chunks and ask vehicle to compensate
    for (const { chunk, collider } of this.chunks.values()) {
      if (chunk.mesh) chunk.mesh.position.sub(shift);
      if (collider) {
        try {
          const t = collider.translation();
          collider.setTranslation(new RAPIER.Vector3(t.x - shift.x, t.y, t.z - shift.z));
        } catch {}
      }
    }
    // Water offset too (if present) — handled by World
    // Notify via custom event
    window.dispatchEvent(new CustomEvent('floating-origin-shift', { detail: { shift } }));
    console.log(`[ChunkManager] Floating origin shift ${shift.x.toFixed(0)},${shift.z.toFixed(0)} — offset now ${this.originOffset.x.toFixed(0)},${this.originOffset.z.toFixed(0)}`);
  }

  dispose() {
    for (const [k, entry] of this.chunks) this.unloadChunk(k, entry);
    this.chunks.clear();
    this.queue = [];
    this.pending.clear();
  }

  // For debugging
  getChunkCount() { return this.chunks.size; }
  getOriginOffset() { return this.originOffset.clone(); }
}

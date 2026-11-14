import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Chunk } from './Chunk';
import { generateChunkData, type ChunkData } from './chunkData';
import type { ChunkRequest, ChunkResponse } from './workers/chunkWorker';
import { CHUNK_SIZE, Terrain } from './Terrain';
import { RoadNetwork } from './RoadNetwork';
import { RoadFlattener } from './RoadFlattener';
import { settings } from '../core/Settings';
import { WORLD_GROUPS, type PhysicsWorld } from '../physics/PhysicsWorld';

/** How many milliseconds per frame we are allowed to spend on chunk work. */
const FRAME_BUDGET_MS = 4;

/** A chunk that has been requested from the worker but is not ready yet. */
interface PendingChunk {
  cx: number;
  cz: number;
  id: number;
}

/** A chunk whose data arrived from the worker and waits to be built. */
interface ReadyChunk {
  cx: number;
  cz: number;
  data: ChunkData;
}

/**
 * Streams the terrain chunks around the player.
 *
 * Chunks are generated in a Web Worker and turned into a mesh plus a physics
 * collider on the main thread. The main thread work is time budgeted
 * (< 4 ms per frame) so the game never stutters while new terrain arrives.
 */
export class ChunkManager {
  readonly terrain: Terrain;
  /** The road graph of the world (used by the roads, the AI and the minimap). */
  readonly roads: RoadNetwork;
  readonly group = new THREE.Group();

  private readonly chunks = new Map<string, Chunk>();
  /** Chunks that were sent to the worker and are still being generated. */
  private readonly inFlight = new Set<string>();
  /** Chunks that were requested but are not in the queue or in flight. */
  private readonly queue: PendingChunk[] = [];
  /** Chunks whose data has arrived and that wait for the frame budget. */
  private readonly ready: ReadyChunk[] = [];

  private worker: Worker | null = null;
  private requestId = 1;

  private readonly material: THREE.MeshLambertMaterial;
  private centerX = Number.NaN;
  private centerZ = Number.NaN;

  /** Number of chunks currently loaded. */
  get loadedCount(): number {
    return this.chunks.size;
  }

  /** Number of chunks waiting to be built on the main thread. */
  get queueCount(): number {
    return this.queue.length + this.ready.length + this.inFlight.size;
  }

  constructor(seed: number, private readonly physics: PhysicsWorld) {
    this.terrain = new Terrain(seed);

    // The road network is generated from the same seed, so the roads and the
    // terrain always agree with each other.
    this.roads = new RoadNetwork();
    this.roads.build(seed, this.terrain);
    this.terrain.flattener = new RoadFlattener(
      this.roads.edges.map((edge) => ({
        points: edge.points,
        heights: edge.heights,
        width: edge.width,
      })),
    );

    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });
    this.group.name = 'terrain';
  }

  /** Start the worker (called once). */
  init(): void {
    if (this.worker) return;
    try {
      this.worker = new Worker(new URL('./workers/chunkWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent<ChunkResponse>) => {
        this.onWorkerMessage(event.data);
      };
      this.worker.postMessage({
        type: 'seed',
        seed: this.terrain.seed,
        roads: this.roads.toTransferData(),
      });
    } catch (error) {
      // No worker support (or a blocked worker) - fall back to generating
      // the chunks on the main thread.
      console.warn('Chunk worker unavailable, generating on the main thread.', error);
      this.worker = null;
    }
  }

  /** Called every frame with the player position. */
  update(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);

    if (cx !== this.centerX || cz !== this.centerZ) {
      this.centerX = cx;
      this.centerZ = cz;
      this.refreshQueue();
    }

    this.processQueue();
  }

  /** Work out which chunks should be loaded and queue the missing ones. */
  private refreshQueue(): void {
    const radius = settings.preset.chunkRadius;
    const wanted: { cx: number; cz: number; distance: number }[] = [];

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = this.centerX + dx;
        const cz = this.centerZ + dz;
        // Only load a square, but skip the far corners of the square to keep
        // the visible area round (the fog hides the rest anyway).
        if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
        const key = `${cx},${cz}`;
        if (this.chunks.has(key) || this.inFlight.has(key)) continue;
        const distance = Math.hypot(dx, dz);
        wanted.push({ cx, cz, distance });
      }
    }

    wanted.sort((a, b) => a.distance - b.distance);
    this.queue.length = 0;
    for (const item of wanted) {
      this.queue.push({ cx: item.cx, cz: item.cz, id: this.requestId++ });
    }

    this.unloadFarChunks(radius);
  }

  /** Remove chunks that are outside the load radius. */
  private unloadFarChunks(radius: number): void {
    const keep = radius + 1;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - this.centerX) > keep || Math.abs(chunk.cz - this.centerZ) > keep) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  private disposeChunk(chunk: Chunk): void {
    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      chunk.disposeMesh();
    }
    if (chunk.collider) {
      this.physics.removeCollider(chunk.collider);
      chunk.collider = null;
    }
    if (chunk.body) {
      this.physics.removeBody(chunk.body);
      chunk.body = null;
    }
  }

  /**
   * Build the chunks that are ready and request new ones.
   * Everything is limited by the frame budget so the game stays smooth.
   */
  private processQueue(): void {
    const start = performance.now();

    // 1. Build the chunks whose data has arrived.
    while (this.ready.length > 0 && performance.now() - start < FRAME_BUDGET_MS) {
      const item = this.ready.shift();
      if (item) this.buildChunk(item.cx, item.cz, item.data);
    }

    // 2. Ask the worker for more chunks.
    while (this.queue.length > 0 && performance.now() - start < FRAME_BUDGET_MS) {
      const item = this.queue.shift();
      if (!item) break;
      const key = `${item.cx},${item.cz}`;
      if (this.chunks.has(key) || this.inFlight.has(key)) continue;

      if (this.worker) {
        this.inFlight.add(key);
        const request: ChunkRequest = {
          type: 'generate',
          id: item.id,
          cx: item.cx,
          cz: item.cz,
          resolution: settings.preset.terrainResolution,
        };
        this.worker.postMessage(request);
      } else {
        // Fallback: generate on the main thread.
        this.buildChunk(
          item.cx,
          item.cz,
          generateChunkData(this.terrain, item.cx, item.cz, settings.preset.terrainResolution),
        );
      }
    }
  }

  /** The worker finished a chunk. */
  private onWorkerMessage(response: ChunkResponse): void {
    this.inFlight.delete(`${response.cx},${response.cz}`);
    this.ready.push({
      cx: response.cx,
      cz: response.cz,
      data: {
        positions: response.positions,
        colors: response.colors,
        indices: response.indices,
        minY: response.minY,
        maxY: response.maxY,
      },
    });
  }

  /** Turn the raw data into a mesh and a collider. */
  private buildChunk(cx: number, cz: number, data: ChunkData): void {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return;

    const chunk = new Chunk(cx, cz);
    const mesh = chunk.buildMesh(data, this.material);
    this.group.add(mesh);

    // --- physics ---
    // A trimesh built from the exact same vertices as the render mesh, so the
    // car can never float above or sink into the visible ground.
    const colliderDesc = RAPIER.ColliderDesc.trimesh(
      data.positions,
      data.indices,
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    )
      .setFriction(0.95)
      .setRestitution(0)
      .setCollisionGroups(WORLD_GROUPS);

    const body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
    );
    const collider = this.physics.world.createCollider(colliderDesc, body);

    chunk.body = body;
    chunk.collider = collider;
    chunk.ready = true;
    this.chunks.set(key, chunk);
  }

  /** The drivable ground height at a position (roads are flattened in). */
  heightAt(x: number, z: number): number {
    return this.terrain.groundHeight(x, z);
  }

  /** Get a loaded chunk (for the minimap and the debug view). */
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(`${cx},${cz}`);
  }

  /** Is the chunk at a position already loaded? */
  isLoadedAt(x: number, z: number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return this.chunks.has(`${cx},${cz}`);
  }

  /**
   * Make sure the chunk under a position exists right now.
   *
   * The chunk is generated on the main thread (the worker would need a few
   * milliseconds and the car must not fall through the world in the
   * meantime). It is only used for the start of the game.
   */
  ensureChunkAt(x: number, z: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    if (this.chunks.has(key) || this.inFlight.has(key)) return;
    this.buildChunk(
      cx,
      cz,
      generateChunkData(this.terrain, cx, cz, settings.preset.terrainResolution),
    );
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.ready.length = 0;
    this.queue.length = 0;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.material.dispose();
    this.group.clear();
  }
}

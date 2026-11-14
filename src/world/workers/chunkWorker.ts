import { Terrain } from '../Terrain';
import { generateChunkData } from '../chunkData';
import { RoadFlattener, type FlatRoad } from '../RoadFlattener';

/**
 * Chunk generation worker.
 *
 * The terrain of a chunk is a few thousand noise samples - doing that on the
 * main thread causes a visible stutter every time a new chunk comes into
 * range. The worker does the maths and sends the vertex buffers back.
 */

export interface ChunkRequest {
  type: 'generate';
  id: number;
  cx: number;
  cz: number;
  resolution: number;
}

export interface SeedRequest {
  type: 'seed';
  seed: number;
  /** The road network so the terrain can be flattened under the roads. */
  roads?: FlatRoad[];
}

export interface ChunkResponse {
  type: 'generated';
  id: number;
  cx: number;
  cz: number;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  minY: number;
  maxY: number;
}

// One terrain instance per worker (it holds the noise generators).
let terrain: Terrain | null = null;

function handleRequest(request: ChunkRequest | SeedRequest): void {
  if (!request) return;

  if (request.type === 'seed') {
    terrain = new Terrain(request.seed);
    if (request.roads && request.roads.length > 0) {
      terrain.flattener = new RoadFlattener(request.roads);
    }
    return;
  }

  if (request.type !== 'generate') return;
  if (!terrain) terrain = new Terrain(1337);

  const data = generateChunkData(terrain, request.cx, request.cz, request.resolution);

  const response: ChunkResponse = {
    type: 'generated',
    id: request.id,
    cx: request.cx,
    cz: request.cz,
    positions: data.positions,
    colors: data.colors,
    indices: data.indices,
    minY: data.minY,
    maxY: data.maxY,
  };

  // Transfer the buffers instead of copying them.
  (self as unknown as Worker).postMessage(response, [
    data.positions.buffer,
    data.colors.buffer,
    data.indices.buffer,
  ]);
}

self.onmessage = (event: MessageEvent<ChunkRequest | SeedRequest>) => {
  handleRequest(event.data);
};

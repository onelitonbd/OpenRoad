import { CHUNK_SIZE, type Terrain } from './Terrain';

/**
 * Data produced by the chunk worker.
 * The typed arrays are transferred (not copied) to the main thread.
 */
export interface ChunkData {
  /** Vertex positions in world space (x, y, z). */
  positions: Float32Array;
  /** Vertex colours (r, g, b). */
  colors: Float32Array;
  /** Triangle indices. */
  indices: Uint32Array;
  /** Lowest and highest vertex of the chunk (for the bounding sphere). */
  minY: number;
  maxY: number;
}

/**
 * Generates the mesh data for one chunk.
 *
 * This function is pure (no Three.js, no Rapier) so it can run inside the
 * Web Worker without dragging the whole engine into the worker thread.
 */
export function generateChunkData(
  terrain: Terrain,
  cx: number,
  cz: number,
  resolution: number,
): ChunkData {
  const n = resolution;
  const step = CHUNK_SIZE / n;
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  const vertexCount = (n + 1) * (n + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(n * n * 6);

  // --- heights (cached so the colour pass can reuse them) ---
  const heights = new Float32Array(vertexCount);
  let minY = Infinity;
  let maxY = -Infinity;

  for (let j = 0; j <= n; j++) {
    const wz = originZ + j * step;
    for (let i = 0; i <= n; i++) {
      const wx = originX + i * step;
      const h = terrain.groundHeight(wx, wz);
      const index = j * (n + 1) + i;
      heights[index] = h;
      positions[index * 3] = wx;
      positions[index * 3 + 1] = h;
      positions[index * 3 + 2] = wz;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }

  // --- colours (based on the region and the slope) ---
  for (let j = 0; j <= n; j++) {
    const wz = originZ + j * step;
    for (let i = 0; i <= n; i++) {
      const wx = originX + i * step;
      const index = j * (n + 1) + i;
      const h = heights[index];

      // Slope from the neighbouring heights.
      const hLeft = heights[j * (n + 1) + Math.max(0, i - 1)];
      const hRight = heights[j * (n + 1) + Math.min(n, i + 1)];
      const hDown = heights[Math.max(0, j - 1) * (n + 1) + i];
      const hUp = heights[Math.min(n, j + 1) * (n + 1) + i];
      const dx = (hRight - hLeft) / (2 * step);
      const dz = (hUp - hDown) / (2 * step);
      const slope = Math.min(1, Math.hypot(dx, dz));

      const color = terrain.colorAt(wx, wz, h, slope);
      colors[index * 3] = color[0];
      colors[index * 3 + 1] = color[1];
      colors[index * 3 + 2] = color[2];
    }
  }

  // --- triangles ---
  let t = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      // Two triangles per quad, wound so the surface faces up.
      indices[t++] = a;
      indices[t++] = c;
      indices[t++] = b;
      indices[t++] = b;
      indices[t++] = c;
      indices[t++] = d;
    }
  }

  return { positions, colors, indices, minY, maxY };
}

// chunkWorker.ts — off-thread generation (standalone worker)
// For Phase 2 we use inline generation in ChunkManager with time budget; this file is a stub for future real Worker.
// The worker would receive {coord, seed, verts} and return {positions, colors, indices, heights}
// Implementation note: Web Workers can't easily import simplex-noise as ES module without bundling.
// Phase 2 uses main-thread generation with time-budgeted queue instead; this file documents the approach.

// placeholder to keep Vite from erroring if imported as worker
export type ChunkWorkerRequest = { coord:{x:number,z:number}, seed:string, verts:number, key:string };
export type ChunkWorkerResponse = { key:string, positions:Float32Array, colors:Float32Array, indices:Uint32Array, heights:Float32Array, minX:number, minZ:number, size:number, verts:number };

self.onmessage = (e: MessageEvent<ChunkWorkerRequest>) => {
  // stub: echo back empty — real work is in ChunkManager's async queue
  const req = e.data;
  // @ts-ignore
  postMessage({ key:req.key, positions:new Float32Array(), colors:new Float32Array(), indices:new Uint32Array(), heights:new Float32Array(), minX:0, minZ:0, size:256, verts:req.verts });
};

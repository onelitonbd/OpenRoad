import * as THREE from 'three';
import type { RoadEdge, RoadNetwork, RoadType } from './RoadNetwork';
import { lerp } from '../utils/math';

/** The road surface sits slightly above the terrain to avoid z-fighting. */
export const ROAD_OFFSET = 0.06;

/**
 * Road textures are drawn on a canvas - a small texture repeated along the
 * road is much cheaper than geometry for the lane markings.
 */
const materialCache = new Map<string, THREE.MeshLambertMaterial>();

function drawRoadTexture(lanes: number, width: number, type: RoadType): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  // Asphalt.
  ctx.fillStyle = type === 'highway' ? '#3c3f46' : '#43464d';
  ctx.fillRect(0, 0, size, size);

  // Slight noise so the surface is not completely flat.
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 2, 2);
  }

  // The texture covers the full road width (u = 0..1).
  const laneWidth = size / (lanes * 2);

  // Edge lines.
  ctx.fillStyle = 'rgba(240,240,235,0.85)';
  ctx.fillRect(size * 0.02, 0, Math.max(2, size * 0.012), size);
  ctx.fillRect(size * 0.98 - Math.max(2, size * 0.012), 0, Math.max(2, size * 0.012), size);

  // Centre line: solid for a median, dashed between the lanes.
  for (let side = 0; side < 2; side++) {
    const center = side === 0 ? size / 2 : size / 2 + laneWidth;
    if (side === 0) {
      ctx.fillStyle = 'rgba(250,215,90,0.9)';
      ctx.fillRect(center - 2, 0, 4, size);
    }
    for (let i = 0; i < lanes - 1; i++) {
      const x = center + laneWidth * (i + 1) * (side === 0 ? 1 : -1);
      ctx.fillStyle = 'rgba(240,240,235,0.8)';
      for (let y = 0; y < size; y += 64) {
        ctx.fillRect(x - 2, y, 4, 34);
      }
    }
  }

  // Kerb / pavement for the streets inside the city.
  if (type === 'street' || type === 'avenue') {
    ctx.fillStyle = '#6f737b';
    ctx.fillRect(0, 0, size * 0.045, size);
    ctx.fillRect(size * 0.955, 0, size * 0.045, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  // The canvas is drawn in sRGB, so the texture has to be marked as such.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  void width;
  return texture;
}

/** Get (and cache) the material for a road type. */
export function getRoadMaterial(type: RoadType, lanes: number, width: number): THREE.MeshLambertMaterial {
  const key = `${type}-${lanes}-${width}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({
      map: drawRoadTexture(lanes, width, type),
    });
    materialCache.set(key, material);
  }
  return material;
}

/**
 * Build the ribbon geometry of a road.
 *
 * The ribbon follows the centre line; the height comes from the (smoothed)
 * road profile so the road is always drivable.
 */
export function buildRoadGeometry(edge: RoadEdge): THREE.BufferGeometry {
  const count = edge.points.length / 2;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices = new Uint32Array((count - 1) * 6);

  const halfWidth = edge.width / 2;
  let travelled = 0;

  for (let i = 0; i < count; i++) {
    const x = edge.points[i * 2];
    const z = edge.points[i * 2 + 1];
    const y = edge.heights[i] + ROAD_OFFSET;

    // Direction of the road at this point.
    const prev = Math.max(0, i - 1);
    const next = Math.min(count - 1, i + 1);
    const dx = edge.points[next * 2] - edge.points[prev * 2];
    const dz = edge.points[next * 2 + 1] - edge.points[prev * 2 + 1];
    const len = Math.hypot(dx, dz) || 1;
    // The right hand normal.
    const nx = dz / len;
    const nz = -dx / len;

    if (i > 0) {
      travelled += Math.hypot(
        edge.points[i * 2] - edge.points[(i - 1) * 2],
        edge.points[i * 2 + 1] - edge.points[(i - 1) * 2 + 1],
      );
    }

    const leftIndex = i * 2;
    const rightIndex = i * 2 + 1;

    positions[leftIndex * 3] = x + nx * halfWidth;
    positions[leftIndex * 3 + 1] = y;
    positions[leftIndex * 3 + 2] = z + nz * halfWidth;
    positions[rightIndex * 3] = x - nx * halfWidth;
    positions[rightIndex * 3 + 1] = y;
    positions[rightIndex * 3 + 2] = z - nz * halfWidth;

    // The texture repeats every 9 metres.
    const v = travelled / 9;
    uvs[leftIndex * 2] = 0;
    uvs[leftIndex * 2 + 1] = v;
    uvs[rightIndex * 2] = 1;
    uvs[rightIndex * 2 + 1] = v;

    if (i < count - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const t = i * 6;
      // The winding has to face up, otherwise the road is invisible from
      // above (Three.js skips the back faces).
      indices[t] = a;
      indices[t + 1] = b;
      indices[t + 2] = c;
      indices[t + 3] = b;
      indices[t + 4] = d;
      indices[t + 5] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A flat patch under a junction.
 *
 * It is drawn slightly below the roads so the road ribbons cover the seams
 * and the patch fills the corners between them.
 */
export function buildIntersectionGeometry(
  x: number,
  z: number,
  y: number,
  radius: number,
): THREE.BufferGeometry {
  const segments = 12;
  const positions = new Float32Array((segments + 1) * 3);
  const uvs = new Float32Array((segments + 1) * 2);
  const indices = new Uint32Array(segments * 3);

  positions[0] = x;
  positions[1] = y;
  positions[2] = z;
  uvs[0] = 0.5;
  uvs[1] = 0.5;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const index = i + 1;
    positions[index * 3] = x + Math.cos(angle) * radius;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z + Math.sin(angle) * radius;
    uvs[index * 2] = Math.cos(angle) * 0.5 + 0.5;
    uvs[index * 2 + 1] = Math.sin(angle) * 0.5 + 0.5;
  }

  for (let i = 0; i < segments; i++) {
    // Wound so the patch faces up.
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 2;
    indices[i * 3 + 2] = i + 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Draws the road network and keeps only the roads near the player in the
 * scene.
 */
export class RoadRenderer {
  readonly group = new THREE.Group();

  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly junctionMeshes = new Map<number, THREE.Mesh>();
  private readonly network: RoadNetwork;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(network: RoadNetwork) {
    this.network = network;
    this.group.name = 'roads';
  }

  /** True when the mesh of a road is built at the moment. */
  hasMesh(edgeId: number): boolean {
    return this.meshes.has(edgeId);
  }

  /** How many road meshes are built at the moment. */
  get meshCount(): number {
    return this.meshes.size;
  }

  /** Load and unload the roads around the player. */
  update(playerX: number, playerZ: number, radius: number): void {
    if (Math.abs(playerX - this.lastX) < 40 && Math.abs(playerZ - this.lastZ) < 40) return;
    this.lastX = playerX;
    this.lastZ = playerZ;

    const edges = this.network.roadsInRadius(playerX, playerZ, radius);
    const visible = new Set<number>();

    for (const edge of edges) {
      visible.add(edge.id);
      if (!this.meshes.has(edge.id)) {
        const geometry = buildRoadGeometry(edge);
        const material = getRoadMaterial(edge.type, edge.lanes, edge.width);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.meshes.set(edge.id, mesh);
        this.group.add(mesh);
      }
    }

    // Remove the roads that are too far away.
    for (const [id, mesh] of this.meshes) {
      if (!visible.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(id);
      }
    }

    this.updateJunctions(playerX, playerZ, radius);
  }

  /** The flat patches under the junctions. */
  private updateJunctions(playerX: number, playerZ: number, radius: number): void {
    const visible = new Set<number>();
    for (const edge of this.network.edges) {
      if (Math.abs(edge.points[0] - playerX) > radius) continue;
      if (Math.abs(edge.points[1] - playerZ) > radius) continue;
      for (const nodeId of [edge.a, edge.b]) {
        const node = this.network.nodes[nodeId];
        if (!node) continue;
        if (Math.hypot(node.x - playerX, node.z - playerZ) > radius) continue;
        visible.add(nodeId);
        if (!this.junctionMeshes.has(nodeId)) {
          const radiusM = this.junctionRadius(nodeId);
          const height = this.junctionHeight(nodeId);
          const geometry = buildIntersectionGeometry(node.x, node.z, height, radiusM);
          const material = getRoadMaterial('street', 1, 8);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.y = -ROAD_OFFSET * 0.6;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          this.junctionMeshes.set(nodeId, mesh);
          this.group.add(mesh);
        }
      }
    }

    for (const [id, mesh] of this.junctionMeshes) {
      if (!visible.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.junctionMeshes.delete(id);
      }
    }
  }

  /** The size of the junction patch (based on the widest connected road). */
  private junctionRadius(nodeId: number): number {
    let radius = 6;
    for (const edge of this.network.edges) {
      if (edge.a === nodeId || edge.b === nodeId) {
        radius = Math.max(radius, edge.width * 0.62);
      }
    }
    return radius;
  }

  /** The height of the junction patch (the average of the connected roads). */
  private junctionHeight(nodeId: number): number {
    let sum = 0;
    let count = 0;
    for (const edge of this.network.edges) {
      if (edge.a === nodeId) {
        sum += edge.heights[0];
        count++;
      } else if (edge.b === nodeId) {
        sum += edge.heights[edge.heights.length - 1];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    for (const mesh of this.junctionMeshes.values()) mesh.geometry.dispose();
    this.meshes.clear();
    this.junctionMeshes.clear();
    this.group.clear();
  }
}

export { lerp };

import * as THREE from 'three';
import type { RoadNetwork } from './RoadNetwork';
import type { Terrain } from './Terrain';
import { Rng } from '../utils/random';

/** How far away the props are still drawn. */
const VIEW_RADIUS = 300;
/** The size of one scatter cell. */
const CELL = 48;

export type PropKind =
  | 'tree'
  | 'pine'
  | 'palm'
  | 'cactus'
  | 'rock'
  | 'lamp'
  | 'sign'
  | 'haystack'
  | 'fence'
  | 'guardrail'
  | 'windmill';

interface PropInstance {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  /** Filled in by `add()`. */
  kind?: PropKind;
}

type PropSpawn = Omit<PropInstance, 'kind'> & { kind?: PropKind };

/**
 * The props of the world: trees, street lamps, signs, rocks and so on.
 *
 * Everything is an instanced mesh, so the whole countryside costs only a
 * handful of draw calls. The props are scattered with a seeded random
 * generator, which keeps them in the same place every time.
 */
export class PropManager {
  readonly group = new THREE.Group();

  private readonly instances = new Map<PropKind, PropInstance[]>();
  private readonly meshes = new Map<PropKind, THREE.InstancedMesh>();
  private readonly byCell = new Map<string, PropInstance[]>();

  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 1, 0);

  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private readonly network: RoadNetwork,
    private readonly terrain: Terrain,
  ) {
    this.group.name = 'props';
    this.generate();
    this.createMeshes();
  }

  /** Scatter the props over the whole map. */
  private generate(): void {
    const rng = new Rng(0x71c3a5e9);
    const kinds: PropKind[] = ['tree', 'tree', 'tree', 'rock', 'fence'];

    for (let gx = -84; gx <= 84; gx++) {
      for (let gz = -84; gz <= 84; gz++) {
        const originX = gx * CELL;
        const originZ = gz * CELL;
        const region = this.terrain.regionAt(originX, originZ);
        // How busy is this cell?
        let density = 0.25;
        let kind: PropKind = 'tree';
        switch (region) {
          case 'downtown':
            density = 0.12;
            kind = 'fence';
            break;
          case 'suburb':
            density = 0.5;
            kind = 'tree';
            break;
          case 'countryside':
            density = 0.55;
            kind = 'tree';
            break;
          case 'mountain':
            density = 0.6;
            kind = 'pine';
            break;
          case 'desert':
            density = 0.3;
            kind = 'cactus';
            break;
          case 'coast':
            density = 0.35;
            kind = 'palm';
            break;
          default:
            break;
        }

        const count = Math.floor(density * 7);
        for (let i = 0; i < count; i++) {
          const x = originX + rng.range(0, CELL);
          const z = originZ + rng.range(0, CELL);
          const road = this.network.nearestRoad(x, z, 40);
          // Keep the roads clear.
          if (road && road.distance < road.edge.width / 2 + 3) continue;
          const height = this.terrain.height(x, z);
          if (height < 0.4) continue;

          const pick = rng.chance(0.85) ? kind : kinds[rng.int(0, kinds.length - 1)];
          this.add({
            x,
            y: height,
            z,
            rotation: rng.range(0, Math.PI * 2),
            scale: rng.range(0.75, 1.35),
          }, pick);
        }

        // Street lamps along the roads.
        if (region === 'downtown' || region === 'suburb') {
          const road = this.network.nearestRoad(originX, originZ, 60);
          if (road && road.distance < road.edge.width / 2 + 8 && rng.chance(0.35)) {
            this.add({
              x: road.x,
              y: road.height,
              z: road.z,
              rotation: 0,
              scale: 1,
            }, 'lamp');
          }
        }
      }
    }

    // Guardrails along the fast and the dangerous roads.
    for (const edge of this.network.edges) {
      if (edge.type !== 'highway' && edge.type !== 'switchback') continue;
      const count = edge.points.length / 2;
      for (let i = 0; i < count - 1; i++) {
        const x0 = edge.points[i * 2];
        const z0 = edge.points[i * 2 + 1];
        const x1 = edge.points[i * 2 + 2];
        const z1 = edge.points[i * 2 + 3];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) continue;
        const nx = dz / len;
        const nz = -dx / len;
        const offset = edge.width / 2 + 1.2;
        for (const side of [-1, 1]) {
          this.add({
            x: (x0 + x1) / 2 + nx * side * offset,
            y: (edge.heights[i] + edge.heights[i + 1]) / 2,
            z: (z0 + z1) / 2 + nz * side * offset,
            rotation: Math.atan2(dx, dz),
            scale: len / 4,
          }, 'guardrail');
        }
      }
    }

    // Small windmills in the countryside.
    for (let i = 0; i < 14; i++) {
      const x = rng.range(-3000, 3000);
      const z = rng.range(-3000, 2500);
      if (this.terrain.regionAt(x, z) !== 'countryside') continue;
      const road = this.network.nearestRoad(x, z, 60);
      if (road && road.distance < road.edge.width / 2 + 12) continue;
      this.add({
        x,
        y: this.terrain.height(x, z),
        z,
        rotation: rng.range(0, Math.PI * 2),
        scale: rng.range(0.8, 1.2),
      }, 'windmill');
    }

    // Signs and haystacks near the rural roads.
    for (const edge of this.network.edges) {
      if (edge.type !== 'rural' && edge.type !== 'coastal') continue;
      const count = edge.points.length / 2;
      for (let i = 0; i < count; i += 6) {
        const x = edge.points[i * 2];
        const z = edge.points[i * 2 + 1];
        const roll = rng.range(0, 1);
        if (roll < 0.3) {
          this.add({ x, y: edge.heights[i], z, rotation: rng.range(0, Math.PI), scale: 1 }, 'sign');
        } else if (roll < 0.4) {
          this.add({
            x: x + rng.range(-25, 25),
            y: this.terrain.height(x, z),
            z: z + rng.range(-25, 25),
            rotation: rng.range(0, Math.PI),
            scale: rng.range(0.8, 1.3),
          }, 'haystack');
        }
      }
    }
  }

  private add(instance: PropSpawn, kind: PropKind): void {
    const full: PropInstance = { ...instance, kind };
    let list = this.instances.get(kind);
    if (!list) {
      list = [];
      this.instances.set(kind, list);
    }
    list.push(full);

    const key = `${Math.floor(full.x / CELL)},${Math.floor(full.z / CELL)}`;
    let cell = this.byCell.get(key);
    if (!cell) {
      cell = [];
      this.byCell.set(key, cell);
    }
    cell.push(full);
  }

  /** Create the instanced meshes for every prop type. */
  private createMeshes(): void {
    const green = new THREE.MeshLambertMaterial({ color: 0x4f8a35 });
    const darkGreen = new THREE.MeshLambertMaterial({ color: 0x2f6330 });
    const palmGreen = new THREE.MeshLambertMaterial({ color: 0x51a04a });
    const cactusGreen = new THREE.MeshLambertMaterial({ color: 0x5f9e52 });
    const brown = new THREE.MeshLambertMaterial({ color: 0x6b4b2f });
    const stone = new THREE.MeshLambertMaterial({ color: 0x8b8b88 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x555c66 });
    const hay = new THREE.MeshLambertMaterial({ color: 0xd8b968 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5636 });

    // Broadleaf tree: a trunk plus a foliage ball.
    const treeGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(0.22, 0.3, 3.2, 6), y: 1.6, material: 0 },
      { geo: new THREE.IcosahedronGeometry(2.1, 0), y: 4.6, material: 1 },
    ]);

    // Pine tree.
    const pineGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(0.2, 0.28, 2.2, 6), y: 1.1, material: 0 },
      { geo: new THREE.ConeGeometry(1.9, 5.5, 7), y: 4.4, material: 1 },
      { geo: new THREE.ConeGeometry(1.3, 3.6, 7), y: 7.2, material: 1 },
    ]);

    // Palm tree.
    const palmGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(0.18, 0.26, 6.5, 6), y: 3.25, material: 0 },
      { geo: new THREE.ConeGeometry(2.6, 1.4, 6), y: 6.6, material: 1 },
    ]);

    // Cactus.
    const cactusGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(0.45, 0.5, 3.2, 8), y: 1.6, material: 0 },
      { geo: new THREE.CylinderGeometry(0.26, 0.26, 1.4, 6), y: 2.2, material: 0 },
    ]);

    // Rock.
    const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);

    // Street lamp.
    const lampGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), y: 3.25, material: 0 },
      { geo: new THREE.BoxGeometry(1.3, 0.25, 0.4), y: 6.5, material: 0 },
    ]);

    // Road sign.
    const signGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), y: 1.2, material: 0 },
      { geo: new THREE.BoxGeometry(1.2, 0.9, 0.1), y: 2.6, material: 1 },
    ]);

    // Haystack.
    const hayGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.2, 8);

    // Fence post.
    const fenceGeo = new THREE.BoxGeometry(0.16, 1.4, 0.16);

    // Guardrail: a long thin rail, scaled along its length.
    const railGeo = new THREE.BoxGeometry(0.14, 0.8, 4);

    // Small windmill for the countryside.
    const windmillGeo = mergeSimple([
      { geo: new THREE.CylinderGeometry(1.1, 1.7, 7, 8), y: 3.5, material: 0 },
      { geo: new THREE.BoxGeometry(0.25, 4.2, 0.2), y: 8.4, material: 1 },
      { geo: new THREE.BoxGeometry(4.2, 0.25, 0.2), y: 8.4, material: 1 },
    ]);

    // The merged geometries use material groups, so they need an array of
    // materials (the first one is the trunk, the second the foliage).
    const defs: [PropKind, THREE.BufferGeometry, THREE.Material[], number][] = [
      ['tree', treeGeo, [brown, green], 900],
      ['pine', pineGeo, [brown, darkGreen], 900],
      ['palm', palmGeo, [brown, palmGreen], 400],
      ['cactus', cactusGeo, [cactusGreen], 400],
      ['rock', rockGeo, [stone], 400],
      ['lamp', lampGeo, [metal], 300],
      ['sign', signGeo, [metal, green], 200],
      ['haystack', hayGeo, [hay], 200],
      ['fence', fenceGeo, [brown], 300],
      ['guardrail', railGeo, [metal], 600],
      ['windmill', windmillGeo, [stone, wood], 60],
    ];

    for (const [kind, geometry, materials, capacity] of defs) {
      const mesh = new THREE.InstancedMesh(
        geometry,
        materials.length === 1 ? materials[0] : materials,
        capacity,
      );
      mesh.count = 0;
      mesh.castShadow = kind !== 'fence';
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  /** Show the props around the player. */
  update(playerX: number, playerZ: number): void {
    if (
      Number.isFinite(this.lastX) &&
      Math.abs(playerX - this.lastX) < 40 &&
      Math.abs(playerZ - this.lastZ) < 40
    ) {
      return;
    }
    this.lastX = playerX;
    this.lastZ = playerZ;

    const counts = new Map<PropKind, number>();
    const cellRadius = Math.ceil(VIEW_RADIUS / CELL);
    const cx = Math.floor(playerX / CELL);
    const cz = Math.floor(playerZ / CELL);

    for (let dz = -cellRadius; dz <= cellRadius; dz++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const list = this.byCell.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const instance of list) {
          if (Math.hypot(instance.x - playerX, instance.z - playerZ) > VIEW_RADIUS) continue;
          const kind = instance.kind ?? 'tree';
          const mesh = this.meshes.get(kind);
          if (!mesh) continue;
          const index = counts.get(kind) ?? 0;
          if (index >= mesh.instanceMatrix.count) continue;

          this.position.set(instance.x, instance.y, instance.z);
          this.quaternion.setFromAxisAngle(this.axis, instance.rotation);
          this.scale.setScalar(instance.scale);
          // The guardrail is stretched along the road.
          this.scale.z = instance.scale;
          this.matrix.compose(this.position, this.quaternion, this.scale);
          mesh.setMatrixAt(index, this.matrix);
          counts.set(kind, index + 1);
        }
      }
    }

    for (const [kind, mesh] of this.meshes) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      // The bounding sphere of an instanced mesh is cached. Without this the
      // mesh keeps the (empty) sphere of the first frame and is culled away
      // for the rest of the game.
      mesh.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) entry.dispose();
      } else {
        material.dispose();
      }
    }
    this.meshes.clear();
    this.group.clear();
  }
}

/**
 * Merge a few simple shapes into one geometry.
 * The shapes keep their own material groups, so an instanced mesh can show a
 * trunk and a foliage ball at the same time.
 */
function mergeSimple(
  parts: { geo: THREE.BufferGeometry; y: number; material: number }[],
): THREE.BufferGeometry {
  const geometries = parts.map((part) => {
    const geo = part.geo.clone();
    geo.translate(0, part.y, 0);
    return geo;
  });

  // Simple manual merge: concatenate the attributes and keep the groups.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  let vertexOffset = 0;
  let indexOffset = 0;
  for (let i = 0; i < geometries.length; i++) {
    const geo = geometries[i];
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      positions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
      uvs.push(uv.getX(v), uv.getY(v));
    }
    const index = geo.index;
    const indexCount = index ? index.count : pos.count;
    if (index) {
      for (let k = 0; k < index.count; k++) indices.push(index.getX(k) + vertexOffset);
    } else {
      for (let k = 0; k < pos.count; k++) indices.push(k + vertexOffset);
    }
    groups.push({
      start: indexOffset,
      count: indexCount,
      materialIndex: parts[i].material,
    });
    indexOffset += indexCount;
    vertexOffset += pos.count;
    geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  for (const group of groups) merged.addGroup(group.start, group.count, group.materialIndex);
  return merged;
}

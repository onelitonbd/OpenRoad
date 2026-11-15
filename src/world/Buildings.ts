import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { RoadNetwork } from './RoadNetwork';
import type { Terrain } from './Terrain';
import { Rng } from '../utils/random';
import { WORLD_GROUPS, type PhysicsWorld } from '../physics/PhysicsWorld';
import { clamp } from '../utils/math';

/** The size of the building archetypes. */
const TOWER_SIZES = [
  { w: 26, h: 34, d: 26 },
  { w: 22, h: 48, d: 30 },
  { w: 30, h: 62, d: 24 },
  { w: 20, h: 78, d: 20 },
  { w: 34, h: 96, d: 34 },
  { w: 24, h: 118, d: 24 },
  { w: 28, h: 138, d: 28 },
  { w: 40, h: 152, d: 32 },
];
const HOUSE_SIZES = [
  { w: 9, h: 4.2, d: 7.5, roof: 2.6 },
  { w: 11, h: 4.6, d: 8.5, roof: 3 },
  { w: 8, h: 4, d: 7, roof: 2.4 },
  { w: 12, h: 5, d: 9, roof: 3.2 },
  { w: 10, h: 3.6, d: 8, roof: 2.2 },
];
const BARN_SIZES = [
  { w: 14, h: 7, d: 9 },
  { w: 18, h: 8, d: 11 },
  { w: 12, h: 6, d: 8 },
];

/** How far away buildings are still drawn. */
const VIEW_RADIUS = 420;
/** How far away buildings get a physics collider. */
const COLLIDER_RADIUS = 130;

export type BuildingKind = 'tower' | 'house' | 'barn' | 'silo';

interface BuildingInstance {
  x: number;
  y: number;
  z: number;
  rotation: number;
  kind: BuildingKind;
  archetype: number;
  color: THREE.Color;
}

/** A box with UVs scaled so a texture tiles in world units. */
function buildingBox(
  width: number,
  height: number,
  depth: number,
  tileWidth = 4,
  tileHeight = 3.5,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry has 6 faces of 4 vertices: +x, -x, +y, -y, +z, -z.
  const faceTiles = [
    [depth / tileWidth, height / tileHeight],
    [depth / tileWidth, height / tileHeight],
    [width / tileWidth, depth / tileHeight],
    [width / tileWidth, depth / tileHeight],
    [width / tileWidth, height / tileHeight],
    [width / tileWidth, height / tileHeight],
  ];
  for (let face = 0; face < 6; face++) {
    const [tu, tv] = faceTiles[face];
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, uv.getX(index) * tu, uv.getY(index) * tv);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** A simple pitched roof (a triangular prism). */
function roofGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = new Float32Array([
    -hw, 0, -hd, hw, 0, -hd, 0, height, -hd,
    -hw, 0, hd, hw, 0, hd, 0, height, hd,
    -hw, 0, -hd, 0, height, -hd, -hw, 0, hd,
    -hw, 0, -hd, -hw, 0, hd, 0, height, -hd,
    -hw, 0, hd, 0, height, hd, 0, height, -hd,
    hw, 0, -hd, hw, 0, hd, 0, height, -hd,
    hw, 0, -hd, 0, height, -hd, hw, 0, hd,
    hw, 0, hd, 0, height, hd, 0, height, -hd,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The window texture used by the towers. */
function windowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#8d9199';
  ctx.fillRect(0, 0, size, size);
  // Windows.
  const columns = 4;
  const rows = 4;
  const w = size / columns;
  const h = size / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      ctx.fillStyle = '#3d4a63';
      ctx.fillRect(x * w + w * 0.22, y * h + h * 0.2, w * 0.56, h * 0.55);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** The material of the buildings, shared by all archetypes. */
function buildingMaterial(textured: boolean): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: false,
  });
  if (textured) {
    const texture = windowTexture();
    material.map = texture;
    material.emissiveMap = texture;
    material.emissive = new THREE.Color(0x000000);
  }
  return material;
}

/**
 * The buildings of the world.
 *
 * Every building is placed deterministically next to a road, so the city
 * always looks the same. The buildings are drawn with instanced meshes (one
 * draw call per archetype) and only the nearby ones get a collider.
 */
export class BuildingManager {
  readonly group = new THREE.Group();

  private readonly instances: BuildingInstance[] = [];
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly archetypeIds = new Map<string, number>();
  private readonly buildingsByCell = new Map<string, BuildingInstance[]>();

  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();

  private readonly colliders: RAPIER.Collider[] = [];
  private readonly colliderBodies: RAPIER.RigidBody[] = [];

  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private readonly network: RoadNetwork,
    private readonly terrain: Terrain,
    private readonly physics: PhysicsWorld,
  ) {
    this.group.name = 'buildings';
    this.generate();
    this.createMeshes();
  }

  /** Place every building of the world (deterministic). */
  private generate(): void {
    const rng = new Rng(0x2f6d3a11);

    for (const edge of this.network.edges) {
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
        const heading = Math.atan2(dx, dz);

        const region = this.terrain.regionAt(x0, z0);
        // How many buildings fit along one road segment.
        const spacing = region === 'downtown' ? 18 : region === 'suburb' ? 30 : 60;
        const perSegment = Math.max(1, Math.round(len / spacing));

        for (let s = 0; s < perSegment; s++) {
          const t = (s + rng.range(0.2, 0.8)) / perSegment;
          const px = x0 + dx * t;
          const pz = z0 + dz * t;

          for (const side of [-1, 1]) {
            if (!rng.chance(region === 'downtown' ? 0.85 : 0.55)) continue;

            // The building is picked first: its size decides how far away
            // from the road it has to stand.
            const plan = this.planBuilding(region, rng);
            if (!plan) continue;

            // The pavement between the kerb and the building.
            const pavement = region === 'downtown' ? 3 : region === 'suburb' ? 5 : 8;
            const setback = edge.width / 2 + pavement + plan.across / 2;

            const bx = px + nx * side * setback;
            const bz = pz + nz * side * setback;

            // Do not build on top of another road: the closest road to the
            // new building has to be the one we are building along.
            const other = this.network.nearestRoad(bx, bz, 80);
            if (!other || other.edge.id !== edge.id) continue;
            if (other.distance < edge.width / 2 + plan.across / 2 + 1) continue;

            const y = this.terrain.groundHeight(bx, bz);
            const instance: BuildingInstance = {
              x: bx,
              y,
              z: bz,
              rotation: heading + rng.range(-0.08, 0.08),
              kind: plan.kind,
              archetype: plan.archetype,
              color: new THREE.Color(plan.color),
            };
            this.instances.push(instance);
            this.addToCell(instance);
          }
        }
      }
    }
  }

  /**
   * Pick the kind, the size and the colour of a new building.
   * `across` is the size of the building across the road.
   */
  private planBuilding(
    region: string,
    rng: Rng,
  ): { kind: BuildingKind; archetype: number; color: number; across: number } | null {
    const palette = [
      0xd8d3c8, 0xc2c6cf, 0xa9b2be, 0xe0d2bb, 0xb9c6b2, 0x8fa3b8, 0xd7b9a3, 0x9aa3ad,
    ];

    if (region === 'downtown') {
      const archetype = rng.int(0, 7);
      return {
        kind: 'tower',
        archetype,
        color: palette[rng.int(0, palette.length - 1)],
        across: TOWER_SIZES[archetype].w,
      };
    }
    if (region === 'suburb') {
      const archetype = rng.int(0, 4);
      return {
        kind: 'house',
        archetype,
        color: [0xf2e6d0, 0xe8d3b8, 0xd9e2e8, 0xe6c9c0, 0xd2ddc4][archetype],
        across: HOUSE_SIZES[archetype].w,
      };
    }
    if (region === 'countryside' || region === 'coast' || region === 'desert') {
      if (rng.chance(0.25)) {
        const archetype = rng.int(0, 1);
        return { kind: 'silo', archetype, color: 0xc9c4b8, across: 7 + archetype * 2.8 };
      }
      const archetype = rng.int(0, 2);
      return {
        kind: 'barn',
        archetype,
        color: [0xa8402f, 0x8b5a3c, 0x7d8f5a][archetype],
        across: BARN_SIZES[archetype].w,
      };
    }
    return null;
  }

  private addToCell(instance: BuildingInstance): void {
    const key = `${Math.floor(instance.x / 128)},${Math.floor(instance.z / 128)}`;
    let list = this.buildingsByCell.get(key);
    if (!list) {
      list = [];
      this.buildingsByCell.set(key, list);
    }
    list.push(instance);
  }

  /** Create one instanced mesh per archetype. */
  private createMeshes(): void {
    const towers = TOWER_SIZES;
    const houses = HOUSE_SIZES;
    const barns = BARN_SIZES;

    const towerMaterial = buildingMaterial(true);
    const houseMaterial = buildingMaterial(false);
    const roofMaterial = buildingMaterial(false);

    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      const geometry = buildingBox(t.w, t.h, t.d);
      const mesh = new THREE.InstancedMesh(geometry, towerMaterial, 400);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(`tower-${i}`, mesh);
      this.archetypeIds.set(`tower-${i}`, i);
      this.group.add(mesh);
    }

    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      const geometry = buildingBox(h.w, h.h, h.d);
      const mesh = new THREE.InstancedMesh(geometry, houseMaterial, 400);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(`house-${i}`, mesh);
      this.archetypeIds.set(`house-${i}`, i);
      this.group.add(mesh);

      // The roof is a second instanced mesh.
      const roof = new THREE.InstancedMesh(roofGeometry(h.w, h.roof, h.d), roofMaterial, 400);
      roof.count = 0;
      roof.castShadow = true;
      roof.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(`house-roof-${i}`, roof);
      this.group.add(roof);
    }

    for (let i = 0; i < barns.length; i++) {
      const b = barns[i];
      const geometry = buildingBox(b.w, b.h, b.d);
      const mesh = new THREE.InstancedMesh(geometry, houseMaterial, 200);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(`barn-${i}`, mesh);
      this.archetypeIds.set(`barn-${i}`, i);
      this.group.add(mesh);
    }

    for (let i = 0; i < 2; i++) {
      const radius = 3 + i * 1.4;
      const geometry = new THREE.CylinderGeometry(radius, radius, 12 + i * 5, 10);
      const mesh = new THREE.InstancedMesh(geometry, houseMaterial, 120);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(`silo-${i}`, mesh);
      this.archetypeIds.set(`silo-${i}`, i);
      this.group.add(mesh);
    }
  }

  /** Show the buildings around the player and update their colliders. */
  update(playerX: number, playerZ: number): void {
    if (
      Number.isFinite(this.lastX) &&
      Math.abs(playerX - this.lastX) < 60 &&
      Math.abs(playerZ - this.lastZ) < 60
    ) {
      return;
    }
    this.lastX = playerX;
    this.lastZ = playerZ;

    const counts = new Map<string, number>();
    const nearby: BuildingInstance[] = [];

    // Collect the buildings in the visible area.
    const cellRadius = Math.ceil(VIEW_RADIUS / 128);
    const cx = Math.floor(playerX / 128);
    const cz = Math.floor(playerZ / 128);
    for (let dz = -cellRadius; dz <= cellRadius; dz++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const list = this.buildingsByCell.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const instance of list) {
          const distance = Math.hypot(instance.x - playerX, instance.z - playerZ);
          if (distance > VIEW_RADIUS) continue;
          nearby.push(instance);
        }
      }
    }

    // Fill the instance buffers.
    for (const instance of nearby) {
      const key = this.keyFor(instance);
      const mesh = this.meshes.get(key);
      if (!mesh) continue;
      const index = counts.get(key) ?? 0;
      if (index >= mesh.instanceMatrix.count) continue;

      this.position.set(instance.x, instance.y, instance.z);
      this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), instance.rotation);
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, instance.color);
      counts.set(key, index + 1);
    }

    for (const [key, mesh] of this.meshes) {
      const count = counts.get(key) ?? 0;
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // The bounding sphere of an instanced mesh is cached. Without this the
      // mesh keeps the (empty) sphere of the first frame and is culled away
      // for the rest of the game.
      mesh.computeBoundingSphere();
    }

    this.updateColliders(nearby, playerX, playerZ);
  }

  private keyFor(instance: BuildingInstance): string {
    switch (instance.kind) {
      case 'tower':
        return `tower-${instance.archetype}`;
      case 'house':
        return `house-${instance.archetype}`;
      case 'barn':
        return `barn-${instance.archetype}`;
      case 'silo':
        return `silo-${instance.archetype}`;
      default:
        return `house-0`;
    }
  }

  /** Create the physics boxes for the buildings close to the player. */
  private updateColliders(nearby: BuildingInstance[], playerX: number, playerZ: number): void {
    // Remove the old colliders.
    for (const collider of this.colliders) this.physics.removeCollider(collider);
    for (const body of this.colliderBodies) this.physics.removeBody(body);
    this.colliders.length = 0;
    this.colliderBodies.length = 0;

    for (const instance of nearby) {
      if (Math.hypot(instance.x - playerX, instance.z - playerZ) > COLLIDER_RADIUS) continue;

      const size = this.footprint(instance);
      const body = this.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          instance.x,
          instance.y + size.height / 2,
          instance.z,
        ),
      );
      const collider = this.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size.width / 2, size.height / 2, size.depth / 2)
          .setFriction(0.6)
          .setRestitution(0.05)
          .setCollisionGroups(WORLD_GROUPS),
        body,
      );
      this.colliders.push(collider);
      this.colliderBodies.push(body);
    }
  }

  /** The size of a building (used for the collider). */
  private footprint(instance: BuildingInstance): { width: number; height: number; depth: number } {
    const towers = TOWER_SIZES;
    const houses = HOUSE_SIZES;
    const barns = BARN_SIZES;

    switch (instance.kind) {
      case 'tower': {
        const t = towers[clamp(instance.archetype, 0, towers.length - 1)];
        return { width: t.w, height: t.h, depth: t.d };
      }
      case 'house': {
        const h = houses[clamp(instance.archetype, 0, houses.length - 1)];
        return { width: h.w, height: h.h + 2, depth: h.d };
      }
      case 'barn': {
        const b = barns[clamp(instance.archetype, 0, barns.length - 1)];
        return { width: b.w, height: b.h, depth: b.d };
      }
      default:
        return { width: 7, height: 16, depth: 7 };
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    this.group.clear();
  }
}

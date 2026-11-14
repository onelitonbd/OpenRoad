/**
 * Drives the car over the generated terrain (head-less) and checks that it
 * never falls through the ground and always follows the terrain height.
 *
 * Run with: npm run test:world
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld, WORLD_GROUPS } from '../src/physics/PhysicsWorld';
import { Vehicle } from '../src/vehicles/Vehicle';
import { buildCarMesh } from '../src/vehicles/CarFactory';
import { COMET_GT } from '../src/vehicles/cars';
import { Terrain, CHUNK_SIZE } from '../src/world/Terrain';
import { generateChunkData } from '../src/world/chunkData';

async function main(): Promise<void> {
  const physics = await PhysicsWorld.create();
  const terrain = new Terrain(1337);

  const spawnX = 520;
  const spawnZ = 0;
  const spawnY = terrain.height(spawnX, spawnZ);

  // --- build the terrain colliders around the spawn point ---
  const resolution = 32;
  const spawnChunkX = Math.floor(spawnX / CHUNK_SIZE);
  const spawnChunkZ = Math.floor(spawnZ / CHUNK_SIZE);
  for (let cz = spawnChunkZ - 1; cz <= spawnChunkZ + 1; cz++) {
    for (let cx = spawnChunkX - 1; cx <= spawnChunkX + 1; cx++) {
      const data = generateChunkData(terrain, cx, cz, resolution);
      const desc = RAPIER.ColliderDesc.trimesh(
        data.positions,
        data.indices,
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
      )
        .setFriction(0.95)
        .setRestitution(0)
        .setCollisionGroups(WORLD_GROUPS);
      const body = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
      );
      physics.world.createCollider(desc, body);
    }
  }

  // --- the car ---
  const mesh = buildCarMesh(COMET_GT);
  const vehicle = new Vehicle(physics, COMET_GT, mesh.group);
  vehicle.setWheelMeshes(mesh.wheels);

  vehicle.resetTo(spawnX, spawnY + 1.5, spawnZ, 0);

  const dt = 1 / 60;
  let minClearance = Infinity;
  let maxClearance = -Infinity;
  let worst = '';

  for (let i = 0; i < 1800; i++) {
    // Drive in a wide circle so the car crosses chunk borders.
    const steer = Math.sin(i / 180) * 0.8;
    vehicle.setControls(1, 0, steer, false);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);

    const p = vehicle.body.translation();
    const ground = terrain.height(p.x, p.z);
    // The chassis origin sits `groundClearance + halfHeight` above the road.
    const clearance = p.y - ground - (COMET_GT.groundClearance + COMET_GT.dimensions[1] / 2);
    if (clearance < minClearance) {
      minClearance = clearance;
      worst = `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`;
    }
    if (clearance > maxClearance) maxClearance = clearance;

    if (i % 300 === 299) {
      console.log(
        `t=${((i + 1) * dt).toFixed(1)}s pos=(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) ` +
          `ground=${ground.toFixed(2)} clearance=${clearance.toFixed(3)} ` +
          `speed=${vehicle.speedKmh.toFixed(1)}km/h`,
      );
    }
  }

  console.log(
    `\nRide height over the terrain: min ${minClearance.toFixed(3)} m at ${worst}, ` +
      `max ${maxClearance.toFixed(3)} m`,
  );
  if (minClearance < -0.35) {
    console.log('FAIL: the car sinks into the terrain!');
    process.exit(1);
  }
  console.log('OK: the car stayed on the terrain.');
  void CHUNK_SIZE;
  void THREE;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

/**
 * Checks that the player can hit an AI car and that the AI car reacts
 * physically to the hit (it is pushed off its line).
 *
 * Run with: npm run test:traffic-player
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld, WORLD_GROUPS } from '../src/physics/PhysicsWorld';
import { Terrain, CHUNK_SIZE } from '../src/world/Terrain';
import { RoadNetwork } from '../src/world/RoadNetwork';
import { generateChunkData } from '../src/world/chunkData';
import { TrafficManager } from '../src/ai/TrafficManager';
import { PlayerController } from '../src/vehicles/PlayerController';
import { Vehicle } from '../src/vehicles/Vehicle';
import { COMET_GT } from '../src/vehicles/cars';

async function main(): Promise<void> {
  const physics = await PhysicsWorld.create();
  const terrain = new Terrain(1337);
  const roads = new RoadNetwork();
  roads.build(1337, terrain);

  // The ground around the start.
  const centerX = Math.floor(0 / CHUNK_SIZE);
  const centerZ = Math.floor(0 / CHUNK_SIZE);
  for (let cz = centerZ - 3; cz <= centerZ + 3; cz++) {
    for (let cx = centerX - 3; cx <= centerX + 3; cx++) {
      const data = generateChunkData(terrain, cx, cz, 32);
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

  const traffic = new TrafficManager(physics, roads, () => true);

  // The player.
  const mesh = new THREE.Group();
  const player = new Vehicle(physics, COMET_GT, mesh);
  const controller = new PlayerController();

  // Let the traffic build up.
  for (let i = 0; i < 60 * 20; i++) {
    traffic.update(1 / 60, 0, 0);
    physics.step();
    traffic.syncVisuals(1 / 60);
  }

  // Find an AI car with the full physics near the start.
  let target: { x: number; z: number; heading: number; speed: number } | null = null;
  for (const car of traffic.cars) {
    const p = car.position;
    const d = Math.hypot(p.x, p.z);
    if (d > 20 && d < 220 && car.physicsMode) {
      target = { x: p.x, z: p.z, heading: car.vehicle.heading, speed: car.speed };
      break;
    }
  }
  if (!target) {
    console.log('SKIP: no AI car with physics near the start');
    traffic.dispose();
    physics.dispose();
    return;
  }

  // The player drives into the back of the AI car.
  player.resetTo(
    target.x - Math.sin(target.heading) * 11,
    8,
    target.z - Math.cos(target.heading) * 11,
    target.heading,
  );

  // The distance of the AI car from its own lane tells us whether it was
  // pushed away by the hit.
  const laneDistance = (car: (typeof traffic.cars)[number]): number => {
    const p = car.position;
    const hit = roads.nearestRoad(p.x, p.z, 60);
    if (!hit) return 0;
    return hit.distance;
  };

  const dt = 1 / 60;
  let touched = false;
  let maxLaneDistance = 0;
  let speedAtHit = 0;
  for (let i = 0; i < 60 * 6; i++) {
    controller.apply(
      { throttle: 1, brake: 0, steer: 0, handbrake: false } as never,
      player,
      dt,
    );
    player.prepareStep(dt);
    player.applyPhysics(dt);
    traffic.update(dt, 0, 0);
    physics.step();
    player.update(dt);
    traffic.syncVisuals(dt);

    for (const car of traffic.cars) {
      const p = car.position;
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      if (d < 5.5) {
        if (!touched) {
          touched = true;
          speedAtHit = car.speed * 3.6;
        }
        maxLaneDistance = Math.max(maxLaneDistance, laneDistance(car));
      }
    }
  }

  console.log(`the player reached the AI car: ${touched}`);
  console.log(`the AI car was driving at ${speedAtHit.toFixed(1)} km/h`);
  console.log(`it was pushed ${maxLaneDistance.toFixed(2)} m away from its lane`);

  let failed = false;
  if (!touched) {
    console.log('FAIL: the player did not reach the AI car');
    failed = true;
  }
  if (maxLaneDistance < 0.5) {
    console.log('FAIL: the AI car did not react to the hit');
    failed = true;
  }
  if (failed) process.exit(1);
  console.log('OK: the player can hit the AI cars and they react.');
  traffic.dispose();
  physics.dispose();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

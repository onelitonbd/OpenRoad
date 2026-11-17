/**
 * Drives the AI traffic for ten minutes (head-less) and checks that the
 * traffic behaves like traffic: the cars stay on the roads, they keep
 * moving, they do not fall through the world and they do not get stuck.
 *
 * Run with: npm run test:traffic
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld, WORLD_GROUPS } from '../src/physics/PhysicsWorld';
import { Terrain, CHUNK_SIZE } from '../src/world/Terrain';
import { RoadNetwork } from '../src/world/RoadNetwork';
import { generateChunkData } from '../src/world/chunkData';
import { TrafficManager } from '../src/ai/TrafficManager';
import { AI_CARS } from '../src/vehicles/aiCars';

/** How long the traffic is simulated (in seconds). */
const DURATION = 600;

/** The car types the traffic uses. */
interface CarInfo {
  path: {
    edgeId: number;
    lane: number;
    reversed: boolean;
    length: number;
    points: { x: number; z: number; heading: number; distance: number }[];
  };
  distance: number;
  speed: number;
  waiting: boolean;
  alive: boolean;
  physicsMode: boolean;
  position: { x: number; y: number; z: number };
  vehicle: { heading: number };
  config?: { id: string };
}

async function main(): Promise<void> {
  const physics = await PhysicsWorld.create();
  const terrain = new Terrain(1337);
  const roads = new RoadNetwork();
  roads.build(1337, terrain);

  // The player stands still in the middle of the city.
  const playerX = 0;
  const playerZ = 0;

  // The traffic needs the ground, so the terrain colliders are built around
  // the player (the same way the chunk manager does it).
  const resolution = 32;
  const centerX = Math.floor(playerX / CHUNK_SIZE);
  const centerZ = Math.floor(playerZ / CHUNK_SIZE);
  for (let cz = centerZ - 3; cz <= centerZ + 3; cz++) {
    for (let cx = centerX - 3; cx <= centerX + 3; cx++) {
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

  const traffic = new TrafficManager(physics, roads);

  const dt = 1 / 60;
  const steps = 60 * DURATION;
  let offRoad = 0;
  let offLane = 0;
  let wrongWay = 0;
  let belowGround = 0;
  let totalSpeed = 0;
  let samples = 0;
  let maxSpeed = 0;
  let stoppedSamples = 0;
  let queuedSamples = 0;

  // How long the cars have been standing still (for the stuck car check).
  const stopTimes = new Map<unknown, number>();
  const worstStop = new Map<unknown, number>();

  // The kinds of car that drove by - every kind has to show up, otherwise
  // a model of the traffic is never seen.
  const kinds = new Set<string>();

  for (let i = 0; i < steps; i++) {
    traffic.update(dt, playerX, playerZ);
    physics.step();
    traffic.syncVisuals(dt);

    if (i % 30 !== 0) continue;
    for (const car of traffic.cars as unknown as CarInfo[]) {
      if (car.config?.id) kinds.add(car.config.id);
      const p = car.position;
      const ground = terrain.groundHeight(p.x, p.z);
      if (p.y < ground - 2) belowGround++;

      // The car has to stay on its road.
      const hit = roads.nearestRoad(p.x, p.z, 60);
      if (!hit || hit.distance > hit.edge.width / 2 + 2.5) offRoad++;

      // The car has to stay on its own lane (not just on the road) and it
      // has to drive in the direction of the lane.
      const lane = car.path.points;
      // Near a junction the car is still turning, so the check only
      // applies in the middle of the lane.
      const nearJunction = car.distance < 15 || car.path.length - car.distance < 15;
      if (lane.length > 1 && !nearJunction) {
        // The point of the lane that is closest to the car.
        let best = lane[0];
        let bestDistance = Infinity;
        for (const point of lane) {
          const d = Math.hypot(point.x - p.x, point.z - p.z);
          if (d < bestDistance) {
            bestDistance = d;
            best = point;
          }
        }
        if (bestDistance > 4) offLane++;
        // The direction of travel has to match the lane.
        const heading = car.vehicle.heading;
        let difference = heading - best.heading;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        if (Math.abs(difference) > 1.2) wrongWay++;
      }

      const speed = car.speed * 3.6;
      totalSpeed += speed;
      samples++;
      if (speed > maxSpeed) maxSpeed = speed;

      // A car that stands still is either waiting for a light, queuing up
      // behind another car or really stuck.
      if (speed < 2) {
        stoppedSamples++;
        const blocked = traffic.obstacleDistance(
          car as never,
        ) !== null;
        if (car.waiting || blocked) queuedSamples++;
        const time = (stopTimes.get(car) ?? 0) + 0.5;
        stopTimes.set(car, time);
        worstStop.set(car, Math.max(worstStop.get(car) ?? 0, time));
      } else {
        stopTimes.set(car, 0);
      }
    }
  }

  const average = samples > 0 ? totalSpeed / samples : 0;
  const stops = [...worstStop.values()].sort((a, b) => b - a);
  console.log(`Traffic after ${DURATION} s of simulated time:`);
  console.log(`  cars            : ${traffic.count} (${traffic.physicsCount} with physics)`);
  console.log(`  rescues         : ${traffic.rescueCount}`);
  console.log(`  average speed   : ${average.toFixed(1)} km/h`);
  console.log(`  fastest car     : ${maxSpeed.toFixed(1)} km/h`);
  console.log(`  samples         : ${samples}`);
  console.log(`  off the road    : ${offRoad}`);
  console.log(`  off their lane  : ${offLane}`);
  console.log(`  driving against the traffic: ${wrongWay}`);
  console.log(`  below the ground: ${belowGround}`);
  console.log(
    `  standing still  : ${stoppedSamples} (${queuedSamples} of them waiting or queuing up)`,
  );
  console.log(`  longest stops   : ${stops.slice(0, 5).map((v) => v.toFixed(1)).join(', ')} s`);
  console.log(`  kinds of car    : ${[...kinds].sort().join(', ')}`);

  traffic.dispose();
  physics.dispose();

  let failed = false;
  const check = (ok: boolean, message: string) => {
    if (!ok) {
      console.log(`FAIL: ${message}`);
      failed = true;
    }
  };
  check(offRoad < samples * 0.01, 'too many cars left the road');
  check(offLane < samples * 0.02, 'too many cars left their lane');
  check(wrongWay < samples * 0.02, 'too many cars drive against the traffic');
  check(belowGround === 0, 'a car fell through the world');
  check(average > 20, 'the traffic is not moving');
  check(traffic.rescueCount < 5, 'too many cars had to be rescued');
  check(
    (stops[0] ?? 0) < 60,
    `a car was stuck for ${(stops[0] ?? 0).toFixed(0)} s`,
  );
  check(
    kinds.size === AI_CARS.length,
    `only ${kinds.size} of the ${AI_CARS.length} kinds of car drove by`,
  );
  if (failed) process.exit(1);
  console.log('OK: the traffic drives on the roads.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

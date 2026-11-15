/**
 * Head-less physics test for the vehicle.
 *
 * Run with:  npm run test:vehicle
 *
 * It boots the real Rapier world, drops the car on a flat plane and prints
 * the telemetry so the handling numbers can be tuned without a browser.
 */
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Vehicle } from '../src/vehicles/Vehicle';
import { buildCarMesh } from '../src/vehicles/CarFactory';
import { COMET_GT } from '../src/vehicles/cars';

async function main(): Promise<void> {
  const physics = await PhysicsWorld.create();

  // Flat ground: a big cuboid whose top surface is at y = 0.
  const groundBody = physics.world.createRigidBody(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (await import('@dimforge/rapier3d-compat')).default.RigidBodyDesc.fixed().setTranslation(0, -1, 0),
  );
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500), groundBody);

  const mesh = buildCarMesh(COMET_GT);
  const vehicle = new Vehicle(physics, COMET_GT, mesh.group);
  vehicle.setWheelMeshes(mesh.wheels);
  vehicle.resetTo(0, 1.0, 0, 0);

  const dt = 1 / 60;

  console.log('--- settling (no input) ---');
  for (let i = 0; i < 120; i++) {
    vehicle.setControls(0, 0, 0, false);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);
  }
  report(vehicle, 'after settling');

  console.log('--- full throttle for 5 s ---');
  for (let i = 0; i < 300; i++) {
    vehicle.setControls(1, 0, 0, false);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);
    if (i % 60 === 59) {
      report(vehicle, `t=${((i + 1) * dt).toFixed(1)}s`);
    }
  }

  console.log('--- steering right for 2 s ---');
  for (let i = 0; i < 120; i++) {
    vehicle.setControls(1, 0, 1, false);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);
  }
  report(vehicle, 'after steering');

  console.log('--- handbrake drift ---');
  for (let i = 0; i < 120; i++) {
    vehicle.setControls(1, 0, 1, true);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);
  }
  report(vehicle, 'after drift');

  console.log('--- brake to a stop ---');
  for (let i = 0; i < 180; i++) {
    vehicle.setControls(0, 1, 0, false);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);
  }
  report(vehicle, 'after braking');

  // The brake becomes the reverse accelerator: the car has to drive
  // backwards at a useful speed, not crawl along at 3 km/h.
  console.log('--- reverse (keep the brake held) ---');
  const start = vehicle.body.translation();
  for (let i = 0; i < 180; i++) {
    vehicle.setControls(0, 1, 0, false);
    vehicle.prepareStep(dt);
    vehicle.applyPhysics(dt);
    physics.step();
    vehicle.update(dt);
    if (i % 60 === 59) {
      report(vehicle, `reverse t=${((i + 1) * dt).toFixed(1)}s`);
    }
  }
  report(vehicle, 'after reversing');

  const end = vehicle.body.translation();
  const reverseKmh = Math.abs(vehicle.forwardSpeed) * 3.6;
  const moved = Math.hypot(end.x - start.x, end.z - start.z);
  const backwards = vehicle.forwardSpeed < 0;
  console.log(
    `reverse speed: ${reverseKmh.toFixed(1)} km/h, ${moved.toFixed(1)} m ` +
      `(${backwards ? 'backwards' : 'FORWARDS'})`,
  );
  if (reverseKmh < 15 || moved < 5 || !backwards) {
    console.log(`FAILED: the reverse gear is too slow (${reverseKmh.toFixed(1)} km/h)`);
    process.exitCode = 1;
    return;
  }
  console.log('OK: the car drives backwards at a useful speed.');
}

function report(vehicle: Vehicle, label: string): void {
  const p = vehicle.body.translation();
  const rot = vehicle.body.rotation();
  const yaw = Math.atan2(
    2 * (rot.w * rot.y + rot.x * rot.z),
    1 - 2 * (rot.y * rot.y + rot.z * rot.z),
  );
  const lengths = [0, 1, 2, 3]
    .map((i) => (vehicle.controller.wheelSuspensionLength(i) ?? 0).toFixed(3))
    .join(' ');
  const forces = [0, 1, 2, 3]
    .map((i) => (vehicle.controller.wheelSuspensionForce(i) ?? 0).toFixed(0))
    .join(' ');
  const vel = vehicle.body.linvel();
  const ang = vehicle.body.angvel();
  const contact = [0, 1, 2, 3].map((i) => (vehicle.controller.wheelIsInContact(i) ? '1' : '0')).join('');
  const nrm = vehicle.controller.wheelContactNormal(0);
  const pitch = Math.asin(
    Math.max(-1, Math.min(1, 2 * (rot.w * rot.x - rot.y * rot.z))),
  );
  console.log(
    `${label.padEnd(18)} pos=(${p.x.toFixed(2)}, ${p.y.toFixed(3)}, ${p.z.toFixed(2)}) ` +
      `yaw=${((yaw * 180) / Math.PI).toFixed(1)}deg pitch=${((pitch * 180) / Math.PI).toFixed(1)}deg ` +
      `speed=${vehicle.speedKmh.toFixed(1)}km/h ` +
      `fwd=${vehicle.forwardSpeed.toFixed(2)} v=(${vel.x.toFixed(2)},${vel.y.toFixed(2)},${vel.z.toFixed(2)}) ` +
      `w=(${ang.x.toFixed(2)},${ang.y.toFixed(2)},${ang.z.toFixed(2)}) mass=${vehicle.body.mass().toFixed(0)} ` +
      `susp=[${lengths}] force=[${forces}] contact=${contact} n=(${nrm?.x.toFixed(2)},${nrm?.y.toFixed(2)},${nrm?.z.toFixed(2)})`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

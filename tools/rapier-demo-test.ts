/**
 * Reproduces Rapier's official vehicle demo so we can compare our own setup
 * against a known good configuration.
 */
import RAPIER from '@dimforge/rapier3d-compat';

async function main(): Promise<void> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(100.0, 0.1, 100.0));

  const hw = 0.3;
  const hh = 0.15;
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0.0, 1.0, 0.0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(hw * 2.0, hh, hw).setDensity(100.0), chassis);

  const vehicle = world.createVehicleController(chassis);
  const wheelPositions = [
    { x: hw * 1.5, y: -hh, z: hw },
    { x: hw * 1.5, y: -hh, z: -hw },
    { x: -hw * 1.5, y: -hh, z: hw },
    { x: -hw * 1.5, y: -hh, z: -hw },
  ];
  for (const position of wheelPositions) {
    vehicle.addWheel(position, { x: 0.0, y: -1.0, z: 0.0 }, { x: 0.0, y: 0.0, z: 1.0 }, hh, hh / 4.0);
  }
  for (let i = 0; i < vehicle.numWheels(); ++i) {
    vehicle.setWheelSuspensionStiffness(i, 100.0);
    vehicle.setWheelSuspensionCompression(i, 10.0);
    vehicle.setWheelSuspensionRelaxation(i, 10.0);
  }

  const dt = world.integrationParameters.dt;
  // Phase 1: idle for 2 seconds so the body can fall asleep (Rapier
  // auto-sleeps bodies that stand still).
  for (let k = 0; k < 120; ++k) {
    vehicle.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    world.step();
  }
  console.log('after idle: sleeping =', chassis.isSleeping(), 'y =', chassis.translation().y.toFixed(3));

  for (let k = 0; k < 400; ++k) {
    vehicle.setWheelEngineForce(0, 30.0);
    vehicle.setWheelSteering(0, 0.2);
    vehicle.setWheelEngineForce(1, 30.0);
    vehicle.setWheelSteering(1, 0.2);

    vehicle.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    world.step();

    if (k % 50 === 49) {
      const p = chassis.translation();
      const v = chassis.linvel();
      const lens = [0, 1, 2, 3]
        .map((i) => (vehicle.wheelSuspensionLength(i) ?? 0).toFixed(3))
        .join(' ');
      console.log(
        `step ${k + 1}: pos=(${p.x.toFixed(2)}, ${p.y.toFixed(3)}, ${p.z.toFixed(2)}) ` +
          `v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) speed=${vehicle.currentVehicleSpeed().toFixed(2)} ` +
          `susp=[${lens}] mass=${chassis.mass().toFixed(2)}`,
      );
    }
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

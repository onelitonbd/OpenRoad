/**
 * Bisection harness: starts from Rapier's official vehicle demo and morphs it
 * step by step towards our own setup to find what breaks the suspension.
 *
 * Usage: node demo-bisect.mjs <variant>
 */
import RAPIER from '@dimforge/rapier3d-compat';

const variant = Number(process.argv[2] ?? 0);

async function main(): Promise<void> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

  // v16: our test harness ground (big slab with the top at y = 0).
  let groundBody: RAPIER.RigidBody | null = null;
  if (variant >= 16) {
    const gb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500), gb);
  } else if (variant >= 5) {
    groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(100.0, 0.1, 100.0), groundBody);
  } else {
    world.createCollider(RAPIER.ColliderDesc.cuboid(100.0, 0.1, 100.0));
  }
  void groundBody;

  const hw = 0.3;
  const hh = 0.15;
  let bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0.0, 1.0, 0.0);
  // v7: body damping + CCD (like our Vehicle class).
  if (variant >= 7) {
    bodyDesc = bodyDesc.setLinearDamping(0.02).setAngularDamping(0.45).setCcdEnabled(true);
  }
  const chassis = world.createRigidBody(bodyDesc);

  // v1: explicit mass properties (our style).
  if (variant >= 1) {
    const mass = 1350;
    const w = 1.9;
    const h = 1.28;
    const l = 4.5;
    let cd = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2)
        .setMassProperties(
          mass,
          { x: 0, y: -0.36, z: 0 },
          {
            x: (mass / 12) * (h * h + l * l),
            y: (mass / 12) * (w * w + l * l),
            z: (mass / 12) * (w * w + h * h),
          },
          { x: 0, y: 0, z: 0, w: 1 },
        );
    // v8: friction / restitution.  v9: collision groups.
    if (variant >= 8) cd = cd.setFriction(0.4).setRestitution(0.12);
    if (variant >= 9) cd = cd.setCollisionGroups((0x2 << 16) | 0x7);
    world.createCollider(cd, chassis);
  } else {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hw * 2.0, hh, hw).setDensity(100.0), chassis);
  }

  const vehicle = world.createVehicleController(chassis);

  // v2: our wheel geometry - bigger wheels, lower connection point.
  const useOurWheels = variant >= 2;
  // v11: our computed connection point (the wheel sits inside the body).
  let connY = useOurWheels ? -0.64 : -hh;
  if (variant >= 11) connY = -0.1445;
  const restLength = useOurWheels ? 0.36 : hh;
  const radius = useOurWheels ? 0.35 : hh / 4.0;
  const frontZ = useOurWheels ? 1.38 : hw;
  const rearZ = useOurWheels ? -1.42 : -hw;
  const track = useOurWheels ? 0.82 : hw * 1.5;

  // v3: our axle convention (forward = +Z, axle = -X).
  const axle = useOurWheels ? { x: -1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };

  const wheelPositions = [
    { x: track, y: connY, z: frontZ },
    { x: -track, y: connY, z: frontZ },
    { x: track, y: connY, z: rearZ },
    { x: -track, y: connY, z: rearZ },
  ];
  for (const position of wheelPositions) {
    vehicle.addWheel(position, { x: 0.0, y: -1.0, z: 0.0 }, axle, restLength, radius);
  }

  const stiffness = useOurWheels ? 45 : 100;
  const damping = useOurWheels ? 7.5 : 10;
  const relaxation = useOurWheels ? 9.5 : 10;
  for (let i = 0; i < vehicle.numWheels(); ++i) {
    vehicle.setWheelSuspensionStiffness(i, stiffness);
    vehicle.setWheelSuspensionCompression(i, damping);
    vehicle.setWheelSuspensionRelaxation(i, relaxation);
    // v4: travel + max force + friction slip.
    if (variant >= 4) {
      vehicle.setWheelMaxSuspensionTravel(i, 0.2);
      vehicle.setWheelMaxSuspensionForce(i, 30000);
      vehicle.setWheelFrictionSlip(i, i < 2 ? 2.4 : 2.2);
      vehicle.setWheelSideFrictionStiffness(i, 1);
    }
  }

  const dt = world.integrationParameters.dt;
  // v13: exactly our Vehicle class setup.
  if (variant >= 13) {
    vehicle.indexUpAxis = 1;
    vehicle.setIndexForwardAxis = 2;
  }
  const engineForce = useOurWheels ? 3600 : 30;
  // v3: rear wheel drive (our layout: wheels 2 and 3 are the rear ones).
  const driven = useOurWheels ? [2, 3] : [0, 1];

  for (let k = 0; k < 300; ++k) {
    if (variant >= 13) {
      // The exact order our Vehicle.prepareStep() uses.
      for (let i = 0; i < vehicle.numWheels(); ++i) {
        const isFront = i < 2;
        vehicle.setWheelSteering(i, 0);
        vehicle.setWheelEngineForce(i, isFront ? 0 : engineForce);
        vehicle.setWheelBrake(i, 0);
        vehicle.setWheelFrictionSlip(i, isFront ? 2.4 : 2.2);
        vehicle.setWheelSideFrictionStiffness(i, 1);
      }
    } else {
      for (const w of driven) vehicle.setWheelEngineForce(w, engineForce);
    }
    if (!useOurWheels) {
      vehicle.setWheelSteering(0, 0.2);
      vehicle.setWheelSteering(1, 0.2);
    }

    // v10: undefined filter flags + interaction groups (our Vehicle class).
    if (variant >= 10) {
      vehicle.updateVehicle(dt, undefined, (0x2 << 16) | 0x1);
    } else if (variant >= 6) {
      vehicle.updateVehicle(dt, undefined, (0x2 << 16) | 0x1);
    } else {
      vehicle.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    }
    world.step();

    // v14: our post-step assist torques.  v15: our downforce.
    if (variant >= 14) {
      const angvel = chassis.angvel();
      const fl = vehicle.wheelSuspensionLength(0) ?? 0;
      const fr = vehicle.wheelSuspensionLength(1) ?? 0;
      const rl = vehicle.wheelSuspensionLength(2) ?? 0;
      const rr = vehicle.wheelSuspensionLength(3) ?? 0;
      const diff = (fl + rl) * 0.5 - (fr + rr) * 0.5;
      chassis.addTorque({ x: 0, y: 0, z: -diff * 900 - angvel.z * 120 }, true);
      chassis.addTorque({ x: 0, y: -angvel.y * 120, z: 0 }, true);
    }
    if (variant >= 15) {
      const v = chassis.linvel();
      chassis.addForce({ x: 0, y: -900 * (v.z * v.z) * 0.008, z: 0 }, true);
    }

    if (k % 50 === 49) {
      const p = chassis.translation();
      const v = chassis.linvel();
      const lens = [0, 1, 2, 3]
        .map((i) => (vehicle.wheelSuspensionLength(i) ?? 0).toFixed(3))
        .join(' ');
      const forces = [0, 1, 2, 3]
        .map((i) => (vehicle.wheelSuspensionForce(i) ?? 0).toFixed(0))
        .join(' ');
      console.log(
        `v${variant} step ${k + 1}: pos=(${p.x.toFixed(2)}, ${p.y.toFixed(3)}, ${p.z.toFixed(2)}) ` +
          `v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) ` +
          `susp=[${lens}] force=[${forces}] mass=${chassis.mass().toFixed(0)}`,
      );
    }
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

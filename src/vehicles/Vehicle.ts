// Vehicle.ts — raycast vehicle with Rapier + kinematic fallback
import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleConfig } from './VehicleConfig';
import { CarFactory, type CarMesh } from './CarFactory';
import { clamp, lerp } from '../utils/math';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export interface VehicleState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  speedKmh: number;
  rpm: number;
  gear: number;
}

export class Vehicle {
  config: VehicleConfig;
  mesh: CarMesh;
  group: THREE.Group;
  state: VehicleState;

  // Kinematic fallback state
  private vel = new THREE.Vector3();
  private heading = 0;
  private steeringAngle = 0;
  private wheelRotation = 0;
  private rpmInternal = 900;

  // Physics
  private rigidBody: RAPIER.RigidBody | null = null;
  private controller: RAPIER.DynamicRayCastVehicleController | null = null;
  private usePhysics = false;
  private physicsWorld: PhysicsWorld | null = null;
  private chassisOffset = new THREE.Vector3();

  // Tuning multipliers (live-adjustable via tuning panel)
  tuning = {
    engineScale: 1,
    gripScale: 1,
    steerScale: 1,
  };

  constructor(config: VehicleConfig) {
    this.config = config;
    this.mesh = CarFactory.createProcedural(config.color, config.dimensions);
    this.group = this.mesh.root;
    this.group.position.set(0, 0.45, 0);
    this.state = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      heading: 0,
      speedKmh: 0,
      rpm: 900,
      gear: 1,
    };
    // ensure initial state copies
    this.state.position.copy(this.group.position);
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Enable Rapier physics for this vehicle. Call after PhysicsWorld.init() */
  enablePhysics(physics: PhysicsWorld) {
    if (this.usePhysics || !physics.world) return;
    this.physicsWorld = physics;
    const world = physics.world;
    const [len, wid, hei] = this.config.dimensions;

    // Chassis rigid body
    const rigidDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.group.position.x, this.group.position.y + 0.6, this.group.position.z)
      .setLinearDamping(0.15)
      .setAngularDamping(0.4);
    this.rigidBody = world.createRigidBody(rigidDesc);

    // Main box collider for chassis
    const halfExtents = { x: len * 0.5, y: hei * 0.35, z: wid * 0.5 };
    const colDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setMass(this.config.mass)
      .setFriction(0.5)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max);
    // Center of mass offset slightly down for stability
    // Rapier collider mass properties handle COM via translation — we mimic by shifting collider
    // Keep simple: collider at chassis center
    world.createCollider(colDesc, this.rigidBody);

    // Vehicle controller
    const controller = world.createVehicleController(this.rigidBody) as unknown as RAPIER.DynamicRayCastVehicleController;
    controller.indexUpAxis = 1;
    (controller as unknown as Record<string, unknown>).setIndexForwardAxis = (controller as unknown as { setIndexForwardAxis: number }).setIndexForwardAxis ?? 0;
    // chassis local forward is X in our model? Vehicle faces +X when heading 0 (cos, sin). Rapier default forward is Z. We set forward axis 0 (X)
    // Use property setter if exists
    try { (controller as unknown as { setIndexForwardAxis: number }).setIndexForwardAxis = 0; } catch {}

    // Wheel positions (chassis local)
    const wheelRadius = this.config.wheelRadius;
    const restLength = this.config.suspension.restLength;
    const travel = this.config.suspension.travel;
    const stiffness = this.config.suspension.stiffness;
    const damping = this.config.suspension.damping;

    // Offsets: chassis local. Rapier assumes wheels relative to chassis origin.
    // Our chassis origin is at rigidBody center. Wheels should be near bottom.
    // Chassis half height ~ hei*0.35, wheel connection should be slightly below center
    const yOff = -halfExtents.y + 0.15; // inside collider bottom
    const xFront = len * 0.35;
    const xRear = -len * 0.33;
    const zOff = wid * 0.5;

    const wheels: Array<{ pos: THREE.Vector3; isFront: boolean }> = [
      { pos: new THREE.Vector3(xFront, yOff, zOff), isFront: true },
      { pos: new THREE.Vector3(xFront, yOff, -zOff), isFront: true },
      { pos: new THREE.Vector3(xRear, yOff, zOff), isFront: false },
      { pos: new THREE.Vector3(xRear, yOff, -zOff), isFront: false },
    ];

    wheels.forEach(w => {
      controller.addWheel(
        new RAPIER.Vector3(w.pos.x, w.pos.y, w.pos.z),
        new RAPIER.Vector3(0, -1, 0), // suspension direction down
        new RAPIER.Vector3(0, 0, 1),  // axle along Z (since car drives along X, axle is Z)
        restLength,
        wheelRadius
      );
    });

    // Configure each wheel
    for (let i = 0; i < 4; i++) {
      controller.setWheelSuspensionStiffness(i, stiffness * 5); // scale to feel right
      controller.setWheelSuspensionCompression(i, damping * 0.7);
      controller.setWheelSuspensionRelaxation(i, damping);
      controller.setWheelMaxSuspensionTravel(i, travel);
      controller.setWheelMaxSuspensionForce(i, 60000);
      // Friction: front slightly higher
      const isFront = i < 2;
      const slip = isFront ? this.config.friction.front * 1.2 : this.config.friction.rear * 1.0;
      controller.setWheelFrictionSlip(i, slip * 800);
      controller.setWheelSideFrictionStiffness(i, isFront ? 20 : 18);
    }

    this.controller = controller;
    this.usePhysics = true;
    console.log('[Vehicle] Rapier vehicle enabled', this.config.name);
  }

  // Called before physics step — set engine/brake/steer
  private applyPhysicsInputs(input: { throttle: number; brake: number; steer: number; handbrake: boolean }, dt: number) {
    if (!this.controller || !this.rigidBody) return;
    const cfg = this.config;
    const speedKmh = Math.abs(this.controller.currentVehicleSpeed()) * 3.6;
    // Speed-sensitive steering
    const speedFactor = clamp(1 - (speedKmh / 220) * cfg.steerSpeedFalloff, 0.24, 1);
    const targetSteer = input.steer * cfg.steerMax * speedFactor * this.tuning.steerScale;
    this.steeringAngle = lerp(this.steeringAngle, targetSteer, dt * 7);

    // Engine force — apply to rear wheels (RWD). For FWD-style cars blend, but keep RWD for fun.
    const engine = input.throttle * cfg.engineForce * this.tuning.engineScale;
    // Simple engine curve: taper at high speed
    const speed01 = clamp(speedKmh / cfg.maxSpeedKmh, 0, 1);
    const engineCurve = 1 - speed01 * 0.55;
    const finalEngine = engine * engineCurve;

    // Brake
    const brake = input.brake * cfg.brakeForce;
    const handBrakeForce = input.handbrake ? cfg.brakeForce * 1.4 : 0;

    // Distribute
    // front wheels only steer, rear wheels drive + handbrake
    for (let i = 0; i < 4; i++) {
      const isFront = i < 2;
      const isRear = !isFront;
      if (isFront) {
        this.controller!.setWheelSteering(i, this.steeringAngle);
        this.controller!.setWheelEngineForce(i, 0);
        // light front brake
        this.controller!.setWheelBrake(i, brake * 0.6);
        // handbrake does not affect front
      } else {
        this.controller!.setWheelSteering(i, 0);
        // reduce rear grip when handbraking = drift
        if (input.handbrake) {
          this.controller!.setWheelFrictionSlip(i, cfg.friction.driftSlip * 400);
        } else {
          this.controller!.setWheelFrictionSlip(i, cfg.friction.rear * 800 * this.tuning.gripScale);
        }
        this.controller!.setWheelEngineForce(i, isRear ? finalEngine : 0);
        this.controller!.setWheelBrake(i, brake * 0.7 + handBrakeForce);
      }
    }

    // Downforce
    const downforce = cfg.downforce * speedKmh * 0.6;
    if (downforce > 0) {
      this.rigidBody!.addForce(new RAPIER.Vector3(0, -downforce, 0), true);
    }

    // Air control: if wheels not in contact, allow small torque/steer influence
    let wheelsInContact = 0;
    for (let i = 0; i < 4; i++) if (this.controller!.wheelIsInContact(i)) wheelsInContact++;
    if (wheelsInContact < 2) {
      // allow air steering and pitch
      const linvel = this.rigidBody!.linvel();
      const angvel = this.rigidBody!.angvel();
      // small air yaw from steer
      if (input.steer !== 0) {
        this.rigidBody!.addTorque(new RAPIER.Vector3(0, input.steer * 600, 0), true);
      }
      if (input.throttle > 0) {
        this.rigidBody!.addTorque(new RAPIER.Vector3(0, 0, -400), true);
      }
      if (input.brake > 0) {
        this.rigidBody!.addTorque(new RAPIER.Vector3(0, 0, 400), true);
      }
      // auto-level a bit
      this.rigidBody!.setAngvel(new RAPIER.Vector3(angvel.x * 0.98, angvel.y * 0.99, angvel.z * 0.98), true);
    }

    // Anti-roll / stability: damp angular velocity when not handbraking
    if (!input.handbrake && wheelsInContact >= 3) {
      const ang = this.rigidBody!.angvel();
      const dampX = clamp(1 - dt * 1.2, 0.8, 1);
      const dampZ = clamp(1 - dt * 1.5, 0.8, 1);
      this.rigidBody!.setAngvel(new RAPIER.Vector3(ang.x * dampX, ang.y, ang.z * dampZ), true);
    }
  }

  // Called after physics step — sync mesh to body
  private syncFromPhysics() {
    if (!this.rigidBody || !this.controller) return;
    const pos = this.rigidBody.translation();
    const rot = this.rigidBody.rotation();
    this.group.position.set(pos.x, pos.y, pos.z);
    this.group.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // Wheels visual: we have 4 mesh groups; set steering on front, rotation, and suspension offset
    const chassisPos = this.group.position;
    const chassisQuat = this.group.quaternion;
    // For each wheel, get suspension length to offset Y
    for (let i = 0; i < Math.min(4, this.mesh.wheels.length); i++) {
      const wheelMesh = this.mesh.wheels[i] as unknown as THREE.Group;
      const hardPoint = this.controller!.wheelHardPoint(i);
      const suspensionLength = this.controller!.wheelSuspensionLength(i);
      const isInContact = this.controller!.wheelIsInContact(i);
      // steering
      if (i < 2) wheelMesh.rotation.y = this.steeringAngle;
      // rotation: wheelRotation property gives rotation around axle
      const rotAngle = this.controller!.wheelRotation(i) ?? 0;
      // Our wheel mesh orientation: cylinder rotated Z Pi/2, so spin is around Z or X? In factory, wheel geo rotateZ Pi/2, so axle is X world? But we set axle Cs to (0,0,1) -> around Z chassis. So spin around Z.
      wheelMesh.rotation.z = rotAngle;
      // If we had hardPoint, we could set local Y offset based on suspension
      // For simplicity, keep wheel local position but adjust Y to reflect suspension compression
      // The mesh wheel local position was set in CarFactory relative to car root; now car root is chassis.
      // We need to lerp wheel Y toward suspension point
      if (hardPoint && suspensionLength !== null) {
        // hardPoint is world space; we convert to local
        // Approximate: offset wheels vertically by suspension delta
        // restLength - currentLength
        const rest = this.config.suspension.restLength;
        const delta = (rest - (suspensionLength ?? rest)) * 0.9;
        // wheel local Y was wheelRadius; shift
        // Find original offset: store in userData
        if (!(wheelMesh as unknown as Record<string, unknown>).__origY) {
          (wheelMesh as unknown as Record<string, unknown>).__origY = wheelMesh.position.y;
        }
        const origY = (wheelMesh as unknown as Record<string, number>).__origY;
        wheelMesh.position.y = origY - delta;
      }
      // visual body roll hint: already handled by chassis quaternion; no extra
    }

    // Extract heading from quaternion (yaw)
    const euler = new THREE.Euler().setFromQuaternion(this.group.quaternion, 'YXZ');
    this.heading = euler.y;
  }

  // Main update called from Game. If physics enabled, apply inputs then rely on post-step sync.
  update(dt: number, input: { throttle: number; brake: number; steer: number; handbrake: boolean }) {
    if (this.usePhysics && this.controller && this.rigidBody) {
      this.applyPhysicsInputs(input, dt);
      // RPM & gear based on speed
      const speedMs = Math.abs(this.controller.currentVehicleSpeed());
      const speedKmh = speedMs * 3.6;
      const targetRpm = 950 + speedMs * 280 + input.throttle * 3800;
      this.rpmInternal = lerp(this.rpmInternal, clamp(targetRpm, 950, this.config.redlineRpm), dt * 4);
      const gear = Math.min(this.config.gearRatios.length, Math.max(1, Math.floor(speedKmh / 32) + 1));
      this.state.rpm = this.rpmInternal;
      this.state.gear = gear;
      this.state.speedKmh = speedKmh;
      // position/velocity will be updated in postPhysicsUpdate
      return;
    }

    // Fallback kinematic (same as Phase 0)
    const mass = this.config.mass;
    const maxSteer = this.config.steerMax;
    const speed = this.vel.length() * 3.6;

    const speedFactor = clamp(1 - (speed / 220) * this.config.steerSpeedFalloff, 0.25, 1);
    const targetSteer = input.steer * maxSteer * speedFactor * this.tuning.steerScale;
    this.steeringAngle = lerp(this.steeringAngle, targetSteer, dt * 6);

    let accel = 0;
    if (input.throttle > 0) {
      const speed01 = clamp(speed / this.config.maxSpeedKmh, 0, 1);
      const engineCurve = 1 - speed01 * 0.7;
      accel = (this.config.engineForce / mass) * input.throttle * engineCurve * this.tuning.engineScale;
    }
    if (input.brake > 0) {
      const brakeDecel = (this.config.brakeForce / mass) * input.brake;
      accel -= brakeDecel;
      if (speed < 2 && input.brake > 0.5) accel = -6 * input.brake;
    }
    if (input.handbrake) {
      accel -= 5;
      this.heading += this.steeringAngle * dt * 1.4 * clamp(speed / 30, 0, 1);
    }

    const drag = 0.45 + speed * 0.006;
    const forward = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
    let forwardSpeed = this.vel.dot(forward);
    forwardSpeed += accel * dt;
    forwardSpeed -= drag * forwardSpeed * dt * 0.8;
    const lateral = this.vel.clone().sub(forward.clone().multiplyScalar(forwardSpeed));
    const grip = input.handbrake ? 0.85 : 0.96 * this.tuning.gripScale;
    lateral.multiplyScalar(1 - clamp(grip * dt * 8, 0, 0.95));
    const newVel = forward.clone().multiplyScalar(forwardSpeed).add(lateral);
    this.vel.copy(newVel);
    const maxMs = this.config.maxSpeedKmh / 3.6;
    if (this.vel.length() > maxMs) this.vel.setLength(maxMs);

    const yawRate = (this.steeringAngle * forwardSpeed) / (this.config.dimensions[0] * 0.9);
    this.heading += yawRate * dt;

    this.group.position.addScaledVector(this.vel, dt);
    this.group.rotation.y = this.heading;
    const lateralG = lateral.length() * 0.05;
    this.group.rotation.z = clamp(-this.steeringAngle * 0.35 - lateralG * Math.sign(this.steeringAngle), -0.35, 0.35);
    this.group.rotation.x = clamp(-accel * 0.02, -0.12, 0.12);

    const wheelSpin = (forwardSpeed / this.config.wheelRadius) * dt;
    this.wheelRotation += wheelSpin;
    this.mesh.wheels.forEach((w, i) => {
      const isFront = i < 2;
      if (isFront) (w as unknown as THREE.Group).rotation.y = this.steeringAngle;
      (w as unknown as THREE.Group).rotation.z += wheelSpin;
    });

    const rpmTarget = 900 + Math.abs(forwardSpeed) * 300 + input.throttle * 3500;
    this.state.rpm = lerp(this.state.rpm, clamp(rpmTarget, 900, this.config.redlineRpm), dt * 5);
    const gear = Math.min(this.config.gearRatios.length, Math.max(1, Math.floor(speed / 35) + 1));
    this.state.gear = gear;
    this.state.speedKmh = Math.abs(forwardSpeed) * 3.6;
    this.state.position.copy(this.group.position);
    this.state.velocity.copy(this.vel);
    this.state.heading = this.heading;
  }

  /** After physics world stepped, call to sync and update state */
  postPhysicsUpdate() {
    if (!this.usePhysics) return;
    this.syncFromPhysics();
    if (!this.rigidBody) return;
    const p = this.rigidBody.translation();
    const v = this.rigidBody.linvel();
    this.state.position.set(p.x, p.y, p.z);
    this.state.velocity.set(v.x, v.y, v.z);
    this.state.heading = this.heading; // updated in sync
    // heading already from sync; also update group's position already
  }

  reset(pos?: THREE.Vector3, heading?: number) {
    const targetPos = pos ?? new THREE.Vector3(0, 0.6, 0);
    const targetHeading = heading ?? 0;
    this.heading = targetHeading;
    this.steeringAngle = 0;
    this.vel.set(0, 0, 0);
    this.state.rpm = 900;
    this.state.speedKmh = 0;
    this.rpmInternal = 900;

    if (this.usePhysics && this.rigidBody) {
      this.rigidBody.setTranslation(targetPos, true);
      this.rigidBody.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetHeading), true);
      this.rigidBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
      this.rigidBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
      this.group.position.copy(targetPos);
      this.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetHeading);
    } else {
      this.group.position.copy(targetPos);
      if (pos) this.group.position.y = 0.4;
      this.group.rotation.set(0, this.heading, 0);
    }
  }

  shiftOrigin(shift: THREE.Vector3) {
    this.group.position.sub(shift);
    this.state.position.sub(shift);
    if (this.rigidBody) {
      const pos = this.rigidBody.translation();
      this.rigidBody.setTranslation({ x: pos.x - shift.x, y: pos.y - shift.y, z: pos.z - shift.z }, true);
    }
  }

  getPosition(): THREE.Vector3 { return this.group.position; }

  applyTuning(key: 'engineScale' | 'gripScale' | 'steerScale', value: number) {
    this.tuning[key] = value;
  }

  dispose() {
    if (this.controller) {
      try { this.controller.free(); } catch {}
      this.controller = null;
    }
    if (this.rigidBody && this.physicsWorld?.world) {
      try { this.physicsWorld.world.removeRigidBody(this.rigidBody); } catch {}
      this.rigidBody = null;
    }
  }
}

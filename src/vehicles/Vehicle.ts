import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleConfig } from './VehicleConfig';
import { WHEEL_RAY_GROUPS, VEHICLE_GROUPS, type PhysicsWorld } from '../physics/PhysicsWorld';
import { clamp, clamp01, lerp } from '../utils/math';

/**
 * Live tuning values.
 *
 * The developer panel (key T) writes into this object so the handling can be
 * tuned while driving, without restarting the game.
 */
export interface VehicleTuning {
  /** Multiplier on the engine force. */
  engine: number;
  /** Multiplier on the steering angle. */
  steer: number;
  /** Multiplier on the tyre grip (also used by the rain effect). */
  grip: number;
  /** Multiplier on the downforce. */
  downforce: number;
  /** Multiplier on the brake force. */
  brake: number;
  /** 0..1 how much the stability assist damps the yaw. */
  stability: number;
}

export function defaultTuning(config: VehicleConfig): VehicleTuning {
  return {
    engine: 1,
    steer: 1,
    grip: 1,
    downforce: 1,
    brake: 1,
    stability: config.stabilityAssist,
  };
}

const FORWARD = new THREE.Vector3(0, 0, 1);

/** How fast the car may drive backwards (about 29 km/h). */
const MAX_REVERSE_MS = 8;

/**
 * A drivable car.
 *
 * The same class is used for the player, the AI traffic and the race rivals -
 * only the controller that feeds it with inputs differs. That keeps the
 * handling identical everywhere (and keeps the future multiplayer code simple).
 *
 * Conventions (important!):
 * - The car faces local +Z, up is local +Y.
 * - Every wheel uses the axle direction (-1, 0, 0). Rapier derives the
 *   rolling direction from the axle (`normal x axle`), so a mixed axle sign
 *   makes the left and right wheels fight each other.
 * - Rapier's steering angle turns the car to the LEFT for positive values,
 *   so the steering value is negated when it is handed to Rapier.
 */
export class Vehicle {
  readonly config: VehicleConfig;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly tuning: VehicleTuning;

  /** Visual root - moved to follow the rigid body. */
  readonly object: THREE.Group;

  private readonly wheels: THREE.Object3D[] = [];

  // --- input state (set by the controller) ---
  private throttle = 0;
  private brake = 0;
  private steerInput = 0;
  private handbrake = false;

  // --- drivetrain state ---
  private gear = 1;
  private rpm = 900;
  private shiftingTimer = 0;

  // --- cached telemetry ---
  private speedMs = 0;
  /** Signed speed along the car's forward axis (m/s). */
  private forwardSpeedValue = 0;
  private slipAmount = 0;
  private airborne = false;

  /** Steering angle used for the front wheels (radians, + = right). */
  private steerAngle = 0;

  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpVec2 = new THREE.Vector3();

  /** Multiplier applied to the tyre grip (rain makes the roads slippery). */
  gripMultiplier = 1;

  /**
   * When false the gearbox never engages the reverse gear.
   *
   * The AI cars brake a lot (for red lights and for the car in front) and
   * would otherwise roll backwards, so they keep the forward gear.
   */
  allowReverse = true;

  constructor(
    physics: PhysicsWorld,
    config: VehicleConfig,
    mesh: THREE.Group,
    collisionGroups = VEHICLE_GROUPS,
  ) {
    this.config = config;
    this.tuning = defaultTuning(config);
    this.object = mesh;

    const [width, height, length] = config.dimensions;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfLength = length / 2;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 2, 0)
      .setLinearDamping(0.02)
      .setAngularDamping(0.45)
      .setCcdEnabled(true);
    this.body = physics.world.createRigidBody(bodyDesc);

    // The mass properties are set explicitly instead of letting Rapier
    // derive them from the collider volume: the car needs the mass from the
    // config and a centre of mass that sits low (otherwise it tips over in
    // every corner).
    const rideHeight = config.groundClearance + halfHeight;
    const comOffsetY = config.centerOfMassY - rideHeight;
    // Box inertia approximation (about the centre of mass).
    const inertiaX = (config.mass / 12) * (height * height + length * length);
    const inertiaY = (config.mass / 12) * (width * width + length * length);
    const inertiaZ = (config.mass / 12) * (width * width + height * height);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength)
      .setFriction(0.4)
      .setRestitution(0.12)
      .setMassProperties(
        config.mass,
        { x: 0, y: comOffsetY, z: 0 },
        { x: inertiaX, y: inertiaY, z: inertiaZ },
        { x: 0, y: 0, z: 0, w: 1 },
      )
      .setCollisionGroups(collisionGroups);
    this.collider = physics.world.createCollider(colliderDesc, this.body);

    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1; // local +Y is up
    this.controller.setIndexForwardAxis = 2; // local +Z is forward

    // --- wheels ---
    // Ride height maths: Rapier's suspension force is
    //   stiffness * (restLength - currentLength) * chassisMass
    // so the static compression is g / (4 * stiffness) and is independent of
    // the car mass. The connection point is placed so the car ends up with
    // the wanted ground clearance.
    const staticCompression = 9.81 / (4 * config.suspension.stiffness);
    const wheelCentreY = config.wheelRadius - rideHeight;
    const connectionY = wheelCentreY + config.suspension.restLength - staticCompression;

    const down = { x: 0, y: -1, z: 0 };
    // All axles point the same way so every wheel rolls the same direction.
    const axle = { x: -1, y: 0, z: 0 };

    const wheelPositions: [number, number][] = [
      [config.frontAxleOffset, config.trackWidth],
      [config.frontAxleOffset, -config.trackWidth],
      [config.rearAxleOffset, config.trackWidth],
      [config.rearAxleOffset, -config.trackWidth],
    ];

    for (const [z, x] of wheelPositions) {
      this.controller.addWheel(
        { x, y: connectionY, z },
        down,
        axle,
        config.suspension.restLength,
        config.wheelRadius,
      );
    }

    for (let i = 0; i < this.controller.numWheels(); i++) {
      const isFront = i < 2;
      this.controller.setWheelSuspensionStiffness(i, config.suspension.stiffness);
      this.controller.setWheelSuspensionCompression(i, config.suspension.damping);
      this.controller.setWheelSuspensionRelaxation(i, config.suspension.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, config.suspension.travel);
      this.controller.setWheelMaxSuspensionForce(i, config.suspension.maxForce);
      this.controller.setWheelFrictionSlip(
        i,
        isFront ? config.friction.front : config.friction.rear,
      );
      this.controller.setWheelSideFrictionStiffness(i, 1);
    }
  }

  /** Register the visual wheel objects so they can be animated. */
  setWheelMeshes(wheels: THREE.Object3D[]): void {
    this.wheels.length = 0;
    for (const w of wheels) this.wheels.push(w);
  }

  /** Signed speed along the car's forward axis in m/s (negative when reversing). */
  get forwardSpeed(): number {
    return this.forwardSpeedValue;
  }

  /** Absolute speed in m/s. */
  get speed(): number {
    return this.speedMs;
  }

  get speedKmh(): number {
    return Math.abs(this.forwardSpeedValue) * 3.6;
  }

  get currentGear(): number {
    return this.gear;
  }

  get currentRpm(): number {
    return this.rpm;
  }

  /** 0..1 of the redline. */
  get rpmRatio(): number {
    return clamp01((this.rpm - this.config.idleRpm) / (this.config.redlineRpm - this.config.idleRpm));
  }

  /** How much the tyres are sliding (0 = gripping, 1 = full drift). */
  get slip(): number {
    return this.slipAmount;
  }

  /** The throttle the controller asked for (0..1). */
  get inputThrottle(): number {
    return this.throttle;
  }

  /** The brake the controller asked for (0..1). */
  get inputBrake(): number {
    return this.brake;
  }

  /** The steering the controller asked for (-1..1). */
  get inputSteer(): number {
    return this.steerInput;
  }

  /** The height of the car body above the ground (the ride height). */
  get rideHeight(): number {
    return this.config.groundClearance;
  }

  get isAirborne(): boolean {
    return this.airborne;
  }

  /** Feed the vehicle with control inputs. Called once per simulation step. */
  setControls(throttle: number, brake: number, steer: number, handbrake: boolean): void {
    this.throttle = clamp01(throttle);
    this.brake = clamp01(brake);
    this.steerInput = clamp(steer, -1, 1);
    this.handbrake = handbrake;
  }

  /**
   * Prepare the wheel forces. Must be called *before* `world.step()`.
   */
  prepareStep(dt: number): void {
    const cfg = this.config;
    const maxSpeedMs = cfg.maxSpeedKmh / 3.6;

    // --- steering: speed sensitive ---
    const speedFactor = clamp01(Math.abs(this.forwardSpeedValue) / maxSpeedMs);
    const falloff = lerp(1, cfg.steerSpeedFalloff, speedFactor);
    const targetAngle = this.steerInput * cfg.steerMax * falloff * this.tuning.steer;
    // Move towards the target angle at a limited rate so the wheel does not
    // snap from side to side (this is what makes the car feel smooth).
    const rate = cfg.steerSpeed * dt * (this.handbrake ? 1.6 : 1);
    this.steerAngle += clamp(targetAngle - this.steerAngle, -rate, rate);

    // --- gearbox / reverse ---
    // The reverse gear is engaged when the car is stopped and the brake is
    // held. It stays engaged until the player asks for the forward gear
    // again - otherwise the car would leave the reverse gear as soon as it
    // started to roll backwards (that capped the reverse at 3 km/h).
    const nearlyStopped = Math.abs(this.forwardSpeedValue) < 0.8;
    if (this.allowReverse) {
      if (this.gear < 0) {
        if (this.throttle > 0.05) this.gear = 1;
      } else if (nearlyStopped && this.brake > 0.05 && this.throttle < 0.05) {
        this.gear = -1;
      }
    } else if (this.gear < 0) {
      this.gear = 1;
    }
    const reversing = this.gear < 0;

    // --- engine and brakes ---
    let engineForce = 0;
    let brakeForce = 0;

    if (reversing) {
      // The brake key becomes the reverse accelerator.
      engineForce = -this.brake * cfg.engineForce * this.tuning.engine * 0.6;
      // The reverse gear has a speed limit of its own.
      const reverseSpeed = Math.max(0, -this.forwardSpeedValue);
      if (reverseSpeed >= MAX_REVERSE_MS) engineForce = 0;
      // The brake was released while the car was rolling backwards: slow it
      // down instead of letting it roll away.
      if (this.brake <= 0.02) {
        brakeForce = cfg.brakeForce * this.tuning.brake * 0.5;
      }
    } else if (this.brake > 0.02) {
      // Braking wins over the throttle (and Rapier ignores the brake on a
      // wheel that also has an engine force).
      brakeForce = this.brake * cfg.brakeForce * this.tuning.brake;
    } else {
      engineForce = this.throttle * cfg.engineForce * this.tuning.engine;
      if (this.forwardSpeedValue >= maxSpeedMs) engineForce = 0;
    }

    // Torque falls off towards the top speed so the gearbox feels natural.
    if (engineForce !== 0) {
      const torqueCurve = 1 - 0.4 * speedFactor;
      engineForce *= torqueCurve;
      // Anti bottom-out: when the suspension is almost fully compressed the
      // drive force is reduced. Without this the car squats onto its body
      // panel under hard acceleration and gets stuck there.
      engineForce *= this.squatFactor();
    }

    // --- aerodynamic drag ---
    // Without this the car would accelerate forever; the drag balances the
    // engine at the top speed.
    if (cfg.drag > 0) {
      const v = this.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 0.5) {
        const force = 0.43 * cfg.drag * speed * speed;
        const k = (-force * dt) / speed;
        this.body.applyImpulse({ x: v.x * k, y: 0, z: v.z * k }, true);
      }
    }

    // --- downforce ---
    // NOTE: Rapier keeps user forces until they are reset, so we use an
    // impulse here (which is applied once) instead of addForce (which would
    // pile up every frame).
    if (cfg.downforce > 0) {
      const df =
        cfg.downforce * this.tuning.downforce * (this.forwardSpeedValue * this.forwardSpeedValue) * 0.008;
      this.body.applyImpulse({ x: 0, y: -df * dt, z: 0 }, true);
    }

    // --- write the wheel state ---
    const grip = this.gripMultiplier * this.tuning.grip;
    for (let i = 0; i < this.controller.numWheels(); i++) {
      const isFront = i < 2;

      if (isFront) {
        // Rapier steers to the left for positive angles - negate it so a
        // positive input means "steer right".
        this.controller.setWheelSteering(i, -this.steerAngle);
      } else {
        this.controller.setWheelSteering(i, 0);
      }

      // Rear wheel drive.
      this.controller.setWheelEngineForce(i, isFront ? 0 : engineForce);

      // Brake impulse (Rapier expects an impulse, not a force).
      let wheelBrake = brakeForce * dt;
      if (!isFront && this.handbrake) {
        wheelBrake = Math.max(wheelBrake, cfg.brakeForce * 0.35 * dt);
      }
      this.controller.setWheelBrake(i, wheelBrake);

      // Tyre grip.
      const baseSlip = isFront ? cfg.friction.front : cfg.friction.rear;
      let slip = baseSlip * grip;
      if (!isFront && this.handbrake) {
        slip *= 1 - cfg.friction.driftSlip;
      }
      this.controller.setWheelFrictionSlip(i, slip);
    }
  }

  /**
   * 1 = the suspension is free, 0 = fully compressed (the car is squatting
   * on its body panel). Used to soften the engine when the car bottoms out.
   */
  private squatFactor(): number {
    const cfg = this.config;
    const numWheels = this.controller.numWheels();
    if (numWheels === 0) return 1;
    let compressed = 0;
    for (let i = 0; i < numWheels; i++) {
      const length = this.controller.wheelSuspensionLength(i) ?? cfg.suspension.restLength;
      const delta = (cfg.suspension.restLength - length) / Math.max(0.01, cfg.suspension.travel);
      compressed = Math.max(compressed, Math.min(1, delta));
    }
    // Start easing off at 65% of the travel, fully off at 95%.
    return clamp01(1 - (compressed - 0.65) / 0.3);
  }

  /** Read the simulation state after `world.step()`. */
  update(dt: number): void {
    const lin = this.body.linvel();
    this.speedMs = Math.hypot(lin.x, lin.y, lin.z);

    const rot = this.body.rotation();
    this.tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    // Forward speed = dot(velocity, forward axis of the chassis).
    this.tmpVec.copy(FORWARD).applyQuaternion(this.tmpQuat);
    this.forwardSpeedValue = lin.x * this.tmpVec.x + lin.y * this.tmpVec.y + lin.z * this.tmpVec.z;

    this.updateDrivetrain(dt);
    this.applyStabilityAssist(dt);
    this.syncVisual();
  }

  /** The fake automatic gearbox: keeps the engine in the right gear. */
  private updateDrivetrain(dt: number): void {
    const cfg = this.config;
    if (this.shiftingTimer > 0) {
      this.shiftingTimer -= dt;
    }

    const wheelRps = Math.abs(this.forwardSpeedValue) / (2 * Math.PI * cfg.wheelRadius);
    const gearIndex = this.gear > 0 ? Math.min(this.gear, cfg.gearRatios.length) - 1 : 0;
    const ratio = cfg.gearRatios[gearIndex] * cfg.finalDrive;
    const targetRpm = wheelRps * ratio * 60;

    const minRpm = cfg.idleRpm + (cfg.redlineRpm - cfg.idleRpm) * 0.15;

    if (this.gear > 0) {
      if (targetRpm > cfg.redlineRpm * 0.93 && this.gear < cfg.gearRatios.length && this.shiftingTimer <= 0) {
        this.gear++;
        this.shiftingTimer = 0.22;
      } else if (targetRpm < minRpm && this.gear > 1 && this.shiftingTimer <= 0) {
        this.gear--;
        this.shiftingTimer = 0.22;
      }
    }

    // Blend towards the target RPM so the needle does not jump.
    const rpmTarget = clamp(
      Math.max(targetRpm, cfg.idleRpm + this.throttle * (cfg.redlineRpm - cfg.idleRpm) * 0.2),
      cfg.idleRpm,
      cfg.redlineRpm,
    );
    this.rpm = lerp(this.rpm, rpmTarget, Math.min(1, dt * 9));
  }

  /**
   * Arcade assists:
   * - stability: damps excessive yaw so the car does not spin like a top
   * - anti roll: pushes the chassis back level
   * - air control: small torques while the wheels are off the ground
   */
  private applyStabilityAssist(dt: number): void {
    const assist = this.tuning.stability * clamp01(this.speedMs / 8);
    if (assist > 0.001) {
      const angvel = this.body.angvel();
      // Yaw is the Y component of the angular velocity.
      // Torque impulses are applied once; addTorque would accumulate.
      const strength = assist * 260 * Math.min(1, dt * 60) * dt;
      this.body.applyTorqueImpulse({ x: 0, y: -angvel.y * strength, z: 0 }, true);
    }

    // Anti roll bar: compare the left and right suspension lengths.
    if (this.controller.numWheels() >= 4) {
      const fl = this.controller.wheelSuspensionLength(0) ?? 0;
      const fr = this.controller.wheelSuspensionLength(1) ?? 0;
      const rl = this.controller.wheelSuspensionLength(2) ?? 0;
      const rr = this.controller.wheelSuspensionLength(3) ?? 0;
      const diff = (fl + rl) * 0.5 - (fr + rr) * 0.5;
      if (Math.abs(diff) > 1e-4) {
        // Torque around the forward axis (Z) to level the car.
        const angvel = this.body.angvel();
        this.body.applyTorqueImpulse(
          { x: 0, y: 0, z: (-diff * 900 - angvel.z * 120) * dt },
          true,
        );
      }
    }

    // Air control: allow a little steering input while airborne.
    let contactCount = 0;
    for (let i = 0; i < this.controller.numWheels(); i++) {
      if (this.controller.wheelIsInContact(i)) contactCount++;
    }
    this.airborne = contactCount === 0;
    if (this.airborne && this.speedMs < 30) {
      this.body.applyTorqueImpulse({ x: 0, y: -this.steerInput * 40 * dt, z: 0 }, true);
    }

    // Slip detection for the skid sound and the drift particles.
    const sideImpulse = this.controller.wheelSideImpulse(2) ?? 0;
    const forwardImpulse = this.controller.wheelForwardImpulse(2) ?? 0;
    const ref = Math.max(1, Math.abs(this.forwardSpeedValue) * 40);
    this.slipAmount = clamp01(Math.abs(sideImpulse) / ref);
    if (Math.abs(forwardImpulse) / Math.max(1, Math.abs(this.forwardSpeedValue) * 30) > 0.05) {
      this.slipAmount = Math.max(this.slipAmount, 0.35);
    }
  }

  /** Copy the physics state onto the visual mesh. */
  syncVisual(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.object.position.set(t.x, t.y, t.z);
    this.object.quaternion.set(r.x, r.y, r.z, r.w);

    if (this.wheels.length === 0) return;

    const quat = this.tmpQuat.set(r.x, r.y, r.z, r.w);
    const down = this.tmpVec2.set(0, -1, 0).applyQuaternion(quat);

    for (let i = 0; i < this.wheels.length; i++) {
      const mesh = this.wheels[i];
      const hard = this.controller.wheelHardPoint(i);
      const len = this.controller.wheelSuspensionLength(i) ?? 0;
      if (!hard) continue;
      mesh.position.set(hard.x + down.x * len, hard.y + down.y * len, hard.z + down.z * len);
      // The wheel spins around its local X axis.
      mesh.rotation.x = this.controller.wheelRotation(i) ?? 0;
      // Front wheels also follow the steering angle.
      if (i < 2) {
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = -this.steerAngle;
      }
    }
  }

  /** Put the car back on the ground at the given position, upright. */
  /**
   * The direction the car is pointing at (0 = +Z, growing clockwise).
   * The minimap uses it to rotate the map.
   */
  get heading(): number {
    // Rotate the local forward vector (+Z) with the car quaternion.
    const rotation = this.body.rotation();
    this.tmpQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.tmpVec.set(0, 0, 1).applyQuaternion(this.tmpQuat);
    return Math.atan2(this.tmpVec.x, this.tmpVec.z);
  }

  /**
   * Hold the car at a fixed height.
   *
   * It is used while the terrain under the car is still streaming in: the
   * car keeps its place instead of falling through the world.
   */
  holdAt(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  resetTo(x: number, y: number, z: number, heading = 0): void {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0));
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.gear = 1;
    this.rpm = this.config.idleRpm;
    this.steerAngle = 0;
  }

  /**
   * Run the ray-cast vehicle update. Must be called *before* `world.step()`.
   */
  applyPhysics(dt: number): void {
    this.controller.updateVehicle(dt, undefined, WHEEL_RAY_GROUPS);
  }

  /** Remove the vehicle from the physics world. */
  dispose(physics: PhysicsWorld): void {
    physics.world.removeVehicleController(this.controller);
    physics.removeBody(this.body);
  }
}

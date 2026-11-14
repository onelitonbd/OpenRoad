// Vehicle.ts — raycast vehicle wrapper placeholder for Phase 1 (real physics in Phase 1 step)
// Phase 0: provides a simple kinematic car that can be driven without Rapier yet,
// but struct matches future Vehicle API so other systems can depend on it.

import * as THREE from 'three';
import type { VehicleConfig } from './VehicleConfig';
import { CarFactory, type CarMesh } from './CarFactory';
import { clamp, lerp } from '../utils/math';

export interface VehicleState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number; // radians Y
  speedKmh: number;
  rpm: number;
  gear: number;
}

export class Vehicle {
  config: VehicleConfig;
  mesh: CarMesh;
  group: THREE.Group; // alias to mesh.root
  state: VehicleState;

  // Simple kinematic model for Phase 0/1 before full Rapier
  private vel = new THREE.Vector3();
  private heading = 0;
  private steeringAngle = 0;
  private wheelRotation = 0;

  constructor(config: VehicleConfig) {
    this.config = config;
    this.mesh = CarFactory.createProcedural(config.color, config.dimensions);
    this.group = this.mesh.root;
    this.group.position.set(0, 0.34, 0); // sit on ground
    this.state = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      heading: 0,
      speedKmh: 0,
      rpm: 900,
      gear: 1,
    };
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.group);
  }

  // Arcade kinematic update — will be replaced by Rapier in Phase 1 full
  update(dt: number, input: { throttle: number; brake: number; steer: number; handbrake: boolean }) {
    // Simple bicycle model
    const mass = this.config.mass;
    const maxSteer = this.config.steerMax;
    const speed = this.vel.length() * 3.6; // m/s to km/h

    // Speed-sensitive steering
    const speedFactor = clamp(1 - (speed / 220) * this.config.steerSpeedFalloff, 0.25, 1);
    const targetSteer = input.steer * maxSteer * speedFactor;
    this.steeringAngle = lerp(this.steeringAngle, targetSteer, dt * 6);

    // Engine force
    let accel = 0;
    if (input.throttle > 0) {
      // engine curve: less force at high speed
      const speed01 = clamp(speed / this.config.maxSpeedKmh, 0, 1);
      const engineCurve = 1 - speed01 * 0.7;
      accel = (this.config.engineForce / mass) * input.throttle * engineCurve;
    }
    if (input.brake > 0) {
      const brakeDecel = (this.config.brakeForce / mass) * input.brake;
      accel -= brakeDecel;
      // auto reverse if almost stopped and holding brake
      if (speed < 2 && input.brake > 0.5) accel = -6 * input.brake;
    }

    // Handbrake reduces rear grip conceptually and adds decel
    if (input.handbrake) {
      accel -= 5;
      // loosen rear: more yaw change
      this.heading += this.steeringAngle * dt * 1.4 * clamp(speed / 30, 0, 1);
    }

    // Drag & rolling resistance
    const drag = 0.45 + speed * 0.006;
    const velDir = this.vel.length() > 0.1 ? this.vel.clone().normalize() : new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
    const forward = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
    // Project velocity onto forward
    let forwardSpeed = this.vel.dot(forward);

    // Apply accel along forward
    forwardSpeed += accel * dt;
    // Apply drag
    forwardSpeed -= drag * forwardSpeed * dt * 0.8;
    // Lateral damping (grip)
    const lateral = this.vel.clone().sub(forward.clone().multiplyScalar(forwardSpeed));
    const grip = input.handbrake ? 0.85 : 0.96;
    lateral.multiplyScalar(1 - clamp(grip * dt * 8, 0, 0.95));
    // Compose new velocity
    const newVel = forward.clone().multiplyScalar(forwardSpeed).add(lateral);
    // Downforce effect (more grip at speed) simplified as less lateral already
    this.vel.copy(newVel);
    // Cap max speed
    const maxMs = this.config.maxSpeedKmh / 3.6;
    if (this.vel.length() > maxMs) this.vel.setLength(maxMs);

    // Heading change from steering and speed
    const yawRate = (this.steeringAngle * forwardSpeed) / (this.config.dimensions[0] * 0.9);
    this.heading += yawRate * dt;
    // Simple stability assist
    if (!input.handbrake) {
      // auto counter-steer a bit when sliding
    }

    // Update position
    this.group.position.addScaledVector(this.vel, dt);
    this.group.rotation.y = this.heading;

    // Body roll/pitch visual
    const lateralG = lateral.length() * 0.05;
    this.group.rotation.z = clamp(-this.steeringAngle * 0.35 - lateralG * Math.sign(this.steeringAngle), -0.35, 0.35);
    this.group.rotation.x = clamp(-accel * 0.02, -0.12, 0.12);

    // Wheels: steer front, rotate all
    const wheelSpin = (forwardSpeed / this.config.wheelRadius) * dt;
    this.wheelRotation += wheelSpin;
    this.mesh.wheels.forEach((w, i) => {
      // w is actually Group
      const isFront = i < 2;
      if (isFront) w.rotation.y = this.steeringAngle;
      // spin around X (need to rotate child meshes)
      // Our wheel group contains tire+rim, rotation Z is spin due to cylinder orientation
      w.rotation.z += wheelSpin;
    });

    // RPM & gear (automatic)
    const rpmTarget = 900 + Math.abs(forwardSpeed) * 300 + input.throttle * 3500;
    this.state.rpm = lerp(this.state.rpm, clamp(rpmTarget, 900, this.config.redlineRpm), dt * 5);
    const gear = Math.min(this.config.gearRatios.length, Math.max(1, Math.floor(speed / 35) + 1));
    this.state.gear = gear;
    this.state.speedKmh = Math.abs(forwardSpeed) * 3.6;
    this.state.position.copy(this.group.position);
    this.state.velocity.copy(this.vel);
    this.state.heading = this.heading;
  }

  reset(pos?: THREE.Vector3, heading?: number) {
    if (pos) this.group.position.copy(pos);
    if (heading !== undefined) this.heading = heading;
    this.group.rotation.set(0, this.heading, 0);
    this.vel.set(0,0,0);
    this.state.rpm = 900;
    this.state.speedKmh = 0;
  }

  getPosition(): THREE.Vector3 { return this.group.position; }
  dispose() {
    // geometries disposed by scene cleanup
  }
}

import * as THREE from 'three';
import type { Vehicle } from './Vehicle';
import { clamp, damp, lerp } from '../utils/math';

export type CameraMode = 'chase' | 'farChase' | 'hood' | 'cockpit';

export const CAMERA_MODES: CameraMode[] = ['chase', 'farChase', 'hood', 'cockpit'];

interface CameraSpec {
  /** Offset from the car in local space. */
  offset: THREE.Vector3;
  /** How quickly the camera catches up (higher = snappier). */
  follow: number;
  /** Base field of view in degrees. */
  fov: number;
  /** How much the FOV grows with speed. */
  fovSpeed: number;
  /** Camera shake amount at top speed. */
  shake: number;
}

/**
 * Camera rig with several modes.
 *
 * The chase camera is the important one: it looks at a point slightly above
 * the car, lags behind with a spring and widens the FOV with speed, which is
 * what gives the arcade feel.
 */
export class CameraRig {
  mode: CameraMode = 'chase';
  readonly camera: THREE.PerspectiveCamera;

  private readonly specs: Record<CameraMode, CameraSpec>;
  private readonly currentOffset = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private shakeTime = 0;

  /** Set to true while the photo mode drives the camera manually. */
  manual = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 3000);

    this.specs = {
      chase: {
        offset: new THREE.Vector3(0, 2.5, -7.4),
        follow: 7.5,
        fov: 62,
        fovSpeed: 16,
        shake: 0.05,
      },
      farChase: {
        offset: new THREE.Vector3(0, 4.2, -12.5),
        follow: 5.0,
        fov: 58,
        fovSpeed: 14,
        shake: 0.06,
      },
      hood: {
        offset: new THREE.Vector3(0, 1.15, 0.55),
        follow: 22,
        fov: 70,
        fovSpeed: 12,
        shake: 0.09,
      },
      cockpit: {
        offset: new THREE.Vector3(-0.36, 0.86, 0.18),
        follow: 26,
        fov: 72,
        fovSpeed: 12,
        shake: 0.1,
      },
    };
  }

  /** Cycle to the next camera mode. */
  cycle(): CameraMode {
    const index = CAMERA_MODES.indexOf(this.mode);
    this.mode = CAMERA_MODES[(index + 1) % CAMERA_MODES.length];
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** Follow the car. */
  update(vehicle: Vehicle, dt: number, terrainHeightAt?: (x: number, z: number) => number): void {
    if (this.manual) return;

    const spec = this.specs[this.mode];
    const speed = vehicle.speed;

    // --- position ---
    const rot = vehicle.body.rotation();
    this.tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    this.tmpVec.copy(spec.offset).applyQuaternion(this.tmpQuat);
    const bodyPos = vehicle.body.translation();
    this.desiredPosition.set(bodyPos.x + this.tmpVec.x, bodyPos.y + this.tmpVec.y, bodyPos.z + this.tmpVec.z);

    // Never let the camera sink into the ground.
    if (terrainHeightAt) {
      const ground = terrainHeightAt(this.desiredPosition.x, this.desiredPosition.z);
      this.desiredPosition.y = Math.max(this.desiredPosition.y, ground + 0.6);
    }

    const follow = spec.follow;
    this.currentOffset.x = damp(this.currentOffset.x, this.desiredPosition.x, follow, dt);
    this.currentOffset.y = damp(this.currentOffset.y, this.desiredPosition.y, follow * 1.4, dt);
    this.currentOffset.z = damp(this.currentOffset.z, this.desiredPosition.z, follow, dt);

    // --- look target ---
    if (this.mode === 'hood' || this.mode === 'cockpit') {
      // Look ahead of the car so the horizon stays stable.
      const forward = this.tmpVec.set(0, 0, 1).applyQuaternion(this.tmpQuat).multiplyScalar(12);
      this.lookTarget.set(bodyPos.x + forward.x, bodyPos.y + 1.2, bodyPos.z + forward.z);
    } else {
      const forward = this.tmpVec.set(0, 0, 1).applyQuaternion(this.tmpQuat).multiplyScalar(6);
      this.lookTarget.set(bodyPos.x + forward.x, bodyPos.y + 1.1, bodyPos.z + forward.z);
    }

    this.camera.position.copy(this.currentOffset);
    this.camera.lookAt(this.lookTarget);

    // --- field of view ---
    const speedRatio = clamp(speed / 90, 0, 1);
    const targetFov = spec.fov + speedRatio * spec.fovSpeed;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();

    // --- shake at high speed ---
    if (spec.shake > 0 && speed > 25) {
      this.shakeTime += dt * (6 + speed * 0.1);
      const amount = spec.shake * clamp((speed - 25) / 60, 0, 1);
      this.camera.position.x += Math.sin(this.shakeTime * 3.1) * amount;
      this.camera.position.y += Math.sin(this.shakeTime * 4.7) * amount * 0.6;
    }
  }

  /** Snap the camera straight to the car (used after a reset or a teleport). */
  snapTo(vehicle: Vehicle): void {
    const spec = this.specs[this.mode];
    const rot = vehicle.body.rotation();
    this.tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    const bodyPos = vehicle.body.translation();
    this.tmpVec.copy(spec.offset).applyQuaternion(this.tmpQuat);
    this.currentOffset.set(bodyPos.x + this.tmpVec.x, bodyPos.y + this.tmpVec.y, bodyPos.z + this.tmpVec.z);
    this.camera.position.copy(this.currentOffset);
    this.camera.fov = spec.fov;
    this.camera.updateProjectionMatrix();
  }

  /** Smoothly blend the camera towards an arbitrary position (photo mode). */
  moveTo(position: THREE.Vector3, lookAt: THREE.Vector3, dt: number): void {
    this.camera.position.set(
      damp(this.camera.position.x, position.x, 8, dt),
      damp(this.camera.position.y, position.y, 8, dt),
      damp(this.camera.position.z, position.z, 8, dt),
    );
    this.lookTarget.lerp(lookAt, Math.min(1, dt * 8));
    this.camera.lookAt(this.lookTarget);
  }

  setFov(fov: number): void {
    this.camera.fov = lerp(this.camera.fov, fov, 1);
    this.camera.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

// CameraRig.ts — chase / far chase / hood cameras
import * as THREE from 'three';
import { lerp } from '../utils/math';

export type CameraMode = 'chase' | 'far' | 'hood' | 'cockpit';

export class CameraRig {
  mode: CameraMode = 'chase';
  private modes: CameraMode[] = ['chase', 'far', 'hood', 'cockpit'];
  target: THREE.Object3D | null = null;

  // camera offset params per mode
  private offsets: Record<CameraMode, { dist: number; height: number; lookAtHeight: number; fov: number }> = {
    chase: { dist: 7, height: 2.2, lookAtHeight: 0.9, fov: 70 },
    far: { dist: 13, height: 4, lookAtHeight: 1.0, fov: 65 },
    hood: { dist: 0.4, height: 1.1, lookAtHeight: 0.6, fov: 80 },
    cockpit: { dist: -0.2, height: 1.15, lookAtHeight: 0.8, fov: 85 },
  };

  private currentPos = new THREE.Vector3();
  private desiredPos = new THREE.Vector3();
  private lookAt = new THREE.Vector3();

  attach(target: THREE.Object3D) {
    this.target = target;
    this.currentPos.copy(target.position).add(new THREE.Vector3(0, 3, 8));
  }

  cycle() {
    const idx = this.modes.indexOf(this.mode);
    this.mode = this.modes[(idx + 1) % this.modes.length];
  }

  update(camera: THREE.PerspectiveCamera, dt: number, speedKmh: number) {
    if (!this.target) return;
    const cfg = this.offsets[this.mode];
    // Speed-based FOV
    const speedFactor = Math.min(speedKmh / 180, 1);
    const targetFov = cfg.fov + speedFactor * 8;
    camera.fov = lerp(camera.fov, targetFov, dt * 2);
    camera.updateProjectionMatrix();

    // Desired position: behind car along heading
    const heading = this.target.rotation.y;
    const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).negate();

    // For hood/cockpit, position is near the car
    const dist = cfg.dist;
    const height = cfg.height;
    if (this.mode === 'hood' || this.mode === 'cockpit') {
      this.desiredPos.copy(this.target.position).add(forward.clone().multiplyScalar(dist)).add(new THREE.Vector3(0, height, 0));
      // Look ahead
      this.lookAt.copy(this.target.position).add(forward.clone().multiplyScalar(12 + speedKmh * 0.05)).add(new THREE.Vector3(0, cfg.lookAtHeight, 0));
      // Smooth
      this.currentPos.lerp(this.desiredPos, dt * 10);
    } else {
      // Chase: spring follow with damping
      // Desired behind
      this.desiredPos.copy(this.target.position).sub(forward.clone().multiplyScalar(dist)).add(new THREE.Vector3(0, height, 0));
      // Add a bit of lateral based on velocity? keep simple
      const lerpSpeed = 2.5 + speedFactor * 1.5;
      this.currentPos.lerp(this.desiredPos, dt * lerpSpeed);
      // Add slight shake at high speed
      if (speedKmh > 140) {
        this.currentPos.x += (Math.random() - 0.5) * 0.02 * (speedKmh / 200);
        this.currentPos.y += (Math.random() - 0.5) * 0.015 * (speedKmh / 200);
      }
      this.lookAt.copy(this.target.position).add(forward.clone().multiplyScalar(6 + speedFactor * 4)).add(new THREE.Vector3(0, cfg.lookAtHeight, 0));
    }

    camera.position.copy(this.currentPos);
    camera.lookAt(this.lookAt);
  }
}

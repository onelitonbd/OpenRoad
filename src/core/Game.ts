// Game.ts — main loop with physics-aware vehicle
import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Time } from './Time';
import { Input } from './Input';
import { settings } from './Settings';
import { Vehicle } from '../vehicles/Vehicle';
import { getDefaultCar } from '../vehicles/cars';
import { PlayerController } from '../vehicles/PlayerController';
import { CameraRig } from '../vehicles/CameraRig';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { HUD } from '../ui/HUD';
import { TuningPanel } from '../ui/TuningPanel';

export type GameState = 'loading' | 'menu' | 'play' | 'pause' | 'photo';

export class Game {
  renderer: Renderer;
  time = new Time();
  input = new Input();
  physics = new PhysicsWorld();
  cameraRig = new CameraRig();
  vehicle: Vehicle;
  controller: PlayerController;
  hud: HUD;
  tuning: TuningPanel;

  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private debugEl: HTMLElement | null = null;
  private showDebug = false;
  private fpsSamples: number[] = [];
  private lastFpsUpdate = 0;
  private physicsReady = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.vehicle = new Vehicle(getDefaultCar());
    this.controller = new PlayerController(this.input, this.vehicle);
    this.hud = new HUD();
    this.tuning = new TuningPanel(this.vehicle);

    this.setupScene();
    this.setupDebug();
    this.vehicle.addToScene(this.renderer.scene);
    this.cameraRig.attach(this.vehicle.group);
    this.hud.setQuality(settings.quality);
    this.hud.show();
  }

  private setupScene() {
    const scene = this.renderer.scene;
    const hemi = new THREE.HemisphereLight(0xfffaf0, 0x444466, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff4e6, 1.2);
    dir.position.set(50, 80, 40);
    dir.castShadow = !!settings.preset.shadows;
    if (dir.castShadow) {
      dir.shadow.mapSize.set(1024, 1024);
      dir.shadow.camera.near = 1;
      dir.shadow.camera.far = 300;
      dir.shadow.camera.left = -80;
      dir.shadow.camera.right = 80;
      dir.shadow.camera.top = 80;
      dir.shadow.camera.bottom = -80;
    }
    scene.add(dir);
    scene.fog = new THREE.Fog('#cfe8ff', 120, 600);

    const groundGeo = new THREE.PlaneGeometry(4000, 4000);
    const groundMat = new THREE.MeshStandardMaterial({ color: '#7ec96a', roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(4000, 80, '#ffffff', '#e0e0e0');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.12;
    scene.add(grid);
  }

  private setupDebug() {
    this.debugEl = document.getElementById('debug-overlay');
    if (!this.debugEl) {
      const el = document.createElement('div');
      el.id = 'debug-overlay';
      el.className = 'debug-overlay hidden';
      document.body.appendChild(el);
      this.debugEl = el;
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.showDebug = !this.showDebug;
        this.debugEl?.classList.toggle('hidden', !this.showDebug);
      }
    });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.physics.init().then(() => {
      this.physicsReady = true;
      // Enable physics on vehicle once world ready
      this.vehicle.enablePhysics(this.physics);
      this.hud.showMessage('Physics ready — Rapier vehicle active', 1800);
    }).catch(err => console.error('Physics init failed', err));
    this.lastTime = performance.now();
    this.loop(this.lastTime);
    this.hideLoading();
  }

  private hideLoading() {
    const el = document.getElementById('loading-screen');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }
    setTimeout(() => {
      const hint = document.getElementById('controls-hint');
      if (hint) hint.classList.add('fade-out');
    }, 6000);
  }

  private loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    const dtMs = now - this.lastTime;
    this.lastTime = now;
    const dt = dtMs / 1000;
    const steps = this.time.step(dt);
    for (let i = 0; i < steps; i++) {
      this.fixedUpdate(Time.FIXED_DT);
    }
    this.update(dt);
    this.renderer.render();
    this.updateDebug(dt);
  };

  private fixedUpdate(dt: number) {
    // Player input → vehicle (sets engine/steer for physics, or kinematic integration)
    this.controller.update(dt);

    // If physics ready, need to handle vehicle controller updates
    if (this.physicsReady && (this.vehicle as unknown as { controller: unknown }).controller) {
      // Vehicle controller already has forces set in Vehicle.update; now updateVehicle before world step
      // We need to call controller.updateVehicle
      const ctrl = (this.vehicle as unknown as { controller: { updateVehicle: (dt:number)=>void } }).controller;
      if (ctrl) ctrl.updateVehicle(dt);
    }

    // Step physics
    this.physics.step(dt);

    // After physics, sync vehicle mesh from body
    this.vehicle.postPhysicsUpdate();

    // Bounds
    const p = this.vehicle.group.position;
    const limit = 1800;
    if (Math.abs(p.x) > limit || Math.abs(p.z) > limit) {
      this.hud.showMessage('Turn back — world edge', 2000);
      const dir = new THREE.Vector3().copy(p).normalize().multiplyScalar(-1);
      p.addScaledVector(dir, 2);
      if (this.physicsReady) this.vehicle.reset(new THREE.Vector3(p.x, 0.6, p.z));
    }

    if (this.input.consumeCameraCycle()) {
      this.cameraRig.cycle();
      this.hud.showMessage(`Camera: ${this.cameraRig.mode}`, 1200);
    }
    if (this.input.consumeReset()) {
      const pos = this.findNearestRoadSpawn(p);
      this.vehicle.reset(pos, 0);
      this.hud.showMessage('Car reset', 1000);
    }
  }

  private findNearestRoadSpawn(_pos: THREE.Vector3): THREE.Vector3 {
    // Phase 1: just origin flat ground; future: query RoadNetwork
    return new THREE.Vector3(0, 0.6, 0);
  }

  private update(dt: number) {
    this.cameraRig.update(this.renderer.camera, dt, this.vehicle.state.speedKmh);
    this.hud.update(this.vehicle.state, dt);
    this.tuning.update();
  }

  private updateDebug(dt: number) {
    if (!this.showDebug || !this.debugEl) return;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    const now = performance.now();
    if (now - this.lastFpsUpdate < 250) return;
    this.lastFpsUpdate = now;
    const avgFps = this.fpsSamples.reduce((a,b)=>a+b,0)/this.fpsSamples.length;
    const info = this.renderer.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const phys = this.physicsReady ? 'Rapier' : 'Kinematic';
    this.debugEl.innerHTML = `
      <div><b>DEBUG</b> (F3) • Tuning: T</div>
      <div>FPS: ${avgFps.toFixed(1)} | ${phys}</div>
      <div>Draw calls: ${info.render.calls} | Tris: ${info.render.triangles.toLocaleString()}</div>
      <div>Textures: ${info.memory.textures} | Geoms: ${info.memory.geometries}</div>
      <div>Pos: ${this.vehicle.group.position.x.toFixed(1)}, ${this.vehicle.group.position.z.toFixed(1)} | Y: ${this.vehicle.group.position.y.toFixed(2)}</div>
      <div>Speed: ${this.vehicle.state.speedKmh.toFixed(0)} km/h | RPM: ${this.vehicle.state.rpm.toFixed(0)} | Gear: ${this.vehicle.state.gear}</div>
      <div>Steer: ${(this.vehicle as unknown as { steeringAngle:number }).steeringAngle?.toFixed(2) ?? 'n/a'} | Quality: ${settings.quality}</div>
      <div>Heap: ${mem ? (mem.usedJSHeapSize/1048576).toFixed(1)+' MB' : 'n/a'}</div>
      <div>Camera: ${this.cameraRig.mode} (C) | R reset | Space handbrake</div>
    `;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
  }
}

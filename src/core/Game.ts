// Game.ts — main loop with World/ChunkManager (Phase 2)
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
import { World } from '../world/World';
import { HUD } from '../ui/HUD';
import { TuningPanel } from '../ui/TuningPanel';

export class Game {
  renderer: Renderer;
  time = new Time();
  input = new Input();
  physics = new PhysicsWorld();
  cameraRig = new CameraRig();
  world: World | null = null;
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
  private worldInitialized = false;

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

    // Floating origin handling — keep vehicle near 0
    window.addEventListener('floating-origin-shift', (e: Event) => {
      const detail = (e as CustomEvent).detail as { shift: THREE.Vector3 };
      this.vehicle.shiftOrigin(detail.shift);
      // Also shift camera rig target is same object, so camera follows
    });
  }

  private setupScene() {
    const scene = this.renderer.scene;
    const hemi = new THREE.HemisphereLight(0xfffaf0, 0x444466, 0.92);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff4e6, 1.15);
    dir.position.set(80, 110, 60);
    dir.castShadow = !!settings.preset.shadows;
    if (dir.castShadow) {
      dir.shadow.mapSize.set(1024, 1024);
      dir.shadow.camera.near = 2;
      dir.shadow.camera.far = 400;
      dir.shadow.camera.left = -120;
      dir.shadow.camera.right = 120;
      dir.shadow.camera.top = 120;
      dir.shadow.camera.bottom = -120;
      dir.shadow.bias = -0.0005;
    }
    scene.add(dir);
    // Fog tuned to chunk radius: Low 3 => ~ 560 far, High 6 => 1100 far
    const preset = settings.preset;
    const fogFar = preset.chunkRadius * 256 * 0.95;
    const fogNear = fogFar * 0.35;
    scene.fog = new THREE.Fog('#dbeeff', fogNear, fogFar);
    // Ground fallback removed — replaced by chunked terrain. Keep faint grid for orientation briefly
    const grid = new THREE.GridHelper(8000, 32, '#ffffff', '#e5e7eb');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.05;
    grid.position.y = 0.02;
    scene.add(grid);
  }

  async start() {
    if (this.running) return;
    this.running = true;
    // Start physics
    this.physics.init().then(() => {
      this.physicsReady = true;
      this.vehicle.enablePhysics(this.physics);
      this.hud.showMessage('Physics ready — chunked world loading…', 1500);
      // Now we can init world with physics
      this.initWorld();
    }).catch(err => console.error('Physics init failed', err));

    // World can init without physics too (fallback), but we wait briefly for physics to avoid double colliders
    // If physics not ready in 1.5s, init anyway
    setTimeout(() => { if (!this.worldInitialized) this.initWorld(); }, 1500);

    this.lastTime = performance.now();
    this.loop(this.lastTime);
    this.hideLoading();
  }

  private initWorld() {
    if (this.worldInitialized) return;
    this.worldInitialized = true;
    const seed = this.getSeed();
    this.world = new World(seed, this.renderer.scene, this.physics as unknown as never);
    // Spawn player at downtown/suburb border
    const spawn = this.world.getSpawnPosition();
    this.vehicle.reset(spawn, 0);
    console.log(`[World] Seed ${seed} spawn ${spawn.x.toFixed(0)},${spawn.z.toFixed(0)} y ${spawn.y.toFixed(1)}`);
  }

  private getSeed(): string {
    try {
      const saved = localStorage.getItem('openroad:seed');
      if (saved) return saved;
    } catch {}
    const seed = `open-road-${Math.floor(Math.random()*1e6)}`;
    try { localStorage.setItem('openroad:seed', seed); } catch {}
    return seed;
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
    }, 7000);
  }

  private loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    const dtMs = now - this.lastTime;
    this.lastTime = now;
    const dt = dtMs / 1000;
    const steps = this.time.step(dt);
    for (let i = 0; i < steps; i++) this.fixedUpdate(Time.FIXED_DT);
    this.update(dt);
    this.renderer.render();
    this.updateDebug(dt);
  };

  private fixedUpdate(dt: number) {
    this.controller.update(dt);

    if (this.physicsReady && (this.vehicle as unknown as { controller: unknown }).controller) {
      const ctrl = (this.vehicle as unknown as { controller: { updateVehicle:(dt:number)=>void } }).controller;
      if (ctrl) ctrl.updateVehicle(dt);
    }
    this.physics.step(dt);
    this.vehicle.postPhysicsUpdate();

    // World streaming
    if (this.world) this.world.update(this.vehicle.group.position, dt);

    // Edge: world boundary 3800m
    const p = this.vehicle.group.position;
    const limit = 3900;
    if (Math.abs(p.x) > limit || Math.abs(p.z) > limit) {
      this.hud.showMessage('Turn back — ocean/mountains ahead', 2000);
      // gentle push back (avoid physics explosion)
      const dir = new THREE.Vector3(-p.x, 0, -p.z).normalize();
      p.addScaledVector(dir, 3);
      if (this.physicsReady) {
        // also nudge body
        const rb = (this.vehicle as unknown as { rigidBody: { setTranslation: (v: unknown, b:boolean)=>void } }).rigidBody;
        if (rb) {
          const cur = p.clone();
          // physics sync will happen next frame; just ensure group pos corrected
        }
      }
    }

    if (this.input.consumeCameraCycle()) {
      this.cameraRig.cycle();
      this.hud.showMessage(`Camera: ${this.cameraRig.mode}`, 1200);
    }
    if (this.input.consumeReset()) {
      const spawn = this.world?.getSpawnPosition() ?? new THREE.Vector3(0,0.6,0);
      this.vehicle.reset(spawn, 0);
      this.hud.showMessage('Car reset to road', 1000);
    }
  }

  private update(dt: number) {
    this.cameraRig.update(this.renderer.camera, dt, this.vehicle.state.speedKmh);
    this.hud.update(this.vehicle.state, dt);
    this.tuning.update();
    // Update fog distance if quality changed live
    const curFog = this.renderer.scene.fog as THREE.Fog | null;
    if (curFog) {
      const far = settings.preset.chunkRadius * 256 * 0.95;
      if (Math.abs(curFog.far - far) > 10) {
        curFog.far = far;
        curFog.near = far * 0.35;
      }
    }
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
    const mem = (performance as unknown as { memory?: { usedJSHeapSize:number } }).memory;
    const phys = this.physicsReady ? 'Rapier' : 'Kinematic';
    const chunks = this.world?.chunkManager.getChunkCount() ?? 0;
    const origin = this.world?.chunkManager.getOriginOffset();
    this.debugEl.innerHTML = `
      <div><b>DEBUG</b> (F3) • Tuning: T • Chunks: ${chunks}</div>
      <div>FPS: ${avgFps.toFixed(1)} | ${phys} | Quality: ${settings.quality} (${settings.preset.chunkRadius}r)</div>
      <div>Draw calls: ${info.render.calls} | Tris: ${info.render.triangles.toLocaleString()}</div>
      <div>Pos: ${this.vehicle.group.position.x.toFixed(1)}, ${this.vehicle.group.position.z.toFixed(1)} | Y: ${this.vehicle.group.position.y.toFixed(2)} | H: ${(this.vehicle.state.heading*180/Math.PI).toFixed(0)}°</div>
      <div>Speed: ${this.vehicle.state.speedKmh.toFixed(0)} km/h | RPM: ${this.vehicle.state.rpm.toFixed(0)} | Gear: ${this.vehicle.state.gear}</div>
      <div>Verts/chunk: ${settings.preset.terrainVerts}² | Origin off: ${origin ? `${origin.x.toFixed(0)},${origin.z.toFixed(0)}` : '0,0'}</div>
      <div>Heap: ${mem ? (mem.usedJSHeapSize/1048576).toFixed(1)+' MB' : 'n/a'}</div>
      <div>Seed: ${this.world?.seed ?? '…'} | C camera | R reset | Space handbrake</div>
    `;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.world?.dispose();
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

}

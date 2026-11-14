import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { FixedTimeStep } from './Time';
import { DebugOverlay } from '../utils/debug';
import { HUD } from '../ui/HUD';
import { TuningPanel } from '../ui/TuningPanel';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Vehicle } from '../vehicles/Vehicle';
import { PlayerController } from '../vehicles/PlayerController';
import { CameraRig } from '../vehicles/CameraRig';
import { buildCarMesh } from '../vehicles/CarFactory';
import { COMET_GT } from '../vehicles/cars';
import { bus } from './EventBus';
import { settings } from './Settings';

/** The states the game can be in. */
export type GameState = 'loading' | 'menu' | 'play' | 'paused' | 'photo';

/**
 * The main game object.
 *
 * It owns the render loop, the physics world, the player car and all of the
 * UI. Every other system is a plain module with `init` / `update` / `dispose`
 * that the game calls, which keeps the main loop easy to read.
 */
export class Game {
  readonly renderer: Renderer;
  readonly input: Input;
  readonly debug = new DebugOverlay();
  readonly bus = bus;

  state: GameState = 'loading';

  hud!: HUD;
  tuningPanel!: TuningPanel;

  physics!: PhysicsWorld;
  vehicle!: Vehicle;
  playerController!: PlayerController;
  cameraRig!: CameraRig;

  private readonly time = new FixedTimeStep(60, 5);
  private lastTime = 0;
  private running = false;
  private frameHandle = 0;

  /** Ground plane used before the streamed terrain exists. */
  private ground: THREE.Mesh | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.hud = new HUD(uiRoot);
    this.tuningPanel = new TuningPanel(uiRoot);
  }

  /** Async setup (loads Rapier WASM). */
  async init(): Promise<void> {
    this.physics = await PhysicsWorld.create();

    // --- simple ground so the car has something to drive on ---
    const groundGeo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshLambertMaterial({ color: 0x5d8a4a }),
    );
    this.ground.receiveShadow = true;
    this.renderer.scene.add(this.ground);

    // --- lighting ---
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x506040, 1.0);
    this.renderer.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    sun.position.set(120, 200, 90);
    this.renderer.scene.add(sun);

    this.renderer.scene.fog = new THREE.Fog(0x9fc8e8, 200, 1200);
    this.renderer.scene.background = new THREE.Color(0x9fc8e8);

    // --- player car ---
    const mesh = buildCarMesh(COMET_GT);
    this.renderer.scene.add(mesh.group);
    this.vehicle = new Vehicle(this.physics, COMET_GT, mesh.group);
    this.vehicle.setWheelMeshes(mesh.wheels);
    this.vehicle.resetTo(0, 1.2, 0, 0);

    this.playerController = new PlayerController();
    this.cameraRig = new CameraRig(this.renderer.aspect);
    this.cameraRig.snapTo(this.vehicle);

    this.tuningPanel.attach(this.vehicle);
  }

  /** Start the render loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.state = 'play';
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    const frameDelta = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    this.handleHotkeys();

    if (this.state === 'play') {
      this.time.update(frameDelta, (dt) => this.fixedUpdate(dt));
    } else {
      this.time.reset();
    }

    this.renderUpdate(frameDelta);

    this.debug.update(frameDelta, this.renderer.renderer);
    this.input.endFrame();

    this.frameHandle = requestAnimationFrame(this.loop);
  };

  /** Keys that work no matter which state we are in. */
  private handleHotkeys(): void {
    if (this.input.wasPressed('debug')) this.debug.toggle();
    if (this.input.wasPressed('tuning')) this.tuningPanel.toggle();

    if (this.state !== 'play') return;

    if (this.input.wasPressed('camera')) {
      const mode = this.cameraRig.cycle();
      this.hud.showToast(`Camera: ${mode}`);
    }
    if (this.input.wasPressed('reset')) this.resetCar();
  }

  /** One fixed physics step. */
  private fixedUpdate(dt: number): void {
    this.playerController.apply(this.input.state, this.vehicle, dt);
    this.vehicle.prepareStep(dt);
    this.vehicle.applyPhysics(dt);
    this.physics.step();
    this.vehicle.update(dt);
  }

  /** Everything that runs once per rendered frame. */
  private renderUpdate(dt: number): void {
    this.cameraRig.update(this.vehicle, dt);
    this.hud.update({
      speedKmh: this.vehicle.speedKmh,
      gear: this.vehicle.currentGear,
      rpmRatio: this.vehicle.rpmRatio,
    });
    this.hud.updateTimers(dt);
    this.renderer.render();
  }

  /** Put the car back on the road, upright. */
  resetCar(): void {
    const pos = this.vehicle.body.translation();
    this.vehicle.resetTo(pos.x, pos.y + 1.5, pos.z, 0);
    this.playerController.reset();
    this.cameraRig.snapTo(this.vehicle);
    this.hud.showToast('Car reset');
  }

  dispose(): void {
    this.stop();
    this.input.dispose();
    this.renderer.dispose();
    this.hud.dispose();
    if (this.ground) {
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
    }
  }
}

export { settings };

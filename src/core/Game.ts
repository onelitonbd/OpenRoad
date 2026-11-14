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
import { ChunkManager } from '../world/ChunkManager';
import { RoadRenderer } from '../world/RoadMesh';
import { Water } from '../world/Water';
import { WORLD_HALF } from '../world/Terrain';

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

  /** The streamed world (terrain chunks + sea). */
  world!: ChunkManager;
  water!: Water;
  /** Draws the road network around the player. */
  roadRenderer!: RoadRenderer;

  private readonly time = new FixedTimeStep(60, 5);
  private lastTime = 0;
  private running = false;
  private frameHandle = 0;

  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fogColor = new THREE.Color(0x9fc8e8);

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.hud = new HUD(uiRoot);
    this.tuningPanel = new TuningPanel(uiRoot);
  }

  /** Async setup (loads Rapier WASM). */
  async init(): Promise<void> {
    this.physics = await PhysicsWorld.create();

    // --- lighting ---
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x506040, 1.0);
    this.renderer.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    this.sun.position.set(120, 200, 90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.renderer.scene.add(this.sun);
    this.renderer.scene.add(this.sun.target);

    // --- fog + sky colour ---
    this.applyFog();

    // --- the streamed world ---
    this.world = new ChunkManager(1337, this.physics);
    this.world.init();
    this.renderer.scene.add(this.world.group);

    this.water = new Water();
    this.renderer.scene.add(this.water.mesh);

    this.roadRenderer = new RoadRenderer(this.world.roads);
    this.renderer.scene.add(this.roadRenderer.group);

    // --- player car ---
    const mesh = buildCarMesh(COMET_GT);
    this.renderer.scene.add(mesh.group);
    this.vehicle = new Vehicle(this.physics, COMET_GT, mesh.group);
    this.vehicle.setWheelMeshes(mesh.wheels);

    // Spawn on the border between downtown and the suburbs.
    const spawn = this.findSpawnPoint();
    this.vehicle.resetTo(spawn.x, spawn.y + 1.5, spawn.z, spawn.heading);

    this.playerController = new PlayerController();
    this.cameraRig = new CameraRig(this.renderer.aspect);
    this.cameraRig.snapTo(this.vehicle);

    this.tuningPanel.attach(this.vehicle);
  }

  /**
   * Find a good place to start: on a road at the edge of the downtown grid.
   */
  private findSpawnPoint(): { x: number; y: number; z: number; heading: number } {
    const roads = this.world.roads;

    // Look for a street or avenue between 450 m and 900 m from the centre.
    for (let radius = 460; radius < 900; radius += 20) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const hit = roads.nearestRoad(x, z, 120);
        if (!hit) continue;
        if (hit.edge.type !== 'street' && hit.edge.type !== 'avenue') continue;

        // The heading follows the road.
        const edge = hit.edge;
        const index = Math.min(
          edge.points.length / 2 - 2,
          Math.floor(hit.t * (edge.points.length / 2 - 1)),
        );
        const dx = edge.points[index * 2 + 2] - edge.points[index * 2];
        const dz = edge.points[index * 2 + 3] - edge.points[index * 2 + 1];
        // The car faces +Z, so the heading is atan2(x, z).
        const heading = Math.atan2(dx, dz);
        return { x: hit.x, y: hit.height, z: hit.z, heading };
      }
    }
    return { x: 0, y: 0, z: 520, heading: 0 };
  }

  /** Fog settings follow the quality preset so the pop-in stays hidden. */
  private applyFog(): void {
    const preset = settings.preset;
    const fog = new THREE.Fog(this.fogColor, preset.fogDistance * 0.35, preset.fogDistance);
    this.renderer.scene.fog = fog;
    this.renderer.scene.background = this.fogColor;
    this.water?.setFog(this.fogColor, fog.near, fog.far);
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
    const position = this.vehicle.body.translation();

    // Stream the terrain and the roads around the player.
    this.world.update(position.x, position.z);
    this.roadRenderer.update(position.x, position.z, settings.preset.chunkRadius * 256 + 400);
    this.water.update(dt);
    this.water.follow(position.x, position.z);

    // Keep the sun above the car so the shadows stay in the shadow frustum.
    this.sun.position.set(position.x + 120, position.y + 200, position.z + 90);
    this.sun.target.position.set(position.x, position.y, position.z);
    this.sun.target.updateMatrixWorld();

    this.cameraRig.update(this.vehicle, dt, (x, z) => this.world.heightAt(x, z));

    this.hud.update({
      speedKmh: this.vehicle.speedKmh,
      gear: this.vehicle.currentGear,
      rpmRatio: this.vehicle.rpmRatio,
    });
    this.hud.updateTimers(dt);

    // Debug information.
    this.debug.extra.chunksLoaded = this.world.loadedCount;
    this.debug.extra.chunkQueue = this.world.queueCount;
    this.debug.extra.position = `${position.x.toFixed(0)}, ${position.z.toFixed(0)}`;

    this.renderer.render();
  }

  /** Put the car back on the road, upright. */
  resetCar(): void {
    const pos = this.vehicle.body.translation();
    const y = this.world.heightAt(pos.x, pos.z);
    this.vehicle.resetTo(pos.x, y + 1.2, pos.z, 0);
    this.playerController.reset();
    this.cameraRig.snapTo(this.vehicle);
    this.hud.showToast('Car reset');
  }

  dispose(): void {
    this.stop();
    this.input.dispose();
    this.renderer.dispose();
    this.hud.dispose();
    this.world?.dispose();
    this.water?.dispose();
    this.roadRenderer?.dispose();
  }
}

export { settings, WORLD_HALF };

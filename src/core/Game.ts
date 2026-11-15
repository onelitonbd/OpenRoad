import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { FixedTimeStep } from './Time';
import { DebugOverlay } from '../utils/debug';
import { RoadGraphDebug } from '../utils/roadDebug';
import { HUD } from '../ui/HUD';
import { Minimap } from '../ui/Minimap';
import { TuningPanel } from '../ui/TuningPanel';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Vehicle } from '../vehicles/Vehicle';
import { PlayerController } from '../vehicles/PlayerController';
import { CameraRig } from '../vehicles/CameraRig';
import { buildCarMesh } from '../vehicles/CarFactory';
import { COMET_GT } from '../vehicles/cars';
import { bus } from './EventBus';
import { settings } from './Settings';
import { TrafficManager } from '../ai/TrafficManager';
import { ChunkManager } from '../world/ChunkManager';
import { RoadRenderer } from '../world/RoadMesh';
import { BuildingManager } from '../world/Buildings';
import { Landmarks } from '../world/Landmarks';
import { PropManager } from '../world/Props';
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
  minimap!: Minimap;
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
  /** The houses and towers of the world. */
  buildings!: BuildingManager;
  /** The trees, lamps and rocks of the world. */
  props!: PropManager;
  /** The hand-placed landmarks (the tower, the lighthouse, the mills). */
  landmarks!: Landmarks;
  /** The AI traffic. */
  traffic!: TrafficManager;
  /** Draws the road graph when the debug overlay is open. */
  private roadDebug!: RoadGraphDebug;

  private readonly uiRoot: HTMLElement;
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
    this.uiRoot = uiRoot;
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

    this.buildings = new BuildingManager(this.world.roads, this.world.terrain, this.physics);
    this.renderer.scene.add(this.buildings.group);

    this.props = new PropManager(this.world.roads, this.world.terrain);
    this.renderer.scene.add(this.props.group);

    this.landmarks = new Landmarks(this.world.terrain);
    this.renderer.scene.add(this.landmarks.group);

    // The road graph is only drawn while the debug overlay is open.
    this.roadDebug = new RoadGraphDebug(this.world.roads);
    this.renderer.scene.add(this.roadDebug.object);

    // --- the traffic ---
    this.traffic = new TrafficManager(this.physics, this.world.roads, (x, z) =>
      this.world.isLoadedAt(x, z),
    );
    // An AI car that is blocked by the player honks at them.
    this.traffic.onHonk = () => {
      this.hud.showToast('A driver honks at you!', 1.5);
    };
    this.renderer.scene.add(this.traffic.group);
    this.renderer.scene.add(this.traffic.debugLines);

    this.minimap = new Minimap(this.uiRoot, this.world.roads, this.landmarks.list);

    // --- player car ---
    const mesh = buildCarMesh(COMET_GT);
    this.renderer.scene.add(mesh.group);
    this.vehicle = new Vehicle(this.physics, COMET_GT, mesh.group);
    this.vehicle.setWheelMeshes(mesh.wheels);

    // Spawn on the border between downtown and the suburbs.
    const spawn = this.findSpawnPoint();
    // The chunk under the spawn has to exist before the car is dropped, so
    // the car can never fall through the world at the start.
    this.world.ensureChunkAt(spawn.x, spawn.z);
    this.vehicle.resetTo(spawn.x, spawn.y + 1.5, spawn.z, spawn.heading);

    this.playerController = new PlayerController();
    this.cameraRig = new CameraRig(this.renderer.camera);
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
    if (this.input.wasPressed('debug')) {
      this.debug.toggle();
      this.roadDebug.visible = this.debug.isVisible;
      this.traffic.setDebugVisible(this.debug.isVisible);
    }
    if (this.input.wasPressed('tuning')) this.tuningPanel.toggle();

    if (this.state !== 'play') return;

    if (this.input.wasPressed('camera')) {
      const mode = this.cameraRig.cycle();
      this.hud.showToast(`Camera: ${mode}`);
    }
    if (this.input.wasPressed('minimap')) {
      const rotating = this.minimap.toggleRotation();
      this.hud.showToast(rotating ? 'Minimap: rotating' : 'Minimap: north up');
    }
    if (this.input.wasPressed('reset')) this.resetCar();
  }

  /** One fixed physics step. */
  private fixedUpdate(dt: number): void {
    const position = this.vehicle.body.translation();

    // While the terrain under the car is still streaming in, the car is held
    // in place. Without this the car would fall through the missing chunk
    // and could never get back on the ground.
    if (!this.world.isLoadedAt(position.x, position.z)) {
      const ground = this.world.heightAt(position.x, position.z);
      this.vehicle.holdAt(position.x, ground + this.vehicle.rideHeight, position.z);
      return;
    }

    this.playerController.apply(this.input.state, this.vehicle, dt);
    this.vehicle.prepareStep(dt);
    this.vehicle.applyPhysics(dt);

    // The AI cars prepare their physics as well, then everything is stepped
    // at once.
    this.traffic.update(dt, position.x, position.z);

    this.physics.step();
    this.vehicle.update(dt);
    this.traffic.syncVisuals(dt);
  }

  /** Everything that runs once per rendered frame. */
  private renderUpdate(dt: number): void {
    const position = this.vehicle.body.translation();

    // Stream the terrain, the roads, the buildings and the props.
    this.world.update(position.x, position.z);
    this.roadRenderer.update(position.x, position.z, settings.preset.chunkRadius * 256 + 400);
    this.buildings.update(position.x, position.z);
    this.props.update(position.x, position.z);
    this.landmarks.update(dt);
    if (this.roadDebug.visible) {
      this.roadDebug.update(position.x, position.z);
      this.traffic.updateDebugLines();
    }
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

    // The minimap follows the player and shows the AI cars.
    this.minimap.setTraffic(this.traffic.mapPositions());
    this.minimap.update(position.x, position.z, this.vehicle.heading);

    // Debug information.
    this.debug.extra.aiActive = this.traffic.count;
    this.debug.extra.aiPhysics = this.traffic.physicsCount;
    this.debug.extra.aiLights = this.traffic.lights.count;
    this.debug.extra.aiRescues = this.traffic.rescueCount;
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
    this.buildings?.dispose();
    this.props?.dispose();
    this.landmarks?.dispose();
    this.roadDebug?.dispose();
    this.traffic?.dispose();
    this.minimap?.dispose();
  }
}

export { settings, WORLD_HALF };

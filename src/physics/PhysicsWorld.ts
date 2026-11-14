// PhysicsWorld.ts — Rapier init, step (stub for now)
import * as RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  world!: InstanceType<typeof RAPIER.World>;

  private ready = false;

  async init() {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    this.world = new RAPIER.World(gravity);
    // Add a flat ground collider so car doesn't fall even before terrain
    const desc = RAPIER.ColliderDesc.cuboid(1000, 0.5, 1000).setTranslation(0, -0.5, 0);
    this.world.createCollider(desc);
    this.ready = true;
    console.log('[Physics] Rapier initialized');
  }

  step(dt: number) {
    if (!this.ready) return;
    this.world.timestep = dt;
    this.world.step();
  }

  isReady() { return this.ready; }

  dispose() {
    if (this.world) this.world.free();
  }
}

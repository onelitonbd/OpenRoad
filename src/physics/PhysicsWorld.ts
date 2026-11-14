import * as RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  world!: RAPIER.World;

  private ready = false;

  async init() {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    this.world = new RAPIER.World(gravity);
    const desc = RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0);
    this.world.createCollider(desc);
    this.ready = true;
    console.log('[Physics] Rapier ready, vehicles can be created');
  }

  step(dt: number) {
    if (!this.ready) return;
    // Physics timestep is set externally; we control via world.timestep
    this.world.timestep = dt;
    this.world.step();
    // After step, update any vehicle controllers that need updateVehicle call
    // Vehicle controllers update themselves via updateVehicle inside Vehicle.applyPhysicsInputs before step,
    // but Rapier recommends calling updateVehicle after world.step with filtered queries.
    // We handle via Vehicle.postPhysicsUpdate sync, but also need to call controller.updateVehicle
    // So we do a second pass for controllers — they are updated pre-step too. For simplicity, call here:
    // The controllers are stored on vehicles; we cannot iterate here. Vehicle's applyPhysicsInputs calls updateVehicle pre-step.
    // Instead, after step we do nothing. Vehicle.postPhysicsUpdate will sync.
  }

  isReady() { return this.ready; }

  dispose() {
    if (this.world) this.world.free();
  }
}

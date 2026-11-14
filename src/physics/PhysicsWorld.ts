import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Collision groups.
 *
 * Rapier packs a 32 bit mask: the upper 16 bits say what an object *is*,
 * the lower 16 bits say what it *collides with*. Using groups lets us stop
 * the vehicle wheel ray-casts from hitting the vehicle's own body.
 */
export const GROUP = {
  /** Terrain, roads, buildings, props. */
  WORLD: 0x0001,
  /** Cars (player, traffic, rivals). */
  VEHICLE: 0x0002,
  /** Static scenery that only the player should collide with. */
  PROP: 0x0004,
} as const;

/** Interaction group for the static world. */
export const WORLD_GROUPS =
  (GROUP.WORLD << 16) | (GROUP.WORLD | GROUP.VEHICLE | GROUP.PROP);

/** Interaction group for vehicles: they hit the world and each other. */
export const VEHICLE_GROUPS =
  (GROUP.VEHICLE << 16) | (GROUP.WORLD | GROUP.VEHICLE | GROUP.PROP);

/** Wheel ray-casts only look at the static world. */
export const WHEEL_RAY_GROUPS = (GROUP.VEHICLE << 16) | GROUP.WORLD;

/**
 * Thin wrapper around the Rapier world.
 *
 * Rapier is loaded through the "compat" build, which inlines the WASM module
 * as base64 - that way there is no extra file to download and it works on
 * every static host (including Vercel) without special headers.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // A slightly larger step budget keeps the vehicle stable at low FPS.
    this.world.timestep = 1 / 60;
    this.world.integrationParameters.numSolverIterations = 4;
  }

  /** Load Rapier (WASM) and create the world. Must be awaited once. */
  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  /** Advance the simulation by one fixed step. */
  step(): void {
    this.world.step();
  }

  /** Remove a rigid body and all of its colliders from the world. */
  removeBody(body: RAPIER.RigidBody): void {
    if (body) this.world.removeRigidBody(body);
  }

  removeCollider(collider: RAPIER.Collider): void {
    if (collider) this.world.removeCollider(collider, false);
  }

  /**
   * Cast a ray and return the hit distance, or `null` when nothing was hit.
   * Used by the traffic AI to look ahead for obstacles.
   */
  raycast(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxToi: number,
    exclude?: RAPIER.RigidBody,
  ): number | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(
      ray,
      maxToi,
      true,
      undefined,
      WHEEL_RAY_GROUPS,
      undefined,
      exclude,
    );
    return hit ? hit.timeOfImpact : null;
  }

  dispose(): void {
    this.world.free();
  }
}

export { RAPIER };

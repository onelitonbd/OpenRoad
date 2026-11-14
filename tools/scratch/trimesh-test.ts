import RAPIER from '@dimforge/rapier3d-compat';

async function main(): Promise<void> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // Simple 2x2 quad at y=0 spanning -1..1
  const positions = new Float32Array([
    -1, 0, -1,  1, 0, -1,  1, 0, 1,  -1, 0, 1,
  ]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2]);

  for (const flags of [undefined, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES]) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = flags === undefined
      ? RAPIER.ColliderDesc.trimesh(positions, indices)
      : RAPIER.ColliderDesc.trimesh(positions, indices, flags);
    const collider = world.createCollider(desc, body);
    console.log('flags', flags, 'collider', collider.handle, 'shape type', collider.shapeType?.());

    // Ray straight down from (0, 5, 0)
    const ray = new RAPIER.Ray({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, 20, true);
    console.log('  ray hit:', hit ? hit.timeOfImpact : 'none');

    // Drop a ball
    const ballBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.3), ballBody);
    for (let i = 0; i < 120; i++) world.step();
    console.log('  ball y after 2s:', ballBody.translation().y.toFixed(3));
  }
}
main();

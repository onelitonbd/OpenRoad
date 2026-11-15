import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';

const executablePath = await sparticuz.executablePath();
try {
  const { inflate } = await import('@sparticuz/chromium');
  await inflate('/home/user/OpenRoad/node_modules/@sparticuz/chromium/bin/al2023.tar.br');
} catch {}
process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH ?? ''}`;

const browser = await playwright.launch({
  executablePath,
  headless: true,
  args: sparticuz.args.filter((a) => a !== '--single-process'),
  chromiumSandbox: false,
  env: { ...process.env },
});

const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });

// Check the physics world directly.
const probe = await page.evaluate(() => {
  const g = window.openRoad;
  const p = g.vehicle.body.translation();
  const down = g.physics.raycast({ x: p.x, y: p.y + 20, z: p.z }, { x: 0, y: -1, z: 0 }, 200);
  const hit = g.world.roads.nearestRoad(p.x, p.z, 200);
  const ground = g.world.heightAt(p.x, p.z);
  const chunk = g.world.getChunk(Math.floor(p.x / 256), Math.floor(p.z / 256));
  return {
    pos: [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)],
    rayDown: down,
    groundAnalytic: ground.toFixed(3),
    roadHit: hit ? { type: hit.edge.type, dist: hit.distance.toFixed(2), h: hit.height.toFixed(3) } : null,
    chunkLoaded: !!chunk,
    chunkCollider: chunk ? !!chunk.collider : null,
    chunkBody: chunk ? !!chunk.body : null,
  };
});
console.log('probe:', JSON.stringify(probe, null, 1));

const scene = await page.evaluate(() => {
  const g = window.openRoad;
  const cam = g.renderer.camera;
  const p = g.vehicle.body.translation();
  const roadGroup = g.roadRenderer.group;
  const buildGroup = g.buildings.group;
  const propGroup = g.props.group;
  const out = {
    camera: [cam.position.x.toFixed(1), cam.position.y.toFixed(1), cam.position.z.toFixed(1)],
    car: [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)],
    roadChildren: roadGroup.children.length,
    roadVisible: roadGroup.children.filter((c) => c.visible).length,
    buildChildren: buildGroup.children.length,
    propChildren: propGroup.children.length,
    sceneChildren: g.renderer.scene.children.length,
  };
  if (roadGroup.children[0]) {
    const m = roadGroup.children[0];
    m.geometry.computeBoundingBox();
    out.firstRoad = {
      pos: [m.position.x, m.position.y, m.position.z],
      bbox: m.geometry.boundingBox,
      visible: m.visible,
      matrixAutoUpdate: m.matrixAutoUpdate,
    };
  }
  return out;
});
console.log('scene:', JSON.stringify(scene, null, 1));

// Check the physics world directly.
const phys = await page.evaluate(() => {
  const g = window.openRoad;
  const p = g.vehicle.body.translation();
  const world = g.physics.world;
  const RAPIER = g.physics.world.constructor;
  const out = {};
  out.colliders = world.colliders.len ? world.colliders.len() : 'n/a';
  out.bodies = world.bodies.len ? world.bodies.len() : 'n/a';
  // Straight down ray from 50 m above the ground.
  const ray = new (Object.getPrototypeOf(g.physics.raycast).constructor === Function ? Object : Object)();
  return out;
});
console.log('physics:', JSON.stringify(phys));

const roads = await page.evaluate(() => {
  const g = window.openRoad;
  const p = g.vehicle.body.translation();
  const out = [];
  for (const mesh of g.roadRenderer.group.children) {
    if (!mesh.geometry) continue;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (p.x >= bb.min.x - 30 && p.x <= bb.max.x + 30 && p.z >= bb.min.z - 30 && p.z <= bb.max.z + 30) {
      out.push({
        min: [bb.min.x.toFixed(1), bb.min.y.toFixed(2), bb.min.z.toFixed(1)],
        max: [bb.max.x.toFixed(1), bb.max.y.toFixed(2), bb.max.z.toFixed(1)],
        mat: mesh.material.type,
        hasMap: !!mesh.material.map,
        visible: mesh.visible,
        renderOrder: mesh.renderOrder,
        frustumCulled: mesh.frustumCulled,
      });
    }
  }
  return { count: out.length, near: out.slice(0, 4) };
});
console.log('roads near car:', JSON.stringify(roads, null, 1));

for (let i = 0; i < 10; i++) {
  const info = await page.evaluate(() => {
    const g = window.openRoad;
    const p = g.vehicle.body.translation();
    const ground = g.world.heightAt(p.x, p.z);
    return {
      t: performance.now() / 1000,
      pos: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
      ground: Math.round(ground * 100) / 100,
      chunks: g.world.loadedCount,
      y: Math.round(p.y),
    };
  });
  console.log(JSON.stringify(info));
  await page.waitForTimeout(500);
}

await browser.close();

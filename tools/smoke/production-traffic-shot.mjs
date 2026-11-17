/**
 * Takes a picture of the AI traffic of a deployed build.
 *
 * The camera is moved next to the closest traffic car, so the screenshot
 * shows the cars of the traffic with the models that they really use.
 * The script also reports how many of the cars are built from a 3D model
 * (a mesh with a texture) and how many use the procedural fallback.
 *
 * The sandbox that develops the game cannot reach the deployment host, so
 * this test runs on a GitHub runner:
 *
 *   npm i --no-save playwright
 *   npx playwright install --with-deps chromium
 *   node tools/smoke/production-traffic-shot.mjs https://example.vercel.app/ shot.png
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'https://openroad-six-ivory.vercel.app/';
const shotPath = process.argv[3] ?? 'tools/smoke/shots/production-traffic.png';

/**
 * Chromium comes from three possible places:
 *   1. `CHROMIUM_PATH` - a browser that was installed by Playwright.
 *   2. `playwright` - the full package with its own browser download.
 *   3. `@sparticuz/chromium` - the browser that ships with the npm package.
 */
async function launchBrowser() {
  const args = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
  ];

  if (process.env.CHROMIUM_PATH) {
    const { chromium } = await import('playwright-core');
    return chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args,
      chromiumSandbox: false,
    });
  }

  try {
    const { chromium } = await import('playwright');
    return chromium.launch({ headless: true, args });
  } catch {
    const { chromium } = await import('playwright-core');
    const sparticuz = (await import('@sparticuz/chromium')).default;
    const executablePath = await sparticuz.executablePath();
    try {
      const { inflate } = await import('@sparticuz/chromium');
      await inflate('node_modules/@sparticuz/chromium/bin/al2023.tar.br');
    } catch {
      // The libraries were already unpacked - that is fine.
    }
    process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH ?? ''}`;
    return chromium.launch({
      executablePath,
      headless: true,
      args: [...args, ...sparticuz.args.filter((a) => a !== '--single-process')],
      chromiumSandbox: false,
      env: { ...process.env },
    });
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => console.log('[pageerror]', error.message));

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 180000 });
await page.waitForTimeout(10000);

// How many of the cars of the traffic use a 3D model?
const models = await page.evaluate(() => {
  const cars = window.openRoad?.traffic?.cars ?? [];
  const hasTexture = (mesh) => {
    const material = mesh.material;
    if (!material) return false;
    if (Array.isArray(material)) return material.some((m) => !!m?.map);
    return !!material.map;
  };
  let withModel = 0;
  let withTexture = 0;
  const kinds = {};
  for (const car of cars) {
    const group = car?.mesh?.group;
    if (!group) continue;
    const meshes = [];
    group.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    if (meshes.length > 0) withModel += 1;
    const textured = meshes.some(hasTexture);
    if (textured) withTexture += 1;
    const name = car?.config?.model ?? 'procedural';
    kinds[name] = (kinds[name] ?? 0) + 1;
    if (!textured) kinds['procedural-fallback'] = (kinds['procedural-fallback'] ?? 0) + 1;
  }
  return { cars: cars.length, withModel, withTexture, kinds };
});
console.log('traffic models', JSON.stringify(models));

// Move the player behind the closest AI car and look at it.
const info = await page.evaluate(() => {
  const game = window.openRoad;
  const cars = game.traffic.cars ?? [];
  if (cars.length === 0) return null;
  const player = game.vehicle.body.translation();
  let best = null;
  let bestDistance = Infinity;
  for (const car of cars) {
    const p = car.position;
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = car;
    }
  }
  const p = best.position;
  // The car drives towards +Z, the heading is atan2(x, z).
  const heading = best.vehicle?.heading ?? 0;
  const backX = -Math.sin(heading);
  const backZ = -Math.cos(heading);
  const x = p.x + backX * 11;
  const z = p.z + backZ * 11;
  const y = game.world.heightAt(x, z);
  game.vehicle.resetTo(x, y + 2, z, heading);
  game.cameraRig.snapTo(game.vehicle);
  return {
    x: Math.round(p.x),
    z: Math.round(p.z),
    distance: Math.round(bestDistance),
    speed: Math.round(best.speed * 3.6),
    model: best.config?.model ?? 'procedural',
  };
});
console.log('closest car', JSON.stringify(info));

await page.waitForTimeout(6000);
mkdirSync(dirname(shotPath), { recursive: true });
await page.screenshot({ path: shotPath, timeout: 180000 });
console.log('screenshot', shotPath);

await browser.close();

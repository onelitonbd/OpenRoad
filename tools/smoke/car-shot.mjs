/**
 * Takes close up pictures of the player car.
 *
 * The camera of the game is moved around the car so the model can be
 * inspected (the normal chase camera is too far away to see any details).
 */
import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'tools/smoke/shots/car';
const drive = process.argv[4] === 'drive';

mkdirSync('tools/smoke/shots', { recursive: true });

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
  env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH },
});

const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text());
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(4000);

if (process.env.LIGHTS === '1') {
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(500);
}

if (drive) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
}

const info = await page.evaluate(() => {
  const game = window.openRoad;
  game.cameraRig.manual = true;
  const body = game.vehicle.body;
  const t = body.translation();
  const r = body.rotation();
  const q = { x: r.x, y: r.y, z: r.z, w: r.w };
  // the forward direction of the car
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const fl = Math.hypot(fx, fz) || 1;
  const info = { x: t.x, y: t.y, z: t.z, fx: fx / fl, fz: fz / fl, heading: game.vehicle.heading };
  window.__carInfo = info;
  return info;
});
console.log('car', JSON.stringify(info));

const views = [
  { name: 'front', offset: [3.4, 1.5, 4.2] },
  { name: 'side', offset: [6.2, 1.3, 0.2] },
  { name: 'rear', offset: [-3.4, 1.6, -4.4] },
  { name: 'top', offset: [0.6, 5.2, 2.2] },
];

for (const view of views) {
  await page.evaluate((v) => {
    const game = window.openRoad;
    const info = window.__carInfo;
    const camera = game.renderer.camera;
    const cos = Math.cos(info.heading);
    const sin = Math.sin(info.heading);
    const [ox, oy, oz] = v.offset;
    const x = info.x + ox * cos + oz * sin;
    const z = info.z - ox * sin + oz * cos;
    camera.position.set(x, info.y + oy, z);
    camera.lookAt(info.x, info.y + 0.2, info.z);
    game.renderer.render();
  }, view);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}-${view.name}.png`, timeout: 60000 });
  console.log('shot', view.name);
}

await browser.close();
console.log('done');

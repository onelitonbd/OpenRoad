/**
 * Drives the car to a few places of the world and takes a screenshot of each
 * one. It is the quickest way to check that every region looks right.
 *
 *   node tools/smoke/tour.mjs http://127.0.0.1:4173/
 */
import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

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

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, { timeout: 120000 });
await page.waitForTimeout(3000);

// The places we want to see.
const places = [
  { name: 'downtown', x: 0, z: 0 },
  { name: 'suburb', x: 700, z: 0 },
  { name: 'countryside', x: 300, z: 1700 },
  { name: 'mountains', x: -2800, z: -900 },
  { name: 'desert', x: 2700, z: 600 },
  { name: 'coast', x: 400, z: 2400 },
  { name: 'shoreline', x: 400, z: 2680 },
  { name: 'sea', x: 200, z: 3300 },
];

mkdirSync('tools/smoke/shots', { recursive: true });

for (const place of places) {
  await page.evaluate((p) => {
    const g = window.openRoad;
    const y = g.world.heightAt(p.x, p.z);
    g.vehicle.resetTo(p.x, y + 2, p.z, 0);
    g.cameraRig.snapTo(g.vehicle);
  }, place);

  // Let the chunks stream in.
  await page.waitForTimeout(6000);
  await page.evaluate((p) => {
    const g = window.openRoad;
    g.cameraRig.snapTo(g.vehicle);
  }, place);
  await page.waitForTimeout(500);

  await page.screenshot({ path: `tools/smoke/shots/${place.name}.png` });
  const info = await page.evaluate(() => {
    const g = window.openRoad;
    const p = g.vehicle.body.translation();
    return {
      pos: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
      chunks: g.world.loadedCount,
      calls: g.renderer.renderer.info.render.calls,
      tris: g.renderer.renderer.info.render.triangles,
    };
  });
  console.log(place.name, JSON.stringify(info));
}

await browser.close();
console.log('done');

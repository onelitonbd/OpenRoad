/** Puts the camera next to the traffic and takes a screenshot. */
import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const executablePath = await sparticuz.executablePath();
try {
  const { inflate } = await import('@sparticuz/chromium');
  await inflate('/home/user/OpenRoad/node_modules/@sparticuz/chromium/bin/al2023.tar.br');
} catch {}
process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH ?? ''}`;
const browser = await playwright.launch({ executablePath, headless: true, args: sparticuz.args.filter((a) => a !== '--single-process'), chromiumSandbox: false, env: { ...process.env } });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, { timeout: 120000 });
await page.waitForTimeout(9000);

// Move the player next to the closest AI car and look at it.
const info = await page.evaluate(() => {
  const g = window.openRoad;
  const cars = g.traffic.cars ?? [];
  if (cars.length === 0) return null;
  const player = g.vehicle.body.translation();
  let best = null;
  let bestDistance = Infinity;
  for (const car of cars) {
    const p = car.position;
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < bestDistance) { bestDistance = d; best = car; }
  }
  const p = best.position;
  const y = g.world.heightAt(p.x, p.z);
  g.vehicle.resetTo(p.x - 18, y + 2, p.z - 10, 0);
  g.cameraRig.snapTo(g.vehicle);
  return { x: Math.round(p.x), z: Math.round(p.z), distance: Math.round(bestDistance), speed: Math.round(best.speed * 3.6) };
});
console.log('closest car', JSON.stringify(info));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'tools/smoke/shots/traffic.png', timeout: 180000 });
console.log('done');
await browser.close();

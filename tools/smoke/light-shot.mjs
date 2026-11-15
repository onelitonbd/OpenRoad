/** Puts the camera next to a traffic light and takes a screenshot. */
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
await page.waitForTimeout(7000);

const info = await page.evaluate(() => {
  const g = window.openRoad;
  const player = g.vehicle.body.translation();
  const spots = g.traffic.lights.poleSpots;
  let best = null;
  let bestDistance = Infinity;
  for (const p of spots) {
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < bestDistance) { bestDistance = d; best = { x: p.x, z: p.z }; }
  }
  if (!best) return null;
  const y = g.world.heightAt(best.x, best.z);
  // Stand 14 m in front of the pole, looking at it.
  g.vehicle.resetTo(best.x - 14, y + 1, best.z - 14, Math.PI * 0.25);
  g.cameraRig.snapTo(g.vehicle);
  return { x: Math.round(best.x), z: Math.round(best.z), d: Math.round(bestDistance) };
});
console.log('pole', JSON.stringify(info));
await page.waitForTimeout(5000);
await page.screenshot({ path: 'tools/smoke/shots/light.png', timeout: 180000 });
console.log('done');
await browser.close();

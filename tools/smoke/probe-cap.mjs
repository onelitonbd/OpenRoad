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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(12000);
const info = await page.evaluate(() => {
  const g = window.openRoad;
  const player = g.vehicle.body.translation();
  let inRing = 0, outRing = 0, minDist = Infinity, maxDist = 0;
  for (const car of g.traffic.cars) {
    const p = car.position;
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    minDist = Math.min(minDist, d);
    maxDist = Math.max(maxDist, d);
    if (d >= 150 && d <= 400) inRing++; else outRing++;
  }
  return {
    preset: g.settings?.preset?.name ?? 'unknown',
    cap: g.settings?.preset?.trafficCap ?? null,
    cars: g.traffic.count,
    physics: g.traffic.physicsCount,
    inRing, outRing,
    minDist: Math.round(minDist),
    maxDist: Math.round(maxDist),
    calls: g.renderer.renderer.info.render.calls,
    tris: g.renderer.renderer.info.render.triangles,
  };
});
console.log(JSON.stringify(info));
await browser.close();

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
await page.waitForFunction(() => window.__openroad?.ready === true, { timeout: 120000 });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const g = window.openRoad;
    const cars = g.traffic.cars ?? [];
    const speeds = cars.map((c) => Math.round(c.speed * 3.6));
    let below = 0;
    for (const car of cars) if (car.position.y < -1) below++;
    return {
      t: Math.round(performance.now() / 1000),
      cars: cars.length,
      physics: g.traffic.physicsCount,
      speeds,
      below,
      edges: [...new Set(cars.map((c) => c.path.edgeId))].length,
    };
  });
  console.log(JSON.stringify(info));
}
await browser.close();

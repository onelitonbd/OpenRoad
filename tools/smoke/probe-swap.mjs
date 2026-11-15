/** Checks that the swap between the physics and the kinematic mode is not visible. */
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
await page.waitForTimeout(10000);

const result = await page.evaluate(async () => {
  const g = window.openRoad;
  const previous = new Map();
  const modes = new Map();
  for (const car of g.traffic.cars) {
    previous.set(car, { x: car.mesh.group.position.x, z: car.mesh.group.position.z });
    modes.set(car, car.physicsMode);
  }
  // The jump of a car is compared with the biggest jump of the cars that
  // did not change their mode. A swap must not stand out.
  const swapJumps = [];
  const normalJumps = [];
  let frames = 0;
  const start = performance.now();
  while (performance.now() - start < 15000) {
    await new Promise((r) => requestAnimationFrame(r));
    frames++;
    for (const car of g.traffic.cars) {
      const p = car.mesh.group.position;
      const before = previous.get(car);
      if (!before) { previous.set(car, { x: p.x, z: p.z }); continue; }
      const jump = Math.hypot(p.x - before.x, p.z - before.z);
      previous.set(car, { x: p.x, z: p.z });
      if (modes.get(car) !== car.physicsMode) {
        swapJumps.push(jump);
        modes.set(car, car.physicsMode);
      } else {
        normalJumps.push(jump);
      }
    }
  }
  normalJumps.sort((a, b) => a - b);
  const median = normalJumps[Math.floor(normalJumps.length / 2)] ?? 0;
  const p99 = normalJumps[Math.floor(normalJumps.length * 0.99)] ?? 0;
  return {
    frames,
    swaps: swapJumps.length,
    swapJumps: swapJumps.map((v) => v.toFixed(2)).join(', '),
    median: median.toFixed(3),
    p99: p99.toFixed(3),
    maxNormal: (normalJumps[normalJumps.length - 1] ?? 0).toFixed(2),
  };
});
console.log(JSON.stringify(result));
await browser.close();

/** Opens the F3 debug view and takes a screenshot. */
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
await page.waitForTimeout(8000);
await page.keyboard.press('F3');
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const g = window.openRoad;
  return {
    debugVisible: g.debug.isVisible,
    roadDebugVisible: g.roadDebug.visible,
    trafficDebugVisible: g.traffic.debugLines.visible,
    aiLines: g.traffic.debugLines.geometry.getAttribute('position')?.count ?? 0,
    lights: g.traffic.lights.count,
    cars: g.traffic.count,
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: 'tools/smoke/shots/debug.png', timeout: 180000 });
console.log('done');
await browser.close();

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

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(4000);

// Lift every road by half a metre so it is clearly visible.
await page.evaluate(() => {
  const g = window.openRoad;
  for (const mesh of g.roadRenderer.group.children) {
    mesh.position.y = 0.5;
    mesh.updateMatrix();
  }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tools/smoke/roads-lifted.png' });

// Hide the terrain to see the roads on their own.
await page.evaluate(() => {
  const g = window.openRoad;
  g.world.group.visible = false;
  for (const mesh of g.roadRenderer.group.children) {
    mesh.position.y = 0;
    mesh.updateMatrix();
  }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tools/smoke/roads-only.png' });

console.log('done');
await browser.close();

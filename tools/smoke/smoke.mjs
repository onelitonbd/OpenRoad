/**
 * Head-less smoke test of the built game.
 *
 * It starts a browser, loads the game, waits a few seconds and reports the
 * FPS, the number of draw calls and any error that was printed.
 *
 * The test needs a Chromium build. In this sandbox we use the one from
 * `@sparticuz/chromium` (it ships the binary inside the npm package, so no
 * system download is needed):
 *
 *   npm i -D @sparticuz/chromium playwright-core
 *   npm run build
 *   npx vite preview --port 4173
 *   node tools/smoke/smoke.mjs http://127.0.0.1:4173/
 */
import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const shot = process.argv[3] ?? 'tools/smoke/screenshot.png';

// The Chromium build needs a few extra shared libraries. They live in the
// same package, so we unpack them next to the binary.
const executablePath = await sparticuz.executablePath();
try {
  const { inflate } = await import('@sparticuz/chromium');
  await inflate('/home/user/OpenRoad/node_modules/@sparticuz/chromium/bin/al2023.tar.br');
} catch {
  // The libraries were already unpacked - that is fine.
}
process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH ?? ''}`;

const browser = await playwright.launch({
  executablePath,
  headless: true,
  args: sparticuz.args.filter((a) => a !== '--single-process'),
  chromiumSandbox: false,
  env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH },
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });

// Wait until the game is ready.
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });

// Let the world stream in.
await page.waitForTimeout(6000);

// Drive for a moment.
await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyW');

// Open the debug overlay.
await page.keyboard.press('F3');
await page.waitForTimeout(1500);

const stats = await page.evaluate(() => window.__openroad?.stats?.() ?? null);
const debugText = await page.evaluate(() => {
  const el = document.querySelector('#debug') ?? document.querySelector('.debug-overlay');
  return el ? el.textContent : null;
});

console.log('--- console errors ---');
for (const error of errors) console.log(error);
console.log('--- stats ---');
console.log(JSON.stringify(stats, null, 2));
console.log('--- debug overlay ---');
console.log(debugText);

mkdirSync('tools/smoke', { recursive: true });
await page.screenshot({ path: shot, timeout: 180000 });
console.log(`screenshot: ${shot}`);

await browser.close();

if (errors.length > 0) {
  console.log(`FAILED: ${errors.length} console errors`);
  process.exit(1);
}
if (!stats || stats.drawCalls === 0) {
  console.log('FAILED: nothing was rendered');
  process.exit(1);
}
console.log('OK');

/**
 * Smoke test of a deployed build (the Vercel production URL).
 *
 * The game is loaded from the network, driven for a few seconds and then
 * checked for:
 *
 *   - console or page errors,
 *   - a rendered frame (draw calls),
 *   - AI traffic that is driving (cars, physics cars, moving cars),
 *   - cars that stay above the ground.
 *
 * A JSON report and a screenshot are written so the result can be archived.
 *
 * The sandbox that develops the game cannot reach the deployment host, so
 * this test runs on a GitHub runner:
 *
 *   npm i --no-save playwright
 *   npx playwright install --with-deps chromium
 *   node tools/smoke/production-smoke.mjs https://example.vercel.app/ report.json shot.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'https://openroad-six-ivory.vercel.app/';
const reportPath = process.argv[3] ?? null;
const shotPath = process.argv[4] ?? null;

/**
 * Chromium comes from three possible places:
 *   1. `CHROMIUM_PATH` - a browser that was installed by Playwright.
 *   2. `playwright` - the full package with its own browser download.
 *   3. `@sparticuz/chromium` - the browser that ships with the npm package.
 */
async function launchBrowser() {
  const args = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
  ];

  if (process.env.CHROMIUM_PATH) {
    const { chromium } = await import('playwright-core');
    return chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args,
      chromiumSandbox: false,
    });
  }

  try {
    const { chromium } = await import('playwright');
    return chromium.launch({ headless: true, args });
  } catch {
    const { chromium } = await import('playwright-core');
    const sparticuz = (await import('@sparticuz/chromium')).default;
    const executablePath = await sparticuz.executablePath();
    try {
      const { inflate } = await import('@sparticuz/chromium');
      await inflate('/home/user/OpenRoad/node_modules/@sparticuz/chromium/bin/al2023.tar.br');
    } catch {
      // The libraries were already unpacked - that is fine.
    }
    process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH ?? ''}`;
    return chromium.launch({
      executablePath,
      headless: true,
      args: [...args, ...sparticuz.args.filter((a) => a !== '--single-process')],
      chromiumSandbox: false,
      env: { ...process.env },
    });
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

const report = {
  url,
  ok: false,
  errors,
  stats: null,
  traffic: [],
  debugOverlay: null,
};

try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__openroad?.ready === true, { timeout: 180000 });

  // Let the world stream in and the traffic spawn.
  await page.waitForTimeout(8000);

  // Drive for a moment so the physics and the traffic are awake.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyW');

  // Sample the traffic a few times, so we can see the cars moving.
  for (let i = 0; i < 5; i++) {
    const sample = await page.evaluate(() => {
      const game = window.openRoad;
      const cars = game?.traffic?.cars ?? [];
      let below = 0;
      let moving = 0;
      for (const car of cars) {
        if ((car.position?.y ?? 0) < -1) below += 1;
        if (Math.abs(car.speed ?? 0) > 0.5) moving += 1;
      }
      return {
        t: Math.round(performance.now() / 1000),
        cars: cars.length,
        physics: game?.traffic?.physicsCount ?? 0,
        moving,
        below,
        speeds: cars.map((car) => Math.round((car.speed ?? 0) * 3.6)),
      };
    });
    report.traffic.push(sample);
    await page.waitForTimeout(2000);
  }

  // Open the debug overlay for the AI numbers.
  await page.keyboard.press('F3');
  await page.waitForTimeout(1500);

  report.stats = await page.evaluate(() => window.__openroad?.stats?.() ?? null);
  report.debugOverlay = await page.evaluate(() => {
    const el = document.querySelector('#debug') ?? document.querySelector('.debug-overlay');
    return el ? el.textContent : null;
  });

  if (shotPath) {
    mkdirSync(dirname(shotPath), { recursive: true });
    await page.screenshot({ path: shotPath, timeout: 180000 });
  }
} catch (error) {
  errors.push(`fatal: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

const last = report.traffic[report.traffic.length - 1] ?? null;
const anyMoving = report.traffic.some((sample) => sample.moving > 0);

report.ok =
  errors.length === 0 &&
  !!report.stats &&
  report.stats.drawCalls > 0 &&
  !!last &&
  last.cars > 0 &&
  last.physics > 0 &&
  anyMoving &&
  last.below === 0;

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log('--- production smoke report ---');
console.log(JSON.stringify(report, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## Production smoke test',
    '',
    `- URL: ${url}`,
    `- Result: ${report.ok ? '**OK**' : '**FAILED**'}`,
    `- Console errors: ${errors.length}`,
    `- Draw calls: ${report.stats?.drawCalls ?? 'n/a'}`,
    `- Triangles: ${report.stats?.triangles ?? 'n/a'}`,
    `- FPS: ${report.stats?.fps ?? 'n/a'}`,
    `- Chunks: ${report.stats?.chunksLoaded ?? 'n/a'} loaded / ${report.stats?.chunkQueue ?? 'n/a'} queued`,
    `- Traffic: ${last ? `${last.cars} cars, ${last.physics} with physics, ${last.moving} moving` : 'n/a'}`,
    '',
    '```',
    report.debugOverlay ?? 'no debug overlay',
    '```',
  ].join('\n');
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, { flag: 'a' });
}

if (!report.ok) {
  console.log('FAILED: the deployed build did not pass the smoke test');
  process.exit(1);
}
console.log('OK: the deployed build boots, renders and drives with AI traffic.');

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

/**
 * Reads the state of the road network: how many roads there are, a
 * fingerprint of their geometry and how many of them lie outside the
 * fixed border of the map (4000 m from the centre).
 */
async function readMapState(page) {
  return page.evaluate(() => {
    const roads = window.openRoad?.world?.roads;
    if (!roads) return { edges: 0, nodes: 0, signature: 'none', outside: -1 };
    let outside = 0;
    let hash = 0;
    for (const edge of roads.edges) {
      for (let i = 0; i < edge.points.length; i += 2) {
        const x = edge.points[i];
        const z = edge.points[i + 1];
        if (Math.max(Math.abs(x), Math.abs(z)) > 4000) outside += 1;
      }
      // A fingerprint of the road: it has to stay the same while the
      // player drives - no road may appear out of nowhere.
      const part = `${edge.id}:${edge.type}:${edge.points.length}:${edge.a}:${edge.b}`;
      for (let i = 0; i < part.length; i++) {
        hash = (Math.imul(hash, 31) + part.charCodeAt(i)) | 0;
      }
    }
    return {
      edges: roads.edges.length,
      nodes: roads.nodes.length,
      signature: hash.toString(16),
      outside,
    };
  });
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
  mobile: null,
  map: null,
  gearbox: null,
  roadMeshes: null,
  car: null,
  trafficModels: null,
};

try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 180000 });

  // Let the world stream in and the traffic spawn.
  await page.waitForTimeout(8000);

  // The road network has to stay exactly the same while the player
  // drives: no road may appear out of nowhere.
  const mapBefore = await readMapState(page);

  // Drive for a moment so the physics and the traffic are awake.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyW');

  const mapAfter = await readMapState(page);
  report.map = {
    before: mapBefore,
    after: mapAfter,
    stable: mapBefore.signature === mapAfter.signature,
    insideBounds: mapAfter.outside === 0,
  };

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

  // The brake has to stop the car and it may not engage the reverse gear.
  // The reverse is a pedal of its own.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(6000);
  const braking = await page.evaluate(() => ({
    gear: window.openRoad?.vehicle?.currentGear ?? 0,
    speed: window.openRoad?.vehicle?.forwardSpeed ?? 0,
  }));
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyX');
  await page.waitForTimeout(5000);
  const reversing = await page.evaluate(() => ({
    gear: window.openRoad?.vehicle?.currentGear ?? 0,
    speed: window.openRoad?.vehicle?.forwardSpeed ?? 0,
  }));
  await page.keyboard.up('KeyX');
  report.gearbox = {
    brakeGear: braking.gear,
    brakeSpeed: braking.speed,
    reverseGear: reversing.gear,
    reverseSpeed: reversing.speed,
  };

  // Every road near the car has to have its mesh already - otherwise a
  // road appears right in front of the car while it is driving.
  const roadMeshes = await page.evaluate(() => {
    const game = window.openRoad;
    const renderer = game?.roadRenderer;
    const roads = game?.world?.roads;
    const position = game?.vehicle?.body?.translation?.();
    if (!renderer || !roads || !position) return { near: 0, missing: -1, meshes: 0 };
    // An older build does not have the method - then the check cannot run.
    if (typeof renderer.hasMesh !== 'function') {
      return { near: 0, missing: -1, meshes: renderer.meshCount ?? 0 };
    }
    const near = roads.roadsInRadius(position.x, position.z, 150);
    const missing = near.filter((edge) => !renderer.hasMesh(edge.id)).length;
    return { near: near.length, missing, meshes: renderer.meshCount };
  });
  report.roadMeshes = roadMeshes;

  // The car of the player has to have four wheels that stand next to it.
  // The wheels are children of the car, so their position is local - a
  // wheel that stands thousands of metres away means that the world space
  // of the physics was used as a local position.
  const car = await page.evaluate(() => {
    const game = window.openRoad;
    const group = game?.vehicle?.object;
    const build = window.__openroad?.build ?? null;
    if (!group) return { build, checked: false, wheels: 0, maxOffset: 999 };
    const wheels = group.children.filter(
      (child) => typeof child.name === 'string' && child.name.startsWith('wheel_'),
    );
    let maxOffset = 0;
    for (const wheel of wheels) {
      maxOffset = Math.max(
        maxOffset,
        Math.hypot(wheel.position.x, wheel.position.y, wheel.position.z),
      );
    }
    // A car that is built from a 3D model uses a texture.
    const model = group.children.some((child) => child.isMesh && !!child.material?.map);
    return {
      build,
      checked: build === 'car-models-1',
      wheels: wheels.length,
      maxOffset: Number(maxOffset.toFixed(3)),
      model,
    };
  });
  report.car = car;

  // The cars of the traffic have to use their 3D model as well. A car
  // that fell back to the built in car has no texture.
  const trafficModels = await page.evaluate(() => {
    const cars = window.openRoad?.traffic?.cars ?? [];
    let withModel = 0;
    for (const car of cars) {
      const group = car?.mesh?.group;
      if (!group) continue;
      let textured = false;
      group.traverse((child) => {
        if (!child.isMesh) return;
        const material = child.material;
        const mapped = Array.isArray(material)
          ? material.some((m) => !!m?.map)
          : !!material?.map;
        if (mapped) textured = true;
      });
      if (textured) withModel += 1;
    }
    return { cars: cars.length, withModel };
  });
  report.trafficModels = trafficModels;

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

  // The desktop page is closed before the phone is tested: the software
  // renderer is slow and two pages at once would starve the phone.
  await page.close();
} catch (error) {
  errors.push(`fatal: ${error instanceof Error ? error.message : String(error)}`);
}

// --- the same build on a phone ----------------------------------------------
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
  });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => errors.push(`mobile pageerror: ${error.message}`));

  await phone.goto(url, { waitUntil: 'load', timeout: 120000 });
  await phone.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 180000 });
  await phone.waitForTimeout(3000);

  const landscape = await phone.evaluate(() => {
    const panel = document.querySelector('.touch-controls');
    const buttons = [...document.querySelectorAll('.touch-btn')];
    const rotate = document.querySelector('.rotate-overlay');
    return {
      controlsVisible: panel ? !panel.classList.contains('hidden') : false,
      buttons: buttons.length,
      hasFullscreen: buttons.some((b) => b.textContent.trim() === 'FULL'),
      rotateVisible: rotate ? !rotate.classList.contains('hidden') : false,
    };
  });

  // The phone held upright has to show the "turn your phone" screen.
  const portraitContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
  });
  const portrait = await portraitContext.newPage();
  await portrait.goto(url, { waitUntil: 'load', timeout: 120000 });
  await portrait.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 180000 });
  await portrait.waitForTimeout(2500);
  const portraitRotate = await portrait.evaluate(() => {
    const rotate = document.querySelector('.rotate-overlay');
    return rotate ? !rotate.classList.contains('hidden') : false;
  });

  report.mobile = {
    controlsVisible: landscape.controlsVisible,
    buttons: landscape.buttons,
    hasFullscreen: landscape.hasFullscreen,
    rotateVisibleInPortrait: portraitRotate,
    rotateVisibleInLandscape: landscape.rotateVisible,
  };

  await context.close();
  await portraitContext.close();
} catch (error) {
  errors.push(`mobile: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

const last = report.traffic[report.traffic.length - 1] ?? null;
const anyMoving = report.traffic.some((sample) => sample.moving > 0);
const mobile = report.mobile;

report.ok =
  errors.length === 0 &&
  !!report.stats &&
  report.stats.drawCalls > 0 &&
  !!last &&
  last.cars > 0 &&
  last.physics > 0 &&
  anyMoving &&
  last.below === 0 &&
  !!report.map &&
  report.map.stable &&
  report.map.insideBounds &&
  !!report.gearbox &&
  report.gearbox.brakeGear > 0 &&
  report.gearbox.reverseGear < 0 &&
  !!report.roadMeshes &&
  report.roadMeshes.missing >= 0 &&
  report.roadMeshes.missing === 0 &&
  !!report.car &&
  (!report.car.checked ||
    (report.car.wheels === 4 && report.car.maxOffset < 3)) &&
  (!report.car?.checked ||
    (!!report.trafficModels &&
      report.trafficModels.cars > 0 &&
      report.trafficModels.withModel === report.trafficModels.cars)) &&
  !!mobile &&
  mobile.controlsVisible &&
  mobile.hasFullscreen &&
  mobile.rotateVisibleInPortrait &&
  !mobile.rotateVisibleInLandscape;

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
    `- Map: ${report.map ? `${report.map.after.edges} roads, unchanged while driving: ${report.map.stable ? 'yes' : 'no'}, all inside the border: ${report.map.insideBounds ? 'yes' : 'no'}` : 'n/a'}`,
    `- Gearbox: brake gear ${report.gearbox?.brakeGear ?? 'n/a'}, reverse gear ${report.gearbox?.reverseGear ?? 'n/a'} at ${(report.gearbox?.reverseSpeed ?? 0).toFixed(1)} m/s`,
    `- Car: ${report.car?.wheels ?? 'n/a'} wheels, 3D model: ${report.car?.model ? 'yes' : 'no'}, wheel offset: ${report.car?.maxOffset ?? 'n/a'} m`,
    `- Traffic models: ${report.trafficModels ? `${report.trafficModels.withModel} of ${report.trafficModels.cars} cars use a 3D model` : 'n/a'}`,
    `- Road meshes: ${report.roadMeshes?.meshes ?? 'n/a'} built, ${report.roadMeshes?.missing ?? 'n/a'} of ${report.roadMeshes?.near ?? 'n/a'} roads near the car are missing`,
    `- Phone: ${mobile ? `${mobile.buttons} touch buttons, full screen ${mobile.hasFullscreen ? 'yes' : 'no'}, "turn your phone" in portrait: ${mobile.rotateVisibleInPortrait ? 'yes' : 'no'}` : 'n/a'}`,
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

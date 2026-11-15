/**
 * Head-less test of the mobile controls.
 *
 * The browser pretends to be an Android phone in landscape:
 *
 *   - the on-screen controls have to show up,
 *   - holding the gas pedal has to move the car,
 *   - dragging on the left half has to steer,
 *   - turning the phone upright has to show the "turn your phone" screen
 *     and stop the game,
 *   - turning it back has to remove that screen again.
 *
 *   npm run build
 *   npm run preview &
 *   node tools/smoke/mobile-test.mjs http://127.0.0.1:4173/
 */
import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';

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
  env: { ...process.env },
});

const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});

const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(4000);

// --- the controls have to show up -------------------------------------------
const controls = await page.evaluate(() => {
  const panel = document.querySelector('.touch-controls');
  const buttons = [...document.querySelectorAll('.touch-btn')];
  const visible = panel ? !panel.classList.contains('hidden') : false;
  return {
    visible,
    buttons: buttons.map((b) => b.textContent.trim()),
    hasFullscreen: buttons.some((b) => b.textContent.trim() === 'FULL'),
    touchMode: document.body.classList.contains('touch-mode'),
  };
});
check('the touch controls show up on a phone', controls.visible);
check('the touch mode is on', controls.touchMode);
check('there is a full screen button', controls.hasFullscreen);
check(
  'the controls have the buttons we need',
  ['◀', '▶', 'GAS', 'BRAKE', 'REV', 'HANDBRAKE', 'CAM', 'HORN', 'RST', 'II', 'FULL'].every(
    (label) => controls.buttons.includes(label),
  ),
  controls.buttons.join(' | '),
);

// --- every button has to be completely on the screen ------------------------
const outside = await page.evaluate(() => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return [...document.querySelectorAll('.touch-btn')]
    .map((b) => {
      const r = b.getBoundingClientRect();
      return {
        label: b.textContent.trim(),
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    })
    .filter((r) => r.left < 0 || r.top < 0 || r.right > width || r.bottom > height);
});
check(
  'every button is completely on the screen',
  outside.length === 0,
  outside.map((r) => `${r.label} ${r.left},${r.top} - ${r.right},${r.bottom}`).join(' | '),
);

// --- the gas pedal drives the car ------------------------------------------
const gas = await page.$('.touch-btn.throttle');
const gasBox = await gas.boundingBox();
await page.mouse.move(gasBox.x + gasBox.width / 2, gasBox.y + gasBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(3000);
const driving = await page.evaluate(() => ({
  speed: window.openRoad.vehicle.speedKmh,
  throttle: window.openRoad.input.state.throttle,
}));
await page.mouse.up();
check('the gas pedal gives throttle', driving.throttle > 0.5, `throttle=${driving.throttle}`);
check('the car drives with the gas pedal', driving.speed > 5, `${driving.speed.toFixed(1)} km/h`);

// --- the brake stops the car, the reverse drives backwards -------------------
await page.waitForTimeout(1500);
const brake = await page.$('.touch-btn.brake');
const brakeBox = await brake.boundingBox();
await page.mouse.move(brakeBox.x + brakeBox.width / 2, brakeBox.y + brakeBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(2500);
const braking = await page.evaluate(() => ({
  speed: window.openRoad.vehicle.speedKmh,
  gear: window.openRoad.vehicle.currentGear,
}));
await page.mouse.up();
check('the brake pedal stops the car', braking.speed < 2, `${braking.speed.toFixed(1)} km/h`);
check('the brake does not engage the reverse', braking.gear > 0, `gear ${braking.gear}`);

const reverse = await page.$('.touch-btn.reverse');
const reverseBox = await reverse.boundingBox();
await page.mouse.move(reverseBox.x + reverseBox.width / 2, reverseBox.y + reverseBox.height / 2);
await page.mouse.down();
// The software renderer in the test browser is slow, so the car needs a
// moment to build up speed.
await page.waitForTimeout(6000);
const reversing = await page.evaluate(() => ({
  speed: window.openRoad.vehicle.speedKmh,
  gear: window.openRoad.vehicle.currentGear,
  forward: window.openRoad.vehicle.forwardSpeed,
}));
await page.mouse.up();
check('the reverse pedal engages the reverse gear', reversing.gear < 0, `gear ${reversing.gear}`);
check(
  'the reverse pedal drives the car backwards',
  reversing.forward < -1.5,
  `${reversing.forward.toFixed(1)} m/s`,
);

// --- dragging steers --------------------------------------------------------
const steer = await page.evaluate(() => {
  const zone = document.querySelector('.touch-steer-zone');
  const rect = zone.getBoundingClientRect();
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
});
await page.mouse.move(steer.x + steer.w * 0.2, steer.y + steer.h * 0.6);
await page.mouse.down();
await page.mouse.move(steer.x + steer.w * 0.2 + 90, steer.y + steer.h * 0.6, { steps: 8 });
await page.waitForTimeout(400);
const steerValue = await page.evaluate(() => window.openRoad.input.state.steer);
await page.mouse.up();
// The state is rebuilt once per frame, and the test browser is slow, so
// wait for the frame that puts the steering back.
const steerReleased = await page
  .waitForFunction(() => Math.abs(window.openRoad.input.state.steer) < 0.05, undefined, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
const steerBack = await page.evaluate(() => window.openRoad.input.state.steer);
check('dragging steers the car', steerValue > 0.3, `steer=${steerValue.toFixed(2)}`);
check('the steering goes back to the middle', steerReleased, `steer=${steerBack.toFixed(2)}`);

// --- the buttons work --------------------------------------------------------
await page.click('.touch-btn.small-action');
// The software renderer is slow, so wait for the next frame instead of a
// fixed time.
const cameraChanged = await page
  .waitForFunction(() => window.openRoad.cameraRig.mode !== 'chase', undefined, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
const cameraMode = await page.evaluate(() => window.openRoad.cameraRig.mode);
check('the camera button changes the camera', cameraChanged, `camera=${cameraMode}`);

// --- the horn, the lights and the pause button ------------------------------
const toastText = async () =>
  page.evaluate(() => document.querySelector('.hud-toast')?.textContent ?? '');

await page.click('.touch-btn[title="Horn"]');
await page.waitForTimeout(600);
check('the horn button honks', (await toastText()).includes('honk'), await toastText());

await page.click('.touch-btn[title="Head lights"]');
await page.waitForTimeout(600);
check('the lights button works', (await toastText()).includes('lights'), await toastText());

await page.click('.touch-btn[title="Pause"]');
await page.waitForTimeout(600);
const paused = await page.evaluate(() => ({
  state: window.openRoad.state,
  overlay: Boolean(document.querySelector('.screen:not(.hidden)')),
}));
check('the pause button pauses the game', paused.state === 'paused', `state=${paused.state}`);
check('the pause screen shows up', paused.overlay);

await page.click('.screen .btn');
await page.waitForTimeout(600);
const resumed = await page.evaluate(() => window.openRoad.state);
check('the game continues after the pause', resumed === 'play', `state=${resumed}`);

// --- the full screen button -------------------------------------------------
await page.click('.touch-btn.touch-fullscreen');
await page.waitForTimeout(800);
const fullscreen = await page.evaluate(() => ({
  active: Boolean(document.fullscreenElement),
  toast: document.querySelector('.hud-toast')?.textContent ?? '',
}));
check(
  'the full screen button works',
  fullscreen.active || fullscreen.toast.length > 0,
  fullscreen.active ? 'the page is full screen' : `toast: ${fullscreen.toast}`,
);
if (fullscreen.active) {
  await page.click('.touch-btn.touch-fullscreen');
  const left = await page
    .waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!left) await page.evaluate(() => document.exitFullscreen?.());
  await page.waitForTimeout(500);
}

// --- the phone in portrait ---------------------------------------------------
mkdirSync('tools/smoke/shots', { recursive: true });
await page.screenshot({ path: 'tools/smoke/shots/mobile-landscape.png', timeout: 180000 });

// A second page in portrait: a full screen window cannot be resized, so the
// phone is simply held the other way round.
const portraitContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});
const portraitPage = await portraitContext.newPage();
portraitPage.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
await portraitPage.goto(url, { waitUntil: 'load', timeout: 60000 });
await portraitPage.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });
await portraitPage.waitForTimeout(2500);

const portrait = await portraitPage.evaluate(() => {
  const overlay = document.querySelector('.rotate-overlay');
  const position = window.openRoad.vehicle.body.translation();
  return {
    overlayVisible: overlay ? !overlay.classList.contains('hidden') : false,
    position: [position.x, position.z],
  };
});
check('the "turn your phone" screen shows up', portrait.overlayVisible);

await portraitPage.waitForTimeout(1500);
const portraitStill = await portraitPage.evaluate(() => {
  const position = window.openRoad.vehicle.body.translation();
  return [position.x, position.z];
});
const moved = Math.hypot(
  portraitStill[0] - portrait.position[0],
  portraitStill[1] - portrait.position[1],
);
check('the game waits while the phone is upright', moved < 0.5, `${moved.toFixed(2)} m`);

await portraitPage.screenshot({
  path: 'tools/smoke/shots/mobile-portrait.png',
  timeout: 180000,
});

// --- back to landscape -------------------------------------------------------
await portraitPage.setViewportSize({ width: 844, height: 390 });
await portraitPage.waitForTimeout(1500);
const landscapeAgain = await portraitPage.evaluate(() => {
  const overlay = document.querySelector('.rotate-overlay');
  return overlay ? !overlay.classList.contains('hidden') : false;
});
check('the "turn your phone" screen goes away again', !landscapeAgain);

await browser.close();

if (errors.length > 0) {
  console.log('--- console errors ---');
  for (const error of errors) console.log(error);
  failures.push(`${errors.length} console errors`);
}

if (failures.length > 0) {
  console.log(`FAILED: ${failures.length} checks failed`);
  process.exit(1);
}
console.log('OK: the mobile controls work.');

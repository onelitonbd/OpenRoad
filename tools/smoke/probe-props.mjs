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
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.openRoad;
  const y = g.world.heightAt(300, 1700);
  g.vehicle.resetTo(300, y + 2, 1700, 0);
});
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const g = window.openRoad;
  const out = { meshes: [], groupVisible: g.props.group.visible, children: g.props.group.children.length };
  for (const mesh of g.props.group.children) {
    out.meshes.push({ count: mesh.count, capacity: mesh.instanceMatrix.count, visible: mesh.visible });
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();

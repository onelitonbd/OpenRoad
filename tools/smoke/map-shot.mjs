/**
 * Draws the whole road network as a map image.
 *
 * The game only shows a small part of the world on the minimap, so this
 * script reads the road network out of the running game and draws all of
 * it into one picture.
 *
 *   npm run build
 *   npm run preview &
 *   node tools/smoke/map-shot.mjs http://127.0.0.1:4173/ tools/smoke/shots/map.png
 */
import { chromium as playwright } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'tools/smoke/shots/map.png';

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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__openroad?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(2500);

const dataUrl = await page.evaluate(() => {
  const roads = window.openRoad.world.roads;
  const size = 1000;
  const half = 4000;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d1220';
  ctx.fillRect(0, 0, size, size);

  const scale = size / (half * 2);
  const toMap = (x, z) => [(x + half) * scale, (z + half) * scale];

  const styles = {
    street: ['rgba(150,160,175,0.6)', 1.4],
    rural: ['rgba(190,180,140,0.75)', 1.8],
    switchback: ['rgba(220,200,180,0.8)', 1.8],
    coastal: ['#7fd4ff', 2],
    avenue: ['#8fb4e0', 2.4],
    highway: ['#f0c76a', 3.4],
  };

  for (const [type, [color, width]] of Object.entries(styles)) {
    ctx.beginPath();
    for (const edge of roads.edges) {
      if (edge.type !== type) continue;
      const count = edge.points.length / 2;
      for (let i = 0; i < count; i++) {
        const [px, py] = toMap(edge.points[i * 2], edge.points[i * 2 + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // The border of the map.
  ctx.strokeStyle = '#ff7a5c';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  return canvas.toDataURL('image/png');
});

await browser.close();

const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(base64, 'base64'));
console.log(`map: ${out}`);

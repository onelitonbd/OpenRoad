/**
 * Prints an ASCII map of the generated world so the terrain layout can be
 * checked without starting the browser.
 *
 * Run with: npm run test:terrain
 */
import { Terrain, WORLD_HALF } from '../src/world/Terrain';
import { REGION_NAMES, type RegionId } from '../src/world/Regions';

function main(): void {
  const terrain = new Terrain(1337);

  const cols = 76;
  const rows = 38;
  const stepX = (WORLD_HALF * 2) / cols;
  const stepZ = (WORLD_HALF * 2) / rows;

  const regionChars: Record<RegionId, string> = {
    downtown: 'D',
    suburb: 's',
    countryside: '.',
    mountain: '^',
    desert: 'd',
    coast: '~',
  };

  console.log(`World map ${WORLD_HALF * 2} x ${WORLD_HALF * 2} m (C = centre, +X right, +Z down)`);
  console.log('  +' + '-'.repeat(cols) + '+');

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const x = -WORLD_HALF + (c + 0.5) * stepX;
      const z = -WORLD_HALF + (r + 0.5) * stepZ;
      const region = terrain.regionAt(x, z);
      line += regionChars[region];
    }
    console.log(`${String(r * stepZ - WORLD_HALF).padStart(6)} |${line}|`);
  }
  console.log('  +' + '-'.repeat(cols) + '+');

  // Height statistics per region.
  console.log('\nHeight samples:');
  const samples: { label: string; x: number; z: number }[] = [
    { label: 'downtown', x: 0, z: 0 },
    { label: 'suburb', x: 620, z: 0 },
    { label: 'countryside', x: 0, z: 1800 },
    { label: 'mountains', x: -3200, z: -500 },
    { label: 'desert', x: 3200, z: 500 },
    { label: 'coast', x: 0, z: 2600 },
    { label: 'sea', x: 0, z: 3400 },
  ];
  for (const s of samples) {
    const h = terrain.height(s.x, s.z);
    const region = terrain.regionAt(s.x, s.z);
    console.log(
      `  ${s.label.padEnd(12)} (${String(s.x).padStart(5)}, ${String(s.z).padStart(5)})  ` +
        `height ${h.toFixed(1).padStart(7)} m   region ${REGION_NAMES[region]}`,
    );
  }

  // Check that the height function is continuous (no jumps between neighbours).
  let maxJump = 0;
  let jumpAt = '';
  for (let i = 0; i < 4000; i++) {
    const x = (Math.random() - 0.5) * WORLD_HALF * 1.9;
    const z = (Math.random() - 0.5) * WORLD_HALF * 1.9;
    const d = Math.abs(terrain.height(x, z) - terrain.height(x + 0.5, z + 0.5));
    if (d > maxJump) {
      maxJump = d;
      jumpAt = `(${x.toFixed(0)}, ${z.toFixed(0)})`;
    }
  }
  console.log(`\nBiggest height jump over 0.5 m: ${maxJump.toFixed(3)} m at ${jumpAt}`);
}

main();

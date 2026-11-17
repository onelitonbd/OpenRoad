/**
 * Prepares a Kenney Car Kit model for Open Road.
 *
 * The kit (https://kenney.nl/assets/car-kit) is public domain (CC0), so the
 * models can be shipped with the game. The models share one colour atlas per
 * file and the body paint is a flat swatch inside it. This script rewrites
 * that swatch so the car wears the colour of the Open Road palette while the
 * shading of the atlas is kept.
 *
 * Usage:
 *   node tools/prepare-car-model.mjs <source.glb> <target.glb> [paint]
 *
 * `paint` is the hex colour of the body (default: the Open Road red).
 *
 * The source archive can be fetched with:
 *   curl -L -o car-kit.zip \
 *     https://codeload.github.com/Arslan12216775/kenney_car-kit/zip/refs/heads/master
 *   unzip car-kit.zip
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

/* ------------------------------------------------------------------ PNG --- */

function decodePng(buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p];
    p += 1;
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pred) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, bpp, pixels: out };
}

function encodePng({ width, height, bpp, pixels }) {
  const stride = width * bpp;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunks = [];
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = bpp === 4 ? 6 : 2; // colour type
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  chunks.push(signature);
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ GLB --- */

function readGlb(buffer) {
  let pos = 12;
  let json = null;
  let bin = null;
  while (pos < buffer.length) {
    const length = buffer.readUInt32LE(pos);
    const type = buffer.readUInt32LE(pos + 4);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    pos += 8 + length;
  }
  return { json, bin };
}

function writeGlb(json, bin) {
  const jsonText = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonText.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc(jsonPad, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

/* ----------------------------------------------------------------- main --- */

const [, , source, target, paintHex = '#ff5d5d', sourcePaint] = process.argv;
if (!source || !target) {
  console.error(
    'usage: node tools/prepare-car-model.mjs <source.glb> <target.glb> [paint] [source-paint]',
  );
  process.exit(1);
}

const { json, bin } = readGlb(readFileSync(source));
const image = json.images?.[0];
if (!image || image.bufferView === undefined) {
  console.error('the model has no embedded texture');
  process.exit(1);
}
const view = json.bufferViews[image.bufferView];
const png = decodePng(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength));

// --- find the colour of the body paint -----------------------------------
// The atlas is a grid of flat swatches. The paint is the warm colour that the
// body mesh uses the most.
const bodyMesh = json.meshes.find((m) => m.name === 'body');
if (!bodyMesh) {
  console.error('the model has no "body" mesh');
  process.exit(1);
}
const primitive = bodyMesh.primitives[0];
const uvAccessor = json.accessors[primitive.attributes.TEXCOORD_0];
const uvView = json.bufferViews[uvAccessor.bufferView];
const uvOffset = (uvView.byteOffset ?? 0) + (uvAccessor.byteOffset ?? 0);
const uvCount = uvAccessor.count;

const at = (u, v) => {
  const x = Math.min(png.width - 1, Math.max(0, Math.round(u * png.width - 0.5)));
  const y = Math.min(png.height - 1, Math.max(0, Math.round(v * png.height - 0.5)));
  const i = (y * png.width + x) * png.bpp;
  return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]];
};

const counts = new Map();
const forcedPaint = sourcePaint
  ? sourcePaint.split(',').map((v) => Number(v.trim()))
  : null;
for (let i = 0; i < uvCount; i++) {
  const u = bin.readFloatLE(uvOffset + i * 8);
  const v = bin.readFloatLE(uvOffset + i * 8 + 4);
  const [r, g, b] = at(u, v);
  // A saturated colour - that rules out the glass, the tyres and the chrome.
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 45) continue;
  if (r + g + b < 90) continue;
  const key = `${r},${g},${b}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const paint = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
if (!paint && !forcedPaint) {
  console.error('no paint colour found');
  process.exit(1);
}
const [pr, pg, pb] = forcedPaint ?? paint[0].split(',').map(Number);
console.log(`paint colour found: rgb(${pr}, ${pg}, ${pb})`);

// --- repaint ---------------------------------------------------------------
const targetRgb = [
  parseInt(paintHex.slice(1, 3), 16),
  parseInt(paintHex.slice(3, 5), 16),
  parseInt(paintHex.slice(5, 7), 16),
];
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const baseLuma = luma(pr, pg, pb);
const tolerance = 14;
let changed = 0;
for (let i = 0; i < png.pixels.length; i += png.bpp) {
  const r = png.pixels[i];
  const g = png.pixels[i + 1];
  const b = png.pixels[i + 2];
  if (Math.abs(r - pr) > tolerance) continue;
  if (Math.abs(g - pg) > tolerance) continue;
  if (Math.abs(b - pb) > tolerance) continue;
  // keep the shading of the atlas, only swap the colour
  const scale = baseLuma > 0 ? luma(r, g, b) / baseLuma : 1;
  png.pixels[i] = Math.min(255, Math.round(targetRgb[0] * scale));
  png.pixels[i + 1] = Math.min(255, Math.round(targetRgb[1] * scale));
  png.pixels[i + 2] = Math.min(255, Math.round(targetRgb[2] * scale));
  changed += 1;
}
console.log(`repainted ${changed} pixels to ${paintHex}`);

// --- write the new glb -----------------------------------------------------
const newPng = encodePng(png);
const newBin = Buffer.concat([
  bin.subarray(0, view.byteOffset),
  newPng,
  bin.subarray(view.byteOffset + view.byteLength),
]);
view.byteLength = newPng.length;
json.buffers[0].byteLength = newBin.length;
writeFileSync(target, writeGlb(json, newBin));
console.log(`wrote ${target} (${newBin.length} bytes of binary data)`);

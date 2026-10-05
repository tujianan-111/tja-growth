import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(root, 'assets');
mkdirSync(outputDirectory, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const body = Buffer.concat([typeBuffer, data]);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(crc32(body), 8 + data.length);
  return result;
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blend(target, offset, color, alpha) {
  const amount = Math.max(0, Math.min(1, alpha));
  const inverse = 1 - amount;
  target[offset] = Math.round(target[offset] * inverse + color[0] * amount);
  target[offset + 1] = Math.round(target[offset + 1] * inverse + color[1] * amount);
  target[offset + 2] = Math.round(target[offset + 2] * inverse + color[2] * amount);
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function coverage(distance, radius, feather) {
  return Math.max(0, Math.min(1, (radius + feather - distance) / (feather * 2)));
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const points = [
    [128, 338],
    [216, 242],
    [306, 289],
    [388, 151],
  ].map(([x, y]) => [x * scale, y * scale]);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      pixels[offset] = 35;
      pixels[offset + 1] = 35;
      pixels[offset + 2] = 33;
      pixels[offset + 3] = 255;

      const topGlowDistance = Math.hypot(x - 410 * scale, y - 100 * scale);
      blend(pixels, offset, [255, 255, 255], coverage(topGlowDistance, 112 * scale, 1.5) * 0.035);
      const bottomGlowDistance = Math.hypot(x - 82 * scale, y - 438 * scale);
      blend(pixels, offset, [139, 162, 143], coverage(bottomGlowDistance, 144 * scale, 1.5) * 0.08);

      for (let index = 0; index < points.length - 1; index += 1) {
        const distance = segmentDistance(x, y, points[index][0], points[index][1], points[index + 1][0], points[index + 1][1]);
        blend(pixels, offset, [250, 248, 240], coverage(distance, 19 * scale, 0.8));
      }
      for (let index = 0; index < points.length - 1; index += 1) {
        const distance = Math.hypot(x - points[index][0], y - points[index][1]);
        blend(pixels, offset, [250, 248, 240], coverage(distance, (index === 0 ? 26 : 24) * scale, 0.8));
      }
      const finalDistance = Math.hypot(x - points[3][0], y - points[3][1]);
      blend(pixels, offset, [35, 35, 33], coverage(finalDistance, 45 * scale, 0.8));
      blend(pixels, offset, [139, 162, 143], coverage(finalDistance, 38 * scale, 0.8));
    }
  }

  return encodePng(size, size, pixels);
}

for (const size of [180, 192, 512]) {
  writeFileSync(join(outputDirectory, `icon-${size}.png`), renderIcon(size));
}
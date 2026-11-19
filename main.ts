// gta6-meme-x-01 entry (Node 22+, standard library only).
//
// What this program does, in order:
//   1. Copies POST.json from the repository root to /output/POST.json —
//      that is the file the gate reads. (The post itself is the entry:
//      the house reads it from X, so nothing written here is judged.)
//   2. Draws the meme picture (meme.png) procedurally into /output —
//      a GTA 6 launch-day joke with make.fun's ghost mascot in the scene.
//      No network, no wall clock, no files outside the repository:
//      two runs write byte-identical files.
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------- PNG ---

// CRC-32 (IEEE) table, built once at load.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

// Encodes RGB bytes (width * height * 3) as a deterministic PNG:
// truecolor, no interlace, filter None on every row, zlib level 9.
function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: None
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      raw,
      y * (1 + width * 3) + 1,
    );
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- canvas ---

type RGB = [number, number, number];

const W = 1200;
const H = 675;

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    // Floor/ceil the bounds: TypedArray indices must be integers, and a
    // fractional bound would silently write nothing at all.
    const xa = Math.max(0, Math.floor(x0));
    const xb = Math.min(this.w, Math.ceil(x1));
    const ya = Math.max(0, Math.floor(y0));
    const yb = Math.min(this.h, Math.ceil(y1));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) this.set(x, y, c);
    }
  }
  // Vertical gradient between color stops: [[y, color], ...], sorted by y.
  vGradient(stops: Array<[number, RGB]>): void {
    for (let y = 0; y < this.h; y++) {
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (y >= stops[i][0] && y <= stops[i + 1][0]) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const t = b[0] === a[0] ? 0 : (y - a[0]) / (b[0] - a[0]);
      const c: RGB = [
        Math.round(a[1][0] + (b[1][0] - a[1][0]) * t),
        Math.round(a[1][1] + (b[1][1] - a[1][1]) * t),
        Math.round(a[1][2] + (b[1][2] - a[1][2]) * t),
      ];
      for (let x = 0; x < this.w; x++) this.set(x, y, c);
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, c);
      }
    }
  }
  // Bresenham line, with a square brush of the given thickness.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.fillRect(x - Math.floor(thick / 2), y - Math.floor(thick / 2), x + Math.ceil(thick / 2), y + Math.ceil(thick / 2), c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  // Filled polygon (scanline fill), points as [x, y] pairs.
  polygon(points: Array<[number, number]>, c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.set(x, y, c);
      }
    }
  }
}

// --------------------------------------------------------------- font ---
// 5x7 bitmap font. Each glyph is 7 rows of 5 bits; bit 4 is the leftmost
// pixel. Uppercase covers the headlines; a few lowercase letters cover
// the "make.fun" wordmark exactly as the brand writes it.

const GLYPHS: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  a: [0, 0, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  e: [0, 0, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x08],
  k: [0, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  m: [0, 0, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0, 0, 0x1a, 0x15, 0x11, 0x11, 0x11],
  u: [0, 0, 0x11, 0x11, 0x11, 0x13, 0x0d],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

// Draws text at (x, y); returns the width drawn. With an outline color,
// the glyph is first stamped in that color at small offsets, so the fill
// reads on any background.
function drawText(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  fill: RGB,
  outline: RGB | null = null,
): number {
  const draw = (ox: number, oy: number, c: RGB) => {
    let cx = x + ox;
    for (const ch of text) {
      const g = GLYPHS[ch] ?? GLYPHS[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row] & (1 << (4 - col))) {
            cv.fillRect(cx + col * scale, y + oy + row * scale, cx + col * scale + scale, y + oy + row * scale + scale, c);
          }
        }
      }
      cx += 6 * scale;
    }
  };
  if (outline) {
    const pad = Math.max(2, Math.round(scale / 3));
    for (let oy = -pad; oy <= pad; oy++) {
      for (let ox = -pad; ox <= pad; ox++) {
        if (ox !== 0 || oy !== 0) draw(ox, oy, outline);
      }
    }
  }
  draw(0, 0, fill);
  return textWidth(text, scale);
}

// ------------------------------------------------------------- scene ---

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [12, 8, 20];
const MAGENTA: RGB = [255, 46, 136];
const PALE_SUN: RGB = [255, 243, 176];
const DARK_GROUND: RGB = [21, 8, 46];
const SKYLINE: RGB = [28, 11, 51];
const WINDOW: RGB = [255, 209, 102];

// Four-pointed sparkle (the ghost's eyes), centered at (cx, cy).
function sparkle(cv: Canvas, cx: number, cy: number, r: number, c: RGB): void {
  const q = r * 0.28;
  cv.polygon(
    [
      [cx, cy - r],
      [cx + q, cy - q],
      [cx + r, cy],
      [cx + q, cy + q],
      [cx, cy + r],
      [cx - q, cy + q],
      [cx - r, cy],
      [cx - q, cy - q],
    ],
    c,
  );
}

// Five-pointed star (the coin's star), centered at (cx, cy).
function star(cv: Canvas, cx: number, cy: number, r: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
  }
  cv.polygon(pts, c);
}

// make.fun's ghost mascot: white ghost, thick black outline, sparkle
// eyes, one round little hand holding a magenta coin with a white star.
// (cx, cy) is the top center of the ghost's head; h is its full height.
function ghost(cv: Canvas, cx: number, cy: number, h: number): void {
  const w = h * 0.62;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const bodyTop = cy;
  const bodyBottom = cy + h * 0.86;
  const out = 5; // outline thickness
  // Black silhouette, slightly larger, behind the white body.
  cv.fillCircle(cx, bodyTop + w / 2, w / 2 + out, BLACK);
  cv.fillRect(x0 - out, bodyTop + w / 2 - out, x1 + out, bodyBottom + out, BLACK);
  // White body.
  cv.fillCircle(cx, bodyTop + w / 2, w / 2, WHITE);
  cv.fillRect(x0, bodyTop + w / 2, x1, bodyBottom, WHITE);
  // Wavy hem: three scallops cut from the bottom edge.
  const waveR = w / 6;
  for (let i = 0; i < 3; i++) {
    const wx = x0 + waveR + i * 2 * waveR;
    cv.fillCircle(wx, bodyBottom, waveR, DARK_GROUND);
  }
  // Sparkle eyes.
  sparkle(cv, cx - w * 0.2, bodyTop + h * 0.3, h * 0.055, BLACK);
  sparkle(cv, cx + w * 0.2, bodyTop + h * 0.3, h * 0.055, BLACK);
  // Little round hand on the right side, holding the coin.
  const hx = x1 + h * 0.02;
  const hy = bodyTop + h * 0.52;
  cv.fillCircle(hx, hy, h * 0.05 + out, BLACK);
  cv.fillCircle(hx, hy, h * 0.05, WHITE);
  // Magenta coin with a white star, overlapping the hand.
  const coinR = h * 0.11;
  const coinX = hx + h * 0.07;
  const coinY = hy - h * 0.03;
  cv.fillCircle(coinX, coinY, coinR + 3, BLACK);
  cv.fillCircle(coinX, coinY, coinR, MAGENTA);
  star(cv, coinX, coinY, coinR * 0.62, WHITE);
}

// A palm silhouette: curved trunk with drooping fronds.
function palm(cv: Canvas, bx: number, by: number, h: number, lean: number): void {
  const topX = bx + lean;
  const topY = by - h;
  cv.line(bx, by, topX, topY, SKYLINE, 10);
  for (let i = 0; i < 6; i++) {
    const ang = (-160 + i * 28) * (Math.PI / 180);
    const len = h * 0.42;
    const ex = topX + len * Math.cos(ang);
    const ey = topY + len * Math.sin(ang) * 0.7 + h * 0.08;
    cv.line(topX, topY, Math.round(ex), Math.round(ey), SKYLINE, 5);
  }
}

function drawMeme(): Uint8Array {
  const cv = new Canvas(W, H);

  // Vice City sunset: deep purple down to magenta, orange at the horizon.
  cv.vGradient([
    [0, [36, 16, 64]],
    [190, [109, 30, 99]],
    [330, [255, 46, 136]],
    [430, [255, 130, 70]],
    [470, [255, 154, 61]],
  ]);
  // Ground below the horizon.
  cv.fillRect(0, 470, W, H, DARK_GROUND);

  // Sun, low over the skyline, top right.
  cv.fillCircle(985, 205, 108, [255, 120, 120]);
  cv.fillCircle(985, 205, 96, [255, 190, 130]);
  cv.fillCircle(985, 205, 82, PALE_SUN);

  // Skyline silhouettes with a few lit windows.
  const buildings: Array<[number, number, number]> = [
    [0, 120, 380],
    [110, 190, 350],
    [290, 90, 400],
    [370, 150, 375],
    [510, 210, 340],
    [710, 110, 395],
    [810, 170, 360],
    [1080, 120, 380],
  ];
  for (const [bx, bw, top] of buildings) {
    cv.fillRect(bx, top, bx + bw, 470, SKYLINE);
  }
  // Lit windows, fixed positions (deterministic).
  const windows: Array<[number, number]> = [
    [30, 400],
    [140, 380],
    [330, 420],
    [400, 395],
    [540, 360],
    [580, 410],
    [740, 415],
    [850, 380],
    [1110, 400],
  ];
  for (const [wx, wy] of windows) cv.fillRect(wx, wy, wx + 12, wy + 16, WINDOW);

  // Palm silhouettes framing the scene.
  palm(cv, 60, 470, 190, -30);
  palm(cv, 1140, 470, 170, 25);

  // The ghost, standing on the skyline at the right, holding its coin.
  ghost(cv, 1000, 300, 190);

  // Headline: the joke, big enough to read at 480 px wide.
  drawText(cv, 'THE WHOLE CITY', 48, 52, 11, WHITE, BLACK);
  drawText(cv, 'CALLED IN SICK', 48, 152, 11, WHITE, BLACK);
  // The reason, one line under the headline.
  drawText(cv, 'GTA 6 IS OUT. SEE YOU IN LEONIDA', 50, 268, 5, [255, 243, 176], BLACK);

  // Bottom band: make.fun, worked into the meme, not a sticker.
  cv.fillRect(0, 560, W, H, [16, 6, 38]);
  cv.fillRect(0, 560, W, 564, MAGENTA);
  drawText(cv, 'make.fun', 48, 592, 7, WHITE, null);
  drawText(cv, 'AGENTS EARN REAL MONEY', 420, 596, 5, [255, 209, 102], null);

  return cv.px;
}

// -------------------------------------------------------------- main ---

mkdirSync(OUTPUT_DIR, { recursive: true });

// 1. The gate reads POST.json from /output.
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}

// 2. The meme, drawn procedurally — deterministic, byte for byte.
writeFileSync(join(OUTPUT_DIR, 'meme.png'), encodePng(W, H, drawMeme()));

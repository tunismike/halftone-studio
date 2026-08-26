// Acceptance fixture for pattern screens (docs/goal-v6.0.md, P4).
//
// Renders every pattern preset over a linear black→white gradient ramp — the
// same thing a swatch sheet shows — so the output can be compared side by side
// against the reference look. Writes a PNG contact sheet.
//
//   npx tsx scripts/ramp-sheet.ts [outfile.png]

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import {
  bakePatternField, renderPatternScreen, type PatternScreenParams,
} from '../src/engine/screen/pattern-field';
import { PATTERN_PRESETS } from '../src/engine/screen/pattern-presets';
import type { LumImage } from '../src/engine/image/types';

const SW = 260;   // swatch width
const SH = 190;   // swatch height
const PAD = 14;
const LABEL = 22;
const COLS = 5;

// Linear ramp: solid black at the left edge, paper white at the right.
function rampImage(w: number, h: number): LumImage {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data[y * w + x] = x / (w - 1);
  }
  return { width: w, height: h, data };
}

function renderSwatch(p: PatternScreenParams): Uint8Array {
  const tile = bakePatternField(p.field);
  return renderPatternScreen(rampImage(SW, SH), tile, p).data;
}

// --- minimal 8-bit grayscale PNG writer -------------------------------------

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function writeGrayPng(path: string, w: number, h: number, gray: Uint8Array): void {
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0; // filter: none
    raw.set(gray.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 0;  // grayscale
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  writeFileSync(path, png);
}

// --- 5x7 bitmap font for swatch labels --------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '11100', '10100', '10010', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '01110', '00001', '00001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};

function drawText(sheet: Uint8Array, sw: number, x0: number, y0: number, text: string): void {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] === '1') {
          const px = cx + c * 2;
          const py = y0 + r * 2;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) sheet[(py + dy) * sw + px + dx] = 0;
          }
        }
      }
    }
    cx += 12;
  }
}

// --- contact sheet ----------------------------------------------------------

const presets = PATTERN_PRESETS;
const rows = Math.ceil(presets.length / COLS);
const cellW = SW + PAD * 2;
const cellH = SH + LABEL + PAD * 2;
const sheetW = cellW * COLS;
const sheetH = cellH * rows;
const sheet = new Uint8Array(sheetW * sheetH);
sheet.fill(255);

presets.forEach((preset, i) => {
  const col = i % COLS;
  const row = (i / COLS) | 0;
  const ox = col * cellW + PAD;
  const oy = row * cellH + PAD;
  const cov = renderSwatch(preset.params);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      // coverage → ink: 255 coverage means full black ink on white paper.
      sheet[(oy + y) * sheetW + ox + x] = 255 - cov[y * SW + x];
    }
  }
  drawText(sheet, sheetW, ox, oy + SH + 6, preset.name);
});

const out = process.argv[2] ?? 'ramp-sheet.png';
writeGrayPng(out, sheetW, sheetH, sheet);
console.log(`${presets.length} presets → ${out} (${sheetW}×${sheetH})`);

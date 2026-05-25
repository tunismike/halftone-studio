// Knuth dot diffusion (Knuth, "Digital Halftones by Dot Diffusion", ACM TOG
// 1987). Unlike raster error diffusion, pixels are processed in an order set by
// an 8×8 "class matrix": all class-0 cells first, then class-1, etc. When a
// pixel is quantized, its error is distributed ONLY to neighbors that have not
// been processed yet (a higher class number), using a small smoothing filter.
// This removes the fixed left-to-right directional bias of Floyd-Steinberg.
//
// The class matrix can be any permutation of 0..63; the choice trades off
// texture. We use the dispersed Bayer-8 ordering — deterministic and a standard
// baseline. The dot-diffusion mechanism (class order + diffuse-to-unprocessed)
// is what distinguishes it from ordered dithering.

import { srgbToLinear } from '../color/srgb';
import {
  nearestPaletteIndex,
  nearestPaletteIndexFromLut,
  type ColorMetric,
  type PaletteLut,
  type PreparedPalette,
} from '../color/palette';
import type { RgbaImage } from '../image/types';
import type { IndexedImage } from './error-diffusion-palette';

export interface KnuthParams {
  palette: PreparedPalette;
  metric: ColorMetric;
  lut?: PaletteLut;
}

// Bayer-8 ordering used as the class matrix (values 0..63).
const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// 8-neighbor smoothing weights: orthogonal heavier than diagonal.
const NEIGHBORS: Array<[number, number, number]> = [
  [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

export function knuthDotDiffusion(src: RgbaImage, p: KnuthParams): IndexedImage {
  const { width, height } = src;
  const data = src.data;
  const np = width * height;

  const workR = new Float32Array(np);
  const workG = new Float32Array(np);
  const workB = new Float32Array(np);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const a = data[i + 3] / 255;
    const r = (data[i] / 255) * a + (1 - a);
    const g = (data[i + 1] / 255) * a + (1 - a);
    const b = (data[i + 2] / 255) * a + (1 - a);
    workR[j] = srgbToLinear(r);
    workG[j] = srgbToLinear(g);
    workB[j] = srgbToLinear(b);
  }

  const indices = new Uint16Array(np);
  // Bucket every pixel by its class (0..63) so we can process in class order
  // in O(N) instead of scanning the image 64 times.
  const buckets: number[][] = Array.from({ length: 64 }, () => []);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buckets[BAYER_8[y & 7][x & 7]].push(y * width + x);
    }
  }

  const classAt = (x: number, y: number): number => BAYER_8[y & 7][x & 7];

  for (let cls = 0; cls < 64; cls++) {
    const bucket = buckets[cls];
    for (let bi = 0; bi < bucket.length; bi++) {
      const i = bucket[bi];
      const x = i % width;
      const y = (i - x) / width;
      let r = workR[i], g = workG[i], b = workB[i];
      if (r < 0) r = 0; else if (r > 1) r = 1;
      if (g < 0) g = 0; else if (g > 1) g = 1;
      if (b < 0) b = 0; else if (b > 1) b = 1;

      const idx = p.lut
        ? nearestPaletteIndexFromLut({ r, g, b }, p.lut)
        : nearestPaletteIndex({ r, g, b }, p.palette, p.metric);
      indices[i] = idx;
      const qd = p.palette.entries[idx].linear;
      const er = r - qd.r, eg = g - qd.g, eb = b - qd.b;

      // Find unprocessed (higher-class) neighbors and total weight.
      let wsum = 0;
      for (let n = 0; n < NEIGHBORS.length; n++) {
        const nx = x + NEIGHBORS[n][0];
        const ny = y + NEIGHBORS[n][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (classAt(nx, ny) > cls) wsum += NEIGHBORS[n][2];
      }
      if (wsum === 0) continue; // last cells in the neighborhood: drop residual
      const inv = 1 / wsum;
      for (let n = 0; n < NEIGHBORS.length; n++) {
        const nx = x + NEIGHBORS[n][0];
        const ny = y + NEIGHBORS[n][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (classAt(nx, ny) <= cls) continue;
        const w = NEIGHBORS[n][2] * inv;
        const ni = ny * width + nx;
        workR[ni] += er * w;
        workG[ni] += eg * w;
        workB[ni] += eb * w;
      }
    }
  }

  return { width, height, indices, paletteSrgb: p.palette.hexes };
}

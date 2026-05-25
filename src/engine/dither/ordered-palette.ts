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

export interface OrderedMask {
  size: number;
  // Threshold values in [0,1), tileable.
  values: Float32Array;
}

export interface OrderedPaletteParams {
  palette: PreparedPalette;
  metric: ColorMetric;
  mask: OrderedMask;
  amplitude: number; // perturbation magnitude in linear-RGB units; typical 0.1
  lut?: PaletteLut;
}

// Bayer matrices wrapped as OrderedMask. Threshold = (m + 0.5) / denom.
const BAYER_2 = [
  [0, 2],
  [3, 1],
];
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
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

export function bayerMask(size: 2 | 4 | 8): OrderedMask {
  const m = size === 2 ? BAYER_2 : size === 4 ? BAYER_4 : BAYER_8;
  const denom = size * size;
  const values = new Float32Array(denom);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      values[y * size + x] = (m[y][x] + 0.5) / denom;
    }
  }
  return { size, values };
}

export function orderedPaletteDither(src: RgbaImage, p: OrderedPaletteParams): IndexedImage {
  const { width, height, data } = src;
  const np = width * height;
  const indices = new Uint16Array(np);
  const ms = p.mask.size;
  const mv = p.mask.values;
  const amp = p.amplitude;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const di = i * 4;
      const a = data[di + 3] / 255;
      const r = (data[di] / 255) * a + (1 - a);
      const g = (data[di + 1] / 255) * a + (1 - a);
      const b = (data[di + 2] / 255) * a + (1 - a);

      const t = mv[(y % ms) * ms + (x % ms)] - 0.5;
      let lr = srgbToLinear(r) + amp * t;
      let lg = srgbToLinear(g) + amp * t;
      let lb = srgbToLinear(b) + amp * t;
      if (lr < 0) lr = 0; else if (lr > 1) lr = 1;
      if (lg < 0) lg = 0; else if (lg > 1) lg = 1;
      if (lb < 0) lb = 0; else if (lb > 1) lb = 1;

      indices[i] = p.lut
        ? nearestPaletteIndexFromLut({ r: lr, g: lg, b: lb }, p.lut)
        : nearestPaletteIndex({ r: lr, g: lg, b: lb }, p.palette, p.metric);
    }
  }
  return { width, height, indices, paletteSrgb: p.palette.hexes };
}

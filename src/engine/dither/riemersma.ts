import { srgbToLinear } from '../color/srgb';
import {
  nearestPaletteIndex,
  nearestPaletteIndexFromLut,
  type ColorMetric,
  type PaletteLut,
  type PreparedPalette,
} from '../color/palette';
import type { RgbaImage } from '../image/types';
import { hilbertTraversal } from './hilbert';
import type { IndexedImage } from './error-diffusion-palette';

export interface RiemersmaParams {
  palette: PreparedPalette;
  metric: ColorMetric;
  historyLen: number; // typical 16
  decay: number; // typical 0.5; weights ∝ decay^i
  lut?: PaletteLut;
}

export const defaultRiemersmaParams = {
  historyLen: 16,
  decay: 0.5,
};

export function riemersmaDither(src: RgbaImage, p: RiemersmaParams): IndexedImage {
  const { width, height, data } = src;
  const np = width * height;
  const indices = new Uint16Array(np);

  // Source as linear RGB planes.
  const lR = new Float32Array(np);
  const lG = new Float32Array(np);
  const lB = new Float32Array(np);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const a = data[i + 3] / 255;
    const r = (data[i] / 255) * a + (1 - a);
    const g = (data[i + 1] / 255) * a + (1 - a);
    const b = (data[i + 2] / 255) * a + (1 - a);
    lR[j] = srgbToLinear(r);
    lG[j] = srgbToLinear(g);
    lB[j] = srgbToLinear(b);
  }

  // Pre-normalize the exponential history weights so the sum is 1.
  const histLen = Math.max(1, p.historyLen | 0);
  const weights = new Float32Array(histLen);
  let wSum = 0;
  for (let i = 0; i < histLen; i++) {
    weights[i] = Math.pow(p.decay, i);
    wSum += weights[i];
  }
  for (let i = 0; i < histLen; i++) weights[i] /= wSum;

  // Ring buffer of past per-channel errors.
  const histR = new Float32Array(histLen);
  const histG = new Float32Array(histLen);
  const histB = new Float32Array(histLen);
  let head = 0;

  for (const { x, y } of hilbertTraversal(width, height)) {
    const i = y * width + x;
    let r = lR[i];
    let g = lG[i];
    let b = lB[i];
    for (let k = 0; k < histLen; k++) {
      const idx = (head + k) % histLen;
      const w = weights[k];
      r += histR[idx] * w;
      g += histG[idx] * w;
      b += histB[idx] * w;
    }
    if (r < 0) r = 0; else if (r > 1) r = 1;
    if (g < 0) g = 0; else if (g > 1) g = 1;
    if (b < 0) b = 0; else if (b > 1) b = 1;

    const idx = p.lut
      ? nearestPaletteIndexFromLut({ r, g, b }, p.lut)
      : nearestPaletteIndex({ r, g, b }, p.palette, p.metric);
    indices[i] = idx;
    const q = p.palette.entries[idx].linear;
    const er = r - q.r;
    const eg = g - q.g;
    const eb = b - q.b;

    // Push new error onto the front of the ring (rotate head backwards).
    head = (head - 1 + histLen) % histLen;
    histR[head] = er;
    histG[head] = eg;
    histB[head] = eb;
  }

  return { width, height, indices, paletteSrgb: p.palette.hexes };
}

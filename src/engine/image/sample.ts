import type { LumImage } from './types';
import { srgbToLinear, linearToSrgb } from '../color/srgb';

export function sampleBilinear(img: LumImage, x: number, y: number): number {
  const { width, height, data } = img;
  // Clamp to the edge rather than returning white out of bounds — a white
  // fringe at the image border isn't what the user expects to see.
  const cx = x < 0 ? 0 : x > width - 1 ? width - 1 : x;
  const cy = y < 0 ? 0 : y > height - 1 ? height - 1 : y;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const a = data[y0 * width + x0];
  const b = data[y0 * width + x1];
  const c = data[y1 * width + x0];
  const d = data[y1 * width + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

// Luma → linear decode LUT (1024 buckets over 0..1). Lets the cell average sum
// in linear light without a pow() per pixel.
const LUM_TO_LINEAR = (() => {
  const t = new Float32Array(1025);
  for (let i = 0; i <= 1024; i++) t[i] = srgbToLinear(i / 1024);
  return t;
})();

export function lumToLinear(v: number): number {
  const k = v <= 0 ? 0 : v >= 1 ? 1024 : (v * 1024) | 0;
  return LUM_TO_LINEAR[k];
}

// Average the tone over a cell-sized box in LINEAR light, returned as a
// perceptual (gamma) value. Replaces point-sampling the cell centre, which
// aliased fine detail, made the dot pattern crawl on pan/zoom, and diverged
// between the (downscaled) preview and the full-res export. Area-averaging
// makes each dot represent the tone it actually covers and is resolution-stable.
export function sampleCellAverage(img: LumImage, cx: number, cy: number, cell: number): number {
  const { width, height, data } = img;
  const half = Math.max(0.5, cell / 2);
  let x0 = Math.floor(cx - half), x1 = Math.ceil(cx + half);
  let y0 = Math.floor(cy - half), y1 = Math.ceil(cy + half);
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > width) x1 = width;
  if (y1 > height) y1 = height;
  if (x1 <= x0 || y1 <= y0) return sampleBilinear(img, cx, cy);
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    let i = y * width + x0;
    for (let x = x0; x < x1; x++, i++) { sum += lumToLinear(data[i]); n++; }
  }
  return linearToSrgb(sum / n);
}

import type { LumImage } from '../image/types';

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

type Matrix = number[][];

function pick(size: 2 | 4 | 8): { m: Matrix; denom: number } {
  if (size === 2) return { m: BAYER_2, denom: 4 };
  if (size === 4) return { m: BAYER_4, denom: 16 };
  return { m: BAYER_8, denom: 64 };
}

export function bayer(src: LumImage, size: 2 | 4 | 8 = 4): LumImage {
  const { width, height, data } = src;
  const { m, denom } = pick(size);
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    const row = m[y % size];
    for (let x = 0; x < width; x++) {
      const t = (row[x % size] + 0.5) / denom;
      out[y * width + x] = data[y * width + x] < t ? 0 : 1;
    }
  }
  return { width, height, data: out };
}

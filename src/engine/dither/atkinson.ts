import type { LumImage } from '../image/types';

export function atkinson(src: LumImage): LumImage {
  const { width, height, data } = src;
  const buf = new Float32Array(data);
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i];
      const q = old < 0.5 ? 0 : 1;
      out[i] = q;
      const frac = (old - q) / 8;
      if (x + 1 < width) buf[i + 1] += frac;
      if (x + 2 < width) buf[i + 2] += frac;
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1] += frac;
        buf[i + width] += frac;
        if (x + 1 < width) buf[i + width + 1] += frac;
      }
      if (y + 2 < height) buf[i + 2 * width] += frac;
    }
  }
  return { width, height, data: out };
}

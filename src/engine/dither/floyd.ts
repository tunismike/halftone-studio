import type { LumImage } from '../image/types';

export function floydSteinberg(src: LumImage): LumImage {
  const { width, height, data } = src;
  const buf = new Float32Array(data);
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i];
      const q = old < 0.5 ? 0 : 1;
      out[i] = q;
      const err = old - q;
      if (x + 1 < width) buf[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1] += (err * 3) / 16;
        buf[i + width] += (err * 5) / 16;
        if (x + 1 < width) buf[i + width + 1] += (err * 1) / 16;
      }
    }
  }
  return { width, height, data: out };
}

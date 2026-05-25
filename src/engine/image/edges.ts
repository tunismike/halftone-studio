import type { LumImage } from './types';

export function computeEdges(img: LumImage): LumImage {
  const { width, height, data } = img;
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -data[i - width - 1] + data[i - width + 1] +
        -2 * data[i - 1] + 2 * data[i + 1] +
        -data[i + width - 1] + data[i + width + 1];
      const gy =
        -data[i - width - 1] - 2 * data[i - width] - data[i - width + 1] +
        data[i + width - 1] + 2 * data[i + width] + data[i + width + 1];
      const m = Math.min(1, Math.hypot(gx, gy) / 4);
      out[i] = m;
    }
  }
  return { width, height, data: out };
}

import type { LumImage, RgbaImage } from './types';

export function rgbaToLum(src: RgbaImage): LumImage {
  const { width, height, data } = src;
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const a = data[i + 3] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[j] = y * a + (1 - a);
  }
  return { width, height, data: out };
}

export function lumToRgba(src: LumImage): RgbaImage {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const v = Math.round(clamp01(data[i]) * 255);
    out[j] = v;
    out[j + 1] = v;
    out[j + 2] = v;
    out[j + 3] = 255;
  }
  return { width, height, data: out };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

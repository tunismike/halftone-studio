import type { LumImage, RgbaImage } from '../image/types';

export interface CmykSeparation {
  c: LumImage;
  m: LumImage;
  y: LumImage;
  k: LumImage;
}

export function rgbaToCmyk(src: RgbaImage): CmykSeparation {
  const { width, height, data } = src;
  const n = width * height;
  const c = new Float32Array(n);
  const m = new Float32Array(n);
  const y = new Float32Array(n);
  const k = new Float32Array(n);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const a = data[i + 3] / 255;
    const r = (data[i] / 255) * a + (1 - a);
    const g = (data[i + 1] / 255) * a + (1 - a);
    const b = (data[i + 2] / 255) * a + (1 - a);
    const kk = 1 - Math.max(r, g, b);
    const denom = 1 - kk;
    if (denom < 1e-6) {
      c[j] = 0; m[j] = 0; y[j] = 0; k[j] = kk;
    } else {
      c[j] = (1 - r - kk) / denom;
      m[j] = (1 - g - kk) / denom;
      y[j] = (1 - b - kk) / denom;
      k[j] = kk;
    }
  }
  return {
    c: { width, height, data: c },
    m: { width, height, data: m },
    y: { width, height, data: y },
    k: { width, height, data: k },
  };
}

export function inkToLum(ink: LumImage): LumImage {
  const out = new Float32Array(ink.data.length);
  for (let i = 0; i < ink.data.length; i++) out[i] = 1 - ink.data[i];
  return { width: ink.width, height: ink.height, data: out };
}

export interface SpotParams {
  targetR: number;
  targetG: number;
  targetB: number;
}

export function rgbaToSpot(src: RgbaImage, p: SpotParams): LumImage {
  const { width, height, data } = src;
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const dr = data[i] - p.targetR;
    const dg = data[i + 1] - p.targetG;
    const db = data[i + 2] - p.targetB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
    out[j] = 1 - Math.max(0, Math.min(1, dist));
  }
  return { width, height, data: out };
}

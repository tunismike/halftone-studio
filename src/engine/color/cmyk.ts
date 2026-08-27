import type { LumImage, RgbaImage } from '../image/types';

export interface CmykSeparation {
  c: LumImage;
  m: LumImage;
  y: LumImage;
  k: LumImage;
}

export interface CmykOptions {
  /**
   * How much of the extractable black actually goes on the K plate.
   *
   * The naive separation sets K to 1 - max(r,g,b), which is maximum grey
   * component replacement: it pulls the largest possible black out of every
   * colour. Minimal total ink, but it means a mid-tone colour carries ~40% K,
   * and once that is screened the artwork wears a scatter of black dots
   * everywhere — the image reads as something seen through a black screen
   * rather than as something printed in colour.
   *
   * Raising the exponent bends K down through the midtones while leaving the
   * shadows alone: at 2.2, a 40% black component becomes 13% and a 90% one
   * stays at 79%, so colour is carried by CMY and K goes back to doing what it
   * is for. CMY are recomputed against whatever K is left, so the colour still
   * reproduces; the cost is more total ink, which matters on press and not on
   * screen. 1 reproduces the old behaviour exactly.
   */
  blackGamma?: number;
}

export function rgbaToCmyk(src: RgbaImage, opts: CmykOptions = {}): CmykSeparation {
  const { width, height, data } = src;
  const gamma = Math.max(0.2, opts.blackGamma ?? 1);
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
    const kFull = 1 - Math.max(r, g, b);
    const kk = gamma === 1 ? kFull : Math.pow(kFull, gamma);
    const denom = 1 - kk;
    if (denom < 1e-6) {
      c[j] = 0; m[j] = 0; y[j] = 0; k[j] = kk;
    } else {
      // Clamped because a pulled-back K can leave a channel needing more than
      // full ink to hit the target; that colour is simply out of gamut for the
      // reduced black, and clipping is the honest response.
      c[j] = Math.min(1, Math.max(0, (1 - r - kk) / denom));
      m[j] = Math.min(1, Math.max(0, (1 - g - kk) / denom));
      y[j] = Math.min(1, Math.max(0, (1 - b - kk) / denom));
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

import type { RgbaImage } from './types';

export interface PreprocessParams {
  blurRadius: number;
  sharpenStrength: number;
  sharpenRadius: number;
  denoiseNoise: number;
  blackPoint: number;
  whitePoint: number;
  midGamma: number;
}

export const defaultPreprocess: PreprocessParams = {
  blurRadius: 0,
  sharpenStrength: 0,
  sharpenRadius: 1,
  denoiseNoise: 0,
  blackPoint: 0,
  whitePoint: 255,
  midGamma: 1,
};

export function isIdentityPreprocess(p: PreprocessParams): boolean {
  return (
    p.blurRadius === 0 &&
    p.sharpenStrength === 0 &&
    p.denoiseNoise === 0 &&
    p.blackPoint === 0 &&
    p.whitePoint === 255 &&
    p.midGamma === 1
  );
}

export function applyPreprocess(src: RgbaImage, p: PreprocessParams): RgbaImage {
  if (isIdentityPreprocess(p)) return src;
  const { width: w, height: h } = src;
  let data = copyData(src.data);

  if (p.denoiseNoise < 0) {
    const strength = Math.min(100, -p.denoiseNoise) / 100;
    data = bilateralDenoise(data, w, h, strength);
  }

  if (p.blurRadius > 0) {
    data = gaussianBlur(data, w, h, p.blurRadius);
  }

  if (p.sharpenStrength > 0) {
    const blurred = gaussianBlur(data, w, h, Math.max(0.5, p.sharpenRadius));
    data = unsharpMask(data, blurred, p.sharpenStrength);
  }

  if (p.blackPoint > 0 || p.whitePoint < 255 || p.midGamma !== 1) {
    data = applyLevels(data, p.blackPoint, p.whitePoint, p.midGamma);
  }

  if (p.denoiseNoise > 0) {
    data = addFilmGrain(data, w, h, p.denoiseNoise / 100);
  }

  return { width: w, height: h, data };
}

function copyData(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  return out;
}

function buildGaussianKernel(radius: number): Float32Array {
  const sigma = Math.max(0.5, radius);
  const halfW = Math.max(1, Math.ceil(sigma * 3));
  const size = halfW * 2 + 1;
  const k = new Float32Array(size);
  const inv = 1 / (2 * sigma * sigma);
  let sum = 0;
  for (let i = -halfW; i <= halfW; i++) {
    const v = Math.exp(-(i * i) * inv);
    k[i + halfW] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

function gaussianBlur(src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const k = buildGaussianKernel(radius);
  const halfW = (k.length - 1) >> 1;
  const horiz = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -halfW; i <= halfW; i++) {
        let xi = x + i;
        if (xi < 0) xi = 0; else if (xi >= w) xi = w - 1;
        const di = (y * w + xi) * 4;
        const kw = k[i + halfW];
        r += src[di] * kw;
        g += src[di + 1] * kw;
        b += src[di + 2] * kw;
      }
      const oi = (y * w + x) * 4;
      horiz[oi] = r;
      horiz[oi + 1] = g;
      horiz[oi + 2] = b;
      horiz[oi + 3] = src[oi + 3];
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -halfW; i <= halfW; i++) {
        let yi = y + i;
        if (yi < 0) yi = 0; else if (yi >= h) yi = h - 1;
        const di = (yi * w + x) * 4;
        const kw = k[i + halfW];
        r += horiz[di] * kw;
        g += horiz[di + 1] * kw;
        b += horiz[di + 2] * kw;
      }
      const oi = (y * w + x) * 4;
      out[oi] = r;
      out[oi + 1] = g;
      out[oi + 2] = b;
      out[oi + 3] = horiz[oi + 3];
    }
  }

  return out;
}

function unsharpMask(
  orig: Uint8ClampedArray,
  blurred: Uint8ClampedArray,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(orig.length);
  for (let i = 0; i < orig.length; i += 4) {
    out[i] = orig[i] + strength * (orig[i] - blurred[i]);
    out[i + 1] = orig[i + 1] + strength * (orig[i + 1] - blurred[i + 1]);
    out[i + 2] = orig[i + 2] + strength * (orig[i + 2] - blurred[i + 2]);
    out[i + 3] = orig[i + 3];
  }
  return out;
}

function bilateralDenoise(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const radius = strength > 0.5 ? 2 : 1;
  const sigmaS = radius;
  const sigmaR = 12 + (1 - strength) * 40;
  const invS2 = 1 / (2 * sigmaS * sigmaS);
  const invR2 = 1 / (2 * sigmaR * sigmaR);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = (y * w + x) * 4;
      const cr = src[ci];
      const cg = src[ci + 1];
      const cb = src[ci + 2];
      let sumW = 0;
      let sR = 0, sG = 0, sB = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const ni = (yy * w + xx) * 4;
          const nr = src[ni], ng = src[ni + 1], nb = src[ni + 2];
          const dLum = (nr - cr) * 0.299 + (ng - cg) * 0.587 + (nb - cb) * 0.114;
          const wS = Math.exp(-(dx * dx + dy * dy) * invS2);
          const wR = Math.exp(-(dLum * dLum) * invR2);
          const ww = wS * wR;
          sumW += ww;
          sR += nr * ww;
          sG += ng * ww;
          sB += nb * ww;
        }
      }
      out[ci] = sR / sumW;
      out[ci + 1] = sG / sumW;
      out[ci + 2] = sB / sumW;
      out[ci + 3] = src[ci + 3];
    }
  }
  return out;
}

function addFilmGrain(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const amplitude = amount * 64;
  let seed = (w * 31 + h * 17 + 1) >>> 0;
  for (let i = 0; i < src.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u1 = ((seed >>> 8) & 0xffffff) / 0x1000000;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u2 = ((seed >>> 8) & 0xffffff) / 0x1000000;
    const mag = Math.sqrt(-2 * Math.log(u1 + 1e-9));
    const n = mag * Math.cos(2 * Math.PI * u2) * amplitude;
    out[i] = src[i] + n;
    out[i + 1] = src[i + 1] + n;
    out[i + 2] = src[i + 2] + n;
    out[i + 3] = src[i + 3];
  }
  return out;
}

function applyLevels(
  src: Uint8ClampedArray,
  black: number,
  white: number,
  gamma: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const lut = new Uint8ClampedArray(256);
  const range = Math.max(1, white - black);
  const invGamma = 1 / Math.max(0.001, gamma);
  for (let i = 0; i < 256; i++) {
    let t = (i - black) / range;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    lut[i] = Math.pow(t, invGamma) * 255;
  }
  for (let i = 0; i < src.length; i += 4) {
    out[i] = lut[src[i]];
    out[i + 1] = lut[src[i + 1]];
    out[i + 2] = lut[src[i + 2]];
    out[i + 3] = src[i + 3];
  }
  return out;
}

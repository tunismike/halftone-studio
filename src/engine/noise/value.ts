import { hash2 } from './hash';

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// Periodic variant: the lattice wraps every `period` units, so the noise
// tiles seamlessly. `period` must be an integer.
export function periodicValueNoise(x: number, y: number, seed: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const p = Math.max(1, period | 0);
  const wrap = (v: number): number => ((v % p) + p) % p;
  const x0 = wrap(xi);
  const y0 = wrap(yi);
  const x1 = wrap(xi + 1);
  const y1 = wrap(yi + 1);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export interface FbmParams {
  octaves: number;
  lacunarity: number;
  gain: number;
}

export function fbm(x: number, y: number, seed: number, p: FbmParams): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < p.octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 17);
    norm += amp;
    amp *= p.gain;
    freq *= p.lacunarity;
  }
  return sum / Math.max(1e-6, norm);
}

// Tileable fbm. Each octave wraps at `period * freq`, which stays integral as
// long as `period` is and lacunarity is a whole number.
export function fbmTileable(
  x: number, y: number, seed: number, p: FbmParams, period: number,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < p.octaves; i++) {
    sum += amp * periodicValueNoise(x * freq, y * freq, seed + i * 17, Math.round(period * freq));
    norm += amp;
    amp *= p.gain;
    freq *= p.lacunarity;
  }
  return sum / Math.max(1e-6, norm);
}

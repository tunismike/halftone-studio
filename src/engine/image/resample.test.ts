import { describe, it, expect } from 'vitest';
import { boxDownsampleLinear } from './resample';
import { sampleCellAverage } from './sample';
import { linearToSrgb } from '../color/srgb';
import type { RgbaImage, LumImage } from './types';

function checker(w: number, h: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (x + y) % 2 === 0 ? 0 : 255; const j = (y * w + x) * 4;
    data[j] = v; data[j + 1] = v; data[j + 2] = v; data[j + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe('boxDownsampleLinear', () => {
  it('downsamples to the target size', () => {
    const out = boxDownsampleLinear(checker(8, 8), 4, 4);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
  });

  it('averages a black/white checker in LINEAR light (≈190, not 128)', () => {
    // 50% black / 50% white: linear average 0.5 → sRGB ≈ 0.735 ≈ 188. Gamma-space
    // averaging would give 128 (too dark). Confirms light-correct averaging.
    const out = boxDownsampleLinear(checker(16, 16), 1, 1);
    const expected = Math.round(linearToSrgb(0.5) * 255);
    expect(out.data[0]).toBeGreaterThan(170);
    expect(out.data[0]).toBeCloseTo(expected, -1);
  });
});

describe('sampleCellAverage', () => {
  it('returns the area average, not a single centre pixel', () => {
    // 4×4 luma: left half black (0), right half white (1). A cell spanning the
    // whole image should average to mid (linear ≈ 0.735), regardless of centre.
    const w = 4, h = 4;
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = x < 2 ? 0 : 1;
    const lum: LumImage = { width: w, height: h, data };
    const v = sampleCellAverage(lum, 2, 2, 4);
    expect(v).toBeGreaterThan(0.6); // linear-light average, lighter than 0.5
    expect(v).toBeLessThan(0.85);
  });

  it('a flat region returns that tone', () => {
    const w = 6, h = 6;
    const lum: LumImage = { width: w, height: h, data: new Float32Array(w * h).fill(0.3) };
    expect(sampleCellAverage(lum, 3, 3, 4)).toBeCloseTo(0.3, 2); // LUT decode ≈1e-4
  });
});

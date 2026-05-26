import { describe, it, expect } from 'vitest';
import { lineMask } from './line-mask';
import type { RgbaImage } from './types';

// A white field with a vertical black line down the middle.
function lineImage(w: number, h: number, lineX: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = x === lineX ? 0 : 255; const j = (y * w + x) * 4;
    data[j] = v; data[j + 1] = v; data[j + 2] = v; data[j + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe('lineMask', () => {
  it('marks the line region and leaves flat areas clear', () => {
    const w = 20, h = 10, lx = 10;
    const m = lineMask(lineImage(w, h, lx), { threshold: 0.15, dilate: 1 });
    // on/near the line → marked
    expect(m[5 * w + lx]).toBe(1);
    // far flat region → not marked
    expect(m[5 * w + 2]).toBe(0);
  });

  it('a flat image produces an empty mask', () => {
    const w = 12, h = 12;
    const flat: RgbaImage = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
    const m = lineMask(flat, { threshold: 0.15, dilate: 2 });
    expect(m.every((v) => v === 0)).toBe(true);
  });

  it('dilation widens the marked band', () => {
    const w = 20, h = 10, lx = 10;
    const thin = lineMask(lineImage(w, h, lx), { threshold: 0.15, dilate: 0 });
    const wide = lineMask(lineImage(w, h, lx), { threshold: 0.15, dilate: 3 });
    const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
    expect(count(wide)).toBeGreaterThan(count(thin));
  });
});

import { describe, it, expect } from 'vitest';
import { floodSelect, polygonMask, maskToRgba, maskIsEmpty, type Pt } from './select';
import type { RgbaImage } from '../image/types';

function makeImage(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y); const j = (y * w + x) * 4;
    data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = 255;
  }
  return { width: w, height: h, data };
}

function count(mask: Uint8Array): number {
  let c = 0; for (let i = 0; i < mask.length; i++) c += mask[i]; return c;
}

describe('floodSelect', () => {
  it('selects a connected same-colour region and stops at a colour edge', () => {
    // left half black, right half white
    const w = 10, h = 6;
    const img = makeImage(w, h, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255]));
    const mask = floodSelect(img, 1, 1, 0.1);
    expect(count(mask)).toBe(5 * 6); // exactly the left half
    expect(mask[1 * w + 1]).toBe(1);
    expect(mask[1 * w + 6]).toBe(0);
  });

  it('high tolerance grabs the whole image', () => {
    const w = 8, h = 8;
    const img = makeImage(w, h, (x) => (x < 4 ? [0, 0, 0] : [255, 255, 255]));
    const mask = floodSelect(img, 0, 0, 1);
    expect(count(mask)).toBe(w * h);
  });

  it('out-of-bounds seed yields empty mask', () => {
    const img = makeImage(4, 4, () => [0, 0, 0]);
    expect(maskIsEmpty(floodSelect(img, -1, 0, 0.5))).toBe(true);
  });
});

describe('polygonMask', () => {
  it('fills a rectangle polygon', () => {
    const pts: Pt[] = [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 6 }, { x: 2, y: 6 }];
    const mask = polygonMask(pts, 10, 10);
    // ~6 wide × 4 tall interior
    expect(count(mask)).toBeGreaterThan(15);
    expect(count(mask)).toBeLessThan(30);
    expect(mask[3 * 10 + 4]).toBe(1); // inside
    expect(mask[0 * 10 + 0]).toBe(0); // outside
  });

  it('degenerate polygon (<3 pts) is empty', () => {
    expect(maskIsEmpty(polygonMask([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5, 5))).toBe(true);
  });
});

describe('maskToRgba', () => {
  it('packs selected pixels white, unselected black, opaque', () => {
    const mask = new Uint8Array([1, 0, 0, 1]);
    const d = maskToRgba(mask, 2, 2);
    expect(d[0]).toBe(255); // px0 selected
    expect(d[3]).toBe(255); // alpha
    expect(d[4]).toBe(0);   // px1 unselected
  });
});

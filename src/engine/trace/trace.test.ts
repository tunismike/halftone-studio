import { describe, it, expect } from 'vitest';
import { traceBinaryMask, polygonArea, douglasPeucker, loopToPathD, traceImage, type Pt } from './trace';
import type { RgbaImage } from '../image/types';

function rectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}

describe('traceBinaryMask', () => {
  it('traces a solid rectangle as one closed loop with correct area', () => {
    const w = 10, h = 10;
    const m = rectMask(w, h, 2, 3, 8, 7); // 6×4 block = 24 px
    const loops = traceBinaryMask(m, w, h);
    expect(loops.length).toBe(1);
    expect(polygonArea(loops[0])).toBeCloseTo(24, 0);
  });

  it('a rectangle with a hole yields two loops (outer + hole)', () => {
    const w = 12, h = 12;
    const m = rectMask(w, h, 1, 1, 11, 11);
    // punch a hole
    for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) m[y * w + x] = 0;
    const loops = traceBinaryMask(m, w, h);
    expect(loops.length).toBe(2);
  });

  it('empty mask yields no loops', () => {
    expect(traceBinaryMask(new Uint8Array(16), 4, 4)).toHaveLength(0);
  });
});

describe('douglasPeucker', () => {
  it('collapses collinear points on a straight edge', () => {
    const line: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    const out = douglasPeucker(line, 0.5);
    expect(out.length).toBe(2);
  });
});

describe('loopToPathD', () => {
  it('emits a closed polygon path when smoothing is 0', () => {
    const d = loopToPathD([[0, 0], [2, 0], [2, 2], [0, 2]], 0);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.includes('L')).toBe(true);
  });
  it('emits béziers when smoothing > 0', () => {
    const d = loopToPathD([[0, 0], [2, 0], [2, 2], [0, 2]], 0.6);
    expect(d.includes('C')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('traceImage', () => {
  it('traces a black/white split into per-color region paths', () => {
    const w = 12, h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255; const j = (y * w + x) * 4;
      data[j] = v; data[j + 1] = v; data[j + 2] = v; data[j + 3] = 255;
    }
    const src: RgbaImage = { width: w, height: h, data };
    const regions = traceImage(src, { colors: 2, simplify: 1, smoothing: 0, minArea: 4 });
    expect(regions.length).toBe(2);
    for (const r of regions) {
      expect(r.d.length).toBeGreaterThan(0);
      expect(r.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

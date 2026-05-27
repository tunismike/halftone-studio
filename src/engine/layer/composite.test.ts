import { describe, it, expect } from 'vitest';
import { compositeLayers, type CompositeLayer } from './composite';
import { regionMask } from './region';
import type { LumImage } from '../image/types';

function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return d;
}

describe('compositeLayers', () => {
  const w = 2, h = 1;
  it('composites a masked layer over the background', () => {
    // black layer, mask = [1, 0] over white bg → px0 black, px1 white.
    const layer: CompositeLayer = { rgba: solid(w, h, 0, 0, 0), mask: new Float32Array([1, 0]), blend: 'normal', opacity: 1 };
    const out = compositeLayers(w, h, '#ffffff', false, [layer]);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);       // masked → black
    expect([out[4], out[5], out[6]]).toEqual([255, 255, 255]); // unmasked → white bg
  });

  it('opacity blends toward the backdrop', () => {
    const layer: CompositeLayer = { rgba: solid(w, h, 0, 0, 0), mask: new Float32Array([1, 1]), blend: 'normal', opacity: 0.5 };
    const out = compositeLayers(w, h, '#ffffff', false, [layer]);
    expect(out[0]).toBeGreaterThan(110); // ~50% black over white
    expect(out[0]).toBeLessThan(145);
  });

  it('multiply blend darkens', () => {
    const grey: CompositeLayer = { rgba: solid(w, h, 128, 128, 128), mask: new Float32Array([1, 1]), blend: 'multiply', opacity: 1 };
    const out = compositeLayers(w, h, '#ffffff', false, [grey]);
    expect(out[0]).toBeCloseTo(128, -1); // 0.5 × white ≈ 128
  });
});

describe('regionMask', () => {
  const lum: LumImage = { width: 4, height: 1, data: new Float32Array([0.0, 0.3, 0.6, 0.9]) };
  it('all → fully on', () => {
    const m = regionMask({ kind: 'all' }, { lum }, false, 0);
    expect(Array.from(m)).toEqual([1, 1, 1, 1]);
  });
  it('toneBand selects a luminance window', () => {
    const m = regionMask({ kind: 'toneBand', min: 0.2, max: 0.7 }, { lum }, false, 0.001);
    expect(m[0]).toBeLessThan(0.5); // 0.0 outside
    expect(m[1]).toBeGreaterThan(0.5); // 0.3 inside
    expect(m[2]).toBeGreaterThan(0.5); // 0.6 inside
    expect(m[3]).toBeLessThan(0.5); // 0.9 outside
  });
  it('invert flips the mask', () => {
    const m = regionMask({ kind: 'all' }, { lum }, true, 0);
    expect(Array.from(m)).toEqual([0, 0, 0, 0]);
  });
  it('mask region resolves via callback; missing → full', () => {
    const resolveMask = (id: string) => (id === 'sel' ? new Float32Array([1, 0, 1, 0]) : undefined);
    expect(Array.from(regionMask({ kind: 'mask', maskId: 'sel' }, { lum, resolveMask }, false, 0))).toEqual([1, 0, 1, 0]);
    expect(Array.from(regionMask({ kind: 'mask', maskId: 'missing' }, { lum, resolveMask }, false, 0))).toEqual([1, 1, 1, 1]);
  });
});

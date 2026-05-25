import { describe, it, expect } from 'vitest';
import { regionMask } from './region';
import { compositeLayers, type CompositeLayer } from './composite';
import type { LumImage } from '../image/types';

function lum(values: number[], w = values.length, h = 1): LumImage {
  return { width: w, height: h, data: Float32Array.from(values) };
}

describe('regionMask', () => {
  it('all → every pixel 1', () => {
    const m = regionMask({ kind: 'all' }, { lum: lum([0, 0.5, 1]) }, false, 0.05);
    expect(Array.from(m)).toEqual([1, 1, 1]);
  });
  it('toneBand keeps pixels inside the window', () => {
    const m = regionMask({ kind: 'toneBand', min: 0.4, max: 0.6 }, { lum: lum([0.1, 0.5, 0.95]) }, false, 0.02);
    expect(m[1]).toBe(1);        // 0.5 inside
    expect(m[0]).toBe(0);        // 0.1 well outside + feather
    expect(m[2]).toBe(0);        // 0.95 well outside
  });
  it('invert flips the mask', () => {
    const m = regionMask({ kind: 'toneBand', min: 0.4, max: 0.6 }, { lum: lum([0.5]) }, true, 0.02);
    expect(m[0]).toBe(0);
  });
  it('mask resolves via callback; missing → full', () => {
    const got = regionMask({ kind: 'mask', maskId: 'x' },
      { lum: lum([0, 0, 0]), resolveMask: () => Float32Array.from([0.2, 0.4, 0.6]) }, false, 0.05);
    expect(got[0]).toBeCloseTo(0.2); expect(got[1]).toBeCloseTo(0.4); expect(got[2]).toBeCloseTo(0.6);
    const missing = regionMask({ kind: 'mask', maskId: 'y' }, { lum: lum([0, 0]) }, false, 0.05);
    expect(Array.from(missing)).toEqual([1, 1]);
  });
});

describe('compositeLayers', () => {
  const red: Uint8ClampedArray = Uint8ClampedArray.from([255, 0, 0, 255]);

  it('opaque background with no layers shows the background', () => {
    const out = compositeLayers(1, 1, '#ffffff', false, []);
    expect(Array.from(out)).toEqual([255, 255, 255, 255]);
  });
  it('full-mask opaque layer fully covers the background', () => {
    const layer: CompositeLayer = { rgba: red, mask: Float32Array.from([1]), blend: 'normal', opacity: 1 };
    const out = compositeLayers(1, 1, '#ffffff', false, [layer]);
    expect(Array.from(out)).toEqual([255, 0, 0, 255]);
  });
  it('zero-mask layer leaves the background untouched', () => {
    const layer: CompositeLayer = { rgba: red, mask: Float32Array.from([0]), blend: 'normal', opacity: 1 };
    const out = compositeLayers(1, 1, '#00ff00', false, [layer]);
    expect(Array.from(out)).toEqual([0, 255, 0, 255]);
  });
  it('multiply blend darkens toward the product', () => {
    // red (255,0,0) multiply white bg (255,255,255) = (255,0,0)
    const onWhite = compositeLayers(1, 1, '#ffffff', false,
      [{ rgba: red, mask: Float32Array.from([1]), blend: 'multiply', opacity: 1 }]);
    expect(onWhite[0]).toBe(255); expect(onWhite[1]).toBe(0);
    // red multiply gray (128) → (~128,0,0)
    const onGray = compositeLayers(1, 1, '#808080', false,
      [{ rgba: red, mask: Float32Array.from([1]), blend: 'multiply', opacity: 1 }]);
    expect(onGray[0]).toBeGreaterThan(120); expect(onGray[0]).toBeLessThan(135);
    expect(onGray[1]).toBe(0);
  });
  it('opacity scales coverage', () => {
    const out = compositeLayers(1, 1, '#000000', false,
      [{ rgba: Uint8ClampedArray.from([255, 255, 255, 255]), mask: Float32Array.from([1]), blend: 'normal', opacity: 0.5 }]);
    expect(out[0]).toBeGreaterThan(120); expect(out[0]).toBeLessThan(135); // ~50% gray
  });
  it('transparent background keeps unpainted pixels transparent', () => {
    const out = compositeLayers(1, 1, '#000000', true,
      [{ rgba: red, mask: Float32Array.from([0]), blend: 'normal', opacity: 1 }]);
    expect(out[3]).toBe(0);
  });
});

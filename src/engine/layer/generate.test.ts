import { describe, it, expect } from 'vitest';
import { toneBandLayers, colorRegionLayers, generateComposition } from './generate';
import { colorAssignments, colorRegionMask } from './color-region';
import type { RgbaImage } from '../image/types';

// Synthetic image: left half pure black, right half pure white.
function blackWhite(w = 8, h = 4): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255;
      const j = (y * w + x) * 4;
      data[j] = v; data[j + 1] = v; data[j + 2] = v; data[j + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe('toneBandLayers', () => {
  it('creates N contiguous luminance bands', () => {
    const layers = toneBandLayers(3);
    expect(layers).toHaveLength(3);
    expect(layers.every((l) => l.region.kind === 'toneBand')).toBe(true);
    const r0 = layers[0].region as { min: number; max: number };
    const r2 = layers[2].region as { min: number; max: number };
    expect(r0.min).toBeCloseTo(0);
    expect(r2.max).toBeCloseTo(1);
  });
  it('clamps count to 2..6', () => {
    expect(toneBandLayers(1)).toHaveLength(2);
    expect(toneBandLayers(99)).toHaveLength(6);
  });
});

describe('colorRegionLayers', () => {
  it('one layer per extracted color, luminance-ordered foregrounds', () => {
    const layers = colorRegionLayers(blackWhite(), 2);
    expect(layers).toHaveLength(2);
    expect(layers.every((l) => l.region.kind === 'colorRegion')).toBe(true);
    // index 0 is the darkest color, index 1 the lightest
    expect(layers[0].treatment.foreground < layers[1].treatment.foreground).toBe(true);
  });
});

describe('colorAssignments', () => {
  it('splits a black/white image into two regions cleanly', () => {
    const img = blackWhite(8, 4);
    const assign = colorAssignments(img, 2);
    // every pixel assigned to one of the 2 colors; left col differs from right col
    const left = assign[0];               // a black pixel
    const right = assign[4];              // a white pixel (x=4 in row 0)
    expect(left).not.toBe(right);
    const m0 = colorRegionMask(assign, left);
    const m1 = colorRegionMask(assign, right);
    // masks are complementary and cover everything
    for (let i = 0; i < assign.length; i++) {
      expect(m0[i] + m1[i]).toBe(1);
    }
  });
});

describe('generateComposition', () => {
  it('tone mode produces a non-transparent composition of band layers', () => {
    const comp = generateComposition(blackWhite(), 'tone', 3, '#ffffff');
    expect(comp.transparent).toBe(false);
    expect(comp.background).toBe('#ffffff');
    expect(comp.layers).toHaveLength(3);
  });
});

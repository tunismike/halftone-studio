import { describe, it, expect } from 'vitest';
import {
  patternToPaths, patternToSvg, coverageToKnockoutRgba, upscaleLum, defaultPatternVector,
} from './pattern-output';
import {
  bakePatternField, renderPatternScreen, defaultShaping, noPatternWarp,
  type PatternFieldKind, type PatternScreenParams,
} from '../screen/pattern-field';
import type { LumImage } from '../image/types';

function params(field: PatternFieldKind, over: Partial<PatternScreenParams> = {}): PatternScreenParams {
  return {
    field,
    cellSize: 8,
    angleDeg: 22.5,
    warp: { ...noPatternWarp },
    shaping: { ...defaultShaping },
    softPreview: true,
    ...over,
  };
}

function ramp(w = 120, h = 90): LumImage {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = x / (w - 1);
  return { width: w, height: h, data };
}

function flat(tone: number, w = 96, h = 96): LumImage {
  const data = new Float32Array(w * h);
  data.fill(tone);
  return { width: w, height: h, data };
}

describe('knockout PNG', () => {
  it('emits alpha of exactly 0 or 255 and nothing between', () => {
    // The entire reason the mode exists: a DTF/DTG RIP renders any partial
    // alpha as a grey halo around every dot.
    const field: PatternFieldKind = { kind: 'roundDot' };
    const cov = renderPatternScreen(ramp(), bakePatternField(field), params(field, { softPreview: false }));
    const rgba = coverageToKnockoutRgba(cov, { r: 17, g: 34, b: 51 });
    for (let j = 3; j < rgba.length; j += 4) {
      expect(rgba[j] === 0 || rgba[j] === 255).toBe(true);
    }
  });

  it('hardens even a soft-preview coverage map', () => {
    // Belt and braces: if an antialiased map ever reaches this path, the
    // threshold still collapses it rather than passing the halo through.
    const field: PatternFieldKind = { kind: 'cosDot' };
    const cov = renderPatternScreen(ramp(), bakePatternField(field), params(field, { softPreview: true }));
    let intermediate = 0;
    for (let i = 0; i < cov.data.length; i++) {
      if (cov.data[i] !== 0 && cov.data[i] !== 255) intermediate++;
    }
    expect(intermediate).toBeGreaterThan(0); // the input really is soft

    const rgba = coverageToKnockoutRgba(cov, { r: 0, g: 0, b: 0 });
    for (let j = 3; j < rgba.length; j += 4) {
      expect(rgba[j] === 0 || rgba[j] === 255).toBe(true);
    }
  });

  it('writes one flat ink colour on every pixel', () => {
    const field: PatternFieldKind = { kind: 'line' };
    const cov = renderPatternScreen(ramp(), bakePatternField(field), params(field, { softPreview: false }));
    const rgba = coverageToKnockoutRgba(cov, { r: 200, g: 30, b: 90 });
    for (let j = 0; j < rgba.length; j += 4) {
      expect([rgba[j], rgba[j + 1], rgba[j + 2]]).toEqual([200, 30, 90]);
    }
  });
});

describe('upscaleLum', () => {
  it('scales dimensions and preserves a flat field exactly', () => {
    const up = upscaleLum(flat(0.42, 20, 10), 3);
    expect(up.width).toBe(60);
    expect(up.height).toBe(30);
    for (let i = 0; i < up.data.length; i++) expect(up.data[i]).toBeCloseTo(0.42, 5);
  });

  it('keeps a ramp monotonic', () => {
    const up = upscaleLum(ramp(40, 8), 2);
    for (let x = 1; x < up.width; x++) {
      expect(up.data[x]).toBeGreaterThanOrEqual(up.data[x - 1]);
    }
  });
});

describe('vector export', () => {
  const field: PatternFieldKind = { kind: 'roundDot' };

  it('traces at supersampled resolution', () => {
    const paths = patternToPaths(ramp(), bakePatternField(field), params(field), defaultPatternVector);
    expect(paths.width).toBe(120 * defaultPatternVector.supersample);
    expect(paths.height).toBe(90 * defaultPatternVector.supersample);
    expect(paths.loops).toBeGreaterThan(10);
    expect(paths.d.length).toBeGreaterThan(100);
  });

  it('scales the SVG viewBox back to source size', () => {
    const paths = patternToPaths(ramp(), bakePatternField(field), params(field), defaultPatternVector);
    const svg = patternToSvg(paths, 120, 90, '#000000', '#ffffff', true);
    expect(svg).toContain('width="120" height="90"');
    expect(svg).toContain(`viewBox="0 0 ${paths.width} ${paths.height}"`);
  });

  it('uses even-odd so shadow holes knock out', () => {
    const paths = patternToPaths(ramp(), bakePatternField(field), params(field), defaultPatternVector);
    expect(patternToSvg(paths, 120, 90, '#000000', '#ffffff', true)).toContain('fill-rule="evenodd"');
  });

  it('omits the background rect when transparent', () => {
    const paths = patternToPaths(ramp(), bakePatternField(field), params(field), defaultPatternVector);
    expect(patternToSvg(paths, 120, 90, '#000000', '#ffffff', true)).not.toContain('<rect');
    expect(patternToSvg(paths, 120, 90, '#000000', '#ffffff', false)).toContain('<rect');
  });

  it('minFeature drops small islands', () => {
    const tile = bakePatternField(field);
    const src = flat(0.88, 120, 90); // highlights: many tiny dots
    const many = patternToPaths(src, tile, params(field), { ...defaultPatternVector, minFeature: 0.1 });
    const few = patternToPaths(src, tile, params(field), { ...defaultPatternVector, minFeature: 40 });
    expect(many.loops).toBeGreaterThan(0);
    expect(few.loops).toBeLessThan(many.loops);
  });

  it('holds the screen at a fixed physical size across supersample factors', () => {
    // Lengths in device px (cell size, warp amplitude) have to scale with the
    // grid or the exported vector would carry a different screen ruling than
    // the preview it came from.
    const tile = bakePatternField(field);
    const src = flat(0.5, 120, 90);
    const inkFraction = (supersample: number): number => {
      const paths = patternToPaths(src, tile, params(field), { ...defaultPatternVector, supersample });
      return paths.loops / (paths.width * paths.height);
    };
    // Dot count per unit area is what encodes the ruling; it must not drift.
    const at1 = inkFraction(1) * 1;
    const at3 = inkFraction(3) * 9;
    expect(at3).toBeCloseTo(at1, 2);
  });
});

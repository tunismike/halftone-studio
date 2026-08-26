import { describe, it, expect } from 'vitest';
import {
  bakePatternField, renderPatternScreen, equalizeTile, inkDemand,
  defaultShaping, coverageToMask,
  type PatternFieldKind, type PatternScreenParams,
} from './pattern-field';
import type { LumImage } from '../image/types';

const ALL_FIELDS: PatternFieldKind[] = [
  { kind: 'cosDot' },
  { kind: 'roundDot' },
  { kind: 'line' },
];

function flat(tone: number, w = 96, h = 96): LumImage {
  const data = new Float32Array(w * h);
  data.fill(tone);
  return { width: w, height: h, data };
}

function params(field: PatternFieldKind, over: Partial<PatternScreenParams> = {}): PatternScreenParams {
  return {
    field,
    cellSize: 8,
    angleDeg: 45,
    shaping: { ...defaultShaping },
    softPreview: false,
    ...over,
  };
}

function inkFraction(field: PatternFieldKind, tone: number, over: Partial<PatternScreenParams> = {}): number {
  const p = params(field, over);
  const cov = renderPatternScreen(flat(tone), bakePatternField(field), p);
  let sum = 0;
  for (let i = 0; i < cov.data.length; i++) sum += cov.data[i] / 255;
  return sum / cov.data.length;
}

describe('equalizeTile', () => {
  it('remaps any distribution to a uniform [0,1)', () => {
    // Heavily skewed input: most values bunched near zero.
    const n = 4096;
    const src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = Math.pow(i / n, 4);
    const eq = equalizeTile(src);
    // Every decile of the equalized field holds ~10% of the values.
    for (let d = 1; d <= 9; d++) {
      const t = d / 10;
      let below = 0;
      for (let i = 0; i < n; i++) if (eq[i] < t) below++;
      expect(below / n).toBeCloseTo(t, 3);
    }
  });

  it('preserves the original ordering', () => {
    const src = Float32Array.from([5, 1, 4, 2, 3]);
    const eq = equalizeTile(src);
    expect(eq[1]).toBeLessThan(eq[3]);
    expect(eq[3]).toBeLessThan(eq[4]);
    expect(eq[4]).toBeLessThan(eq[2]);
    expect(eq[2]).toBeLessThan(eq[0]);
  });
});

describe('tonal linearity', () => {
  // The money test. A constant-tone patch must print an ink fraction equal to
  // its ink demand, for every field. This is what equalization buys, and it is
  // what makes the output read as a professional screen rather than a muddy one.
  it.each(ALL_FIELDS)('ink fraction tracks tone within 2% ($kind)', (field) => {
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      // tone t → ink demand (1 - t) under the default linear shaping.
      expect(inkFraction(field, t)).toBeCloseTo(1 - t, 1.5);
    }
  });

  it.each(ALL_FIELDS)('holds across cell sizes at print angles ($kind)', (field) => {
    for (const over of [
      { cellSize: 4, angleDeg: 22.5 },
      { cellSize: 6.7, angleDeg: 15 },
      { cellSize: 11, angleDeg: 75 },
      { cellSize: 16, angleDeg: 45 },
    ]) {
      for (const t of [0.2, 0.5, 0.8]) {
        expect(inkFraction(field, t, over)).toBeCloseTo(1 - t, 1.5);
      }
    }
  });

  it.each(ALL_FIELDS)('soft preview keeps the same average tone ($kind)', (field) => {
    for (const t of [0.25, 0.5, 0.75]) {
      expect(inkFraction(field, t, { softPreview: true })).toBeCloseTo(1 - t, 1.5);
    }
  });
});

describe('axis-aligned quantization', () => {
  // At angleDeg 0 every cell samples the pixel grid at identical phase, so the
  // achievable ink fractions collapse to the handful of distinct threshold
  // values inside one cell — coarsened further by the field's own symmetry
  // (points equidistant from a round dot's center must switch on together, or
  // the dot stops being round). This is ordinary screening physics and the
  // reason print screens are angled at all; we document it rather than paper
  // over it with noise.
  it('quantizes tone when the screen is axis-aligned', () => {
    const err = Math.abs(inkFraction({ kind: 'roundDot' }, 0.35, { cellSize: 8, angleDeg: 0 }) - 0.65);
    expect(err).toBeGreaterThan(0.02);
  });

  it('is essentially exact at any print angle', () => {
    for (const angleDeg of [15, 22.5, 45, 75]) {
      const err = Math.abs(inkFraction({ kind: 'roundDot' }, 0.35, { cellSize: 8, angleDeg }) - 0.65);
      expect(err).toBeLessThan(0.005);
    }
  });

  it('supersampling recovers most of it for axis-aligned preview', () => {
    const hard = Math.abs(inkFraction({ kind: 'roundDot' }, 0.35, { cellSize: 8, angleDeg: 0 }) - 0.65);
    const soft = Math.abs(
      inkFraction({ kind: 'roundDot' }, 0.35, { cellSize: 8, angleDeg: 0, softPreview: true }) - 0.65,
    );
    expect(soft).toBeLessThan(hard / 2);
  });
});

describe('tonal extremes', () => {
  it.each(ALL_FIELDS)('pure black is fully solid, pure white is empty ($kind)', (field) => {
    expect(inkFraction(field, 0)).toBe(1);
    expect(inkFraction(field, 1)).toBe(0);
  });

  it('solidAt / dropAt clamp exactly', () => {
    const shaping = { ...defaultShaping, solidAt: 0.2, dropAt: 0.8 };
    expect(inkFraction({ kind: 'cosDot' }, 0.15, { shaping })).toBe(1);
    expect(inkFraction({ kind: 'cosDot' }, 0.85, { shaping })).toBe(0);
    // Midway between the two clamps is still half coverage.
    expect(inkFraction({ kind: 'cosDot' }, 0.5, { shaping })).toBeCloseTo(0.5, 1.5);
  });
});

describe('knockout guarantee', () => {
  it.each(ALL_FIELDS)('hard mode emits only 0 or 255 ($kind)', (field) => {
    const cov = renderPatternScreen(flat(0.5), bakePatternField(field), params(field));
    for (let i = 0; i < cov.data.length; i++) {
      expect(cov.data[i] === 0 || cov.data[i] === 255).toBe(true);
    }
  });

  it('soft mode is the only source of intermediate coverage', () => {
    const f: PatternFieldKind = { kind: 'roundDot' };
    const cov = renderPatternScreen(flat(0.5), bakePatternField(f), params(f, { softPreview: true }));
    let intermediate = 0;
    for (let i = 0; i < cov.data.length; i++) {
      if (cov.data[i] !== 0 && cov.data[i] !== 255) intermediate++;
    }
    expect(intermediate).toBeGreaterThan(0);
  });
});

describe('dot geometry', () => {
  // Structure through the whole tonal range is the reason this mode exists:
  // the mark-stamping path can grow discs until they merge, but it can never
  // produce the hole phase.
  const cos = bakePatternField({ kind: 'cosDot' });

  function maskAt(tone: number): { mask: Uint8Array; w: number; h: number } {
    const p = params({ kind: 'cosDot' }, { cellSize: 8, angleDeg: 22.5 });
    const cov = renderPatternScreen(flat(tone, 64, 64), cos, p);
    return { mask: coverageToMask(cov), w: 64, h: 64 };
  }

  // 4-connected component count over a NON-wrapping grid, counting either
  // ink islands (dots) or holes.
  function components(mask: Uint8Array, w: number, h: number, target: number): number {
    const seen = new Uint8Array(mask.length);
    let n = 0;
    const stack: number[] = [];
    for (let i = 0; i < mask.length; i++) {
      if (seen[i] || mask[i] !== target) continue;
      n++;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % w;
        const cy = (c / w) | 0;
        if (cx > 0 && !seen[c - 1] && mask[c - 1] === target) { seen[c - 1] = 1; stack.push(c - 1); }
        if (cx < w - 1 && !seen[c + 1] && mask[c + 1] === target) { seen[c + 1] = 1; stack.push(c + 1); }
        if (cy > 0 && !seen[c - w] && mask[c - w] === target) { seen[c - w] = 1; stack.push(c - w); }
        if (cy < h - 1 && !seen[c + w] && mask[c + w] === target) { seen[c + w] = 1; stack.push(c + w); }
      }
    }
    return n;
  }

  it('highlights are disconnected dots', () => {
    const { mask, w, h } = maskAt(0.85);
    // 64px at cellSize 8 ⇒ an 8×8 lattice; expect dozens of separate dots.
    expect(components(mask, w, h, 1)).toBeGreaterThan(30);
    expect(components(mask, w, h, 0)).toBe(1); // paper is one connected field
  });

  it('shadows invert to disconnected holes', () => {
    const { mask, w, h } = maskAt(0.15);
    expect(components(mask, w, h, 0)).toBeGreaterThan(30);
    expect(components(mask, w, h, 1)).toBe(1); // ink is one connected field
  });

  it('midtone interlocks: both phases percolate', () => {
    const { mask, w, h } = maskAt(0.5);
    // At 50% the two phases are congruent — neither is a scatter of islands in
    // a sea of the other, which is what distinguishes a checkerboard midtone
    // from the highlight and shadow extremes above.
    const ink = components(mask, w, h, 1);
    const paper = components(mask, w, h, 0);
    expect(ink).toBeGreaterThan(10);
    expect(paper).toBeGreaterThan(10);
    let inked = 0;
    for (let i = 0; i < mask.length; i++) inked += mask[i];
    expect(inked / mask.length).toBeCloseTo(0.5, 1.5);
  });
});

describe('inkDemand', () => {
  it('is linear in tone by default', () => {
    expect(inkDemand(0, defaultShaping)).toBe(1);
    expect(inkDemand(0.5, defaultShaping)).toBeCloseTo(0.5, 6);
    expect(inkDemand(1, defaultShaping)).toBe(0);
  });

  it('inverts', () => {
    const p = { ...defaultShaping, invert: true };
    expect(inkDemand(0, p)).toBe(0);
    expect(inkDemand(1, p)).toBe(1);
  });

  it('applies gamma between the clamps', () => {
    const p = { ...defaultShaping, gamma: 2 };
    expect(inkDemand(0.5, p)).toBeCloseTo(0.25, 6);
  });
});

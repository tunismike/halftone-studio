import { describe, it, expect } from 'vitest';
import { radiusRatioForCoverage, SOLID_RATIO } from './dot-coverage';

// Actual disc-in-cell coverage for a radius ratio (mirrors the engine geometry).
function coverage(rr: number): number {
  if (rr <= 0) return 0;
  if (rr >= Math.SQRT2) return 1;
  const r = rr * 0.5;
  if (rr <= 1) return Math.PI * r * r;
  const seg = r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25);
  return Math.min(1, Math.PI * r * r - 4 * seg);
}

describe('radiusRatioForCoverage', () => {
  it('round-trips: coverage(ratio(c)) ≈ c across the range', () => {
    for (const c of [0.1, 0.25, 0.4, 0.5, 0.6, 0.785, 0.9, 0.95]) {
      expect(coverage(radiusRatioForCoverage(c))).toBeCloseTo(c, 1);
    }
  });

  it('0 coverage → no dot, 1 coverage → corner-filling (solid)', () => {
    expect(radiusRatioForCoverage(0)).toBe(0);
    expect(radiusRatioForCoverage(1)).toBeCloseTo(SOLID_RATIO, 5);
  });

  it('50% tone gives ~50% ink (not 39% like a naive r∝√c, nor 25% like r∝c)', () => {
    const c = coverage(radiusRatioForCoverage(0.5));
    expect(c).toBeGreaterThan(0.47);
    expect(c).toBeLessThan(0.53);
  });

  it('a dot at π/4 coverage just touches the cell edge (ratio ≈ 1)', () => {
    expect(radiusRatioForCoverage(Math.PI / 4)).toBeCloseTo(1, 1);
  });
});

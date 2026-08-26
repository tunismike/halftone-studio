import { describe, it, expect } from 'vitest';
import { bakePatternField, renderPatternScreen, defaultShaping, noPatternWarp } from './pattern-field';
import type { LumImage } from '../image/types';

// The print-facing relationship the UI exposes:
//   dpi = sourceWidth / outputWidthInches      cellSize = dpi / lpi
// Documented here so a refactor can't quietly invert it.
const dpiFor = (sourceWidth: number, inches: number): number => sourceWidth / inches;
const cellFor = (dpi: number, lpi: number): number => dpi / lpi;

describe('print units', () => {
  it('derives DPI from source width and printed width', () => {
    // A 4200px source printed 14in wide is 300 DPI — the reference spec's ceiling.
    expect(dpiFor(4200, 14)).toBe(300);
  });

  it('maps the reference rulings to sane cell sizes at 300 DPI', () => {
    expect(cellFor(300, 25)).toBe(12);
    expect(cellFor(300, 45)).toBeCloseTo(6.67, 2);
  });

  it('a cell size set from an LPI round-trips back to that LPI', () => {
    const dpi = dpiFor(4200, 14);
    for (const lpi of [25, 35, 45]) {
      const cell = cellFor(dpi, lpi);
      expect(dpi / cell).toBeCloseTo(lpi, 6);
    }
  });

  it('holds tonal linearity at the reference rulings and angle', () => {
    // 25/35/45 LPI @ 22.5 deg, 300 DPI — the settings the benchmark product
    // ships. Tone has to stay linear at all three or the ruling control is a
    // lie.
    const field = { kind: 'roundDot' } as const;
    const tile = bakePatternField(field);
    const dpi = 300;
    for (const lpi of [25, 35, 45]) {
      for (const tone of [0.25, 0.5, 0.75]) {
        const w = 300, h = 300;
        const data = new Float32Array(w * h);
        data.fill(tone);
        const lum: LumImage = { width: w, height: h, data };
        const cov = renderPatternScreen(lum, tile, {
          field,
          cellSize: cellFor(dpi, lpi),
          angleDeg: 22.5,
          warp: { ...noPatternWarp },
          shaping: { ...defaultShaping },
          softPreview: false,
        });
        let sum = 0;
        for (let i = 0; i < cov.data.length; i++) sum += cov.data[i] / 255;
        expect(sum / cov.data.length).toBeCloseTo(1 - tone, 1.5);
      }
    }
  });
});

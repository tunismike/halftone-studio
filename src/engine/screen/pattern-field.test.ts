import { describe, it, expect } from 'vitest';
import {
  bakePatternField, renderPatternScreen, equalizeTile, inkDemand,
  defaultShaping, noPatternWarp, coverageToMask, defaultPatternScreen,
  type PatternFieldKind, type PatternScreenParams, type PatternTile,
} from './pattern-field';
import { PATTERN_PRESETS, matchPatternPreset } from './pattern-presets';
import type { LumImage } from '../image/types';

const ALL_FIELDS: PatternFieldKind[] = [
  { kind: 'cosDot' },
  { kind: 'roundDot' },
  { kind: 'line' },
  { kind: 'cosDot', hex: true },
  { kind: 'roundDot', hex: true },
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
    warp: { ...noPatternWarp },
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

// Small/cheap configs — the shapes are what matter here, not the preset scales.
const BAKED_FIELDS: PatternFieldKind[] = [
  { kind: 'blueNoise', size: 32, seed: 1 },
  { kind: 'rd', pattern: 'pebbles', iterations: 600, gridSize: 64, seed: 1, featureTexels: 8 },
  { kind: 'rd', pattern: 'squiggles', iterations: 600, gridSize: 64, seed: 1, featureTexels: 8,
    dash: { width: 0.4, scale: 8, seed: 7 } },
  { kind: 'worley', cells: 8, jitter: 0.9, edge: true, seed: 3 },
  { kind: 'worley', cells: 8, jitter: 0.9, edge: false, seed: 3 },
  { kind: 'fbm', octaves: 3, lacunarity: 2, gain: 0.5, periods: 8, seed: 5 },
  { kind: 'points', cells: 8, jitter: 0.6, sizeJitter: 0.5, seed: 11 },
  { kind: 'rings', cells: 8, jitter: 0.5, radius: 0.34, seed: 3 },
  { kind: 'points', cells: 8, jitter: 0.3, sizeJitter: 0.3, seed: 11, hex: true },
  { kind: 'points', cells: 10, jitter: 1, sizeJitter: 0.3, seed: 11, hex: true, relax: 8 },
  { kind: 'strokes', cells: 10, length: 1, lengthJitter: 0.6, spread: 0.7, bend: 0.6, bias: 0.35, seed: 11 },
];

describe('baked fields', () => {
  // The raw distributions here are wildly non-uniform — Gray-Scott
  // concentrations pile up at the attractor, Worley distances are skewed, fbm
  // is roughly Gaussian. Equalization is what drags all of them onto the same
  // linear tonal response, so this is the test that earns the whole approach.
  it.each(BAKED_FIELDS)('equalization gives linear tone ($kind)', (field) => {
    const tile = bakePatternField(field);
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const cov = renderPatternScreen(flat(t, 160, 160), tile, params(field, { cellSize: 6, angleDeg: 22.5 }));
      let sum = 0;
      for (let i = 0; i < cov.data.length; i++) sum += cov.data[i] / 255;
      expect(sum / cov.data.length).toBeCloseTo(1 - t, 1);
    }
  });

  it.each(BAKED_FIELDS)('produces a tileable field in [0,1) ($kind)', (field) => {
    const tile = bakePatternField(field);
    expect(tile.values.length).toBe(tile.size * tile.size);
    expect(tile.tileCells).toBeGreaterThan(0);
    for (let i = 0; i < tile.values.length; i++) {
      expect(tile.values[i]).toBeGreaterThan(0);
      expect(tile.values[i]).toBeLessThan(1);
    }
  });

  it.each(BAKED_FIELDS)('is deterministic ($kind)', (field) => {
    const a = bakePatternField(field);
    const b = bakePatternField(field);
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
  });

  it('reads threshold matrices without interpolating', () => {
    // Regression: blue noise is one feature per texel, so bilinear sampling
    // averages four uncorrelated thresholds and drags them toward 0.5 — a
    // patch asking for 80% ink came back at 97%. Nearest lookup is required
    // for correctness, not sharpness.
    const field: PatternFieldKind = { kind: 'blueNoise', size: 32, seed: 1 };
    const tile = bakePatternField(field);
    expect(tile.smooth).toBe(false);

    const measure = (t: PatternTile): number => {
      const cov = renderPatternScreen(flat(0.2, 160, 160), t, params(field, { cellSize: 6, angleDeg: 22.5 }));
      let sum = 0;
      for (let i = 0; i < cov.data.length; i++) sum += cov.data[i] / 255;
      return sum / cov.data.length;
    };
    expect(measure(tile)).toBeCloseTo(0.8, 1);
    // Forcing interpolation on reintroduces the bias this flag exists to avoid.
    expect(measure({ ...tile, smooth: true })).toBeGreaterThan(0.9);
  });

  it('a different seed gives a different field', () => {
    const a = bakePatternField({ kind: 'points', cells: 8, jitter: 0.6, sizeJitter: 0.5, seed: 11 });
    const b = bakePatternField({ kind: 'points', cells: 8, jitter: 0.6, sizeJitter: 0.5, seed: 12 });
    expect(Array.from(a.values)).not.toEqual(Array.from(b.values));
  });
});

describe('domain warp', () => {
  const wavy = { waveAmp: 12, waveFreq: 0.02, wavePhase: 0.3, noiseAmp: 6, noiseFreq: 0.015, noiseSeed: 7 };

  it.each(ALL_FIELDS)('preserves tonal linearity ($kind)', (field) => {
    // A domain warp relocates which threshold each pixel reads but leaves the
    // field's value distribution alone, so the tonal response must survive it.
    for (const t of [0.2, 0.5, 0.8]) {
      expect(inkFraction(field, t, { warp: wavy, angleDeg: 22.5 })).toBeCloseTo(1 - t, 1.5);
    }
  });

  it('is deterministic for a given seed', () => {
    const f: PatternFieldKind = { kind: 'roundDot' };
    const tile = bakePatternField(f);
    const a = renderPatternScreen(flat(0.4), tile, params(f, { warp: wavy }));
    const b = renderPatternScreen(flat(0.4), tile, params(f, { warp: wavy }));
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('a different noise seed gives a different field', () => {
    const f: PatternFieldKind = { kind: 'roundDot' };
    const tile = bakePatternField(f);
    const a = renderPatternScreen(flat(0.4), tile, params(f, { warp: wavy }));
    const b = renderPatternScreen(flat(0.4), tile, params(f, { warp: { ...wavy, noiseSeed: 8 } }));
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('zero amplitude is exactly a no-op', () => {
    const f: PatternFieldKind = { kind: 'cosDot' };
    const tile = bakePatternField(f);
    const plain = renderPatternScreen(flat(0.4), tile, params(f));
    const zeroed = renderPatternScreen(flat(0.4), tile, params(f, {
      warp: { ...noPatternWarp, waveFreq: 0.05, wavePhase: 2, noiseFreq: 0.3 },
    }));
    expect(Array.from(zeroed.data)).toEqual(Array.from(plain.data));
  });

  it('actually bends the pattern', () => {
    const f: PatternFieldKind = { kind: 'line' };
    const tile = bakePatternField(f);
    const straight = renderPatternScreen(flat(0.5), tile, params(f, { angleDeg: 0 }));
    const bent = renderPatternScreen(flat(0.5), tile, params(f, { angleDeg: 0, warp: wavy }));
    let diff = 0;
    for (let i = 0; i < bent.data.length; i++) if (bent.data[i] !== straight.data[i]) diff++;
    expect(diff / bent.data.length).toBeGreaterThan(0.1);
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

describe('preset matching', () => {
  it('recognises a preset regardless of key order', () => {
    const p = PATTERN_PRESETS[0];
    expect(matchPatternPreset(p.params)?.id).toBe(p.id);

    // Same settings, keys written in a different order — what a JSON round
    // trip through the URL hash or autosave can produce.
    const reordered = {
      softPreview: p.params.softPreview,
      shaping: { invert: p.params.shaping.invert, dropAt: p.params.shaping.dropAt,
        solidAt: p.params.shaping.solidAt, gamma: p.params.shaping.gamma },
      angleDeg: p.params.angleDeg,
      warp: { ...p.params.warp },
      cellSize: p.params.cellSize,
      field: { ...p.params.field },
    } as PatternScreenParams;
    expect(matchPatternPreset(reordered)?.id).toBe(p.id);
  });

  it('survives a real JSON round trip for every preset', () => {
    for (const p of PATTERN_PRESETS) {
      expect(matchPatternPreset(JSON.parse(JSON.stringify(p.params)))?.id).toBe(p.id);
    }
  });

  it('returns nothing once a value actually differs', () => {
    const p = PATTERN_PRESETS[0];
    expect(matchPatternPreset({ ...p.params, cellSize: p.params.cellSize + 1 })).toBeUndefined();
  });

  it('the default mode lands on a named preset', () => {
    expect(matchPatternPreset(defaultPatternScreen)).toBeDefined();
  });

  it('every preset id is unique', () => {
    const ids = PATTERN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('hex packing', () => {
  // A square lattice puts its neighbours at 0/90 degrees; an equilateral one
  // puts six at 60-degree steps, with alternate rows offset half a column.
  // That staggering is what stops a dot screen reading as rows and columns,
  // and it is the packing most printed screens actually use.
  function dotCentroids(field: PatternFieldKind, tone: number): Array<[number, number]> {
    const w = 200, h = 200;
    const data = new Float32Array(w * h);
    data.fill(tone);
    const cov = renderPatternScreen({ width: w, height: h, data },
      bakePatternField(field), params(field, { cellSize: 14, angleDeg: 0 }));
    const mask = coverageToMask(cov);
    const seen = new Uint8Array(mask.length);
    const out: Array<[number, number]> = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      let sx = 0, sy = 0, n = 0, touchesEdge = false;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % w, cy = (c / w) | 0;
        sx += cx; sy += cy; n++;
        if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) touchesEdge = true;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      if (!touchesEdge && n >= 4) out.push([sx / n, sy / n]);
    }
    return out;
  }

  // Mean angular distance of each dot's nearest bonds from the closest
  // multiple of `step` degrees. The symmetry the lattice actually has wins.
  function bondDeviation(cs: Array<[number, number]>, step: number): number {
    let sum = 0, count = 0;
    for (let i = 0; i < cs.length; i++) {
      const [x, y] = cs[i];
      const d = cs
        .map((c, j) => [Math.hypot(c[0] - x, c[1] - y), j] as const)
        .filter(([, j]) => j !== i)
        .sort((a, b) => a[0] - b[0])
        .slice(0, 6);
      if (!d.length) continue;
      const r0 = d[0][0];
      for (const [dist, j] of d) {
        if (dist > r0 * 1.35) break;
        const ang = ((Math.atan2(cs[j][1] - y, cs[j][0] - x) * 180) / Math.PI + 360) % 180;
        const m = ang % step;
        sum += Math.min(m, step - m);
        count++;
      }
    }
    return count ? sum / count : NaN;
  }

  it.each([
    { kind: 'cosDot', hex: true } as PatternFieldKind,
    { kind: 'roundDot', hex: true } as PatternFieldKind,
    { kind: 'points', cells: 14, jitter: 0, sizeJitter: 0, seed: 3, hex: true } as PatternFieldKind,
  ])('staggers rows onto a 60-degree lattice ($kind)', (field) => {
    const cs = dotCentroids(field, 0.8);
    expect(cs.length).toBeGreaterThan(20);
    expect(bondDeviation(cs, 60)).toBeLessThan(bondDeviation(cs, 90));
  });

  it.each([
    { kind: 'cosDot' } as PatternFieldKind,
    { kind: 'roundDot' } as PatternFieldKind,
  ])('leaves the square lattice square when hex is off ($kind)', (field) => {
    const cs = dotCentroids(field, 0.8);
    expect(cs.length).toBeGreaterThan(20);
    expect(bondDeviation(cs, 90)).toBeLessThan(bondDeviation(cs, 60));
  });

  it('keeps hex tiles seamless across the wrap', () => {
    // The tile is sqrt(3) taller than it is wide precisely so the staggered
    // rows meet at the seam; a mismatch would show as a tone discontinuity.
    const field: PatternFieldKind = { kind: 'roundDot', hex: true };
    const tile = bakePatternField(field);
    expect(tile.aspect).toBeCloseTo(Math.sqrt(3), 6);
    const w = 400, h = 400;
    const data = new Float32Array(w * h);
    data.fill(0.5);
    const cov = renderPatternScreen({ width: w, height: h, data }, tile,
      params(field, { cellSize: 9, angleDeg: 0 }));
    // Ink fraction per horizontal band should be flat: a seam would spike one.
    const bands: number[] = [];
    for (let b = 0; b < 8; b++) {
      let s = 0;
      for (let y = b * (h / 8); y < (b + 1) * (h / 8); y++)
        for (let x = 0; x < w; x++) s += cov.data[y * w + x] / 255;
      bands.push(s / (w * (h / 8)));
    }
    expect(Math.max(...bands) - Math.min(...bands)).toBeLessThan(0.05);
  });
});

describe('point relaxation', () => {
  // A jittered grid at full jitter looks random but drops points from
  // neighbouring cells on top of each other, and those pairs merge into worms.
  // Relaxation puts a floor under the spacing without restoring the grid.
  function separateDots(relax: number): { blobs: number; ink: number } {
    const field: PatternFieldKind = {
      kind: 'points', cells: 22, jitter: 1, sizeJitter: 0.3, seed: 11, relax,
    };
    const w = 220, h = 220;
    const data = new Float32Array(w * h);
    data.fill(0.62);
    const cov = renderPatternScreen({ width: w, height: h, data },
      bakePatternField(field), params(field, { cellSize: 9, angleDeg: 0 }));
    const mask = coverageToMask(cov);
    const seen = new Uint8Array(mask.length);
    let blobs = 0, ink = 0;
    for (let i = 0; i < mask.length; i++) {
      ink += mask[i];
      if (!mask[i] || seen[i]) continue;
      blobs++;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % w, cy = (c / w) | 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
    }
    return { blobs, ink: ink / mask.length };
  }

  it('keeps dots separate at the same ink coverage', () => {
    const raw = separateDots(0);
    const relaxed = separateDots(8);
    // Equalization fixes the ink fraction, so the only thing that can change
    // is how much of it is stuck together.
    expect(relaxed.ink).toBeCloseTo(raw.ink, 1);
    expect(relaxed.blobs).toBeGreaterThan(raw.blobs * 1.15);
  });

  it('does not collapse back onto a lattice', () => {
    // Relaxation run to convergence would rebuild the grid it is escaping, so
    // the relaxed set must stay measurably more disordered than a bare lattice.
    const lattice: PatternFieldKind = {
      kind: 'points', cells: 22, jitter: 0, sizeJitter: 0, seed: 11, relax: 0,
    };
    const relaxed: PatternFieldKind = {
      kind: 'points', cells: 22, jitter: 1, sizeJitter: 0, seed: 11, relax: 8,
    };
    const spread = (f: PatternFieldKind): number => {
      const tile = bakePatternField(f);
      let sum = 0;
      for (let i = 0; i < tile.values.length; i++) sum += tile.values[i];
      const mean = sum / tile.values.length;
      let varr = 0;
      for (let i = 0; i < tile.values.length; i++) {
        const d = tile.values[i] - mean;
        varr += d * d;
      }
      return varr / tile.values.length;
    };
    // Both are equalized so both have the same value spread; the difference is
    // structural, so compare bond order instead via dot positions.
    expect(spread(relaxed)).toBeCloseTo(spread(lattice), 2);
    const a = bakePatternField(lattice).values;
    const b = bakePatternField(relaxed).values;
    let differing = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.05) differing++;
    expect(differing / a.length).toBeGreaterThan(0.3);
  });

  it('is deterministic', () => {
    const f: PatternFieldKind = {
      kind: 'points', cells: 12, jitter: 1, sizeJitter: 0.3, seed: 4, relax: 6,
    };
    expect(Array.from(bakePatternField(f).values)).toEqual(Array.from(bakePatternField(f).values));
  });
});

describe('rd dash mode', () => {
  // Thresholding a fixed field can only fatten or thin its ridges, so a plain
  // RD screen runs the same maze at every tone, just at different weights.
  // Dash mode reorders the worm band by smooth noise so worms drop out in
  // segments instead. What that buys is fragmentation — measured here — not
  // literally constant stroke weight, which barely moves either way.
  const BASE = {
    kind: 'rd', pattern: 'squiggles', iterations: 2000, gridSize: 128, seed: 1, featureTexels: 9,
  } as const;
  const DASH = { width: 0.4, scale: 18, seed: 7 } as const;

  function render(field: PatternFieldKind, tone: number): { mask: Uint8Array; w: number; h: number } {
    const w = 240, h = 240;
    const data = new Float32Array(w * h);
    data.fill(tone);
    const cov = renderPatternScreen({ width: w, height: h, data },
      bakePatternField(field), params(field, { cellSize: 6, angleDeg: 0 }));
    return { mask: coverageToMask(cov), w, h };
  }

  function stats(field: PatternFieldKind, tone: number): { marks: number; ink: number } {
    const { mask, w, h } = render(field, tone);
    const seen = new Uint8Array(mask.length);
    let marks = 0, ink = 0;
    for (let i = 0; i < mask.length; i++) {
      ink += mask[i];
      if (!mask[i] || seen[i]) continue;
      marks++;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % w, cy = (c / w) | 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
    }
    return { marks, ink: ink / mask.length };
  }

  it('breaks the maze into far more separate marks at the same ink', () => {
    // Tone 0.7 puts ink demand at 0.3, inside the 0.4 dash band.
    const plain = stats({ ...BASE }, 0.7);
    const dashed = stats({ ...BASE, dash: DASH }, 0.7);
    expect(dashed.ink).toBeCloseTo(plain.ink, 1);
    expect(dashed.marks).toBeGreaterThan(plain.marks * 1.8);
  });

  it('leaves the shadow end alone above the dash band', () => {
    // Ink demand 0.55 is past width 0.4, where the field is untouched, so the
    // two must agree — a dash setting that changed the shadows would be
    // rewriting tone rather than redistributing marks.
    const a = render({ ...BASE }, 0.45);
    const b = render({ ...BASE, dash: DASH }, 0.45);
    let same = 0;
    for (let i = 0; i < a.mask.length; i++) if (a.mask[i] === b.mask[i]) same++;
    expect(same / a.mask.length).toBeGreaterThan(0.95);
  });

  it('does not disturb tonal linearity', () => {
    const field: PatternFieldKind = { ...BASE, dash: DASH };
    for (const tone of [0.25, 0.5, 0.75]) {
      expect(stats(field, tone).ink).toBeCloseTo(1 - tone, 1);
    }
  });
});

describe('strokes field', () => {
  const FIELD: PatternFieldKind = {
    kind: 'strokes', cells: 20, length: 1, lengthJitter: 0.7,
    spread: 0.75, bend: 0.6, bias: 0.35, seed: 11,
  };

  function marks(field: PatternFieldKind, tone: number): { count: number; largest: number } {
    const w = 240, h = 240;
    const data = new Float32Array(w * h);
    data.fill(tone);
    const cov = renderPatternScreen({ width: w, height: h, data },
      bakePatternField(field), params(field, { cellSize: 10, angleDeg: 0 }));
    const mask = coverageToMask(cov);
    const seen = new Uint8Array(mask.length);
    let count = 0, largest = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      count++;
      let n = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        const cx = c % w, cy = (c / w) | 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      if (n > largest) largest = n;
    }
    return { count, largest: largest / mask.length };
  }

  it('scatters many separate marks rather than a few blocks', () => {
    // Regression: applying the per-stroke offset as a flat term rather than
    // fading it with distance darkened every texel in a stroke's 5x5 search
    // neighbourhood, stamping square blocks of cells instead of marks. Tone
    // stayed linear throughout, so only the shape of the output catches it.
    const { count, largest } = marks(FIELD, 0.8);
    expect(count).toBeGreaterThan(60);
    expect(largest).toBeLessThan(0.05);
  });

  it('lets marks merge as tone darkens', () => {
    // The whole reason this field exists: strokes are placed independently, so
    // they collide. A field whose features hold each other apart would keep its
    // mark count roughly flat instead of consolidating.
    const light = marks(FIELD, 0.82);
    const dark = marks(FIELD, 0.5);
    expect(dark.count).toBeLessThan(light.count);
    expect(dark.largest).toBeGreaterThan(light.largest * 3);
  });
});

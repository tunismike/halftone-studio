// Pattern screens — threshold-field halftoning.
//
//   ink(x, y) = coverage(x, y) > T(x, y)
//
// where T is a *rank-equalized* threshold field in [0,1). Equalization is the
// whole ballgame: after sorting a field's values and remapping them to a
// uniform [0,1), a constant ink demand `c` produces an ink fraction of exactly
// `c`, whatever the field's raw value distribution looked like. That linear
// tonal response is what separates a professional-looking screen from a muddy
// one, and it comes free for every field we can bake into a tile.
//
// Unlike the mark-stamping pipeline (screen → samples → discs), a threshold
// comparison is per-pixel, so it is edge-preserving by construction, produces
// structure across the *whole* tonal range (dots → checkerboard → holes), and
// is inherently binary — the "no semi-transparent pixels" knockout guarantee
// is structural rather than a post-process.
//
// See docs/goal-v6.0.md.

import type { LumImage } from '../image/types';

const TAU = Math.PI * 2;

// Texels per tile side. Analytic fields bake one cell period into this, so
// 256 samples across a cell is heavy oversampling for any usable cell size.
const TILE = 256;

export type PatternFieldKind =
  // Euclidean dot: dots grow, merge into a checkerboard at 50%, invert to
  // round holes in the shadows. The classic newsprint screen.
  | { kind: 'cosDot' }
  // Round dot: circular dots that stay circular as they merge (distance to
  // the nearest lattice point). Corners fill last, so shadows keep concave
  // diamond holes rather than flipping phase.
  | { kind: 'roundDot' }
  // Parallel lines, width tracking coverage.
  | { kind: 'line' };

export interface PatternShaping {
  /** Ink-demand curve exponent. 1 = linear (leave it there for print). */
  gamma: number;
  /** Luminance at or below this is solid ink. */
  solidAt: number;
  /** Luminance at or above this drops out entirely. */
  dropAt: number;
  /** Flip the ink demand (positive ↔ negative). */
  invert: boolean;
}

export const defaultShaping: PatternShaping = {
  gamma: 1,
  solidAt: 0,
  dropAt: 1,
  invert: false,
};

export interface PatternTile {
  size: number;
  /** Equalized thresholds in [0,1), tileable. */
  values: Float32Array;
  /** How many `cellSize` units one tile side spans. */
  tileCells: number;
}

// Map luminance → ink demand in [0,1]. Mirrors the solidAt/dropAt convention
// already used by mark/circle.ts: both are luminance levels, solidAt < dropAt.
export function inkDemand(tone: number, p: PatternShaping): number {
  const solid = p.solidAt;
  const drop = p.dropAt;
  let c: number;
  if (tone <= solid) c = 1;
  else if (tone >= drop) c = 0;
  else c = (drop - tone) / Math.max(1e-6, drop - solid);
  if (p.gamma !== 1) c = Math.pow(c, p.gamma);
  return p.invert ? 1 - c : c;
}

// Rank equalization: sort, then hand out evenly spaced thresholds.
//
// Tied values MUST share a threshold (the midpoint of their rank span). Giving
// them distinct ranks would still be uniform in aggregate, but it would shred
// the field's structure — a 1-D line field, whose every column repeats one
// value down the tile, would come back as ragged noise instead of lines.
export function equalizeTile(values: Float32Array): Float32Array {
  const n = values.length;
  const order = new Array<number>(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => values[a] - values[b]);
  const out = new Float32Array(n);
  let i = 0;
  while (i < n) {
    const v = values[order[i]];
    let j = i + 1;
    while (j < n && values[order[j]] === v) j++;
    const t = (i + (j - i) / 2) / n;
    for (let k = i; k < j; k++) out[order[k]] = t;
    i = j;
  }
  return out;
}

// Bake an analytic spot function over one period of the (u,v) unit torus.
// Sampling in torus space (rather than device space) makes the tile
// independent of cell size and rotation — those are applied at lookup time.
function bakeAnalytic(raw: (u: number, v: number) => number): Float32Array {
  const values = new Float32Array(TILE * TILE);
  for (let j = 0; j < TILE; j++) {
    const v = (j + 0.5) / TILE;
    for (let i = 0; i < TILE; i++) {
      values[j * TILE + i] = raw((i + 0.5) / TILE, v);
    }
  }
  return values;
}

// Lowest at the lattice point so ink appears at dot centers first.
function cosDotRaw(u: number, v: number): number {
  return -(Math.cos(TAU * u) + Math.cos(TAU * v));
}

// Distance to the nearest lattice point. Equalizing this makes disc AREA
// linear in coverage, the same exactness mark/dot-coverage.ts computes
// analytically for stamped discs — but it keeps going past the point where
// discs overlap, which the stamper cannot.
function roundDotRaw(u: number, v: number): number {
  const du = u - Math.round(u);
  const dv = v - Math.round(v);
  return Math.sqrt(du * du + dv * dv);
}

// Triangle wave: 0 at the line's spine, 1 midway between lines.
function lineRaw(u: number): number {
  return Math.abs(u - Math.round(u)) * 2;
}

export function bakePatternField(field: PatternFieldKind): PatternTile {
  switch (field.kind) {
    case 'cosDot':
      return { size: TILE, values: equalizeTile(bakeAnalytic(cosDotRaw)), tileCells: 1 };
    case 'roundDot':
      return { size: TILE, values: equalizeTile(bakeAnalytic(roundDotRaw)), tileCells: 1 };
    case 'line':
      return { size: TILE, values: equalizeTile(bakeAnalytic((u) => lineRaw(u))), tileCells: 1 };
  }
}

export interface PatternScreenParams {
  field: PatternFieldKind;
  cellSize: number;
  angleDeg: number;
  shaping: PatternShaping;
  /** Antialias the preview by supersampling the threshold test. */
  softPreview: boolean;
}

export const defaultPatternScreen: PatternScreenParams = {
  field: { kind: 'cosDot' },
  cellSize: 8,
  angleDeg: 45,
  shaping: { ...defaultShaping },
  softPreview: true,
};

/** Subsamples per axis when soft preview is on. */
export const SOFT_SS = 3;

export interface CoverageMap {
  readonly width: number;
  readonly height: number;
  /** Ink coverage per pixel, 0..255. Hard mode emits only 0 or 255. */
  readonly data: Uint8Array;
}

// Bilinear, toroidal.
function sampleTile(tile: PatternTile, tu: number, tv: number): number {
  const n = tile.size;
  let fx = tu % n;
  if (fx < 0) fx += n;
  let fy = tv % n;
  if (fy < 0) fy += n;
  const x0 = fx | 0;
  const y0 = fy | 0;
  const x1 = x0 + 1 === n ? 0 : x0 + 1;
  const y1 = y0 + 1 === n ? 0 : y0 + 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const v = tile.values;
  const r0 = y0 * n;
  const r1 = y1 * n;
  const a = v[r0 + x0] + (v[r0 + x1] - v[r0 + x0]) * tx;
  const b = v[r1 + x0] + (v[r1 + x1] - v[r1 + x0]) * tx;
  return a + (b - a) * ty;
}

export function renderPatternScreen(
  lum: LumImage,
  tile: PatternTile,
  p: PatternScreenParams,
): CoverageMap {
  const { width, height } = lum;
  const out = new Uint8Array(width * height);
  const cell = Math.max(0.5, p.cellSize) * tile.tileCells;
  // Fold cell scale and rotation into the basis so the inner loop is two
  // multiply-adds per axis.
  const k = tile.size / cell;
  const theta = (p.angleDeg * Math.PI) / 180;
  const ca = Math.cos(theta) * k;
  const sa = Math.sin(theta) * k;
  const ss = p.softPreview ? SOFT_SS : 1;
  const subs = ss * ss;
  const step = 1 / ss;
  const half = step / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cov = inkDemand(lum.data[i], p.shaping);
      // Every threshold lives strictly inside (0,1), so these two clamps are
      // exact, not approximations — solid stays solid and dropout stays empty.
      if (cov <= 0) { out[i] = 0; continue; }
      if (cov >= 1) { out[i] = 255; continue; }
      if (ss === 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        out[i] = cov > sampleTile(tile, px * ca + py * sa, -px * sa + py * ca) ? 255 : 0;
        continue;
      }
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        const py = y + half + sy * step;
        for (let sx = 0; sx < ss; sx++) {
          const px = x + half + sx * step;
          if (cov > sampleTile(tile, px * ca + py * sa, -px * sa + py * ca)) hits++;
        }
      }
      out[i] = Math.round((hits / subs) * 255);
    }
  }
  return { width, height, data: out };
}

/** Threshold a coverage map to a 0/1 mask for tracing or knockout export. */
export function coverageToMask(cov: CoverageMap): Uint8Array {
  const out = new Uint8Array(cov.data.length);
  for (let i = 0; i < out.length; i++) out[i] = cov.data[i] >= 128 ? 1 : 0;
  return out;
}

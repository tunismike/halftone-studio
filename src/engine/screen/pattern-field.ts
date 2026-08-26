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
import { fbm, fbmTileable, type FbmParams } from '../noise/value';
import { hash2 } from '../noise/hash';
import { tileableWorley } from '../noise/worley';
import { generateBlueNoiseMask } from '../noise/blue-noise-mask';
import { simulatePattern, type PatternId } from '../noise/reaction-diffusion';

const TAU = Math.PI * 2;

// Texels per tile side. Analytic fields bake one cell period into this, so
// 256 samples across a cell is heavy oversampling for any usable cell size.
const TILE = 256;

// Procedural fields bake many features into one tile rather than one cell, so
// they get a bigger tile: the pattern repeats every `cellSize * tileCells`
// pixels, and structured textures (worms, cells, clouds) show that seam long
// before isotropic grain does.
const TILE_PROC = 512;

export type PatternFieldKind =
  // Euclidean dot: dots grow, merge into a checkerboard at 50%, invert to
  // round holes in the shadows. The classic newsprint screen.
  | { kind: 'cosDot' }
  // Round dot: circular dots that stay circular as they merge (distance to
  // the nearest lattice point). Corners fill last, so shadows keep concave
  // diamond holes rather than flipping phase.
  | { kind: 'roundDot' }
  // Parallel lines, width tracking coverage.
  | { kind: 'line' }
  // --- baked fields ---------------------------------------------------------
  // Every one of these is generated once, rank-equalized, and then read exactly
  // like an analytic field. Their raw distributions are wildly non-uniform —
  // which is why equalization is not optional here.
  //
  // Void-and-cluster blue noise: isotropic, aperiodic-looking grain.
  | { kind: 'blueNoise'; size: number; seed: number }
  // Gray-Scott reaction-diffusion. Worm regimes give a carved/petroglyph
  // texture, spot regimes give packed pebbles.
  | { kind: 'rd'; pattern: PatternId; iterations: number; gridSize: number; seed: number; featureTexels: number }
  // Worley/cellular. `edge: true` uses F2-F1, whose minima trace the cell
  // boundaries — a paver/crazed-tile look; `false` uses F1 for packed blobs.
  | { kind: 'worley'; cells: number; jitter: number; edge: boolean; seed: number }
  // fBm turbulence: soft, cloudy, plasma-like.
  | { kind: 'fbm'; octaves: number; lacunarity: number; gain: number; periods: number; seed: number }
  // Scattered dots on a jittered lattice, each with its own size bias, so dots
  // reach full size at different tones instead of growing in lockstep.
  | { kind: 'points'; cells: number; jitter: number; sizeJitter: number; seed: number };

// Domain warp: bend the field's coordinate space before evaluating it. Because
// the field is a continuous function of (x,y) rather than a rendered bitmap,
// warping its *domain* is exact — no resampling, no softening. Same parameter
// shape as screen/warp.ts, which displaces samples instead.
export interface PatternWarp {
  waveAmp: number;
  waveFreq: number;
  wavePhase: number;
  noiseAmp: number;
  noiseFreq: number;
  noiseSeed: number;
}

export const noPatternWarp: PatternWarp = {
  waveAmp: 0,
  waveFreq: 0.02,
  wavePhase: 0,
  noiseAmp: 0,
  noiseFreq: 0.02,
  noiseSeed: 1,
};

const WARP_FBM: FbmParams = { octaves: 3, lacunarity: 2, gain: 0.5 };

export function isIdentityWarp(w: PatternWarp): boolean {
  return w.waveAmp === 0 && w.noiseAmp === 0;
}

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
  /**
   * Whether neighbouring texels are correlated enough to interpolate between.
   *
   * This is not a quality knob — it is a correctness one. Bilinear sampling
   * averages four thresholds, and averaging four *uncorrelated* uniform values
   * concentrates the result toward 0.5, which is exactly the equalization we
   * just worked to establish being thrown away: a blue-noise field read
   * bilinearly inks ~97% of a patch that asked for 80%. Fields whose features
   * span many texels (every analytic and procedural one here) interpolate
   * harmlessly and want the smooth sub-texel edges; a threshold matrix like
   * blue noise, where one texel *is* one feature, must be read directly.
   */
  smooth: boolean;
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

// Bake an arbitrary (u,v)→value function over the unit torus at `size`.
function bakeTorus(size: number, raw: (u: number, v: number) => number): Float32Array {
  const values = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const v = (j + 0.5) / size;
    for (let i = 0; i < size; i++) values[j * size + i] = raw((i + 0.5) / size, v);
  }
  return values;
}

// Scattered dots: survey the 9 neighboring lattice cells for the nearest
// feature point, but scale each point's distance by its own random bias. The
// bias is what makes this pointillism rather than Worley — dots pop in and
// reach full size at different tones, instead of every dot growing in lockstep.
function pointsRaw(
  u: number, v: number, cells: number, jitter: number, sizeJitter: number, seed: number,
): number {
  const cu = u * cells;
  const cv = v * cells;
  const cellX = Math.floor(cu);
  const cellY = Math.floor(cv);
  const fx = cu - cellX;
  const fy = cv - cellY;
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = ((cellY + dy) % cells + cells) % cells;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = ((cellX + dx) % cells + cells) % cells;
      const px = dx + 0.5 + jitter * (hash2(nx, ny, seed) - 0.5);
      const py = dy + 0.5 + jitter * (hash2(nx, ny, seed + 9173) - 0.5);
      const ddx = px - fx;
      const ddy = py - fy;
      const bias = 1 - sizeJitter * hash2(nx, ny, seed + 4523);
      const d = Math.sqrt(ddx * ddx + ddy * ddy) / Math.max(0.05, bias);
      if (d < best) best = d;
    }
  }
  return best;
}

export function bakePatternField(field: PatternFieldKind): PatternTile {
  switch (field.kind) {
    case 'cosDot':
      return { size: TILE, values: equalizeTile(bakeAnalytic(cosDotRaw)), tileCells: 1, smooth: true };
    case 'roundDot':
      return { size: TILE, values: equalizeTile(bakeAnalytic(roundDotRaw)), tileCells: 1, smooth: true };
    case 'line':
      return { size: TILE, values: equalizeTile(bakeAnalytic((u) => lineRaw(u))), tileCells: 1, smooth: true };

    case 'blueNoise': {
      // Already a rank matrix, so equalization is a formality — but running it
      // keeps every field on one contract.
      const bn = generateBlueNoiseMask({ size: field.size, sigma: 1.5, seed: field.seed, initialDensity: 0.1 });
      return { size: bn.size, values: equalizeTile(bn.values), tileCells: bn.size, smooth: false };
    }

    case 'rd': {
      const rd = simulatePattern({
        pattern: field.pattern,
        size: field.gridSize,
        iterations: field.iterations,
        seed: field.seed,
      });
      // High V concentration = the structure; invert so structure inks first.
      const raw = new Float32Array(rd.values.length);
      for (let i = 0; i < raw.length; i++) raw[i] = -rd.values[i];
      return {
        size: rd.size,
        values: equalizeTile(raw),
        tileCells: rd.size / Math.max(1, field.featureTexels),
        smooth: true,
      };
    }

    case 'worley': {
      const values = bakeTorus(TILE_PROC, (u, v) => {
        const { f1, f2 } = tileableWorley(u, v, field.cells, field.jitter, field.seed);
        return field.edge ? f2 - f1 : f1;
      });
      return { size: TILE_PROC, values: equalizeTile(values), tileCells: field.cells, smooth: true };
    }

    case 'fbm': {
      const cfg: FbmParams = {
        octaves: field.octaves, lacunarity: field.lacunarity, gain: field.gain,
      };
      const values = bakeTorus(TILE_PROC, (u, v) =>
        fbmTileable(u * field.periods, v * field.periods, field.seed, cfg, field.periods),
      );
      return { size: TILE_PROC, values: equalizeTile(values), tileCells: field.periods, smooth: true };
    }

    case 'points': {
      const values = bakeTorus(TILE_PROC, (u, v) =>
        pointsRaw(u, v, field.cells, field.jitter, field.sizeJitter, field.seed),
      );
      return { size: TILE_PROC, values: equalizeTile(values), tileCells: field.cells, smooth: true };
    }
  }
}

export interface PatternScreenParams {
  field: PatternFieldKind;
  cellSize: number;
  angleDeg: number;
  warp: PatternWarp;
  shaping: PatternShaping;
  /** Antialias the preview by supersampling the threshold test. */
  softPreview: boolean;
}

export const defaultPatternScreen: PatternScreenParams = {
  field: { kind: 'cosDot' },
  cellSize: 8,
  angleDeg: 45,
  warp: { ...noPatternWarp },
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

// Toroidal lookup: bilinear for smooth fields, nearest for threshold matrices.
function sampleTile(tile: PatternTile, tu: number, tv: number): number {
  const n = tile.size;
  let fx = tu % n;
  if (fx < 0) fx += n;
  let fy = tv % n;
  if (fy < 0) fy += n;
  const x0 = fx | 0;
  const y0 = fy | 0;
  if (!tile.smooth) return tile.values[y0 * n + x0];
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
  const w = p.warp;
  const warped = !isIdentityWarp(w);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cov = inkDemand(lum.data[i], p.shaping);
      // Every threshold lives strictly inside (0,1), so these two clamps are
      // exact, not approximations — solid stays solid and dropout stays empty.
      if (cov <= 0) { out[i] = 0; continue; }
      if (cov >= 1) { out[i] = 255; continue; }
      // The warp is smooth and low-frequency next to the screen itself, so one
      // displacement per pixel is plenty — subsamples share it, which keeps the
      // fbm cost off the inner loop.
      let wx = 0;
      let wy = 0;
      if (warped) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (w.waveAmp !== 0) {
          wx += w.waveAmp * Math.sin(w.waveFreq * cy + w.wavePhase);
          wy += w.waveAmp * Math.sin(w.waveFreq * cx + w.wavePhase + Math.PI / 2);
        }
        if (w.noiseAmp !== 0) {
          const nx = fbm(cx * w.noiseFreq, cy * w.noiseFreq, w.noiseSeed, WARP_FBM);
          const ny = fbm(cx * w.noiseFreq, cy * w.noiseFreq, w.noiseSeed + 9173, WARP_FBM);
          wx += w.noiseAmp * (nx - 0.5) * 2;
          wy += w.noiseAmp * (ny - 0.5) * 2;
        }
      }
      if (ss === 1) {
        const px = x + 0.5 + wx;
        const py = y + 0.5 + wy;
        out[i] = cov > sampleTile(tile, px * ca + py * sa, -px * sa + py * ca) ? 255 : 0;
        continue;
      }
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        const py = y + half + sy * step + wy;
        for (let sx = 0; sx < ss; sx++) {
          const px = x + half + sx * step + wx;
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

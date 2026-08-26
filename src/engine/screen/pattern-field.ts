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

// Row spacing of an equilateral lattice whose columns sit one unit apart.
const SQRT3 = Math.sqrt(3);

export type PatternFieldKind =
// `hex` staggers alternate rows onto an equilateral lattice instead of a
// square one — the packing most printed dot screens actually use, since six
// equidistant neighbours read as an even field where four plus diagonals read
// as rows and columns.
//
  // Euclidean dot: dots grow, merge into a checkerboard at 50%, invert to
  // round holes in the shadows. The classic newsprint screen.
  | { kind: 'cosDot'; hex?: boolean }
  // Round dot: circular dots that stay circular as they merge (distance to
  // the nearest lattice point). Corners fill last, so shadows keep concave
  // diamond holes rather than flipping phase.
  | { kind: 'roundDot'; hex?: boolean }
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
  | {
      kind: 'rd'; pattern: PatternId; iterations: number; gridSize: number;
      seed: number; featureTexels: number;
      /**
       * Turn the worms from thickness-modulated into density-modulated.
       *
       * Thresholding a fixed field can only make its ridges fatter or thinner —
       * the skeleton never changes, so a plain RD screen runs the same maze at
       * every tone. Carved/stamped marks behave the opposite way: constant
       * stroke width, fewer strokes as the tone lightens.
       *
       * Reordering gets most of the way there. Every pixel inside a worm is
       * re-keyed to a smooth noise value, so worms switch on in segments
       * instead of the whole maze thinning together: at a given tone you get
       * fewer, longer marks rather than a complete maze of hairlines. Measured
       * at 30% coverage that is ~2.5x as many separate marks for the same ink.
       *
       * It buys fragmentation, not literally constant stroke weight — the
       * widest point of a mark still creeps up with coverage, much as it does
       * without dash. Above `width` the field is left alone, so the shadow end
       * behaves exactly as the plain field does.
       *
       * `width` is the area fraction counted as worm (so, roughly the stroke
       * weight); `scale` is how many noise periods span the tile, setting how
       * long the surviving dashes run.
       */
      dash?: { width: number; scale: number; seed: number };
      /**
       * Break up the regularity of the pattern's features.
       *
       * Gray-Scott converges on a characteristic wavelength, so left alone
       * every spot comes out the same size and every worm the same width —
       * the field is organised, and reads that way however its tone is
       * remapped. Blending noise into it at roughly the feature scale
       * perturbs each level set independently: outlines go ragged and
       * features drift in size, because a spot whose core got nudged down
       * arrives earlier and grows larger than its neighbour.
       *
       * `amount` is how much noise is mixed in (past ~0.4 the RD structure
       * stops being legible), `scale` is noise periods across the tile.
       * Applied before `dash`, so dashes inherit the roughened shapes.
       */
      roughen?: { amount: number; scale: number; seed: number };
      /**
       * Blur the field, in tile texels, before it gets thresholded.
       *
       * Roughening buys irregular shapes at the cost of ragged outlines,
       * because the noise it mixes in carries detail far finer than the
       * features. Smoothing the field afterwards is the classic blur-then-
       * re-threshold move: the large-scale irregularity survives, the
       * high-frequency chatter along each outline does not, and what comes out
       * reads as flowing organic shapes rather than noisy ones. It also breaks
       * thin necks — a blur pulls more background into a narrow bridge than
       * into a blob's middle — which is what separates touching features into
       * distinct rounded ones. Applied last, so it rounds the ends of dashes
       * too.
       *
       * Measured in original tile texels, but the tile is doubled first: a
       * whole-texel kernel on a 128-wide field is a third of a feature wide,
       * far too blunt to steer. The kernel is still a whole number of texels
       * on the doubled tile, so this lands on 0.5 steps — 0.75 and 1.0 give
       * the same result.
       */
      smooth?: number;
    }
  // Worley/cellular. `edge: true` uses F2-F1, whose minima trace the cell
  // boundaries — a paver/crazed-tile look; `false` uses F1 for packed blobs.
  | { kind: 'worley'; cells: number; jitter: number; edge: boolean; seed: number }
  // fBm turbulence: soft, cloudy, plasma-like.
  | { kind: 'fbm'; octaves: number; lacunarity: number; gain: number; periods: number; seed: number }
  // Scattered dots on a jittered lattice, each with its own size bias, so dots
  // reach full size at different tones instead of growing in lockstep.
  | {
      kind: 'points'; cells: number; jitter: number; sizeJitter: number; seed: number;
      hex?: boolean;
      /**
       * Repulsion passes over the point set. A jittered grid at high jitter
       * looks random but drops points from neighbouring cells right on top of
       * each other, and those pairs merge into worms instead of staying
       * separate dots. A few passes of pushing points apart turns it into a
       * blue-noise set: still random-looking, but with a floor on spacing.
       * A few is the operative word — relaxation run to convergence collapses
       * back onto a lattice, which is the very thing being escaped.
       */
      relax?: number;
    }
  // Rings. Ink appears at a radius rather than at a point, so the screen runs
  // thin rings → thick rings → merged, with the ring centres and the gaps
  // between cells the last things to fill. A crazed-tile / paver look that no
  // centre-out mark can produce.
  | {
      kind: 'rings'; cells: number; jitter: number; radius: number; seed: number;
      hex?: boolean; relax?: number;
    }
  // Scattered strokes: short segments at random angles, combined by nearest
  // distance so they cross and merge freely.
  //
  // This exists because reaction-diffusion cannot make marks that touch. An RD
  // field's worms repel each other and hold an even gap — crown shyness — so
  // however its tone is remapped, the result still reads as one organised
  // system rather than as marks made independently. Carved and stamped marks
  // overlap, cross, and clump, and the only way to get that is to place them
  // independently and let them collide.
  | {
      kind: 'strokes';
      /** Strokes per tile side; one per lattice cell, jittered. */
      cells: number;
      /** Stroke length in cell units. */
      length: number;
      /** Random length variation, 0..1. */
      lengthJitter: number;
      /** How far a stroke's influence reaches, in cell units. Sets weight. */
      spread: number;
      /** Lateral bend at the stroke's midpoint, in cell units. */
      bend: number;
      /**
       * Per-stroke appearance offset, 0..1. Whole strokes arrive at different
       * tones rather than every stroke fading up together, which is what makes
       * the count vary with tone instead of the weight.
       */
      bias: number;
      seed: number;
    };

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
  /** How many `cellSize` units one tile side spans horizontally. */
  tileCells: number;
  /**
   * Vertical extent of the tile as a multiple of its horizontal extent.
   *
   * An equilateral lattice puts its rows sqrt(3)/2 apart for columns one apart,
   * and that ratio is irrational — so a hex field cannot be baked into a square
   * tile and still repeat seamlessly. Letting the tile cover a non-square patch
   * of device space is what makes hex packing tileable at all.
   */
  aspect: number;
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

// Toroidal 2x bilinear upsample, so the blur below has sub-texel resolution to
// work at.
function upsample2x(values: Float32Array, size: number): Float32Array {
  const n = size * 2;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const sy = (y + 0.5) / 2 - 0.5;
    const y0 = Math.floor(sy);
    const ty = sy - y0;
    const ya = ((y0 % size) + size) % size;
    const yb = ((y0 + 1) % size + size) % size;
    for (let x = 0; x < n; x++) {
      const sx = (x + 0.5) / 2 - 0.5;
      const x0 = Math.floor(sx);
      const tx = sx - x0;
      const xa = ((x0 % size) + size) % size;
      const xb = ((x0 + 1) % size + size) % size;
      const a = values[ya * size + xa] + (values[ya * size + xb] - values[ya * size + xa]) * tx;
      const b = values[yb * size + xa] + (values[yb * size + xb] - values[yb * size + xa]) * tx;
      out[y * n + x] = a + (b - a) * ty;
    }
  }
  return out;
}

// Cyclic separable box blur, run three times to approximate a Gaussian.
// Wrapping keeps the tile seamless — a clamped blur would darken its edges and
// leave a visible seam every time the pattern repeats.
function smoothTile(values: Float32Array, size: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return values;
  const width = r * 2 + 1;
  let src = Float32Array.from(values);
  let dst = new Float32Array(values.length);
  for (let pass = 0; pass < 3; pass++) {
    // horizontal
    for (let y = 0; y < size; y++) {
      const row = y * size;
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[row + ((x + k) % size + size) % size];
        dst[row + x] = sum / width;
      }
    }
    const swap1 = src; src = dst; dst = swap1;
    // vertical
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[(((y + k) % size + size) % size) * size + x];
        dst[y * size + x] = sum / width;
      }
    }
    const swap2 = src; src = dst; dst = swap2;
  }
  return src;
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

// Hex Euclidean dot. Three cosines along the triangular lattice's directions.
// Every term is periodic over u+1 and v+1 AND over the half-step (u+1/2, v+1/2),
// which is exactly the staggered-row symmetry — so it bakes into a tile of
// aspect sqrt(3) with no seam.
function hexCosDotRaw(u: number, v: number): number {
  return -(Math.cos(TAU * (u - v)) + Math.cos(TAU * 2 * v) + Math.cos(TAU * (u + v)));
}

// Distance to the nearest point of a staggered lattice: rows every 1/2 in v,
// odd rows shifted half a column. `v` is scaled by SQRT3 to get back to device
// proportions, since the tile it lives in is that much taller than it is wide.
function hexRoundDotRaw(u: number, v: number): number {
  let best = Infinity;
  const r0 = Math.round(v / 0.5);
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    const vr = r * 0.5;
    const off = (r & 1) === 0 ? 0 : 0.5;
    let du = u - off;
    du -= Math.round(du);
    const dv = (v - vr) * SQRT3;
    const d = Math.sqrt(du * du + dv * dv);
    if (d < best) best = d;
  }
  return best;
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

interface PointSet {
  cells: number;
  /** x,y per home cell, in cell units, each point kept inside its own cell. */
  xy: Float32Array;
  /** Vertical squash so hex rows sit closer together than columns. */
  rowScale: number;
}

// Stratified point set: one point per cell, jittered, then optionally relaxed
// apart. Keeping every point inside its home cell is what lets the field
// lookup stay a fixed 3x3 neighbourhood walk.
function buildPointSet(
  cells: number, jitter: number, seed: number, hex: boolean, relax: number,
): PointSet {
  const rowScale = hex ? SQRT3 / 2 : 1;
  const xy = new Float32Array(cells * cells * 2);
  const home = new Float32Array(cells * cells * 2);
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const i = (gy * cells + gx) * 2;
      const stagger = hex && (gy & 1) === 1 ? 0.5 : 0;
      home[i] = gx + 0.5 + stagger;
      home[i + 1] = gy + 0.5;
      xy[i] = home[i] + jitter * (hash2(gx, gy, seed) - 0.5);
      xy[i + 1] = home[i + 1] + jitter * (hash2(gx, gy, seed + 9173) - 0.5);
    }
  }
  if (relax <= 0) return { cells, xy, rowScale };

  const wrap = (d: number): number => d - Math.round(d / cells) * cells;
  const target = 0.92;
  const strength = 0.3;
  let cur = xy;
  let next = new Float32Array(xy.length);
  for (let pass = 0; pass < relax; pass++) {
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        const i = (gy * cells + gx) * 2;
        const px = cur[i];
        const py = cur[i + 1];
        let fx = 0;
        let fy = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = ((gy + dy) % cells + cells) % cells;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = ((gx + dx) % cells + cells) % cells;
            const j = (ny * cells + nx) * 2;
            const ddx = wrap(cur[j] - px);
            const ddy = wrap(cur[j + 1] - py) * rowScale;
            const d = Math.sqrt(ddx * ddx + ddy * ddy);
            if (d > 1e-6 && d < target) {
              const push = (target - d) / target / d;
              fx -= ddx * push;
              fy -= (ddy * push) / rowScale;
            }
          }
        }
        // Clamped to the home cell: a point that wandered further would break
        // the 3x3 assumption the lookup depends on.
        next[i] = Math.max(home[i] - 0.5, Math.min(home[i] + 0.5, px + fx * strength));
        next[i + 1] = Math.max(home[i + 1] - 0.5, Math.min(home[i + 1] + 0.5, py + fy * strength));
      }
    }
    const swap = cur; cur = next; next = swap;
  }
  return { cells, xy: cur, rowScale };
}

// Distance to the nearest point of a prepared set, in cell units.
function nearestFeature(
  u: number, v: number, ps: PointSet,
  bias: (nx: number, ny: number) => number,
): number {
  const { cells, xy, rowScale } = ps;
  const cu = u * cells;
  const cv = v * cells;
  const cellX = Math.floor(cu);
  const cellY = Math.floor(cv);
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = ((cellY + dy) % cells + cells) % cells;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = ((cellX + dx) % cells + cells) % cells;
      const j = (ny * cells + nx) * 2;
      // The point's stored position is absolute; shift it into the texel's
      // neighbourhood so the toroidal wrap is handled by the cell offsets.
      const ddx = xy[j] + (cellX + dx - nx) - cu;
      const ddy = (xy[j + 1] + (cellY + dy - ny) - cv) * rowScale;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) / Math.max(0.05, bias(nx, ny));
      if (d < best) best = d;
    }
  }
  return best;
}

// Squared distance from a point to a segment, both in cell units.
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 1e-9 ? (wx * vx + wy * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return dx * dx + dy * dy;
}

export function bakePatternField(field: PatternFieldKind): PatternTile {
  switch (field.kind) {
    case 'cosDot':
      return field.hex
        ? { size: TILE, values: equalizeTile(bakeAnalytic(hexCosDotRaw)), tileCells: 1, aspect: SQRT3, smooth: true }
        : { size: TILE, values: equalizeTile(bakeAnalytic(cosDotRaw)), tileCells: 1, aspect: 1, smooth: true };
    case 'roundDot':
      return field.hex
        ? { size: TILE, values: equalizeTile(bakeAnalytic(hexRoundDotRaw)), tileCells: 1, aspect: SQRT3, smooth: true }
        : { size: TILE, values: equalizeTile(bakeAnalytic(roundDotRaw)), tileCells: 1, aspect: 1, smooth: true };
    case 'line':
      return { size: TILE, values: equalizeTile(bakeAnalytic((u) => lineRaw(u))), tileCells: 1, aspect: 1, smooth: true };

    case 'blueNoise': {
      // Already a rank matrix, so equalization is a formality — but running it
      // keeps every field on one contract.
      const bn = generateBlueNoiseMask({ size: field.size, sigma: 1.5, seed: field.seed, initialDensity: 0.1 });
      return { size: bn.size, values: equalizeTile(bn.values), tileCells: bn.size, aspect: 1, smooth: false };
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
      let values = equalizeTile(raw);
      const rough = field.roughen;
      if (rough && rough.amount > 0) {
        const cfg: FbmParams = { octaves: 3, lacunarity: 2, gain: 0.5 };
        const n = rd.size;
        const noise = new Float32Array(n * n);
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            noise[j * n + i] = fbmTileable(
              ((i + 0.5) / n) * rough.scale, ((j + 0.5) / n) * rough.scale,
              rough.seed, cfg, rough.scale,
            );
          }
        }
        const noiseEq = equalizeTile(noise);
        const blended = new Float32Array(values.length);
        for (let i = 0; i < blended.length; i++) {
          blended[i] = values[i] * (1 - rough.amount) + noiseEq[i] * rough.amount;
        }
        values = equalizeTile(blended);
      }
      const d = field.dash;
      if (d) {
        // `values` is uniform on [0,1), so the worms are exactly the pixels
        // below `width`. Re-key those to smooth noise scaled into the same
        // [0, width) band: the band keeps its measure, so tone stays linear,
        // but within it a whole dash now switches on at once instead of every
        // worm thickening together.
        const cfg: FbmParams = { octaves: 3, lacunarity: 2, gain: 0.5 };
        const n = rd.size;
        const noise = new Float32Array(n * n);
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            noise[j * n + i] = fbmTileable(
              ((i + 0.5) / n) * d.scale, ((j + 0.5) / n) * d.scale, d.seed, cfg, d.scale,
            );
          }
        }
        const noiseEq = equalizeTile(noise);
        const out = new Float32Array(values.length);
        for (let i = 0; i < out.length; i++) {
          out[i] = values[i] < d.width ? noiseEq[i] * d.width : values[i];
        }
        values = equalizeTile(out);
      }
      // tileCells is a count of cells per tile, so it is independent of the
      // resolution the tile happens to be stored at.
      const tileCells = rd.size / Math.max(1, field.featureTexels);
      let size = rd.size;
      if (field.smooth && field.smooth > 0) {
        values = upsample2x(values, size);
        size *= 2;
        values = equalizeTile(smoothTile(values, size, field.smooth * 2));
      }
      return {
        size,
        values,
        tileCells,
        aspect: 1,
        smooth: true,
      };
    }

    case 'worley': {
      const values = bakeTorus(TILE_PROC, (u, v) => {
        const { f1, f2 } = tileableWorley(u, v, field.cells, field.jitter, field.seed);
        return field.edge ? f2 - f1 : f1;
      });
      return { size: TILE_PROC, values: equalizeTile(values), tileCells: field.cells, aspect: 1, smooth: true };
    }

    case 'fbm': {
      const cfg: FbmParams = {
        octaves: field.octaves, lacunarity: field.lacunarity, gain: field.gain,
      };
      const values = bakeTorus(TILE_PROC, (u, v) =>
        fbmTileable(u * field.periods, v * field.periods, field.seed, cfg, field.periods),
      );
      return { size: TILE_PROC, values: equalizeTile(values), tileCells: field.periods, aspect: 1, smooth: true };
    }

    case 'points': {
      // The per-point size bias is what makes this pointillism rather than
      // Worley: dots pop in and reach full size at different tones instead of
      // every dot growing in lockstep.
      const ps = buildPointSet(field.cells, field.jitter, field.seed, !!field.hex, field.relax ?? 0);
      const values = bakeTorus(TILE_PROC, (u, v) =>
        nearestFeature(u, v, ps,
          (nx, ny) => 1 - field.sizeJitter * hash2(nx, ny, field.seed + 4523)),
      );
      return {
        size: TILE_PROC, values: equalizeTile(values), tileCells: field.cells,
        aspect: field.hex ? SQRT3 / 2 : 1, smooth: true,
      };
    }

    case 'strokes': {
      const { cells, seed } = field;
      const values = bakeTorus(TILE_PROC, (u, v) => {
        const cu = u * cells;
        const cv = v * cells;
        const cellX = Math.floor(cu);
        const cellY = Math.floor(cv);
        let best = Infinity;
        // Wide enough that a stroke centred two cells away can still reach.
        for (let dy = -2; dy <= 2; dy++) {
          const ny = ((cellY + dy) % cells + cells) % cells;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = ((cellX + dx) % cells + cells) % cells;
            // Stroke geometry, all derived from the cell's hashes so the tile
            // stays deterministic and seamless.
            const cx = cellX + dx + 0.5 + (hash2(nx, ny, seed) - 0.5);
            const cy = cellY + dy + 0.5 + (hash2(nx, ny, seed + 9173) - 0.5);
            const ang = hash2(nx, ny, seed + 4523) * TAU;
            const len = field.length * (1 - field.lengthJitter * hash2(nx, ny, seed + 7717));
            const half = len / 2;
            const ex = Math.cos(ang) * half;
            const ey = Math.sin(ang) * half;
            // Bend the stroke by pushing its midpoint sideways, then measure
            // against the two halves so marks read as hooks, not tally sticks.
            const bend = field.bend * (hash2(nx, ny, seed + 3313) - 0.5) * 2;
            const mx = cx - ey * bend;
            const my = cy + ex * bend;
            const px = cu - cellX + cellX;
            const py = cv - cellY + cellY;
            const d2 = Math.min(
              segDistSq(px, py, cx - ex, cy - ey, mx, my),
              segDistSq(px, py, mx, my, cx + ex, cy + ey),
            );
            const d = Math.sqrt(d2) / Math.max(0.05, field.spread);
            // The per-stroke offset has to fade out with distance. Applying it
            // as a flat term instead lowers every texel in the search
            // neighbourhood, so an early-biased stroke stamps its whole 5x5
            // block of cells dark — square artefacts, not marks. Weighting it
            // by (1 - d) keeps a stroke's influence local, and leaving val = d
            // beyond the spread keeps the far field ordered by distance rather
            // than tied at a single value that would all ink at once.
            const dc = d > 1 ? 1 : d;
            const val = d + field.bias * hash2(nx, ny, seed + 6151) * (1 - dc);
            if (val < best) best = val;
          }
        }
        return best;
      });
      return { size: TILE_PROC, values: equalizeTile(values), tileCells: cells, aspect: 1, smooth: true };
    }

    case 'rings': {
      // Distance from a ring of radius `radius`, so the minimum — where ink
      // lands first — is a circle rather than a point.
      const rs = buildPointSet(field.cells, field.jitter, field.seed, !!field.hex, field.relax ?? 0);
      const values = bakeTorus(TILE_PROC, (u, v) =>
        Math.abs(nearestFeature(u, v, rs, () => 1) - field.radius),
      );
      return {
        size: TILE_PROC, values: equalizeTile(values), tileCells: field.cells,
        aspect: field.hex ? SQRT3 / 2 : 1, smooth: true,
      };
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

// Matches the "Grid Angle" preset, so entering the mode lands on a named
// preset rather than reading as "Custom".
export const defaultPatternScreen: PatternScreenParams = {
  field: { kind: 'cosDot' },
  cellSize: 18,
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
  // Fold cell scale, tile aspect, and rotation into the basis so the inner
  // loop stays two multiply-adds per axis.
  const kx = tile.size / cell;
  const ky = tile.size / (cell * tile.aspect);
  const theta = (p.angleDeg * Math.PI) / 180;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ax = ct * kx, ay = st * kx;
  const bx = -st * ky, by = ct * ky;
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
        out[i] = cov > sampleTile(tile, px * ax + py * ay, px * bx + py * by) ? 255 : 0;
        continue;
      }
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        const py = y + half + sy * step + wy;
        for (let sx = 0; sx < ss; sx++) {
          const px = x + half + sx * step + wx;
          if (cov > sampleTile(tile, px * ax + py * ay, px * bx + py * by)) hits++;
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

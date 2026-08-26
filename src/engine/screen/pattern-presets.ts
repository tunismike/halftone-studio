// Named pattern-screen presets.
//
// These recreate the pattern taxonomy that apparel-print halftone packs ship
// as fixed Photoshop templates — but every one is just a field kind plus a few
// numbers, so any of them can be scaled, re-angled, and re-shaped freely.
// See docs/goal-v6.0.md.

import {
  defaultShaping, noPatternWarp,
  type PatternScreenParams, type PatternWarp,
} from './pattern-field';

export interface PatternPreset {
  id: string;
  name: string;
  params: PatternScreenParams;
}

function preset(
  id: string,
  name: string,
  params: Omit<PatternScreenParams, 'shaping' | 'softPreview' | 'warp'> & Partial<PatternScreenParams>,
): PatternPreset {
  return {
    id,
    name,
    params: {
      warp: { ...noPatternWarp },
      shaping: { ...defaultShaping },
      softPreview: true,
      ...params,
    },
  };
}

// Key-order-independent structural compare. Params reach us from object
// literals, preset spreads, and JSON round-trips through the URL hash and
// autosave, all of which can order keys differently for identical settings —
// so a plain JSON.stringify comparison would report "Custom" for params that
// exactly match a preset.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/** The preset these params match exactly, if any. */
export function matchPatternPreset(params: PatternScreenParams): PatternPreset | undefined {
  const key = canonical(params);
  return PATTERN_PRESETS.find((p) => canonical(p.params) === key);
}

// A broad, smooth bend — long next to the screen period, so the lattice stays
// legible as a lattice while the rows visibly flow.
function wave(waveAmp: number, waveFreq: number, wavePhase = 0): PatternWarp {
  return { ...noPatternWarp, waveAmp, waveFreq, wavePhase };
}

export const PATTERN_PRESETS: PatternPreset[] = [
  // --- dot lattices ---------------------------------------------------------
  preset('grid', 'Grid', {
    field: { kind: 'cosDot' }, cellSize: 18, angleDeg: 0,
  }),
  preset('grid-angle', 'Grid Angle', {
    field: { kind: 'cosDot' }, cellSize: 18, angleDeg: 45,
  }),
  preset('grid-dots', 'Grid Dots', {
    field: { kind: 'roundDot' }, cellSize: 18, angleDeg: 0,
  }),
  preset('grid-dots-angle', 'Grid Dots Angle', {
    field: { kind: 'roundDot' }, cellSize: 18, angleDeg: 45,
  }),

  // --- line screens ---------------------------------------------------------
  preset('vertical-lines', 'Vertical Lines', {
    field: { kind: 'line' }, cellSize: 13, angleDeg: 0,
  }),
  preset('horizontal-lines', 'Horizontal Lines', {
    field: { kind: 'line' }, cellSize: 13, angleDeg: 90,
  }),
  preset('angle-lines-1', 'Angle Lines 1', {
    field: { kind: 'line' }, cellSize: 9, angleDeg: 45,
  }),
  preset('angle-lines-2', 'Angle Lines 2', {
    field: { kind: 'line' }, cellSize: 12, angleDeg: 135,
  }),

  // --- warped lattices ------------------------------------------------------
  preset('mesh-wave', 'Mesh Wave', {
    field: { kind: 'cosDot', hex: true }, cellSize: 14, angleDeg: 0, warp: wave(9, 0.017),
  }),
  preset('dot-mesh-wave', 'Dot Mesh Wave', {
    field: { kind: 'roundDot', hex: true }, cellSize: 10, angleDeg: 0, warp: wave(9, 0.017),
  }),
  preset('dot-wave', 'Dot Wave', {
    field: { kind: 'roundDot', hex: true }, cellSize: 11, angleDeg: 0, warp: wave(16, 0.011),
  }),

  // --- warped line screens --------------------------------------------------
  preset('line-wave-vertical', 'Line Wave Vertical', {
    field: { kind: 'line' }, cellSize: 14, angleDeg: 0, warp: wave(14, 0.012),
  }),
  preset('line-wave-horizontal', 'Line Wave Horizontal', {
    field: { kind: 'line' }, cellSize: 14, angleDeg: 90, warp: wave(14, 0.012),
  }),
  preset('line-wave-angle', 'Line Wave Angle', {
    field: { kind: 'line' }, cellSize: 12, angleDeg: 45, warp: wave(14, 0.012),
  }),

  // --- organic / stochastic fields ------------------------------------------
  // The reference "grain" is binarized noise — irregular specks that clump —
  // rather than a magnified blue-noise threshold matrix, which reads as a grid
  // of squares once one texel covers several pixels.
  preset('grain', 'Grain', {
    field: { kind: 'fbm', octaves: 5, lacunarity: 2, gain: 0.55, periods: 64, seed: 5 },
    cellSize: 4, angleDeg: 0,
  }),
  // Not in the reference set. Void-and-cluster blue noise read at one texel
  // per pixel is the best-behaved stochastic screen we have — isotropic, no
  // lattice to moiré against the image — so it earns its own preset.
  preset('stipple', 'Blue-noise stipple', {
    field: { kind: 'blueNoise', size: 64, seed: 1 }, cellSize: 2, angleDeg: 0,
  }),
  // Ours, not a copy of anything: a Gray-Scott reaction-diffusion field read
  // straight, so one maze skeleton holds at every tone and the strokes thicken
  // and thin with it. Grid size drives both bake cost and how far the tile
  // repeats — 160² lands at ~0.6s, in line with the rdContour mode that already
  // ships, where 256² looked marginally better and took 3s: a freeze, not a wait.
  preset('turing-diffusion', 'Turing Diffusion', {
    field: { kind: 'rd', pattern: 'squiggles', iterations: 3000, gridSize: 160, seed: 1, featureTexels: 9 },
    cellSize: 7, angleDeg: 0,
  }),
  // Same field in dash mode: the maze breaks into separate strokes as the tone
  // lightens instead of thinning into a web of hairlines.
  preset('turing-dashes', 'Turing Dashes', {
    field: {
      kind: 'rd', pattern: 'squiggles', iterations: 3000, gridSize: 160, seed: 1,
      featureTexels: 9, dash: { width: 0.4, scale: 24, seed: 7 },
    },
    cellSize: 4.5, angleDeg: 0,
  }),
  // Dash mode plus a noise warp, which is the part that makes it read as carved
  // rather than grown. Reaction-diffusion worms repel each other and hold an
  // even gap — crown shyness — so however the tone is remapped the result still
  // looks like one organised system. Warping the field's domain squeezes some
  // regions and stretches others, so worms crowd and touch in places and leave
  // wide gaps in others, the way marks made independently do.
  preset('petroglyph', 'Petroglyph', {
    field: {
      kind: 'rd', pattern: 'squiggles', iterations: 3000, gridSize: 160, seed: 1,
      featureTexels: 9, roughen: { amount: 0.3, scale: 24, seed: 3 }, smooth: 0.75,
      dash: { width: 0.46, scale: 24, seed: 7 },
    },
    cellSize: 4.5, angleDeg: 0,
    warp: { ...noPatternWarp, noiseAmp: 7, noiseFreq: 0.03, noiseSeed: 5 },
  }),
  // Ours. Short strokes placed independently and combined by nearest distance,
  // so unlike anything reaction-diffusion can produce they cross and pile up.
  preset('carved', 'Carved Marks', {
    field: {
      kind: 'strokes', cells: 22, length: 1, lengthJitter: 0.7,
      spread: 0.75, bend: 0.6, bias: 0.35, seed: 11,
    },
    cellSize: 11, angleDeg: 0,
  }),
  // The spot regime, then roughened and smoothed. Topology first: spots stay
  // separate at coverage where the neighbouring "reptile" regime would connect
  // its features into a web, and the reference keeps distinct blobs. Roughen
  // then varies their size and shape, and the blur rounds the outlines that
  // roughening leaves ragged and breaks the thin necks it creates. Past about
  // 0.4 roughen the blobs stop being blobs, so this sits under it.
  preset('pebbles', 'Pebbles', {
    field: {
      kind: 'rd', pattern: 'pebbles', iterations: 2500, gridSize: 128, seed: 1,
      featureTexels: 8, roughen: { amount: 0.35, scale: 16, seed: 3 }, smooth: 1,
    },
    cellSize: 6, angleDeg: 0,
  }),
  preset('pavers', 'Pavers', {
    field: { kind: 'rings', cells: 24, jitter: 0.8, radius: 0.34, seed: 3, relax: 6 },
    cellSize: 14, angleDeg: 0,
  }),
  preset('plasma', 'Plasma', {
    field: { kind: 'fbm', octaves: 5, lacunarity: 2, gain: 0.5, periods: 24, seed: 5 },
    cellSize: 3, angleDeg: 0,
  }),
  preset('pointillism-1', 'Pointillism 1', {
    field: { kind: 'points', cells: 40, jitter: 1, sizeJitter: 0.3, seed: 11, hex: true, relax: 8 },
    cellSize: 11, angleDeg: 0,
  }),
  preset('pointillism-2', 'Pointillism 2', {
    field: { kind: 'points', cells: 56, jitter: 1, sizeJitter: 0.4, seed: 23, hex: true, relax: 8 },
    cellSize: 10, angleDeg: 0,
  }),
  // Ours. A pure reaction-diffusion spot regime gives the most even dot
  // scatter in the set — every dot the same size, spaced by the chemistry
  // rather than by a lattice. It reads as a third pointillism, not as pebbles.
  preset('pointillism-3', 'Pointillism 3', {
    field: { kind: 'rd', pattern: 'pebbles', iterations: 2500, gridSize: 128, seed: 1, featureTexels: 8 },
    cellSize: 6, angleDeg: 0,
  }),
];

export function findPatternPreset(id: string): PatternPreset | undefined {
  return PATTERN_PRESETS.find((p) => p.id === id);
}

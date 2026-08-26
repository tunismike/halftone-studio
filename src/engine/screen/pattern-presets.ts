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

// A broad, smooth bend — long next to the screen period, so the lattice stays
// legible as a lattice while the rows visibly flow.
function wave(waveAmp: number, waveFreq: number, wavePhase = 0): PatternWarp {
  return { ...noPatternWarp, waveAmp, waveFreq, wavePhase };
}

export const PATTERN_PRESETS: PatternPreset[] = [
  // --- dot lattices ---------------------------------------------------------
  preset('grid', 'Grid', {
    field: { kind: 'cosDot' }, cellSize: 9, angleDeg: 0,
  }),
  preset('grid-angle', 'Grid Angle', {
    field: { kind: 'cosDot' }, cellSize: 9, angleDeg: 45,
  }),
  preset('grid-dots', 'Grid Dots', {
    field: { kind: 'roundDot' }, cellSize: 9, angleDeg: 0,
  }),
  preset('grid-dots-angle', 'Grid Dots Angle', {
    field: { kind: 'roundDot' }, cellSize: 9, angleDeg: 45,
  }),

  // --- line screens ---------------------------------------------------------
  preset('vertical-lines', 'Vertical Lines', {
    field: { kind: 'line' }, cellSize: 9, angleDeg: 0,
  }),
  preset('horizontal-lines', 'Horizontal Lines', {
    field: { kind: 'line' }, cellSize: 9, angleDeg: 90,
  }),
  preset('angle-lines-1', 'Angle Lines 1', {
    field: { kind: 'line' }, cellSize: 9, angleDeg: 45,
  }),
  preset('angle-lines-2', 'Angle Lines 2', {
    field: { kind: 'line' }, cellSize: 14, angleDeg: 135,
  }),

  // --- warped lattices ------------------------------------------------------
  preset('mesh-wave', 'Mesh Wave', {
    field: { kind: 'cosDot' }, cellSize: 8, angleDeg: 0, warp: wave(9, 0.017),
  }),
  preset('dot-mesh-wave', 'Dot Mesh Wave', {
    field: { kind: 'roundDot' }, cellSize: 9, angleDeg: 0, warp: wave(9, 0.017),
  }),
  preset('dot-wave', 'Dot Wave', {
    field: { kind: 'roundDot' }, cellSize: 11, angleDeg: 0, warp: wave(16, 0.011),
  }),

  // --- warped line screens --------------------------------------------------
  preset('line-wave-vertical', 'Line Wave Vertical', {
    field: { kind: 'line' }, cellSize: 10, angleDeg: 0, warp: wave(14, 0.012),
  }),
  preset('line-wave-horizontal', 'Line Wave Horizontal', {
    field: { kind: 'line' }, cellSize: 10, angleDeg: 90, warp: wave(14, 0.012),
  }),
  preset('line-wave-angle', 'Line Wave Angle', {
    field: { kind: 'line' }, cellSize: 10, angleDeg: 45, warp: wave(14, 0.012),
  }),

  // --- organic / stochastic fields ------------------------------------------
  preset('grain', 'Grain', {
    field: { kind: 'blueNoise', size: 64, seed: 1 }, cellSize: 1.6, angleDeg: 0,
  }),
  preset('petroglyph', 'Petroglyph', {
    // Grid size drives both the bake cost and how far the tile repeats. 160²
    // lands at ~0.6s, in line with the rdContour mode that already ships;
    // 256² looked marginally better and took 3s, which is a freeze, not a wait.
    field: { kind: 'rd', pattern: 'squiggles', iterations: 3000, gridSize: 160, seed: 1, featureTexels: 9 },
    cellSize: 6, angleDeg: 0,
  }),
  preset('pebbles', 'Pebbles', {
    field: { kind: 'rd', pattern: 'pebbles', iterations: 2500, gridSize: 128, seed: 1, featureTexels: 8 },
    cellSize: 7, angleDeg: 0,
  }),
  preset('pavers', 'Pavers', {
    field: { kind: 'worley', cells: 24, jitter: 0.9, edge: true, seed: 3 },
    cellSize: 13, angleDeg: 0,
  }),
  preset('plasma', 'Plasma', {
    field: { kind: 'fbm', octaves: 5, lacunarity: 2, gain: 0.5, periods: 24, seed: 5 },
    cellSize: 5, angleDeg: 0,
  }),
  preset('pointillism-1', 'Pointillism 1', {
    field: { kind: 'points', cells: 40, jitter: 0.55, sizeJitter: 0.45, seed: 11 },
    cellSize: 9, angleDeg: 0,
  }),
  preset('pointillism-2', 'Pointillism 2', {
    field: { kind: 'points', cells: 56, jitter: 1, sizeJitter: 0.7, seed: 23 },
    cellSize: 6, angleDeg: 0,
  }),
];

export function findPatternPreset(id: string): PatternPreset | undefined {
  return PATTERN_PRESETS.find((p) => p.id === id);
}

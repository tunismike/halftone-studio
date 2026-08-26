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
];

export function findPatternPreset(id: string): PatternPreset | undefined {
  return PATTERN_PRESETS.find((p) => p.id === id);
}

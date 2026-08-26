// Named pattern-screen presets.
//
// These recreate the pattern taxonomy that apparel-print halftone packs ship
// as fixed Photoshop templates — but every one is just a field kind plus a few
// numbers, so any of them can be scaled, re-angled, and re-shaped freely.
// See docs/goal-v6.0.md.

import { defaultShaping, type PatternScreenParams } from './pattern-field';

export interface PatternPreset {
  id: string;
  name: string;
  params: PatternScreenParams;
}

function preset(
  id: string,
  name: string,
  params: Omit<PatternScreenParams, 'shaping' | 'softPreview'> & Partial<PatternScreenParams>,
): PatternPreset {
  return {
    id,
    name,
    params: {
      shaping: { ...defaultShaping },
      softPreview: true,
      ...params,
    },
  };
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
];

export function findPatternPreset(id: string): PatternPreset | undefined {
  return PATTERN_PRESETS.find((p) => p.id === id);
}

// Deterministic per-intent default recipes. Used both as the fallback when an
// LLM response is missing/invalid AND as the "reset to default intent" target.
// Every intent MUST have one so the pipeline always has something safe to render.

import type { Intent, RecipeLayerParams, TraceRecipe } from './types';
import { RECIPE_VERSION } from './types';

function recipe(intent: Intent, name: string, params: RecipeLayerParams): TraceRecipe {
  return {
    recipeVersion: RECIPE_VERSION,
    intent,
    sourceTreatment: 'analysis-only',
    notes: 'Built-in default for this intent.',
    layers: [{ id: 'main', name, role: 'final-art', enabled: true, params }],
  };
}

export const INTENT_DEFAULTS: Record<Intent, TraceRecipe> = {
  'screen-print': recipe('screen-print', 'Three-tone separation', {
    mode: { mode: 'tonal', bandCount: 3, bandColors: ['#111111', '#888888', '#f5f5f5'], bgColor: '#ffffff' },
    preprocess: { sharpen: 0.5, levelsBlack: 24, levelsWhite: 232, gamma: 0.9 },
    background: '#ffffff',
    foreground: '#111111',
  }),
  'halftone-poster': recipe('halftone-poster', 'Dot halftone', {
    mode: { mode: 'vector-halftone', screen: 'grid', mark: 'circle', cellSize: 8, angleDeg: 45 },
    preprocess: { sharpen: 0.4, levelsBlack: 12, levelsWhite: 244, gamma: 1 },
    background: '#ffffff',
    foreground: '#000000',
  }),
  sticker: recipe('sticker', 'Bold two-tone', {
    mode: { mode: 'tonal', bandCount: 2, bandColors: ['#000000', '#ffffff'], bgColor: '#ffffff' },
    preprocess: { sharpen: 0.8, levelsBlack: 40, levelsWhite: 216, gamma: 0.85 },
    background: '#ffffff',
    foreground: '#000000',
  }),
  'comic-ink': recipe('comic-ink', 'Comic halftone', {
    mode: { mode: 'vector-halftone', screen: 'grid', mark: 'circle', cellSize: 6, angleDeg: 15 },
    preprocess: { sharpen: 0.7, levelsBlack: 30, levelsWhite: 225, gamma: 0.9 },
    adjust: { contrast: 0.2 },
    background: '#ffffff',
    foreground: '#000000',
  }),
  'retro-game': recipe('retro-game', 'NES dither', {
    mode: { mode: 'palette-dither', palette: 'console-nes-ntsc', algorithm: 'ordered-bayer' },
    background: '#ffffff',
    foreground: '#000000',
  }),
  duotone: recipe('duotone', 'Duotone', {
    mode: { mode: 'duotone', shadow: '#1d4ed8', highlight: '#f59e0b' },
    background: '#ffffff',
    foreground: '#000000',
  }),
};

export function defaultRecipeForIntent(intent: Intent): TraceRecipe {
  return structuredClone(INTENT_DEFAULTS[intent]);
}

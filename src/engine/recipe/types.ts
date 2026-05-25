// Trace Recipe — the structured contract an LLM (ChatGPT/Gemini) emits after
// analyzing a source image. The LLM NEVER writes SVG; it only describes a
// renderable recipe. Our deterministic engine turns the recipe into geometry.
//
// Tier 1 ships a single-layer recipe, but the envelope already supports the
// multi-layer Trace Recipe of later phases — so Phase 2+ is an extension, not
// a rewrite.

export const RECIPE_VERSION = '0.1';

export const INTENTS = [
  'screen-print',
  'halftone-poster',
  'sticker',
  'comic-ink',
  'retro-game',
  'duotone',
] as const;
export type Intent = (typeof INTENTS)[number];

// Roles a layer can play. Tier 1 only emits "final-art"; the rest are reserved
// so the schema and UI don't need to change when the multi-layer composer and
// bitmap tracer land.
export const LAYER_ROLES = [
  'final-art',
  'silhouette',
  'linework',
  'tone-plate',
  'palette-region',
  'halftone-plate',
  'distress-mask',
] as const;
export type LayerRole = (typeof LAYER_ROLES)[number];

export const SOURCE_TREATMENTS = ['analysis-only'] as const;
export type SourceTreatment = (typeof SOURCE_TREATMENTS)[number];

// ── Constrained mode vocabulary the LLM may choose from ──────────────
// These are intentionally simpler than the engine's full ModeKind; the mapper
// expands them into real PipelineParams with sane defaults + clamping.

export const RECIPE_SCREENS = ['grid', 'hex', 'radial', 'poisson', 'stipple'] as const;
export const RECIPE_MARKS = ['circle', 'square', 'diamond', 'line', 'blob'] as const;
export const RECIPE_DITHER_ALGOS = [
  'floyd-steinberg', 'atkinson', 'stucki', 'jjn', 'burkes', 'ordered-bayer', 'blue-noise',
] as const;

export type RecipeMode =
  | {
      mode: 'vector-halftone';
      screen: (typeof RECIPE_SCREENS)[number];
      mark: (typeof RECIPE_MARKS)[number];
      cellSize: number;
      angleDeg: number;
    }
  | {
      mode: 'palette-dither';
      palette: string; // builtin id OR "extract:N"
      algorithm: (typeof RECIPE_DITHER_ALGOS)[number];
    }
  | {
      mode: 'tonal';
      bandCount: number; // 1..5
      bandColors: string[];
      bgColor: string;
    }
  | {
      mode: 'duotone';
      shadow: string;
      highlight: string;
    };

export interface RecipePreprocess {
  blur?: number;
  sharpen?: number;
  sharpenRadius?: number;
  levelsBlack?: number;
  levelsWhite?: number;
  gamma?: number;
}

export interface RecipeAdjust {
  brightness?: number;
  contrast?: number;
  gamma?: number;
  invert?: boolean;
}

export interface RecipeLayerParams {
  mode: RecipeMode;
  preprocess?: RecipePreprocess;
  adjust?: RecipeAdjust;
  background?: string;
  foreground?: string;
  transparent?: boolean;
}

export interface RecipeLayer {
  id: string;
  name: string;
  role: LayerRole;
  enabled: boolean;
  params: RecipeLayerParams;
}

export interface TraceRecipe {
  recipeVersion: string;
  intent: Intent;
  sourceTreatment: SourceTreatment;
  notes?: string;
  layers: RecipeLayer[];
}

// Result of validating + mapping an LLM response. Surfaced in the debug panel.
export interface RecipeReport {
  intent: Intent;
  mode: string;
  warnings: string[];
  clampedFields: string[];
  fallbackUsed: boolean;
  parseOk: boolean;
}

// Validate untrusted LLM JSON and map it to engine PipelineParams.
//
// Safety contract:
//   - JSON is parsed with try/catch; a parse failure can never throw past here.
//   - The strict Zod schema rejects unknown keys and unknown enum values.
//   - Numbers are clamped (and the clamp recorded) rather than trusted.
//   - Hex colors are shape-validated and normalized; bad colors degrade to a
//     default with a warning instead of failing the whole recipe.
//   - Unknown palettes degrade to the intent default with a warning.
//   - On any structural failure we fall back to the selected intent's default
//     recipe, so the renderer ALWAYS receives valid params.
//   - Model output is never eval'd and never used as SVG.

import { traceRecipeSchema } from './schema';
import { defaultRecipeForIntent } from './intents';
import type { Intent, RecipeLayer, RecipeRegion, RecipeReport, TraceRecipe } from './types';
import type { Layer, LayerBlend, LayerRegion, LayeredComposition } from '../layer/types';
import {
  defaultGridScreen, defaultHexScreen, defaultRadialScreen, defaultPoissonScreen,
  defaultStippleScreen, defaultSpotMode, defaultTonalRamp, makeMark,
  type ModeKind, type PaletteAlgorithm, type PipelineParams, type ScreenKind,
} from '../pipeline';
import { noWarp } from '../screen/warp';
import { defaultAdjust, type AdjustParams } from '../image/adjust';
import { defaultPreprocess, type PreprocessParams } from '../image/preprocess';
import { BUILTIN_PALETTES } from '../color/palettes-builtin';
import { addCustomPalette } from '../color/custom-palettes';
import { extractPalette } from '../color/extract';
import type { RgbaImage } from '../image/types';

export interface MappedRecipe {
  recipe: TraceRecipe;
  params: PipelineParams;
  // Present when the recipe has more than one enabled layer: a layered
  // composition the renderer can composite directly.
  composition?: LayeredComposition;
  report: RecipeReport;
}

interface Ctx {
  warnings: string[];
  clamped: string[];
  source?: RgbaImage;
}

function clampNum(v: unknown, min: number, max: number, field: string, ctx: Ctx, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  if (v < min) { ctx.clamped.push(`${field}: ${v}→${min}`); return min; }
  if (v > max) { ctx.clamped.push(`${field}: ${v}→${max}`); return max; }
  return v;
}

const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function normHex(v: unknown, field: string, ctx: Ctx, fallback: string): string {
  if (typeof v !== 'string' || !HEX_RE.test(v.trim())) {
    ctx.warnings.push(`${field}: invalid color "${String(v)}", used ${fallback}`);
    return fallback;
  }
  let h = v.trim().replace(/^#?/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

const KERNEL_FOR: Record<string, { kind: 'error-diffusion'; kernel: string; serpentine: boolean }> = {
  'floyd-steinberg': { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
  atkinson: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: true },
  stucki: { kind: 'error-diffusion', kernel: 'stucki', serpentine: true },
  jjn: { kind: 'error-diffusion', kernel: 'jjn', serpentine: true },
  burkes: { kind: 'error-diffusion', kernel: 'burkes', serpentine: true },
};

function mapAlgorithm(algo: string): PaletteAlgorithm {
  if (KERNEL_FOR[algo]) return KERNEL_FOR[algo] as PaletteAlgorithm;
  if (algo === 'ordered-bayer') return { kind: 'ordered-bayer', size: 4, amplitude: 0.18 };
  return { kind: 'ordered-bluenoise', size: 64, amplitude: 0.18 }; // blue-noise
}

function resolvePalette(palette: string, intent: Intent, ctx: Ctx): string {
  if (BUILTIN_PALETTES.some((p) => p.id === palette)) return palette;
  const m = /^extract:(\d+)$/.exec(palette);
  if (m && ctx.source) {
    const count = Math.max(2, Math.min(16, Number(m[1])));
    const colors = extractPalette(ctx.source, { count, refineKMeans: true });
    const id = 'custom:ai-extracted';
    addCustomPalette({ id, name: `AI extracted (${colors.length})`, category: 'modern-designer', colors });
    return id;
  }
  if (m) ctx.warnings.push(`palette "extract:${m[1]}" needs a loaded source; using fallback`);
  else ctx.warnings.push(`unknown palette "${palette}"; using fallback`);
  // Intent-appropriate fallback palette.
  return intent === 'retro-game' ? 'console-nes-ntsc' : 'mono-1bit';
}

function buildScreen(
  screen: string, cellSize: number, angleDeg: number,
): ScreenKind {
  switch (screen) {
    case 'hex': return defaultHexScreen(cellSize, angleDeg);
    case 'radial': return defaultRadialScreen(cellSize);
    case 'poisson': return defaultPoissonScreen();
    case 'stipple': {
      const s = defaultStippleScreen();
      if (s.kind === 'stipple') s.stipple.pitch = Math.max(1.5, cellSize);
      return s;
    }
    default: return defaultGridScreen(cellSize, angleDeg); // grid
  }
}

function mapMode(layer: RecipeLayer, intent: Intent, ctx: Ctx): ModeKind {
  const m = layer.params.mode;
  switch (m.mode) {
    case 'vector-halftone': {
      const cell = clampNum(m.cellSize, 2, 40, 'cellSize', ctx, 10);
      const angle = clampNum(m.angleDeg, -90, 90, 'angleDeg', ctx, 45);
      return {
        kind: 'vector',
        screen: buildScreen(m.screen, cell, angle),
        mark: makeMark(m.mark),
        warp: { ...noWarp },
        stroke: { enabled: false, width: 1 },
      };
    }
    case 'palette-dither':
      return {
        kind: 'paletteDither',
        paletteId: resolvePalette(m.palette, intent, ctx),
        metric: 'lab-de2000',
        algorithm: mapAlgorithm(m.algorithm),
      };
    case 'tonal': {
      const n = Math.round(clampNum(m.bandCount, 1, 5, 'bandCount', ctx, 3)) as 1 | 2 | 3 | 4 | 5;
      const ramp = defaultTonalRamp(n);
      const colors: string[] = [];
      for (let i = 0; i < n; i++) {
        const c = m.bandColors[i];
        colors.push(c != null ? normHex(c, `bandColors[${i}]`, ctx, ramp[i]) : ramp[i]);
      }
      return {
        kind: 'tonal', bandCount: n, bandColors: colors, metric: 'lab-de2000',
        algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
      };
    }
    case 'duotone': {
      const spot = defaultSpotMode();
      if (spot.kind === 'spot') {
        spot.channels[0] = { ...spot.channels[0], color: normHex(m.shadow, 'shadow', ctx, '#1d4ed8') };
        spot.channels[1] = { ...spot.channels[1], color: normHex(m.highlight, 'highlight', ctx, '#f59e0b') };
      }
      return spot;
    }
  }
}

function mapPreprocess(layer: RecipeLayer, ctx: Ctx): PreprocessParams {
  const p = layer.params.preprocess;
  if (!p) return { ...defaultPreprocess };
  return {
    blurRadius: clampNum(p.blur, 0, 10, 'preprocess.blur', ctx, 0),
    sharpenStrength: clampNum(p.sharpen, 0, 2, 'preprocess.sharpen', ctx, 0),
    sharpenRadius: clampNum(p.sharpenRadius, 0.5, 10, 'preprocess.sharpenRadius', ctx, 1),
    denoiseNoise: 0,
    blackPoint: clampNum(p.levelsBlack, 0, 254, 'preprocess.levelsBlack', ctx, 0),
    whitePoint: clampNum(p.levelsWhite, 1, 255, 'preprocess.levelsWhite', ctx, 255),
    midGamma: clampNum(p.gamma, 0.1, 3, 'preprocess.gamma', ctx, 1),
  };
}

function mapAdjust(layer: RecipeLayer, ctx: Ctx): AdjustParams {
  const a = layer.params.adjust;
  if (!a) return { ...defaultAdjust };
  return {
    brightness: clampNum(a.brightness, -1, 1, 'adjust.brightness', ctx, 0),
    contrast: clampNum(a.contrast, -1, 1, 'adjust.contrast', ctx, 0),
    gamma: clampNum(a.gamma, 0.1, 3, 'adjust.gamma', ctx, 1),
    invert: a.invert === true,
  };
}

function mapLayerToParams(layer: RecipeLayer, intent: Intent, ctx: Ctx): PipelineParams {
  const transparent = layer.params.transparent === true;
  return {
    adjust: mapAdjust(layer, ctx),
    preprocess: mapPreprocess(layer, ctx),
    mode: mapMode(layer, intent, ctx),
    background: normHex(layer.params.background ?? '#ffffff', 'background', ctx, '#ffffff'),
    foreground: normHex(layer.params.foreground ?? '#000000', 'foreground', ctx, '#000000'),
    transparent,
  };
}

function firstEnabledLayer(recipe: TraceRecipe): RecipeLayer | null {
  return recipe.layers.find((l) => l.enabled) ?? recipe.layers[0] ?? null;
}

function mapRegion(r: RecipeRegion | undefined, ctx: Ctx): LayerRegion {
  if (!r || r.kind === 'whole') return { kind: 'all' };
  if (r.kind === 'tone') {
    const min = clampNum(r.min, 0, 1, 'region.min', ctx, 0);
    const max = clampNum(r.max, 0, 1, 'region.max', ctx, 1);
    return { kind: 'toneBand', min: Math.min(min, max), max: Math.max(min, max) };
  }
  const count = Math.round(clampNum(r.count, 2, 12, 'region.count', ctx, 4));
  const index = Math.round(clampNum(r.index, 0, count - 1, 'region.index', ctx, 0));
  return { kind: 'colorRegion', count, index };
}

const BLENDS: LayerBlend[] = ['normal', 'multiply', 'screen', 'darken', 'lighten'];
function mapBlend(b: string | undefined): LayerBlend {
  return BLENDS.includes(b as LayerBlend) ? (b as LayerBlend) : 'normal';
}

// Map every enabled recipe layer to a composition layer (Tier 2). Draw order
// follows the recipe's layer array (first = bottom).
export function mapRecipeToComposition(
  recipe: TraceRecipe, source?: RgbaImage,
): { composition: LayeredComposition; warnings: string[]; clamped: string[] } {
  const ctx: Ctx = { warnings: [], clamped: [], source };
  const enabled = recipe.layers.filter((l) => l.enabled);
  const layers: Layer[] = enabled.map((rl, i) => {
    const p = mapLayerToParams(rl, recipe.intent, ctx);
    return {
      id: rl.id || `recipe-${i}`,
      name: rl.name || `Layer ${i + 1}`,
      region: mapRegion(rl.region, ctx),
      invertRegion: false,
      treatment: { mode: p.mode, adjust: p.adjust, preprocess: p.preprocess, foreground: p.foreground },
      enabled: true,
      blend: mapBlend(rl.blend),
      opacity: clampNum(rl.opacity, 0, 1, 'opacity', ctx, 1),
      feather: 0.03,
    };
  });
  const background = normHex(enabled[0]?.params.background ?? '#ffffff', 'background', ctx, '#ffffff');
  return { composition: { layers, background, transparent: false }, warnings: ctx.warnings, clamped: ctx.clamped };
}

// Map an already-validated TraceRecipe to params (used for fallbacks/defaults).
export function mapRecipe(recipe: TraceRecipe, source?: RgbaImage): { params: PipelineParams; warnings: string[]; clamped: string[] } {
  const ctx: Ctx = { warnings: [], clamped: [], source };
  const layer = firstEnabledLayer(recipe);
  if (!layer) {
    return { params: mapLayerToParams(defaultRecipeForIntent(recipe.intent).layers[0], recipe.intent, ctx), warnings: ['no enabled layer'], clamped: ctx.clamped };
  }
  const params = mapLayerToParams(layer, recipe.intent, ctx);
  return { params, warnings: ctx.warnings, clamped: ctx.clamped };
}

// Validate raw LLM text → mapped params + report. Never throws.
export function validateAndMapRecipe(
  jsonText: string,
  selectedIntent: Intent,
  source?: RgbaImage,
): MappedRecipe {
  const fallback = (warnings: string[], parseOk: boolean): MappedRecipe => {
    const recipe = defaultRecipeForIntent(selectedIntent);
    const { params, warnings: w2, clamped } = mapRecipe(recipe, source);
    return {
      recipe, params,
      report: {
        intent: selectedIntent, mode: recipe.layers[0].params.mode.mode,
        warnings: [...warnings, ...w2], clampedFields: clamped,
        fallbackUsed: true, parseOk,
      },
    };
  };

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return fallback(['Response was not valid JSON. Showing the intent default.'], false);
  }

  const parsed = traceRecipeSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return fallback([`Recipe did not match the schema. ${issues.join('; ')}`, 'Showing the intent default.'], true);
  }

  const recipe = parsed.data as TraceRecipe;
  // Honor the recipe's own intent for fallback colors/palettes, but report the
  // user-selected intent if they differ (the model may have echoed a different one).
  const intent = recipe.intent;
  const ctx: Ctx = { warnings: [], clamped: [], source };
  const layer = firstEnabledLayer(recipe);
  if (!layer) return fallback(['Recipe had no enabled layer.'], true);

  const params = mapLayerToParams(layer, intent, ctx);
  if (intent !== selectedIntent) {
    ctx.warnings.push(`Recipe intent "${intent}" differs from selected "${selectedIntent}".`);
  }

  // Tier 2: more than one enabled layer → a layered composition.
  const enabledCount = recipe.layers.filter((l) => l.enabled).length;
  let composition: LayeredComposition | undefined;
  if (enabledCount > 1) {
    const c = mapRecipeToComposition(recipe, source);
    composition = c.composition;
    ctx.warnings.push(...c.warnings);
    ctx.clamped.push(...c.clamped);
  }

  return {
    recipe, params, composition,
    report: {
      intent, mode: composition ? `composition (${enabledCount} layers)` : layer.params.mode.mode,
      warnings: ctx.warnings, clampedFields: ctx.clamped,
      fallbackUsed: false, parseOk: true,
    },
  };
}

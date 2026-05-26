import { describe, it, expect } from 'vitest';
import { validateAndMapRecipe, mapRecipe } from './validate';
import { INTENT_DEFAULTS, defaultRecipeForIntent } from './intents';
import { INTENTS, RECIPE_VERSION, type Intent } from './types';

const validVectorRecipe = JSON.stringify({
  recipeVersion: RECIPE_VERSION,
  intent: 'halftone-poster',
  sourceTreatment: 'analysis-only',
  notes: 'test',
  layers: [{
    id: 'main', name: 'Dots', role: 'final-art', enabled: true,
    params: { mode: { mode: 'vector-halftone', screen: 'grid', mark: 'circle', cellSize: 8, angleDeg: 45 } },
  }],
});

describe('every intent has a deterministic fallback', () => {
  it.each(INTENTS)('intent %s has a default recipe that maps without fallback', (intent) => {
    const def = INTENT_DEFAULTS[intent as Intent];
    expect(def).toBeTruthy();
    const { params } = mapRecipe(def);
    expect(params.mode).toBeTruthy();
    expect(params.background).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('valid recipe maps correctly', () => {
  it('maps a vector-halftone recipe to a vector mode', () => {
    const r = validateAndMapRecipe(validVectorRecipe, 'halftone-poster');
    expect(r.report.fallbackUsed).toBe(false);
    expect(r.report.parseOk).toBe(true);
    expect(r.params.mode.kind).toBe('vector');
    expect(r.report.warnings).toHaveLength(0);
  });
});

describe('multi-layer recipe maps to a composition (Tier 2)', () => {
  const multi = JSON.stringify({
    recipeVersion: RECIPE_VERSION,
    intent: 'screen-print',
    sourceTreatment: 'analysis-only',
    layers: [
      {
        id: 'bg', name: 'Background', role: 'halftone-plate', enabled: true,
        region: { kind: 'whole' }, blend: 'normal',
        params: { mode: { mode: 'vector-halftone', screen: 'grid', mark: 'circle', cellSize: 8, angleDeg: 45 } },
      },
      {
        id: 'sub', name: 'Subject', role: 'silhouette', enabled: true,
        region: { kind: 'tone', min: 0, max: 0.4 }, blend: 'multiply', opacity: 0.9,
        params: { mode: { mode: 'duotone', shadow: '#102030', highlight: '#f0e0d0' } },
      },
    ],
  });

  it('produces a 2-layer composition with mapped regions/blends', () => {
    const r = validateAndMapRecipe(multi, 'screen-print');
    expect(r.report.fallbackUsed).toBe(false);
    expect(r.composition).toBeTruthy();
    expect(r.composition!.layers).toHaveLength(2);
    expect(r.composition!.layers[0].region).toEqual({ kind: 'all' });
    expect(r.composition!.layers[1].region).toEqual({ kind: 'toneBand', min: 0, max: 0.4 });
    expect(r.composition!.layers[1].blend).toBe('multiply');
    expect(r.composition!.layers[1].opacity).toBeCloseTo(0.9);
    expect(r.report.mode).toContain('composition');
  });

  it('single-layer recipe stays single-mode (no composition)', () => {
    const r = validateAndMapRecipe(validVectorRecipe, 'halftone-poster');
    expect(r.composition).toBeUndefined();
  });
});

describe('invalid JSON never crashes and falls back', () => {
  it('non-JSON → fallback', () => {
    const r = validateAndMapRecipe('not json {{{', 'sticker');
    expect(r.report.fallbackUsed).toBe(true);
    expect(r.report.parseOk).toBe(false);
    expect(r.params.mode.kind).toBe('tonal'); // sticker default
  });
  it('empty string → fallback', () => {
    const r = validateAndMapRecipe('', 'duotone');
    expect(r.report.fallbackUsed).toBe(true);
    expect(r.params.mode.kind).toBe('spot'); // duotone → spot
  });
});

describe('unknown enums are rejected (→ fallback)', () => {
  it('unknown mode → fallback', () => {
    const bad = JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'sticker', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true, params: { mode: { mode: 'magic-trace' } } }],
    });
    const r = validateAndMapRecipe(bad, 'sticker');
    expect(r.report.fallbackUsed).toBe(true);
  });
  it('unknown screen → fallback', () => {
    const bad = JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'halftone-poster', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true,
        params: { mode: { mode: 'vector-halftone', screen: 'fractal', mark: 'circle', cellSize: 8, angleDeg: 0 } } }],
    });
    expect(validateAndMapRecipe(bad, 'halftone-poster').report.fallbackUsed).toBe(true);
  });
  it('unknown role → fallback', () => {
    const bad = JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'sticker', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'overlord', enabled: true,
        params: { mode: { mode: 'duotone', shadow: '#000', highlight: '#fff' } } }],
    });
    expect(validateAndMapRecipe(bad, 'sticker').report.fallbackUsed).toBe(true);
  });
});

describe('unknown keys are rejected by strict schema', () => {
  it('extra top-level key → fallback', () => {
    const bad = JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'sticker', sourceTreatment: 'analysis-only',
      evil: 'rm -rf', layers: defaultRecipeForIntent('sticker').layers,
    });
    expect(validateAndMapRecipe(bad, 'sticker').report.fallbackUsed).toBe(true);
  });
  it('literal __proto__ key cannot pollute the prototype or reach params', () => {
    const bad = `{"recipeVersion":"${RECIPE_VERSION}","intent":"sticker","sourceTreatment":"analysis-only","__proto__":{"polluted":true},"layers":${JSON.stringify(defaultRecipeForIntent('sticker').layers)}}`;
    const r = validateAndMapRecipe(bad, 'sticker');
    // No prototype pollution regardless of how the parse/validate resolved.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    // Params are built by explicit field reads, so the renderer only ever sees
    // known top-level keys — never a smuggled one.
    expect(Object.keys(r.params).sort()).toEqual(
      ['adjust', 'background', 'foreground', 'mode', 'preprocess', 'transparent'],
    );
    expect((r.params as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('extra key inside params → fallback', () => {
    const bad = JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'sticker', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true,
        params: { mode: { mode: 'duotone', shadow: '#000', highlight: '#fff' }, __proto__hack: 1 } }],
    });
    expect(validateAndMapRecipe(bad, 'sticker').report.fallbackUsed).toBe(true);
  });
});

describe('numbers are clamped, not trusted', () => {
  it('out-of-range cellSize is clamped and recorded', () => {
    const r = validateAndMapRecipe(JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'halftone-poster', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true,
        params: { mode: { mode: 'vector-halftone', screen: 'grid', mark: 'circle', cellSize: 9999, angleDeg: 500 } } }],
    }), 'halftone-poster');
    expect(r.report.fallbackUsed).toBe(false);
    expect(r.report.clampedFields.some((c) => c.startsWith('cellSize'))).toBe(true);
    expect(r.report.clampedFields.some((c) => c.startsWith('angleDeg'))).toBe(true);
    if (r.params.mode.kind === 'vector' && r.params.mode.screen.kind === 'grid') {
      expect(r.params.mode.screen.cellSize).toBeLessThanOrEqual(40);
    }
  });
});

describe('colors are normalized; bad colors degrade with a warning', () => {
  it('3-digit hex expands; missing # added', () => {
    const r = validateAndMapRecipe(JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'duotone', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true,
        params: { mode: { mode: 'duotone', shadow: 'f00', highlight: '#00FF00' } } }],
    }), 'duotone');
    expect(r.report.fallbackUsed).toBe(false);
    if (r.params.mode.kind === 'spot') {
      expect(r.params.mode.channels[0].color).toBe('#ff0000');
      expect(r.params.mode.channels[1].color).toBe('#00ff00');
    }
  });
  it('garbage color → warning + default, no fallback', () => {
    const r = validateAndMapRecipe(JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'duotone', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true,
        params: { mode: { mode: 'duotone', shadow: 'periwinkle', highlight: '#fff' } } }],
    }), 'duotone');
    expect(r.report.fallbackUsed).toBe(false);
    expect(r.report.warnings.some((w) => w.includes('shadow'))).toBe(true);
  });
});

describe('unknown palette degrades to a fallback palette with a warning', () => {
  it('bad palette id → warning, valid mode still produced', () => {
    const r = validateAndMapRecipe(JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'retro-game', sourceTreatment: 'analysis-only',
      layers: [{ id: 'm', name: 'x', role: 'final-art', enabled: true,
        params: { mode: { mode: 'palette-dither', palette: 'super-palette-9000', algorithm: 'floyd-steinberg' } } }],
    }), 'retro-game');
    expect(r.report.fallbackUsed).toBe(false);
    expect(r.report.warnings.some((w) => w.includes('palette'))).toBe(true);
    expect(r.params.mode.kind).toBe('paletteDither');
  });
});

describe('multi-layer envelope parses without breaking Tier 1', () => {
  it('uses the first enabled layer; extra layers do not crash', () => {
    const r = validateAndMapRecipe(JSON.stringify({
      recipeVersion: RECIPE_VERSION, intent: 'screen-print', sourceTreatment: 'analysis-only',
      layers: [
        { id: 'bg', name: 'BG', role: 'silhouette', enabled: false,
          params: { mode: { mode: 'tonal', bandCount: 1, bandColors: ['#000'], bgColor: '#fff' } } },
        { id: 'main', name: 'Ink', role: 'linework', enabled: true,
          params: { mode: { mode: 'vector-halftone', screen: 'grid', mark: 'line', cellSize: 6, angleDeg: 0 } } },
      ],
    }), 'screen-print');
    expect(r.report.fallbackUsed).toBe(false);
    expect(r.params.mode.kind).toBe('vector'); // picked first ENABLED layer
  });
});

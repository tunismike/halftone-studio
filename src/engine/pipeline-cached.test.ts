import { describe, it, expect } from 'vitest';
import { Cache } from './cache';
import { runCachedPipeline } from './pipeline-cached';
import { defaultAdjust } from './image/adjust';
import { defaultShaping } from './screen/pattern-field';
import {
  defaultVectorMode, defaultCmykMode, defaultSpotMode, defaultPaletteDitherMode,
  defaultTonalMode, defaultRdContourMode, defaultTraceMode, defaultPatternScreenMode,
  defaultPatternCmyk,
  type ModeKind, type PipelineParams,
} from './pipeline';
import type { RgbaImage } from './image/types';
import type { MarkSet } from './mark/types';

// A small horizontal black→white gradient with a bit of colour, so every mode
// has real tone + colour to work with.
function testImage(w = 48, h = 32): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    const j = (y * w + x) * 4;
    data[j] = Math.round(t * 255);
    data[j + 1] = Math.round((1 - t) * 255);
    data[j + 2] = Math.round(y / (h - 1) * 255);
    data[j + 3] = 255;
  }
  return { width: w, height: h, data };
}

function params(mode: ModeKind): PipelineParams {
  return { adjust: { ...defaultAdjust }, mode, background: '#ffffff', foreground: '#000000', transparent: false };
}

const src = testImage();
const markCount = (set: MarkSet) => set.groups.reduce((s, g) => s + g.marks.length, 0);

describe('runCachedPipeline — every mode produces valid output', () => {
  it('raster → raster image at source size', () => {
    const out = runCachedPipeline(new Cache(), src, params({ kind: 'raster', dither: { kind: 'floyd' } }));
    expect(out.kind).toBe('raster');
    if (out.kind === 'raster') { expect(out.image.width).toBe(src.width); expect(out.image.height).toBe(src.height); }
  });

  it('pattern screen → one ink layer at source size', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultPatternScreenMode()));
    expect(out.kind).toBe('field');
    if (out.kind === 'field') {
      expect(out.layers).toHaveLength(1);
      expect(out.width).toBe(src.width);
      expect(out.height).toBe(src.height);
      expect(out.layers[0].ink).toBe('#000000');
      const cov = out.layers[0].coverage;
      expect(cov.width).toBe(src.width);
      // A gradient must produce a mix, not an all-on or all-off field.
      let inked = 0;
      for (let i = 0; i < cov.data.length; i++) if (cov.data[i] > 127) inked++;
      expect(inked).toBeGreaterThan(0);
      expect(inked).toBeLessThan(cov.data.length);
    }
  });

  it('pattern screen → one layer per enabled ink, each its own colour', () => {
    // The whole point of colour separation: a luminance channel cannot tell
    // saturated hues apart, so each ink has to be screened from its own
    // separation at its own angle.
    const mode = defaultPatternScreenMode();
    if (mode.kind !== 'patternScreen') throw new Error('unreachable');
    const cmyk = { ...mode, inks: defaultPatternCmyk() };
    const out = runCachedPipeline(new Cache(), src, params(cmyk));
    expect(out.kind).toBe('field');
    if (out.kind !== 'field') return;
    expect(out.layers).toHaveLength(4);
    expect(out.layers.map((l) => l.ink)).toEqual(['#00aaee', '#e6008c', '#ffd000', '#111111']);
    // The separations must actually differ — identical layers would mean the
    // colour never reached the screen.
    const sig = (i: number) => Array.from(out.layers[i].coverage.data).join(',');
    expect(sig(0)).not.toEqual(sig(1));
    expect(sig(1)).not.toEqual(sig(2));
  });

  it('pattern screen → disabled inks are dropped', () => {
    const mode = defaultPatternScreenMode();
    if (mode.kind !== 'patternScreen') throw new Error('unreachable');
    const inks = defaultPatternCmyk();
    if (inks.kind !== 'cmyk') throw new Error('unreachable');
    inks.channels[0].enabled = false;
    const out = runCachedPipeline(new Cache(), src, params({ ...mode, inks }));
    if (out.kind !== 'field') throw new Error('expected field');
    expect(out.layers).toHaveLength(3);
  });

  it('pattern screen → tile cached across param edits', () => {
    // The equalized tile depends only on the field kind, so re-rendering at a
    // new cell size must not pay to bake it again.
    const cache = new Cache();
    const a = defaultPatternScreenMode();
    runCachedPipeline(cache, src, params(a));
    if (a.kind !== 'patternScreen') throw new Error('unreachable');
    const b = { ...a, pattern: { ...a.pattern, cellSize: a.pattern.cellSize + 3 } };
    const out = runCachedPipeline(cache, src, params(b));
    expect(out.kind).toBe('field');
  });

  it('vector halftone → non-empty marks', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultVectorMode()));
    expect(out.kind).toBe('marks');
    if (out.kind === 'marks') expect(markCount(out.set)).toBeGreaterThan(0);
  });

  it('cmyk → marks with per-channel groups', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultCmykMode()));
    expect(out.kind).toBe('marks');
    if (out.kind === 'marks') { expect(out.set.groups.length).toBeGreaterThan(1); expect(markCount(out.set)).toBeGreaterThan(0); }
  });

  it('spot → marks', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultSpotMode()));
    expect(out.kind).toBe('marks');
    if (out.kind === 'marks') expect(markCount(out.set)).toBeGreaterThan(0);
  });

  it('paletteDither → indexed image', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultPaletteDitherMode()));
    expect(out.kind).toBe('indexed');
  });

  it('tonal → indexed image', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultTonalMode()));
    expect(out.kind).toBe('indexed');
  });

  it('rdContour → marks', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultRdContourMode()));
    expect(out.kind).toBe('marks');
  });

  it('trace → non-empty traced regions', () => {
    const out = runCachedPipeline(new Cache(), src, params(defaultTraceMode()));
    expect(out.kind).toBe('traced');
    if (out.kind === 'traced') expect(out.regions.length).toBeGreaterThan(0);
  });
});

describe('runCachedPipeline — caching', () => {
  it('reuses cached geometry: a second identical run shares the marks array', () => {
    const cache = new Cache();
    const p = params(defaultVectorMode());
    const a = runCachedPipeline(cache, src, p);
    const b = runCachedPipeline(cache, src, p);
    if (a.kind === 'marks' && b.kind === 'marks') {
      expect(a.set.groups[0].marks).toBe(b.set.groups[0].marks); // same cached reference
    } else {
      throw new Error('expected marks');
    }
  });
});

describe('pattern screen inks', () => {
  it('pulls black out of coloured areas as blackGamma rises', () => {
    // A maximum-GCR separation puts a heavy black component on every colour,
    // so once screened the image wears black dots everywhere. Raising the
    // exponent hands colour back to CMY.
    const mode = defaultPatternScreenMode();
    if (mode.kind !== 'patternScreen') throw new Error('unreachable');
    const kInk = (blackGamma: number): number => {
      const inks = { ...defaultPatternCmyk(), blackGamma };
      const out = runCachedPipeline(new Cache(), src, params({ ...mode, inks }));
      if (out.kind !== 'field') throw new Error('expected field');
      const k = out.layers[out.layers.length - 1].coverage;
      let sum = 0;
      for (let i = 0; i < k.data.length; i++) sum += k.data[i] / 255;
      return sum / k.data.length;
    };
    expect(kInk(2.5)).toBeLessThan(kInk(1) * 0.8);
  });

  it('lays a solid ink as the artwork shape, not the screen shape', () => {
    // A solid plate must not carry the field's pattern at all — that is the
    // difference between printing a drawing and screening it.
    const mode = defaultPatternScreenMode();
    if (mode.kind !== 'patternScreen') throw new Error('unreachable');
    const run = (solid: boolean) => {
      const inks = defaultPatternCmyk();
      if (inks.kind !== 'cmyk') throw new Error('unreachable');
      inks.channels = inks.channels.map((c) => ({ ...c, solid: c.key === 'K' ? solid : false }));
      const out = runCachedPipeline(new Cache(), src, params({ ...mode, inks }));
      if (out.kind !== 'field') throw new Error('expected field');
      return out.layers[out.layers.length - 1].coverage;
    };
    const screened = run(false);
    const solid = run(true);
    // Screening breaks a region into many marks; a solid plate leaves it whole.
    const runsOf = (c: typeof screened): number => {
      let runs = 0;
      for (let y = 0; y < c.height; y++) {
        let prev = 0;
        for (let x = 0; x < c.width; x++) {
          const v = c.data[y * c.width + x] > 127 ? 1 : 0;
          if (v && !prev) runs++;
          prev = v;
        }
      }
      return runs;
    };
    expect(runsOf(solid)).toBeLessThan(runsOf(screened) * 0.6);
  });
});

describe('palette pattern screen', () => {
  const paletteMode = (colors: string[]) => {
    const mode = defaultPatternScreenMode();
    if (mode.kind !== 'patternScreen') throw new Error('unreachable');
    return { ...mode, inks: { kind: 'palette' as const, colors } };
  };

  it('assigns every pixel exactly one palette entry', () => {
    // A gradient map is a partition, not an overprint: any pixel covered twice
    // would mean two colours claiming it, and any pixel covered zero times
    // would leave a hole.
    const colors = ['#101020', '#2a3ea8', '#e0338c', '#f5d020'];
    const out = runCachedPipeline(new Cache(), src, params(paletteMode(colors)));
    if (out.kind !== 'field') throw new Error('expected field');
    expect(out.layers).toHaveLength(4);
    expect(out.layers.map((l) => l.ink)).toEqual(colors);
    const n = src.width * src.height;
    for (let i = 0; i < n; i++) {
      let hits = 0;
      for (const l of out.layers) if (l.coverage.data[i] > 127) hits++;
      expect(hits).toBe(1);
    }
  });

  it('paints normally rather than multiplying', () => {
    // Palette layers each own their pixels outright. Multiplying them, which is
    // right for overprinting inks, would drive everything toward black.
    const pal = runCachedPipeline(new Cache(), src, params(paletteMode(['#000000', '#ffffff'])));
    const cmyk = runCachedPipeline(new Cache(), src,
      params({ ...paletteMode([]), inks: defaultPatternCmyk() }));
    if (pal.kind !== 'field' || cmyk.kind !== 'field') throw new Error('expected field');
    expect(pal.blend).toBe('normal');
    expect(cmyk.blend).toBe('multiply');
  });

  it('splits a flat tone between neighbours in proportion to where it sits', () => {
    // The point of dithering the handoff: a tone a third of the way from one
    // colour to the next takes the next on about a third of its pixels, so the
    // ramp reads continuously while every band stays a flat spot colour.
    const flat = (v: number) => {
      const w = 160, h = 160;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const g = Math.round(v * 255);
        data[i * 4] = g; data[i * 4 + 1] = g; data[i * 4 + 2] = g; data[i * 4 + 3] = 255;
      }
      return { width: w, height: h, data };
    };
    // Neutral shaping, so position along the ramp is luminance itself. With
    // the mode's print defaults the clamps would remap it first, which is
    // correct behaviour but would be measuring the tone curve, not the dither.
    const mode = paletteMode(['#000000', '#ffffff']);
    const neutral = {
      ...mode,
      pattern: { ...mode.pattern, shaping: { ...defaultShaping } },
    };
    const out = runCachedPipeline(new Cache(), flat(0.33), params(neutral));
    if (out.kind !== 'field') throw new Error('expected field');
    let upper = 0;
    const total = out.layers[1].coverage.data.length;
    for (let i = 0; i < total; i++) if (out.layers[1].coverage.data[i] > 127) upper++;
    expect(upper / total).toBeCloseTo(0.33, 1);
  });
});

import { describe, it, expect } from 'vitest';
import { Cache } from './cache';
import { runCachedPipeline } from './pipeline-cached';
import { defaultAdjust } from './image/adjust';
import {
  defaultVectorMode, defaultCmykMode, defaultSpotMode, defaultPaletteDitherMode,
  defaultTonalMode, defaultRdContourMode, defaultTraceMode,
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

import type { Cache } from './cache';
import type { LumImage, RgbaImage, Sample } from './image/types';
import { rgbaToLum } from './image/luminance';
import { adjust as applyAdjust, threshold } from './image/adjust';
import { applyPreprocess, defaultPreprocess, isIdentityPreprocess, type PreprocessParams } from './image/preprocess';
import { computeEdges } from './image/edges';
import { atkinson, bayer, floydSteinberg } from './dither';
import { gridScreen } from './screen/grid';
import { hexScreen } from './screen/hex';
import { radialScreen } from './screen/radial';
import { poissonScreen } from './screen/poisson';
import { stippleScreen } from './screen/stipple';
import { warpSamples } from './screen/warp';
import { samplesToCircles } from './mark/circle';
import { samplesToLineSegments } from './mark/line';
import { samplesToBlobs } from './mark/blob';
import { samplesToSquares } from './mark/square';
import { samplesToFlowStrokes } from './mark/flow';
import { samplesToGlyphs } from './mark/glyph';
import { registrationMarks } from './mark/registration';
import { rgbaToCmyk, rgbaToSpot, type CmykSeparation } from './color/cmyk';
import { buildPaletteLut, preparePalette, type PaletteLut, type PreparedPalette } from './color/palette';
import { findPalette } from './color/palettes-builtin';
import { paletteErrorDiffusion, type IndexedImage } from './dither/error-diffusion-palette';
import { riemersmaDither } from './dither/riemersma';
import { knuthDotDiffusion } from './dither/knuth';
import { traceImage, type TracedRegion } from './trace/trace';
import { bayerMask, orderedPaletteDither } from './dither/ordered-palette';
import { generateBlueNoiseMask, type BlueNoiseMask } from './noise/blue-noise-mask';
import { simulatePattern, type RdField } from './noise/reaction-diffusion';
import { reactionDiffusionScreen } from './screen/reaction-diffusion-screen';
import { runRdContour, rdContourToMarkSet } from './mode/rd-contour';
import {
  bakePatternField, renderPatternScreen, renderSolidInk, renderPaletteScreen,
  type CoverageMap, type PatternTile, type PatternScreenParams,
} from './screen/pattern-field';
import { KERNELS } from './dither/kernels';
import type { MarkGroup, MarkSet, Mark } from './mark/types';
import type { Output } from './output';
import type { AdjustParams } from './image/adjust';
import type { RgbaImage as RgbaImageType } from './image/types';
import type {
  PipelineParams,
  ModeKind,
  ScreenKind,
  MarkKind,
  ChannelConfig,
} from './pipeline';

type VectorMode = Extract<ModeKind, { kind: 'vector' }>;
type CmykMode = Extract<ModeKind, { kind: 'cmyk' }>;
type SpotMode = Extract<ModeKind, { kind: 'spot' }>;
type RasterMode = Extract<ModeKind, { kind: 'raster' }>;
type PaletteDitherMode = Extract<ModeKind, { kind: 'paletteDither' }>;
type TonalMode = Extract<ModeKind, { kind: 'tonal' }>;
type RdContourMode = Extract<ModeKind, { kind: 'rdContour' }>;
type PatternScreenMode = Extract<ModeKind, { kind: 'patternScreen' }>;

export function runCachedPipeline(
  cache: Cache,
  rawSrc: RgbaImage,
  p: PipelineParams,
): Output {
  const pp = p.preprocess ?? defaultPreprocess;
  const src = getPreprocessed(cache, rawSrc, pp);
  const srcKey = isIdentityPreprocess(pp) ? 'raw' : JSON.stringify(pp);
  switch (p.mode.kind) {
    case 'raster': return runRaster(cache, src, srcKey, p, p.mode);
    case 'vector': return runVector(cache, src, srcKey, p, p.mode);
    case 'cmyk': return runCmyk(cache, src, srcKey, p, p.mode);
    case 'spot': return runSpot(cache, src, srcKey, p, p.mode);
    case 'paletteDither': return runPaletteDither(cache, src, srcKey, p.mode);
    case 'tonal': return runTonal(cache, src, srcKey, p.mode);
    case 'rdContour': return runRdContourMode(cache, src, p, p.mode);
    case 'patternScreen': return runPatternScreen(cache, src, srcKey, p, p.mode);
    case 'trace': return runTrace(cache, src, srcKey, p, p.mode);
  }
}

function runPatternScreen(
  cache: Cache, src: RgbaImage, srcKey: string, p: PipelineParams,
  mode: PatternScreenMode,
): Output {
  const ps = mode.pattern;
  // The equalized tile depends only on the field kind — not on cell size,
  // angle, or the source — so one bake serves every edit of those, and every
  // ink shares it.
  const tile = cache.get<PatternTile>('pattern-tile', JSON.stringify(ps.field), () =>
    bakePatternField(ps.field),
  );
  const adjKey = `${src.width}x${src.height}|${srcKey}|${JSON.stringify(p.adjust)}`;
  const inks = mode.inks ?? { kind: 'mono' as const };

  // Screen one separation. `tone` is luminance-shaped: 0 lays full ink.
  // A solid ink skips the screen entirely and prints its own shape.
  const screen = (
    id: string, tone: LumImage, angleDeg: number, scale: number, solid = false,
  ): CoverageMap => {
    if (solid) {
      return cache.get<CoverageMap>(`pattern-solid:${id}`,
        `${adjKey}|${JSON.stringify(ps.shaping)}`,
        () => renderSolidInk(tone, ps.shaping));
    }
    const params: PatternScreenParams = {
      ...ps,
      angleDeg,
      cellSize: Math.max(0.5, ps.cellSize * scale),
    };
    return cache.get<CoverageMap>(`pattern-cov:${id}`,
      `${adjKey}|${JSON.stringify(params)}`,
      () => renderPatternScreen(tone, tile, params));
  };

  const layers: Array<{ coverage: CoverageMap; ink: string }> = [];

  if (inks.kind === 'mono') {
    const lum = getLum(cache, src, srcKey, p.adjust);
    layers.push({ coverage: screen('mono', lum, ps.angleDeg, 1), ink: p.foreground });
  } else if (inks.kind === 'cmyk') {
    const bg = inks.blackGamma ?? 1;
    const sep = cache.get<CmykSeparation>('cmyk', `${srcKey}|bg${bg}`, () =>
      rgbaToCmyk(src, { blackGamma: bg }),
    );
    for (const ch of inks.channels) {
      if (!ch.enabled) continue;
      // invertWithAdjust turns an ink-amount channel into the luminance shape
      // the screen expects, applying the same tone controls as mono does.
      const tone = cache.get<LumImage>(`ink-adj:${ch.key}`, adjKey, () =>
        invertWithAdjust(pickCmykChannel(sep, ch.key), p.adjust),
      );
      layers.push({
        coverage: screen(`cmyk:${ch.key}`, tone, ch.angleDeg, ch.scale, ch.solid),
        ink: ch.color,
      });
    }
  } else if (inks.kind === 'palette') {
    const lum = getLum(cache, src, srcKey, p.adjust);
    const colors = inks.colors;
    const maps = cache.get<CoverageMap[]>('pattern-palette',
      `${adjKey}|${JSON.stringify(ps)}|${colors.join(',')}`,
      () => renderPaletteScreen(lum, tile, ps, colors.length),
    );
    for (let i = 0; i < colors.length; i++) {
      layers.push({ coverage: maps[i], ink: colors[i] });
    }
  } else {
    for (let i = 0; i < inks.channels.length; i++) {
      const ch = inks.channels[i];
      if (!ch.enabled) continue;
      const targetKey = `${srcKey}|${ch.color}`;
      const ink = cache.get<LumImage>(`spot-ink:${i}`, targetKey, () => {
        const { r, g, b } = hexToRgb(ch.color);
        return rgbaToSpot(src, { targetR: r, targetG: g, targetB: b });
      });
      const tone = cache.get<LumImage>(`spot-ink-adj:${i}`, `${targetKey}|${adjKey}`, () =>
        invertWithAdjust(ink, p.adjust),
      );
      layers.push({
        coverage: screen(`spot:${i}`, tone, ch.angleDeg, ch.scale, ch.solid),
        ink: ch.color,
      });
    }
  }

  return {
    kind: 'field',
    layers,
    // A palette assigns each pixel one colour, so its layers paint normally;
    // inks overprint, so they multiply.
    blend: inks.kind === 'palette' ? 'normal' : 'multiply',
    width: src.width,
    height: src.height,
    background: p.background,
    transparent: p.transparent,
  };
}

function runTrace(
  cache: Cache, src: RgbaImage, srcKey: string, p: PipelineParams,
  mode: Extract<ModeKind, { kind: 'trace' }>,
): Output {
  const key = `${src.width}x${src.height}|${srcKey}|${JSON.stringify(mode.trace)}`;
  const regions = cache.get<TracedRegion[]>('trace', key, () => traceImage(src, mode.trace));
  return { kind: 'traced', regions, width: src.width, height: src.height, background: p.background, transparent: p.transparent };
}

function getPreprocessed(cache: Cache, src: RgbaImage, pp: PreprocessParams): RgbaImage {
  if (isIdentityPreprocess(pp)) return src;
  const key = `${src.width}x${src.height}|${JSON.stringify(pp)}`;
  return cache.get<RgbaImage>('preprocess', key, () => applyPreprocess(src, pp));
}

function runRdContourMode(
  cache: Cache,
  src: RgbaImage,
  p: PipelineParams,
  mode: RdContourMode,
): Output {
  const rp = mode.params;
  // Cache the RD field by (pattern, iterations, gridSize, seed) — independent of source.
  const fieldKey = `${rp.pattern}|${rp.iterations}|${rp.gridSize}|${rp.seed}`;
  const field = cache.get<RdField>('rd-field', fieldKey, () =>
    simulatePattern({ pattern: rp.pattern, iterations: rp.iterations, size: rp.gridSize, seed: rp.seed }),
  );
  const run = runRdContour(src, p.adjust, field, rp);
  const set = rdContourToMarkSet(src, run.marks, p.background, p.foreground, p.transparent);
  return { kind: 'marks', set };
}

function getLum(cache: Cache, src: RgbaImage, srcKey: string, adjust: AdjustParams): LumImage {
  const adjKey = srcKey + '|' + JSON.stringify(adjust);
  return cache.get<LumImage>('lum-adjust', adjKey, () => {
    const raw = rgbaToLum(src);
    return applyAdjust(raw, adjust);
  });
}

function getEdges(cache: Cache, lum: LumImage, adjKey: string): LumImage {
  return cache.get<LumImage>('edges', adjKey, () => computeEdges(lum));
}

function runRaster(
  cache: Cache,
  src: RgbaImage,
  srcKey: string,
  p: PipelineParams,
  mode: RasterMode,
): Output {
  const lum = getLum(cache, src, srcKey, p.adjust);
  const dKey = srcKey + '|' + JSON.stringify(p.adjust) + '|' + JSON.stringify(mode.dither);
  const image = cache.get<LumImage>('dither', dKey, () => runDither(lum, mode.dither));
  return { kind: 'raster', image };
}

function runVector(
  cache: Cache,
  src: RgbaImage,
  srcKey: string,
  p: PipelineParams,
  mode: VectorMode,
): Output {
  const lum = getLum(cache, src, srcKey, p.adjust);
  const adjKey = srcKey + '|' + JSON.stringify(p.adjust);
  const screenKey = adjKey + '|' + JSON.stringify(mode.screen);
  const samples = cache.get<Sample[]>('samples', screenKey, () => runScreen(lum, mode.screen, cache));
  const warpKey = screenKey + '|' + JSON.stringify(mode.warp);
  const warped = cache.get<Sample[]>('warp', warpKey, () =>
    warpSamples(samples, lum, mode.warp),
  );
  const wantEdges = markUsesEdges(mode.mark);
  const edges = wantEdges ? getEdges(cache, lum, adjKey) : undefined;
  const markKey =
    warpKey +
    '|' + JSON.stringify(mode.mark) +
    '|' + (wantEdges ? 'e' : 'n');
  const marks = cache.get<Mark[]>('marks', markKey, () => runMarks(warped, mode.mark, edges));
  const groupName = mode.mark.kind;
  const stroke = mode.stroke.enabled
    ? { fill: 'none', stroke: p.foreground, strokeWidth: mode.stroke.width }
    : { fill: p.foreground, stroke: 'none', strokeWidth: undefined };
  const set: MarkSet = {
    width: src.width,
    height: src.height,
    background: p.transparent ? 'none' : p.background,
    foreground: p.foreground,
    groups: [{
      name: groupName,
      fill: stroke.fill,
      stroke: stroke.stroke,
      strokeWidth: stroke.strokeWidth,
      marks,
    }],
  };
  return { kind: 'marks', set };
}

function runPaletteDither(cache: Cache, src: RgbaImage, srcKey: string, mode: PaletteDitherMode): Output {
  const palette = cache.get<PreparedPalette>(
    `palette:${mode.paletteId}`,
    mode.paletteId,
    () => {
      const def = findPalette(mode.paletteId);
      if (!def) throw new Error(`unknown palette: ${mode.paletteId}`);
      return preparePalette(def.colors);
    },
  );
  // Precompute and cache a nearest-color LUT keyed by (palette, metric).
  // 32³ voxel grid built once per session per palette/metric combination —
  // cuts per-pixel cost from N×DeltaE to a single array lookup.
  const lutKey = `${mode.paletteId}|${mode.metric}`;
  const lut = cache.get<PaletteLut>('palette-lut', lutKey, () =>
    buildPaletteLut(palette, mode.metric),
  );
  const algoKey = JSON.stringify(mode.algorithm) + '|' + mode.metric;
  const sourceKey = `${src.width}x${src.height}|${srcKey}`;
  const image = cache.get<IndexedImage>(
    `palette-dither:${mode.paletteId}`,
    `${sourceKey}|${algoKey}`,
    () => runPaletteAlgorithm(cache, src, palette, lut, mode),
  );
  return { kind: 'indexed', image };
}

function runTonal(cache: Cache, src: RgbaImage, srcKey: string, mode: TonalMode): Output {
  const colors = mode.bandColors.slice(0, mode.bandCount);
  const palKey = colors.join(',');
  const palette = cache.get<PreparedPalette>('tonal-palette', palKey, () => preparePalette(colors));
  const lutKey = palKey + '|' + mode.metric;
  const lut = cache.get<PaletteLut>('tonal-lut', lutKey, () => buildPaletteLut(palette, mode.metric));
  const algoKey = JSON.stringify(mode.algorithm) + '|' + mode.metric;
  const fullKey = `${src.width}x${src.height}|${srcKey}|${palKey}|${algoKey}`;
  const image = cache.get<IndexedImage>('tonal-out', fullKey, () =>
    runPaletteAlgorithm(cache, src, palette, lut, {
      kind: 'paletteDither',
      paletteId: `tonal:${palKey}`,
      metric: mode.metric,
      algorithm: mode.algorithm,
    }),
  );
  return { kind: 'indexed', image };
}

function runPaletteAlgorithm(
  cache: Cache,
  src: RgbaImageType,
  palette: PreparedPalette,
  lut: PaletteLut,
  mode: PaletteDitherMode,
): IndexedImage {
  const a = mode.algorithm;
  switch (a.kind) {
    case 'error-diffusion': {
      const kernel = KERNELS[a.kernel];
      return paletteErrorDiffusion(src, {
        palette, kernel, metric: mode.metric, serpentine: a.serpentine, lut,
      });
    }
    case 'riemersma':
      return riemersmaDither(src, {
        palette, metric: mode.metric, historyLen: a.historyLen, decay: a.decay, lut,
      });
    case 'ordered-bayer': {
      const mask = bayerMask(a.size);
      return orderedPaletteDither(src, {
        palette, metric: mode.metric, mask, amplitude: a.amplitude, lut,
      });
    }
    case 'ordered-bluenoise': {
      const bn = cache.get<BlueNoiseMask>(
        `bluenoise:${a.size}`,
        `${a.size}`,
        () => generateBlueNoiseMask({ size: a.size, sigma: 1.5, seed: 1, initialDensity: 0.1 }),
      );
      return orderedPaletteDither(src, {
        palette, metric: mode.metric,
        mask: { size: bn.size, values: bn.values },
        amplitude: a.amplitude, lut,
      });
    }
    case 'knuth':
      return knuthDotDiffusion(src, { palette, metric: mode.metric, lut });
  }
}

function runCmyk(cache: Cache, src: RgbaImage, srcKey: string, p: PipelineParams, mode: CmykMode): Output {
  const sep = cache.get<CmykSeparation>('cmyk', srcKey, () => rgbaToCmyk(src));
  const adjKey = srcKey + '|' + JSON.stringify(p.adjust);
  const dotKey = JSON.stringify(mode.dot);
  const warpJson = JSON.stringify(mode.warp);
  const groups: MarkGroup[] = [];

  for (const ch of mode.channels) {
    if (!ch.enabled) continue;
    const screenLum = cache.get<LumImage>(`ink-adj:${ch.key}`, adjKey, () => {
      const ink = pickCmykChannel(sep, ch.key);
      return invertWithAdjust(ink, p.adjust);
    });
    const cellSize = Math.max(1, mode.baseCellSize * ch.scale);
    const channelScreen = { cellSize, angleDeg: ch.angleDeg };
    const screenKey = adjKey + '|' + JSON.stringify(channelScreen);
    const samples = cache.get<Sample[]>(`cmyk-samples:${ch.key}`, screenKey, () =>
      gridScreen(screenLum, channelScreen),
    );
    const warpKey = screenKey + '|' + warpJson;
    const warped = cache.get<Sample[]>(`cmyk-warp:${ch.key}`, warpKey, () =>
      warpSamples(samples, screenLum, mode.warp),
    );
    const markKey = warpKey + '|' + dotKey;
    const marks = cache.get<Mark[]>(`cmyk-marks:${ch.key}`, markKey, () =>
      samplesToCircles(warped, mode.dot),
    );
    if (marks.length === 0) continue;
    groups.push({
      name: ch.key,
      fill: ch.color,
      stroke: 'none',
      blendMode: 'multiply',
      marks,
    });
  }

  appendRegistration(groups, src, mode);
  return finishMarks(src, p, groups);
}

function runSpot(cache: Cache, src: RgbaImage, srcKey: string, p: PipelineParams, mode: SpotMode): Output {
  const adjKey = srcKey + '|' + JSON.stringify(p.adjust);
  const dotKey = JSON.stringify(mode.dot);
  const warpJson = JSON.stringify(mode.warp);
  const groups: MarkGroup[] = [];

  for (let idx = 0; idx < mode.channels.length; idx++) {
    const ch = mode.channels[idx];
    if (!ch.enabled) continue;
    const targetKey = `${srcKey}|${ch.color}`;
    const ink = cache.get<LumImage>(`spot-ink:${idx}`, targetKey, () => {
      const { r, g, b } = hexToRgb(ch.color);
      return rgbaToSpot(src, { targetR: r, targetG: g, targetB: b });
    });
    const screenLum = cache.get<LumImage>(`spot-ink-adj:${idx}`, targetKey + '|' + adjKey, () =>
      invertWithAdjust(ink, p.adjust),
    );
    const cellSize = Math.max(1, mode.baseCellSize * ch.scale);
    const channelScreen = { cellSize, angleDeg: ch.angleDeg };
    const screenKey = targetKey + '|' + adjKey + '|' + JSON.stringify(channelScreen);
    const samples = cache.get<Sample[]>(`spot-samples:${idx}`, screenKey, () =>
      gridScreen(screenLum, channelScreen),
    );
    const warpKey = screenKey + '|' + warpJson;
    const warped = cache.get<Sample[]>(`spot-warp:${idx}`, warpKey, () =>
      warpSamples(samples, screenLum, mode.warp),
    );
    const markKey = warpKey + '|' + dotKey;
    const marks = cache.get<Mark[]>(`spot-marks:${idx}`, markKey, () =>
      samplesToCircles(warped, mode.dot),
    );
    if (marks.length === 0) continue;
    groups.push({
      name: ch.name,
      fill: ch.color,
      stroke: 'none',
      blendMode: 'multiply',
      marks,
    });
  }

  appendRegistration(groups, src, mode);
  return finishMarks(src, p, groups);
}

function appendRegistration(
  groups: MarkGroup[],
  src: RgbaImage,
  mode: CmykMode | SpotMode,
): void {
  if (!mode.registration) return;
  groups.push({
    name: 'registration',
    fill: 'none',
    stroke: '#000000',
    strokeWidth: mode.registrationParams.stroke,
    marks: registrationMarks(src.width, src.height, mode.registrationParams),
  });
}

function finishMarks(src: RgbaImage, p: PipelineParams, groups: MarkGroup[]): Output {
  const set: MarkSet = {
    width: src.width,
    height: src.height,
    background: p.transparent ? 'none' : p.background,
    foreground: p.foreground,
    groups,
  };
  return { kind: 'marks', set };
}

function runScreen(lum: LumImage, screen: ScreenKind, cache?: Cache): Sample[] {
  switch (screen.kind) {
    case 'grid': return gridScreen(lum, screen);
    case 'hex': return hexScreen(lum, screen);
    case 'radial':
      return radialScreen(lum, screen);
    case 'poisson':
      return poissonScreen(lum, screen.poisson);
    case 'stipple': {
      // Blue-noise mask only matters for the 'blue-noise' dither option, but
      // generating a fixed 64² mask is cheap + cached, so always supply it.
      const ms = 64;
      const mask = cache
        ? cache.get<BlueNoiseMask>(`bluenoise:${ms}`, `${ms}`, () =>
            generateBlueNoiseMask({ size: ms, sigma: 1.5, seed: 1, initialDensity: 0.1 }))
        : generateBlueNoiseMask({ size: ms, sigma: 1.5, seed: 1, initialDensity: 0.1 });
      return stippleScreen(lum, screen.stipple, mask);
    }
    case 'reaction-diffusion': {
      // RD field is independent of source; cache by pattern+iters+size+seed.
      const fieldKey = `${screen.pattern}|${screen.iterations}|${screen.gridSize}|${screen.rd.seed}`;
      const field = cache
        ? cache.get<RdField>('rd-field', fieldKey, () => simulatePattern({
            pattern: screen.pattern,
            iterations: screen.iterations,
            size: screen.gridSize,
            seed: screen.rd.seed,
          }))
        : simulatePattern({
            pattern: screen.pattern,
            iterations: screen.iterations,
            size: screen.gridSize,
            seed: screen.rd.seed,
          });
      return reactionDiffusionScreen(lum, field, screen.rd);
    }
  }
}

function runMarks(samples: Sample[], mark: MarkKind, edges?: LumImage): Mark[] {
  switch (mark.kind) {
    case 'circle': return samplesToCircles(samples, mark.params, edges);
    case 'square': return samplesToSquares(samples, mark.params);
    case 'diamond': return samplesToSquares(samples, mark.params);
    case 'line': return samplesToLineSegments(samples, mark.params);
    case 'blob': return samplesToBlobs(samples, mark.params, edges);
    case 'flow': return samplesToFlowStrokes(samples, mark.params);
    case 'glyph': return samplesToGlyphs(samples, mark.params);
  }
}

function markUsesEdges(mark: MarkKind): boolean {
  if (mark.kind === 'circle') return !!mark.params.edgeAwareStrength;
  if (mark.kind === 'blob') return !!mark.params.edgeAwareStrength;
  return false;
}

function pickCmykChannel(sep: CmykSeparation, key: ChannelConfig['key']): LumImage {
  if (key === 'C') return sep.c;
  if (key === 'M') return sep.m;
  if (key === 'Y') return sep.y;
  return sep.k;
}

function invertWithAdjust(ink: LumImage, a: AdjustParams): LumImage {
  const out = new Float32Array(ink.data.length);
  const cFactor = (1 + a.contrast) / Math.max(1e-6, 1 - a.contrast);
  const invGamma = 1 / Math.max(1e-6, a.gamma);
  for (let i = 0; i < ink.data.length; i++) {
    let v = ink.data[i] - a.brightness;
    v = (v - 0.5) * cFactor + 0.5;
    v = v <= 0 ? 0 : v >= 1 ? 1 : Math.pow(v, invGamma);
    v = a.invert ? 1 - v : v;
    out[i] = 1 - v;
  }
  return { width: ink.width, height: ink.height, data: out };
}

function runDither(img: LumImage, d: RasterMode['dither']): LumImage {
  switch (d.kind) {
    case 'none': return img;
    case 'threshold': return threshold(img, d.t);
    case 'bayer': return bayer(img, d.size);
    case 'floyd': return floydSteinberg(img);
    case 'atkinson': return atkinson(img);
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

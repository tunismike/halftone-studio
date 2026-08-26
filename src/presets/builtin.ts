import { defaultAdjust } from '../engine/image/adjust';
import { defaultBlobParams } from '../engine/mark/blob';
import { defaultDotParams } from '../engine/mark/circle';
import { defaultFlowParams } from '../engine/mark/flow';
import { defaultGlyphParams } from '../engine/mark/glyph';
import { defaultLineParams } from '../engine/mark/line';
import { defaultSquareParams, defaultDiamondParams } from '../engine/mark/square';
import {
  defaultCmykMode,
  defaultSpotMode,
  type ModeKind,
} from '../engine/pipeline';
import { noWarp } from '../engine/screen/warp';
import { PATTERN_PRESETS } from '../engine/screen/pattern-presets';
import { defaultPatternVector } from '../engine/export/pattern-output';
import type { Preset } from './types';

const std = (mode: ModeKind, overrides: Partial<Preset> = {}): Omit<Preset, 'id' | 'name' | 'category'> => ({
  adjust: { ...defaultAdjust },
  mode,
  background: '#ffffff',
  foreground: '#000000',
  transparent: false,
  ...overrides,
});

function vector(
  screen: Extract<ModeKind, { kind: 'vector' }>['screen'],
  mark: Extract<ModeKind, { kind: 'vector' }>['mark'],
  options: { warp?: Extract<ModeKind, { kind: 'vector' }>['warp']; stroke?: Extract<ModeKind, { kind: 'vector' }>['stroke'] } = {},
): ModeKind {
  return {
    kind: 'vector',
    screen,
    mark,
    warp: options.warp ?? { ...noWarp },
    stroke: options.stroke ?? { enabled: false, width: 1 },
  };
}


// Every pattern-screen preset is a gallery preset too. They share one source
// of truth so the mode panel's preset list and the gallery can never drift.
const PATTERN_SCREEN_PRESETS: Preset[] = PATTERN_PRESETS.map((p) => ({
  id: `screen-${p.id}`,
  name: p.name,
  category: 'screen' as const,
  ...std({
    kind: 'patternScreen',
    pattern: structuredClone(p.params),
    vector: { ...defaultPatternVector },
  }),
}));

export const BUILTIN_PRESETS: Preset[] = [
  ...PATTERN_SCREEN_PRESETS,
  // ── Grid family ──────────────────────────────────────────────
  {
    id: 'grid-dot-0',
    name: 'Dot grid',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams } },
    )),
  },
  {
    id: 'grid-dot-45',
    name: 'Dot grid 45°',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 45 },
      { kind: 'circle', params: { ...defaultDotParams } },
    )),
  },
  {
    id: 'grid-dot-bold',
    name: 'Dot grid bold',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 12, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 1.3 } },
    )),
  },
  {
    id: 'grid-dot-bold-45',
    name: 'Dot grid bold 45°',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 12, angleDeg: 45 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 1.3 } },
    )),
  },
  {
    // Screenprint-style: solid black in the shadows, halftone dots through the
    // mids, knocked out in the highlights. Reaches true solid black like a
    // dither, but stays vector. (Interpretation A.)
    id: 'grid-solid-ink',
    name: 'Solid-ink halftone',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 45 },
      { kind: 'circle', params: { ...defaultDotParams, solidAt: 0.18, dropAt: 0.9 } },
    )),
  },
  {
    id: 'grid-square',
    name: 'Square mosaic',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      { kind: 'square', params: { ...defaultSquareParams } },
    )),
  },
  {
    id: 'grid-diamond',
    name: 'Diamond mosaic',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      { kind: 'diamond', params: { ...defaultDiamondParams } },
    )),
  },
  {
    id: 'hex-dot',
    name: 'Hex grid dots',
    category: 'grid',
    ...std(vector(
      { kind: 'hex', cellSize: 10, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams } },
    )),
  },
  {
    id: 'radial-dot',
    name: 'Radial dots',
    category: 'grid',
    ...std(vector(
      { kind: 'radial', cellSize: 10, cxFrac: 0.5, cyFrac: 0.5 },
      { kind: 'circle', params: { ...defaultDotParams } },
    )),
  },

  // ── Line family ──────────────────────────────────────────────
  {
    id: 'line-vert',
    name: 'Vertical lines',
    category: 'line',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 90 },
      { kind: 'line', params: { ...defaultLineParams } },
    )),
  },
  {
    id: 'line-horiz',
    name: 'Horizontal lines',
    category: 'line',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 0 },
      { kind: 'line', params: { ...defaultLineParams } },
    )),
  },
  {
    id: 'line-45',
    name: 'Diagonal lines',
    category: 'line',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 45 },
      { kind: 'line', params: { ...defaultLineParams } },
    )),
  },
  {
    id: 'line-60',
    name: 'Steep lines',
    category: 'line',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 60 },
      { kind: 'line', params: { ...defaultLineParams } },
    )),
  },

  // ── Wave family ──────────────────────────────────────────────
  {
    id: 'wave-mesh',
    name: 'Mesh wave',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 8, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 0.9 } },
      { warp: { ...noWarp, waveAmp: 6, waveFreq: 0.04, wavePhase: 0 } },
    )),
  },
  {
    id: 'wave-dot-mesh',
    name: 'Dot mesh wave',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 1.1 } },
      { warp: { ...noWarp, waveAmp: 10, waveFreq: 0.03 } },
    )),
  },
  {
    id: 'wave-dot',
    name: 'Dot wave',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 1 } },
      { warp: { ...noWarp, waveAmp: 14, waveFreq: 0.025 } },
    )),
  },
  {
    id: 'wave-line-45',
    name: 'Line wave diagonal',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 45 },
      { kind: 'line', params: { ...defaultLineParams } },
      { warp: { ...noWarp, waveAmp: 12, waveFreq: 0.03 } },
    )),
  },
  {
    id: 'wave-line-vert',
    name: 'Line wave vertical',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 90 },
      { kind: 'line', params: { ...defaultLineParams } },
      { warp: { ...noWarp, waveAmp: 10, waveFreq: 0.03 } },
    )),
  },
  {
    id: 'wave-line-horiz',
    name: 'Line wave horizontal',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 0 },
      { kind: 'line', params: { ...defaultLineParams } },
      { warp: { ...noWarp, waveAmp: 10, waveFreq: 0.03 } },
    )),
  },

  // ── Stochastic family ────────────────────────────────────────
  {
    id: 'stoch-grain',
    name: 'Fine grain',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 2, maxRadius: 6, densityFromLum: true, seed: 1, k: 24 } },
      { kind: 'circle', params: { ...defaultDotParams, maxRatio: 0.6 } },
    )),
  },
  {
    id: 'stoch-pointillism',
    name: 'Pointillism',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 3, maxRadius: 10, densityFromLum: true, seed: 7, k: 24 } },
      { kind: 'circle', params: { ...defaultDotParams } },
    )),
  },
  {
    id: 'stoch-pointillism-fine',
    name: 'Pointillism fine',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 2, maxRadius: 5, densityFromLum: true, seed: 9, k: 24 } },
      { kind: 'circle', params: { ...defaultDotParams, maxRatio: 0.7 } },
    )),
  },
  {
    id: 'stoch-petroglyph',
    name: 'Petroglyph',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 3, maxRadius: 8, densityFromLum: true, seed: 3, k: 24 } },
      { kind: 'blob', params: { ...defaultBlobParams, jitter: 0.45, vertices: 7 } },
    )),
  },
  {
    id: 'stoch-pebbles',
    name: 'Pebbles',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 5, maxRadius: 14, densityFromLum: true, seed: 5, k: 24 } },
      { kind: 'blob', params: { ...defaultBlobParams, jitter: 0.25, vertices: 11 } },
    )),
  },
  {
    id: 'stoch-pavers',
    name: 'Pavers (outline)',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 5, maxRadius: 14, densityFromLum: true, seed: 11, k: 24 } },
      { kind: 'blob', params: { ...defaultBlobParams, jitter: 0.3, vertices: 9, gain: 1.4 } },
      { stroke: { enabled: true, width: 1.2 } },
    )),
  },
  {
    id: 'stoch-plasma',
    name: 'Plasma flow',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 3, maxRadius: 6, densityFromLum: true, seed: 13, k: 24 } },
      { kind: 'flow', params: { ...defaultFlowParams, gain: 1.4, noiseFreq: 0.03 } },
    )),
  },

  // ── Color (multi-ink) ────────────────────────────────────────
  {
    id: 'color-cmyk',
    name: 'CMYK rosette',
    category: 'color',
    ...std(defaultCmykMode()),
  },
  {
    id: 'color-duotone-blue-yellow',
    name: 'Duotone (blue/amber)',
    category: 'color',
    ...std(defaultSpotMode()),
  },
  {
    id: 'color-duotone-warm',
    name: 'Duotone (red/cream)',
    category: 'color',
    ...std({
      ...defaultSpotMode(),
      channels: [
        { name: 'red', color: '#b91c1c', enabled: true, angleDeg: 45, scale: 1 },
        { name: 'cream', color: '#fcd34d', enabled: true, angleDeg: 15, scale: 1 },
      ],
    } as ModeKind),
  },
  {
    id: 'color-riso-pink-blue',
    name: 'Riso pink + blue',
    category: 'color',
    ...std({
      ...defaultSpotMode(),
      baseCellSize: 6,
      channels: [
        { name: 'fluorescent-pink', color: '#ff48b0', enabled: true, angleDeg: 22, scale: 1 },
        { name: 'federal-blue', color: '#3d5588', enabled: true, angleDeg: 67, scale: 1 },
      ],
    } as ModeKind),
  },

  // ── Glyph showcase ───────────────────────────────────────────
  {
    id: 'glyph-star',
    name: 'Star stamp',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 14, angleDeg: 0 },
      {
        kind: 'glyph',
        params: {
          ...defaultGlyphParams,
          pathD: 'M 1 0 L 0.31 0.45 L 0.95 1.45 L 0.19 1.18 L 1 2 L 1.81 1.18 L 1.05 1.45 L 1.69 0.45 Z',
          viewBoxW: 2,
          viewBoxH: 2,
          gain: 1.1,
        },
      },
    )),
  },
  {
    id: 'grid-newsprint-coarse',
    name: 'Newsprint coarse',
    category: 'grid',
    ...std(vector(
      { kind: 'grid', cellSize: 18, angleDeg: 45 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 1.4, maxRatio: 1.15 } },
    )),
  },
  {
    id: 'stoch-star-field',
    name: 'Star field',
    category: 'stochastic',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 4, maxRadius: 10, densityFromLum: true, seed: 21, k: 24 } },
      {
        kind: 'glyph',
        params: {
          ...defaultGlyphParams,
          pathD: 'M 1 0 L 0.31 0.45 L 0.95 1.45 L 0.19 1.18 L 1 2 L 1.81 1.18 L 1.05 1.45 L 1.69 0.45 Z',
          viewBoxW: 2,
          viewBoxH: 2,
          gain: 1.2,
          maxRatio: 1.2,
        },
      },
    )),
  },
  {
    id: 'line-engraver',
    name: 'Engraver lines (30°)',
    category: 'line',
    ...std(vector(
      { kind: 'grid', cellSize: 4, angleDeg: 30 },
      { kind: 'line', params: { ...defaultLineParams, gain: 1.1 } },
    )),
  },
  {
    id: 'wave-swirl',
    name: 'Wave swirl',
    category: 'wave',
    ...std(vector(
      { kind: 'grid', cellSize: 9, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams, gain: 1.1 } },
      { warp: {
        waveAmp: 9, waveFreq: 0.05, wavePhase: 0,
        noiseAmp: 6, noiseFreq: 0.025, noiseSeed: 19, resample: true,
      } },
    )),
  },

  // ── Palette dither family ────────────────────────────────────
  {
    id: 'pal-handheld-floyd',
    name: 'Handheld 4 (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'mono-handheld-green',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-handheld-bluenoise',
    name: 'Handheld 4 (blue noise)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'mono-handheld-green',
      metric: 'lab-de2000',
      algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.2 },
    } as ModeKind),
  },
  {
    id: 'pal-mono-atkinson',
    name: '1-bit Atkinson',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'mono-1bit',
      metric: 'linear-euclid',
      algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false },
    } as ModeKind),
  },
  {
    id: 'pal-c64-floyd',
    name: 'C64 16 (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-c64',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-nes-bluenoise',
    name: 'NES 64 (blue noise)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'console-nes-ntsc',
      metric: 'lab-de2000',
      algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.15 },
    } as ModeKind),
  },
  {
    id: 'pal-pico8-bayer',
    name: 'PICO-8 (Bayer 4×4)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'fantasy-pico8',
      metric: 'lab-de2000',
      algorithm: { kind: 'ordered-bayer', size: 4, amplitude: 0.2 },
    } as ModeKind),
  },
  {
    id: 'pal-zx-jjn',
    name: 'Speccy (Jarvis)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-zx',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'jjn', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-cga-stucki',
    name: 'CGA 4-color (Stucki)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'pc-cga-0-high',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'stucki', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-nord-riemersma',
    name: 'Nord (Riemersma)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'modern-nord',
      metric: 'lab-de2000',
      algorithm: { kind: 'riemersma', historyLen: 16, decay: 0.5 },
    } as ModeKind),
  },
  {
    id: 'pal-gruvbox-sierra',
    name: 'Gruvbox dark (Sierra)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'modern-gruvbox-dark',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'sierra-full', serpentine: true },
    } as ModeKind),
  },

  // ── Additional palette-dither variants ──────────────────────
  // Handheld
  {
    id: 'pal-gameboy-atkinson',
    name: 'Game Boy LCD',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'mono-handheld-green',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false },
    } as ModeKind),
  },
  // NES
  {
    id: 'pal-nes-floyd',
    name: 'NES (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'console-nes-ntsc',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-nes-riemersma',
    name: 'NES (Riemersma)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'console-nes-ntsc',
      metric: 'lab-de2000',
      algorithm: { kind: 'riemersma', historyLen: 16, decay: 0.5 },
    } as ModeKind),
  },
  // Master System
  {
    id: 'pal-master-system-bluenoise',
    name: 'Master System (blue noise)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'console-master-system',
      metric: 'lab-de2000',
      algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.15 },
    } as ModeKind),
  },
  // Atari 2600
  {
    id: 'pal-atari-bluenoise',
    name: 'Atari 2600 (blue noise)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'console-atari-2600-ntsc',
      metric: 'lab-de2000',
      algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.12 },
    } as ModeKind),
  },
  // C64
  {
    id: 'pal-c64-atkinson',
    name: 'C64 (Atkinson)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-c64',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false },
    } as ModeKind),
  },
  {
    id: 'pal-c64-bluenoise',
    name: 'C64 (blue noise)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-c64',
      metric: 'lab-de2000',
      algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.18 },
    } as ModeKind),
  },
  // ZX Spectrum
  {
    id: 'pal-zx-floyd',
    name: 'Speccy (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-zx',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-zx-atkinson',
    name: 'Speccy (Atkinson)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-zx',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false },
    } as ModeKind),
  },
  // Amstrad CPC
  {
    id: 'pal-cpc-floyd',
    name: 'CPC 27 (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-cpc',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  // MSX
  {
    id: 'pal-msx-floyd',
    name: 'MSX (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-msx1',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  // Apple II
  {
    id: 'pal-apple-ii-floyd',
    name: 'Apple II artifacts',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'micro-apple-ii-hgr',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  // CGA additional modes
  {
    id: 'pal-cga-1-high-floyd',
    name: 'CGA cyan/magenta (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'pc-cga-1-high',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-cga-mode5-atkinson',
    name: 'CGA mode 5 (Atkinson)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'pc-cga-mode-5',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false },
    } as ModeKind),
  },
  // PICO-8 additional
  {
    id: 'pal-pico8-floyd',
    name: 'PICO-8 (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'fantasy-pico8',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-pico8-riemersma',
    name: 'PICO-8 (Riemersma)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'fantasy-pico8',
      metric: 'lab-de2000',
      algorithm: { kind: 'riemersma', historyLen: 16, decay: 0.5 },
    } as ModeKind),
  },
  {
    id: 'pal-pico8-secret-floyd',
    name: 'PICO-8 secret (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'fantasy-pico8-secret',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  // Mac additional
  {
    id: 'pal-mac-floyd',
    name: '1-bit Floyd-Steinberg',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'mono-1bit',
      metric: 'linear-euclid',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-mac-bayer',
    name: '1-bit ordered (Bayer 8×8)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'mono-1bit',
      metric: 'linear-euclid',
      algorithm: { kind: 'ordered-bayer', size: 8, amplitude: 0.4 },
    } as ModeKind),
  },
  // Modern designer additions
  {
    id: 'pal-tokyo-night-floyd',
    name: 'Tokyo Night (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'modern-tokyo-night',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-solarized-floyd',
    name: 'Solarized (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'modern-solarized-dark',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  {
    id: 'pal-dracula-floyd',
    name: 'Dracula (Floyd)',
    category: 'palette',
    ...std({
      kind: 'paletteDither',
      paletteId: 'modern-dracula',
      metric: 'lab-de2000',
      algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
    } as ModeKind),
  },
  // ── Reaction-diffusion (image-driven contour strokes) ──────
  // All organic presets use the rdContour mode: the RD field is biased by
  // source luminance so the pattern's curves trace your image's silhouette.
  ...(([
    { id: 'rd-coral',       name: 'Coral',         pattern: 'coral' as const,        textureScale: 0.30, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-coral-multi', name: 'Coral (multi)', pattern: 'coral' as const,        textureScale: 0.30, levels: 10, sourceWeight: 1.8, strokeWidth: 1 },
    { id: 'rd-maze',        name: 'Maze',          pattern: 'maze' as const,         textureScale: 0.28, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-amoeba',      name: 'Amoeba',        pattern: 'amoeba' as const,       textureScale: 0.25, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-reptile',     name: 'Reptile',       pattern: 'reptile' as const,      textureScale: 0.32, levels: 6, sourceWeight: 1.8, strokeWidth: 1 },
    { id: 'rd-fingerprint', name: 'Fingerprint',   pattern: 'fingerprint' as const,  textureScale: 0.40, levels: 8, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-network',     name: 'Network',       pattern: 'network' as const,      textureScale: 0.28, levels: 6, sourceWeight: 2,   strokeWidth: 0.75 },
    { id: 'rd-waves',       name: 'Wave ridges',   pattern: 'waves' as const,        textureScale: 0.22, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-seismic',     name: 'Seismic',       pattern: 'seismic' as const,      textureScale: 0.22, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-wormy',       name: 'Wormy',         pattern: 'wormy' as const,        textureScale: 0.32, levels: 6, sourceWeight: 1.8, strokeWidth: 1 },
    { id: 'rd-squiggles',   name: 'Squiggles',     pattern: 'squiggles' as const,    textureScale: 0.28, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-zigzag',      name: 'Zig zag',       pattern: 'zig-zag' as const,      textureScale: 0.30, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-gator-skin',  name: 'Gator skin',    pattern: 'gator-skin' as const,   textureScale: 0.30, levels: 6, sourceWeight: 1.8, strokeWidth: 1 },
    { id: 'rd-leafy',       name: 'Leafy',         pattern: 'leafy' as const,        textureScale: 0.28, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-spirals',     name: 'Spirals',       pattern: 'spirals' as const,      textureScale: 0.24, levels: 6, sourceWeight: 2,   strokeWidth: 1 },
    { id: 'rd-gravel',      name: 'Gravel',        pattern: 'gravel' as const,       textureScale: 0.35, levels: 8, sourceWeight: 2,   strokeWidth: 0.75 },
  ]).map((preset): Preset => ({
    id: preset.id,
    name: preset.name,
    category: 'organic',
    ...std({
      kind: 'rdContour',
      params: {
        pattern: preset.pattern,
        iterations: 4000,
        gridSize: 128,
        seed: 1,
        textureScale: preset.textureScale,
        levels: preset.levels,
        strokeWidth: preset.strokeWidth,
        invert: false,
        rotationDeg: 0,
        sourceWeight: preset.sourceWeight,
        sourceMidpoint: 0.5,
      },
    } as ModeKind),
  }))),

  // ── RD contour-stroke presets (the pattern *is* the strokes) ───
  {
    id: 'rdc-coral-strokes',
    name: 'Coral strokes',
    category: 'organic',
    ...std({
      kind: 'rdContour',
      params: {
        pattern: 'coral', iterations: 4000, gridSize: 128, seed: 1,
        textureScale: 0.3, levels: 3, strokeWidth: 1, rotationDeg: 0, invert: false,
      },
    } as ModeKind),
  },
  {
    id: 'rdc-maze-strokes',
    name: 'Maze strokes',
    category: 'organic',
    ...std({
      kind: 'rdContour',
      params: {
        pattern: 'maze', iterations: 4000, gridSize: 128, seed: 1,
        textureScale: 0.28, levels: 3, strokeWidth: 1, rotationDeg: 0, invert: false,
      },
    } as ModeKind),
  },
  {
    id: 'rdc-fingerprint-strokes',
    name: 'Fingerprint strokes',
    category: 'organic',
    ...std({
      kind: 'rdContour',
      params: {
        pattern: 'fingerprint', iterations: 5000, gridSize: 128, seed: 1,
        textureScale: 0.35, levels: 3, strokeWidth: 1, rotationDeg: 0, invert: false,
      },
    } as ModeKind),
  },
  {
    id: 'rdc-reptile-strokes',
    name: 'Reptile strokes',
    category: 'organic',
    ...std({
      kind: 'rdContour',
      params: {
        pattern: 'reptile', iterations: 4000, gridSize: 128, seed: 1,
        textureScale: 0.32, levels: 3, strokeWidth: 0.75, rotationDeg: 0, invert: false,
      },
    } as ModeKind),
  },
  {
    id: 'rdc-network-strokes',
    name: 'Network strokes',
    category: 'organic',
    ...std({
      kind: 'rdContour',
      params: {
        pattern: 'network', iterations: 4000, gridSize: 128, seed: 1,
        textureScale: 0.28, levels: 3, strokeWidth: 0.75, rotationDeg: 0, invert: false,
      },
    } as ModeKind),
  },

  // ── Distress variants of existing looks ─────────────────────
  {
    id: 'distress-dot-grid-erode',
    name: 'Gritty dot grid',
    category: 'distress',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      {
        kind: 'circle',
        params: {
          ...defaultDotParams,
          distress: { strength: 0.6, seed: 7, mode: 'erode' },
        },
      },
    )),
  },
  {
    id: 'distress-line-break',
    name: 'Broken line halftone',
    category: 'distress',
    ...std(vector(
      { kind: 'grid', cellSize: 6, angleDeg: 45 },
      {
        kind: 'line',
        params: {
          ...defaultLineParams,
          distress: { strength: 0.35, seed: 12, mode: 'break' },
        },
      },
    )),
  },
  {
    id: 'distress-pebbles-erode',
    name: 'Eroded pebbles',
    category: 'distress',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 5, maxRadius: 14, densityFromLum: true, seed: 5, k: 24 } },
      {
        kind: 'blob',
        params: {
          ...defaultBlobParams,
          jitter: 0.3,
          vertices: 9,
          distress: { strength: 0.55, seed: 17, mode: 'erode' },
        },
      },
    )),
  },
  {
    id: 'distress-jitter-grid',
    name: 'Hand-stamped dots',
    category: 'distress',
    ...std(vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      {
        kind: 'circle',
        params: {
          ...defaultDotParams,
          distress: { strength: 0.4, seed: 3, mode: 'jitter' },
        },
      },
    )),
  },
  {
    id: 'distress-stochastic-break',
    name: 'Distressed grain',
    category: 'distress',
    ...std(vector(
      { kind: 'poisson', poisson: { minRadius: 3, maxRadius: 8, densityFromLum: true, seed: 1, k: 24 } },
      {
        kind: 'circle',
        params: {
          ...defaultDotParams,
          maxRatio: 0.7,
          distress: { strength: 0.5, seed: 9, mode: 'break' },
        },
      },
    )),
  },

  // High-contrast newspaper photo dither
  {
    id: 'pal-newspaper-photo',
    name: 'Newspaper photo dither',
    category: 'palette',
    adjust: { brightness: 0, contrast: 0.35, invert: false, gamma: 1 },
    mode: {
      kind: 'paletteDither',
      paletteId: 'mono-1bit',
      metric: 'linear-euclid',
      algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false },
    },
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },

  // ── Print + texture combo presets ──────────────────────────
  {
    id: 'tex-cmyk-paper-grit',
    name: 'CMYK + paper grit',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: defaultCmykMode(),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'pulp-grain', source: 'bundled', blendMode: 'multiply', opacity: 0.35, scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-handheld-denim',
    name: 'Handheld + denim weave',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'mono-handheld-green', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'denim-twill', source: 'bundled', blendMode: 'multiply', opacity: 0.5, scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-coral-brush',
    name: 'Coral strokes + brush noise',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: { kind: 'rdContour', params: { pattern: 'coral', iterations: 4000, gridSize: 128, seed: 1, textureScale: 0.3, levels: 6, strokeWidth: 1, invert: false, rotationDeg: 0, sourceWeight: 2, sourceMidpoint: 0.5 } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'dry-brush', source: 'bundled', blendMode: 'multiply', opacity: 0.4, scale: 1.5, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-mac-paint-scuff',
    name: 'Mac Atkinson + paint scuff',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'mono-1bit', metric: 'linear-euclid', algorithm: { kind: 'error-diffusion', kernel: 'atkinson', serpentine: false } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'paint-flake', source: 'bundled', blendMode: 'screen', opacity: 0.5, scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-dot-newsprint',
    name: 'Dot grid + newsprint',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: vector({ kind: 'grid', cellSize: 10, angleDeg: 45 }, { kind: 'circle', params: { ...defaultDotParams } }),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'newsprint', source: 'bundled', blendMode: 'multiply', opacity: 0.4, scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-line-pen-hatch',
    name: 'Line halftone + pen hatch',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: vector({ kind: 'grid', cellSize: 6, angleDeg: 45 }, { kind: 'line', params: { ...defaultLineParams } }),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'pen-hatch', source: 'bundled', blendMode: 'multiply', opacity: 0.35, scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-c64-static',
    name: 'C64 + static dust',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'micro-c64', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'static-dust', source: 'bundled', blendMode: 'multiply', opacity: 0.3, scale: 1.5, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },
  {
    id: 'tex-stochastic-ink-fleck',
    name: 'Pointillism + ink fleck',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: vector(
      { kind: 'poisson', poisson: { minRadius: 3, maxRadius: 10, densityFromLum: true, seed: 7, k: 24 } },
      { kind: 'circle', params: { ...defaultDotParams } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'ink-fleck', source: 'bundled', blendMode: 'darken', opacity: 0.5, scale: 1.2, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false },
  },

  // ── v3.0 showcase presets ────────────────────────────────────────────

  // Tritone (3 zones)
  {
    id: 'tonal-cool-tritone',
    name: 'Cool tritone',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'tonal', bandCount: 3, bandColors: ['#0a0a2a', '#5a73a8', '#f4f4ff'], metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true } } as ModeKind,
    background: '#0a0a2a',
    foreground: '#f4f4ff',
    transparent: false,
  },
  {
    id: 'tonal-warm-tritone',
    name: 'Warm tritone',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'tonal', bandCount: 3, bandColors: ['#2a0f08', '#c87a3a', '#fde6c0'], metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'jjn', serpentine: true } } as ModeKind,
    background: '#fde6c0',
    foreground: '#2a0f08',
    transparent: false,
  },
  {
    id: 'tonal-skull-blue',
    name: 'Skull blue stipple',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'tonal', bandCount: 1, bandColors: ['#7a8cf0'], metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true } } as ModeKind,
    background: '#000000',
    foreground: '#7a8cf0',
    transparent: false,
  },
  {
    id: 'tonal-mono-print',
    name: 'Mono print bayer',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'tonal', bandCount: 1, bandColors: ['#111111'], metric: 'lab-de2000', algorithm: { kind: 'ordered-bayer', size: 8, amplitude: 0.2 } } as ModeKind,
    background: '#ffffff',
    foreground: '#111111',
    transparent: false,
  },
  {
    id: 'tonal-five-band-sunset',
    name: 'Five-band sunset',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'tonal', bandCount: 5, bandColors: ['#1a0033', '#5a1a4d', '#c7416a', '#f48c5e', '#ffe9b3'], metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'stucki', serpentine: true } } as ModeKind,
    background: '#1a0033',
    foreground: '#ffe9b3',
    transparent: false,
  },

  // Bi-Thread kernel showcases
  {
    id: 'bithread-stevenson-arce',
    name: 'Stevenson-Arce coarse',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'mono-1bit', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'stevenson-arce', serpentine: true } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'bithread-shiau-fan',
    name: 'Shiau-Fan sharp',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'mono-1bit', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'shiau-fan', serpentine: true } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'bithread-pigeon',
    name: 'Pigeon hybrid',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'console-nes-ntsc', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'pigeon', serpentine: true } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'bithread-stevenson-color',
    name: 'Stevenson-Arce + C64',
    category: 'palette',
    adjust: { ...defaultAdjust },
    mode: { kind: 'paletteDither', paletteId: 'micro-c64', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'stevenson-arce', serpentine: true } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },

  // New texture combos (cellular + binarized + cracks)
  {
    id: 'tex-vector-gator-skin',
    name: 'Vector + gator skin',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: vector(
      { kind: 'grid', cellSize: 8, angleDeg: 45 },
      { kind: 'circle', params: { ...defaultDotParams } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'gator-skin', source: 'bundled', blendMode: 'multiply', opacity: 0.55, scale: 1.2, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false, contrast: 1.8, threshold: 0.5 },
  },
  {
    id: 'tex-plastisol-crack-print',
    name: 'Plastisol crack print',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: vector(
      { kind: 'grid', cellSize: 10, angleDeg: 0 },
      { kind: 'circle', params: { ...defaultDotParams } },
    ),
    background: '#ffffff',
    foreground: '#1a1a1a',
    transparent: false,
    textureOverlay: { textureId: 'plastisol-crack', source: 'bundled', blendMode: 'screen', opacity: 0.7, scale: 1.5, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false, contrast: 1.5, threshold: 0.5 },
  },
  {
    id: 'tex-spot-fiberglass',
    name: 'Spot duotone + fiberglass',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: defaultSpotMode(),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'fiberglass', source: 'bundled', blendMode: 'multiply', opacity: 0.45, scale: 1.3, offsetX: 0, offsetY: 0, rotationDeg: 90, invert: false, contrast: 1.2, threshold: 0.5 },
  },

  // Preprocess showcases (Levels/Sharpen on photo input)
  {
    id: 'pre-high-contrast-newsprint',
    name: 'High-contrast newsprint',
    category: 'color',
    adjust: { ...defaultAdjust },
    preprocess: { blurRadius: 0, sharpenStrength: 0.6, sharpenRadius: 2, denoiseNoise: 0, blackPoint: 30, whitePoint: 220, midGamma: 0.85 },
    mode: { kind: 'paletteDither', paletteId: 'mono-1bit', metric: 'lab-de2000', algorithm: { kind: 'error-diffusion', kernel: 'jjn', serpentine: true } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'pre-soft-grain-photo',
    name: 'Soft grain photo',
    category: 'color',
    adjust: { ...defaultAdjust },
    preprocess: { blurRadius: 1.2, sharpenStrength: 0, sharpenRadius: 1, denoiseNoise: 35, blackPoint: 10, whitePoint: 240, midGamma: 1 },
    mode: { kind: 'paletteDither', paletteId: 'console-nes-ntsc', metric: 'lab-de2000', algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.2 } } as ModeKind,
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'tex-binarized-beatgrit',
    name: 'Vector + beatgrit',
    category: 'texture',
    adjust: { ...defaultAdjust },
    mode: vector(
      { kind: 'grid', cellSize: 8, angleDeg: 22.5 },
      { kind: 'circle', params: { ...defaultDotParams } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
    textureOverlay: { textureId: 'beatgrit', source: 'bundled', blendMode: 'multiply', opacity: 0.5, scale: 1.4, offsetX: 0, offsetY: 0, rotationDeg: 0, invert: false, contrast: 2.5, threshold: 0.5 },
  },

  // Stipple styles — Inkwell / Structured / Clean Machine
  {
    id: 'stipple-inkwell',
    name: 'Stipple: Inkwell',
    category: 'stochastic',
    adjust: { ...defaultAdjust },
    mode: vector(
      // Blue-noise stipple: every cell evaluated against the void-and-cluster
      // threshold, so detail down to the pitch is preserved. Slightly raised
      // gamma + jitter gives the organic ink-spray feel.
      { kind: 'stipple', stipple: { pitch: 3, jitter: 0.8, dither: 'floyd', contrast: 0 } },
      { kind: 'circle', params: { gain: 0, minRatio: 0, maxRatio: 1, fixedRadius: 1.4, distress: { strength: 0.4, seed: 3, mode: 'jitter' } } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'stipple-structured',
    name: 'Stipple: Structured',
    category: 'stochastic',
    adjust: { ...defaultAdjust },
    mode: vector(
      // Uniform fixed-size dots; density tracks tone via blue-noise threshold.
      { kind: 'stipple', stipple: { pitch: 2.5, jitter: 0.5, dither: 'blue-noise', contrast: 0 } },
      { kind: 'circle', params: { gain: 0, minRatio: 0, maxRatio: 1, fixedRadius: 1.1 } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'stipple-fine-detail',
    name: 'Stipple: Fine detail',
    category: 'stochastic',
    adjust: { ...defaultAdjust },
    mode: vector(
      // Tight pitch + small dots for maximum detail retention.
      { kind: 'stipple', stipple: { pitch: 2, jitter: 0.35, dither: 'atkinson', contrast: 0 } },
      { kind: 'circle', params: { gain: 0, minRatio: 0, maxRatio: 1, fixedRadius: 1 } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
  {
    id: 'stipple-clean-machine',
    name: 'Stipple: Clean Machine',
    category: 'grid',
    adjust: { ...defaultAdjust },
    mode: vector(
      { kind: 'grid', cellSize: 8, angleDeg: 45 },
      { kind: 'circle', params: { ...defaultDotParams } },
    ),
    background: '#ffffff',
    foreground: '#000000',
    transparent: false,
  },
];

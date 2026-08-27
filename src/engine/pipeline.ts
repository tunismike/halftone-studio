import { type AdjustParams } from './image/adjust';
import { defaultPreprocess, type PreprocessParams } from './image/preprocess';
import type { RgbaImage } from './image/types';
import type { DitherKind } from './dither';
import type { PoissonParams } from './screen/poisson';
import { noWarp, type WarpParams } from './screen/warp';
import { defaultDotParams, type DotParams } from './mark/circle';
import { defaultLineParams, type LineParams } from './mark/line';
import { defaultBlobParams, type BlobParams } from './mark/blob';
import { defaultFlowParams, type FlowParams } from './mark/flow';
import { defaultGlyphParams, type GlyphParams } from './mark/glyph';
import { defaultSquareParams, defaultDiamondParams, type SquareParams } from './mark/square';
import { defaultRegistration, type RegistrationParams } from './mark/registration';
import { defaultRdScreenParams, type RdScreenParams } from './screen/reaction-diffusion-screen';
import { defaultStippleParams, type StippleParams } from './screen/stipple';
import { defaultRdContourParams, type RdContourParams } from './mode/rd-contour';
import { defaultPatternScreen, printShaping, type PatternScreenParams } from './screen/pattern-field';
import { defaultPatternVector, type PatternVectorParams } from './export/pattern-output';
import { defaultTraceOptions } from './trace/trace';
import type { TextureOverlay } from './texture/types';
import type { MaskOverlay } from './mask/types';
import type { LayeredComposition } from './layer/types';
import type { PatternId } from './noise/reaction-diffusion';
import type { ColorMetric } from './color/palette';
import type { KernelId } from './dither/kernels';

export type ScreenKind =
  | { kind: 'grid'; cellSize: number; angleDeg: number }
  | { kind: 'hex'; cellSize: number; angleDeg: number }
  | { kind: 'radial'; cellSize: number; cxFrac: number; cyFrac: number }
  | { kind: 'poisson'; poisson: PoissonParams }
  | { kind: 'stipple'; stipple: StippleParams }
  | {
      kind: 'reaction-diffusion';
      pattern: PatternId;
      iterations: number;
      gridSize: number;
      rd: RdScreenParams;
    };

export type MarkKind =
  | { kind: 'circle'; params: DotParams }
  | { kind: 'square'; params: SquareParams }
  | { kind: 'diamond'; params: SquareParams }
  | { kind: 'line'; params: LineParams }
  | { kind: 'blob'; params: BlobParams }
  | { kind: 'flow'; params: FlowParams }
  | { kind: 'glyph'; params: GlyphParams };

export interface StrokeStyle {
  enabled: boolean;
  width: number;
}

export const defaultStroke: StrokeStyle = { enabled: false, width: 1 };

export interface ChannelConfig {
  key: 'C' | 'M' | 'Y' | 'K';
  enabled: boolean;
  angleDeg: number;
  scale: number;
  color: string;
  /**
   * Print this ink solid instead of screening it (pattern screens only).
   *
   * A halftone reproduces continuous tone. Line art has none — so screening a
   * drawing's black plate does not reproduce it, it shatters it, and the
   * result reads as a pattern laid over the artwork rather than as the artwork
   * printed. Which is exactly why line-and-tint printing has always run the
   * black plate solid and screened only the colour behind it.
   */
  solid?: boolean;
}

export interface SpotChannel {
  name: string;
  color: string;
  enabled: boolean;
  angleDeg: number;
  scale: number;
  /** Print this ink solid instead of screening it (pattern screens only). */
  solid?: boolean;
}

export type PaletteAlgorithm =
  | { kind: 'error-diffusion'; kernel: KernelId; serpentine: boolean }
  | { kind: 'riemersma'; historyLen: number; decay: number }
  | { kind: 'ordered-bayer'; size: 2 | 4 | 8; amplitude: number }
  | { kind: 'ordered-bluenoise'; size: number; amplitude: number }
  | { kind: 'knuth' };

/**
 * Which inks a pattern screen lays down.
 *
 * `mono` screens luminance into one ink. Anything colour has to separate
 * first and screen each ink at its own angle, or the hues collapse into each
 * other on the way to a single channel.
 */
export type PatternInks =
  | { kind: 'mono' }
  | { kind: 'cmyk'; channels: ChannelConfig[]; blackGamma?: number }
  | { kind: 'spot'; channels: SpotChannel[] }
  /**
   * Gradient map to an ordered palette, dithered by the screen.
   *
   * Not a separation at all — the opposite idea. Rather than splitting the
   * image into inks that overprint, luminance is mapped onto a ramp of
   * colours, darkest first, and the field decides the handoff between each
   * adjacent pair: a pixel sitting 30% of the way from one colour to the next
   * takes the next one wherever the threshold falls below 0.30. So the
   * transitions are halftoned while each band stays a flat spot colour, which
   * is what makes the look printable in N screens of solid ink.
   */
  | { kind: 'palette'; colors: string[] };

export const defaultPatternInks: PatternInks = { kind: 'mono' };

export function defaultPatternCmyk(): PatternInks {
  return {
    kind: 'cmyk',
    // Black pulled well back by default. Screening a maximum-GCR separation
    // puts black dots over every colour in the image, which is the single
    // thing that makes a colour halftone read as an overlay.
    blackGamma: 2.2,
    channels: [
      { key: 'C', enabled: true, angleDeg: 15, scale: 1, color: '#00aaee' },
      { key: 'M', enabled: true, angleDeg: 75, scale: 1, color: '#e6008c' },
      { key: 'Y', enabled: true, angleDeg: 0, scale: 1, color: '#ffd000' },
      // The line plate runs solid: it carries the drawing, not a tone.
      { key: 'K', enabled: true, angleDeg: 45, scale: 1, color: '#111111', solid: true },
    ],
  };
}

export function defaultPatternPalette(): PatternInks {
  // Dark to light. Shadows take the first colour, highlights the last.
  return { kind: 'palette', colors: ['#101020', '#2a3ea8', '#e0338c', '#f5d020'] };
}

export function defaultPatternSpot(): PatternInks {
  return {
    kind: 'spot',
    channels: [
      { name: 'ink-1', color: '#1d4ed8', enabled: true, angleDeg: 45, scale: 1 },
      { name: 'ink-2', color: '#f59e0b', enabled: true, angleDeg: 15, scale: 1 },
    ],
  };
}

export type ModeKind =
  | { kind: 'raster'; dither: DitherKind }
  | {
      kind: 'vector';
      screen: ScreenKind;
      mark: MarkKind;
      warp: WarpParams;
      stroke: StrokeStyle;
    }
  | {
      kind: 'cmyk';
      baseCellSize: number;
      dot: DotParams;
      warp: WarpParams;
      channels: ChannelConfig[];
      registration: boolean;
      registrationParams: RegistrationParams;
    }
  | {
      kind: 'spot';
      baseCellSize: number;
      dot: DotParams;
      warp: WarpParams;
      channels: SpotChannel[];
      registration: boolean;
      registrationParams: RegistrationParams;
    }
  | {
      kind: 'paletteDither';
      paletteId: string;
      metric: ColorMetric;
      algorithm: PaletteAlgorithm;
    }
  | {
      kind: 'tonal';
      bandCount: 1 | 2 | 3 | 4 | 5;
      bandColors: string[];
      metric: ColorMetric;
      algorithm: PaletteAlgorithm;
    }
  | {
      kind: 'rdContour';
      params: RdContourParams;
    }
  | {
      kind: 'patternScreen';
      pattern: PatternScreenParams;
      /** Which inks to lay down. Separation happens before screening. */
      inks: PatternInks;
      // Kept beside `pattern` rather than inside it: these only affect vector
      // export, and folding them in would invalidate the raster cache on every
      // simplify-tolerance nudge.
      vector: PatternVectorParams;
    }
  | {
      kind: 'trace';
      trace: import('./trace/trace').TraceOptions;
    };

export type ResamplingMode = 'nearest' | 'bilinear' | 'bicubic';

export interface PipelineParams {
  adjust: AdjustParams;
  preprocess?: PreprocessParams;
  mode: ModeKind;
  background: string;
  foreground: string;
  transparent: boolean;
  textureOverlay?: TextureOverlay;
  maskOverlay?: MaskOverlay;
  superSample?: boolean;
  resampling?: ResamplingMode;
  /**
   * Intended printed width, in inches. Purely a unit of account: it turns the
   * source's pixel width into an output DPI, which is what lets a screen be
   * specified in LPI the way a print shop actually specifies one. Nothing in
   * the render pipeline reads it.
   */
  outputWidthInches?: number;
  /** When present, render a layered composition instead of the single mode. */
  composition?: LayeredComposition;
}

export { defaultPreprocess };
export type { PreprocessParams };

export const defaultMode: ModeKind = { kind: 'raster', dither: { kind: 'floyd' } };

export function defaultGridScreen(cellSize = 10, angleDeg = 45): ScreenKind {
  return { kind: 'grid', cellSize, angleDeg };
}

export function defaultHexScreen(cellSize = 10, angleDeg = 0): ScreenKind {
  return { kind: 'hex', cellSize, angleDeg };
}

export function defaultRadialScreen(cellSize = 10): ScreenKind {
  return { kind: 'radial', cellSize, cxFrac: 0.5, cyFrac: 0.5 };
}

export function defaultPoissonScreen(): ScreenKind {
  return {
    kind: 'poisson',
    poisson: { minRadius: 4, maxRadius: 14, densityFromLum: true, seed: 1, k: 24 },
  };
}

export function defaultStippleScreen(): ScreenKind {
  return { kind: 'stipple', stipple: { ...defaultStippleParams } };
}

export function defaultRdScreen(pattern: PatternId = 'coral', iterations = 4000): ScreenKind {
  return {
    kind: 'reaction-diffusion',
    pattern,
    iterations,
    gridSize: 128,
    rd: { ...defaultRdScreenParams },
  };
}

export function defaultVectorMode(): ModeKind {
  return {
    kind: 'vector',
    screen: defaultGridScreen(),
    mark: { kind: 'circle', params: { ...defaultDotParams } },
    warp: { ...noWarp },
    stroke: { ...defaultStroke },
  };
}

export function makeMark(kind: MarkKind['kind']): MarkKind {
  switch (kind) {
    case 'circle': return { kind, params: { ...defaultDotParams } };
    case 'square': return { kind, params: { ...defaultSquareParams } };
    case 'diamond': return { kind, params: { ...defaultDiamondParams } };
    case 'line': return { kind, params: { ...defaultLineParams } };
    case 'blob': return { kind, params: { ...defaultBlobParams } };
    case 'flow': return { kind, params: { ...defaultFlowParams } };
    case 'glyph': return { kind, params: { ...defaultGlyphParams } };
  }
}

export function defaultCmykMode(): ModeKind {
  return {
    kind: 'cmyk',
    baseCellSize: 8,
    dot: { ...defaultDotParams },
    warp: { ...noWarp },
    channels: [
      { key: 'C', enabled: true, angleDeg: 15, scale: 1, color: '#00aaee' },
      { key: 'M', enabled: true, angleDeg: 75, scale: 1, color: '#e6008c' },
      { key: 'Y', enabled: true, angleDeg: 0, scale: 1, color: '#ffd000' },
      { key: 'K', enabled: true, angleDeg: 45, scale: 1, color: '#111111' },
    ],
    registration: false,
    registrationParams: { ...defaultRegistration },
  };
}

export function defaultRdContourMode(): ModeKind {
  return {
    kind: 'rdContour',
    params: { ...defaultRdContourParams },
  };
}

export function defaultPatternScreenMode(): ModeKind {
  return {
    kind: 'patternScreen',
    pattern: {
      ...defaultPatternScreen,
      warp: { ...defaultPatternScreen.warp },
      shaping: { ...printShaping },
    },
    inks: { ...defaultPatternInks },
    vector: { ...defaultPatternVector },
  };
}

export function defaultTraceMode(): ModeKind {
  return { kind: 'trace', trace: { ...defaultTraceOptions } };
}

export function defaultPaletteDitherMode(): ModeKind {
  return {
    kind: 'paletteDither',
    paletteId: 'micro-c64',
    metric: 'lab-de2000',
    algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
  };
}

export function defaultTonalMode(): ModeKind {
  return {
    kind: 'tonal',
    bandCount: 3,
    bandColors: ['#1a1a3a', '#7a7ab0', '#f0f0ff'],
    metric: 'lab-de2000',
    algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true },
  };
}

// Build a grayscale ramp of N colors from black to white. Used when the
// user bumps the band count and we need to fill new slots.
export function defaultTonalRamp(n: number): string[] {
  if (n <= 1) return ['#ffffff'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.round((i / (n - 1)) * 255);
    const h = v.toString(16).padStart(2, '0');
    out.push(`#${h}${h}${h}`);
  }
  return out;
}

export function defaultSpotMode(): ModeKind {
  return {
    kind: 'spot',
    baseCellSize: 8,
    dot: { ...defaultDotParams },
    warp: { ...noWarp },
    channels: [
      { name: 'ink-1', color: '#1d4ed8', enabled: true, angleDeg: 45, scale: 1 },
      { name: 'ink-2', color: '#f59e0b', enabled: true, angleDeg: 15, scale: 1 },
    ],
    registration: false,
    registrationParams: { ...defaultRegistration },
  };
}

export type { RgbaImage };

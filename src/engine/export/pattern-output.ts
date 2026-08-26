// Production output for pattern screens.
//
// Two guarantees this module exists to keep:
//
// 1. KNOCKOUT. A print PNG carries alpha of exactly 0 or exactly 255 and one
//    ink colour — no semi-transparent pixels, which DTF/DTG RIPs render as a
//    grey halo around every dot. Threshold output is already binary, so this
//    is a matter of not throwing the property away on the way out.
//
// 2. RESOLUTION. Tracing the preview-resolution mask would stair-step every
//    dot. We re-render the screen at a supersampled resolution, trace that,
//    and let the SVG viewBox scale it back — so the curves are as smooth as
//    the screen is fine, independent of the source image's pixel grid.

import {
  renderPatternScreen, coverageToMask,
  type CoverageMap, type PatternScreenParams, type PatternTile,
} from '../screen/pattern-field';
import { traceBinaryMask, douglasPeucker, loopToPathD, polygonArea } from '../trace/trace';
import { sampleBilinear } from '../image/sample';
import type { LumImage } from '../image/types';

export interface PatternVectorParams {
  /** Douglas-Peucker tolerance, in source pixels. */
  simplify: number;
  /** 0 = polygons, >0 = Catmull-Rom bézier tension. */
  smoothing: number;
  /** Drop islands smaller than this, in source px². Despeckle for print. */
  minFeature: number;
  /** Render the screen at this multiple of source resolution before tracing. */
  supersample: number;
}

export const defaultPatternVector: PatternVectorParams = {
  simplify: 0.8,
  smoothing: 0.35,
  minFeature: 1.5,
  supersample: 3,
};

/** Bilinear upscale of a luminance image. */
export function upscaleLum(src: LumImage, scale: number): LumImage {
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) / scale - 0.5;
    for (let x = 0; x < w; x++) {
      data[y * w + x] = sampleBilinear(src, (x + 0.5) / scale - 0.5, sy);
    }
  }
  return { width: w, height: h, data };
}

// Scale every length that is expressed in device pixels, so the screen keeps
// its physical size when rendered on a finer grid.
function scaleParams(p: PatternScreenParams, scale: number): PatternScreenParams {
  return {
    ...p,
    cellSize: p.cellSize * scale,
    warp: {
      ...p.warp,
      waveAmp: p.warp.waveAmp * scale,
      waveFreq: p.warp.waveFreq / scale,
      noiseAmp: p.warp.noiseAmp * scale,
      noiseFreq: p.warp.noiseFreq / scale,
    },
    // Tracing wants a crisp binary mask; antialiasing it would only be thrown
    // away by the threshold.
    softPreview: false,
  };
}

export interface PatternPaths {
  /** Path data in supersampled coordinates. */
  d: string;
  /** Width/height of that coordinate space. */
  width: number;
  height: number;
  loops: number;
}

export function patternToPaths(
  lum: LumImage,
  tile: PatternTile,
  p: PatternScreenParams,
  v: PatternVectorParams,
): PatternPaths {
  const scale = Math.max(1, Math.round(v.supersample));
  const big = scale === 1 ? lum : upscaleLum(lum, scale);
  const cov = renderPatternScreen(big, tile, scaleParams(p, scale));
  const mask = coverageToMask(cov);
  const loops = traceBinaryMask(mask, cov.width, cov.height);
  // Thresholds are in source units; the trace is in supersampled units.
  const minArea = v.minFeature * scale * scale;
  const tol = v.simplify * scale;
  const parts: string[] = [];
  let kept = 0;
  for (const loop of loops) {
    if (polygonArea(loop) < minArea) continue;
    const d = loopToPathD(douglasPeucker(loop, tol), v.smoothing);
    if (!d) continue;
    parts.push(d);
    kept++;
  }
  return { d: parts.join(' '), width: cov.width, height: cov.height, loops: kept };
}

export function patternToSvg(
  paths: PatternPaths,
  outWidth: number,
  outHeight: number,
  ink: string,
  background: string,
  transparent: boolean,
): string {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" ` +
      `viewBox="0 0 ${paths.width} ${paths.height}">`,
  ];
  if (!transparent && background !== 'none') {
    parts.push(`<rect width="${paths.width}" height="${paths.height}" fill="${background}"/>`);
  }
  // Even-odd so traced holes knock out of their enclosing contour — the shadow
  // end of a dot screen is nothing but holes.
  if (paths.d) parts.push(`<g fill="${ink}" fill-rule="evenodd"><path d="${paths.d}"/></g>`);
  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * Coverage → straight RGBA bytes with hard alpha.
 *
 * Deliberately does not go through a canvas: this is the one output where a
 * stray intermediate alpha is a defect rather than a nicety, so the bytes are
 * written directly and can be asserted on.
 */
export function coverageToKnockoutRgba(
  cov: CoverageMap,
  ink: { r: number; g: number; b: number },
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cov.width * cov.height * 4);
  for (let i = 0, j = 0; i < cov.data.length; i++, j += 4) {
    const on = cov.data[i] >= 128;
    out[j] = ink.r;
    out[j + 1] = ink.g;
    out[j + 2] = ink.b;
    out[j + 3] = on ? 255 : 0;
  }
  return out;
}

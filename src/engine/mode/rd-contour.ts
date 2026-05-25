// rdContour mode: trace the RD field at N iso-levels, mask each segment
// by source luminance, output as LineMarks. The RD pattern's *curves*
// become the ink strokes that render the source image.
//
// Halftone semantics: a contour at level L is visible at any point where
// source-lum < (1 - L). Low L (broad rings) → visible almost everywhere
// (sparse default). High L (peak rings) → visible only in dark areas
// (dense fill). Net effect: dark source regions show all levels (dense
// pattern); light regions show only the tightest peaks.

import { sampleBilinear } from '../image/sample';
import type { LumImage, RgbaImage } from '../image/types';
import type { LineMark, MarkSet } from '../mark/types';
import { marchingSquares } from '../screen/marching-squares';
import { rgbaToLum } from '../image/luminance';
import { adjust as applyAdjust, type AdjustParams } from '../image/adjust';
import { simulatePattern, type PatternId, type RdField } from '../noise/reaction-diffusion';

export interface RdContourParams {
  pattern: PatternId;
  iterations: number;
  gridSize: number;
  seed: number;
  textureScale: number;   // field-units per image-pixel; <1 zooms in on pattern
  levels: number;         // contour count around 0; 1 = pure silhouette
  strokeWidth: number;    // px
  invert: boolean;        // flip the lum→visibility mapping
  rotationDeg: number;
  sourceWeight: number;   // how strongly source modulates RD (1 = balanced; 2-4 = source dominates → image-shaped contours)
  sourceMidpoint: number; // 0..1; the lum value that maps to mid (above = ink off, below = ink on)
}

export const defaultRdContourParams: RdContourParams = {
  pattern: 'coral',
  iterations: 4000,
  gridSize: 128,
  seed: 1,
  textureScale: 0.18,
  levels: 6,
  strokeWidth: 1,
  invert: false,
  rotationDeg: 0,
  sourceWeight: 2,
  sourceMidpoint: 0.5,
};

export interface RdContourRun {
  field: RdField;
  lum: LumImage;
  marks: LineMark[];
}

export function runRdContour(
  src: RgbaImage,
  adjust: AdjustParams,
  field: RdField,
  p: RdContourParams,
): RdContourRun {
  const lumRaw = rgbaToLum(src);
  const lum = applyAdjust(lumRaw, adjust);
  const marks = traceRdContour(lum, field, p);
  return { field, lum, marks };
}

function traceRdContour(
  lum: LumImage,
  field: RdField,
  p: RdContourParams,
): LineMark[] {
  // Build a "combined" field at image resolution (downsampled if huge).
  // Each cell = rd(x, y) - sourceLum(x, y) where rd is sampled from the
  // tileable RD field at the cell's image-coordinate scaled by textureScale.
  // Marching squares on this combined field then produces contours that
  // intrinsically deform to follow image tonal silhouette.
  const WORK_MAX = 384; // marching squares is O(n²); cap working resolution
  const aspect = lum.width / lum.height;
  let workW: number;
  let workH: number;
  if (aspect >= 1) {
    workW = Math.min(lum.width, WORK_MAX);
    workH = Math.max(8, Math.round(workW / aspect));
  } else {
    workH = Math.min(lum.height, WORK_MAX);
    workW = Math.max(8, Math.round(workH * aspect));
  }

  const n = field.size;
  const theta = (p.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const sx = lum.width / workW;
  const sy = lum.height / workH;
  const halfW = lum.width / 2;
  const halfH = lum.height / 2;

  const combined = new Float32Array(workW * workH);
  for (let wy = 0; wy < workH; wy++) {
    const iy = (wy + 0.5) * sy;
    for (let wx = 0; wx < workW; wx++) {
      const ix = (wx + 0.5) * sx;
      // Map image coords → tiled RD field coords (rotated, scaled).
      const dx = ix - halfW;
      const dy = iy - halfH;
      let fx = (cos * dx - sin * dy) * p.textureScale + n / 2;
      let fy = (sin * dx + cos * dy) * p.textureScale + n / 2;
      // Wrap toroidally — RD field is tileable.
      fx = ((fx % n) + n) % n;
      fy = ((fy % n) + n) % n;
      const rd = sampleTileableField(field, fx, fy);
      const srcLum = sampleBilinear(lum, ix, iy);
      // Center source around midpoint and scale by sourceWeight so it can
      // out-weigh the RD field's natural variation. Result: contours bend
      // dramatically to follow image silhouette.
      const sw = p.sourceWeight ?? 2;
      const smid = p.sourceMidpoint ?? 0.5;
      const centered = srcLum - smid;
      const lumTerm = p.invert ? -centered * sw : centered * sw;
      combined[wy * workW + wx] = rd - 0.5 - lumTerm;
    }
  }

  // Trace at multiple levels bracketing zero so we get density variation.
  // halfRange must scale with sourceWeight: with sourceWeight=W, a pixel
  // whose source-lum is at the extreme shifts the combined-field by up to
  // W * 0.5. If we sweep levels only across ±0.15 then those extreme
  // regions never cross any contour — net result is "RD pattern only in
  // midtone bands, blank everywhere else". Sweep ±(W * 0.5) plus a small
  // base so each tone band has multiple contour levels passing through it
  // and the image's actual silhouette becomes visible.
  const out: LineMark[] = [];
  const sw = p.sourceWeight ?? 2;
  const halfRange = Math.max(0.2, sw * 0.5);
  const levelStep = p.levels > 1 ? (halfRange * 2) / (p.levels - 1) : 0;
  for (let li = 0; li < p.levels; li++) {
    const T = p.levels === 1 ? 0 : -halfRange + li * levelStep;
    const segments = marchingSquares(
      { width: workW, height: workH, values: combined },
      T,
    );
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      out.push({
        kind: 'line',
        x1: seg.x1 * sx,
        y1: seg.y1 * sy,
        x2: seg.x2 * sx,
        y2: seg.y2 * sy,
        width: p.strokeWidth,
      });
    }
  }
  return out;
}

function sampleTileableField(field: RdField, x: number, y: number): number {
  const n = field.size;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % n;
  const y1 = (y0 + 1) % n;
  const fx = x - x0;
  const fy = y - y0;
  const v = field.values;
  const a = v[y0 * n + x0];
  const b = v[y0 * n + x1];
  const c = v[y1 * n + x0];
  const d = v[y1 * n + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export function rdContourToMarkSet(
  src: RgbaImage,
  marks: LineMark[],
  background: string,
  foreground: string,
  transparent: boolean,
): MarkSet {
  return {
    width: src.width,
    height: src.height,
    background: transparent ? 'none' : background,
    foreground,
    groups: [{
      name: 'rd-contours',
      fill: 'none',
      stroke: foreground,
      strokeWidth: undefined,
      marks,
    }],
  };
}

// Re-export the simulator for cache wiring convenience.
export { simulatePattern };

// Binary line/edge mask for the "Lines + halftone" split: Sobel edge magnitude
// thresholded and dilated so line strokes are captured and connected. Used as a
// region mask — lines layer keeps these areas crisp (traced solid), the
// halftone layer screens everything else.

import { rgbaToLum } from './luminance';
import { computeEdges } from './edges';
import type { RgbaImage } from './types';

export interface LineMaskParams {
  threshold: number;  // edge magnitude (0..1) above which a pixel is "line"
  dilate: number;     // px to grow the mask (fill/connect strokes)
  darkBelow?: number; // luminance (0..1) at/under which a pixel is solid ink
}

export const defaultLineMaskParams: LineMaskParams = { threshold: 0.16, dilate: 2, darkBelow: 0.12 };

// "Ink" = strong edges (outlines) OR very dark pixels (solid fills). This keeps
// both thin strokes AND large solid-black areas crisp; only the mid-tone
// shading between is left for the halftone layer.
export function lineMask(src: RgbaImage, p: LineMaskParams = defaultLineMaskParams): Uint8Array {
  const w = src.width, h = src.height;
  const lum = rgbaToLum(src);
  const edges = computeEdges(lum);
  const bin = new Uint8Array(w * h);
  const t = Math.max(0, Math.min(1, p.threshold));
  const dark = Math.max(0, Math.min(1, p.darkBelow ?? 0.12));
  for (let i = 0; i < bin.length; i++) {
    bin[i] = edges.data[i] >= t || lum.data[i] <= dark ? 1 : 0;
  }
  const rad = Math.max(0, Math.round(p.dilate));
  return rad === 0 ? bin : dilate(bin, w, h, rad);
}

// Separable box dilation (max filter) by `rad`.
function dilate(mask: Uint8Array, w: number, h: number, rad: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dx = -rad; dx <= rad && !on; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w && mask[row + nx]) on = 1;
      }
      tmp[row + x] = on;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let on = 0;
      for (let dy = -rad; dy <= rad && !on; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h && tmp[ny * w + x]) on = 1;
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

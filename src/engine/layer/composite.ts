// Pure layer compositor. Stacks region-masked RGBA layers over a background
// using straight-alpha over-compositing with separable blend modes (W3C
// compositing model). Kept dependency-free so it's unit-testable; the worker
// supplies each layer's rendered RGBA + region mask.

import { hexToRgb } from '../color/srgb';
import type { LayerBlend } from './types';

export interface CompositeLayer {
  rgba: Uint8ClampedArray; // straight RGBA, same dimensions as output
  mask: Float32Array;      // 0..1 region alpha, length = w*h
  blend: LayerBlend;
  opacity: number;         // 0..1
}

function blendChannel(mode: LayerBlend, cb: number, cs: number): number {
  switch (mode) {
    case 'multiply': return cb * cs;
    case 'screen': return cb + cs - cb * cs;
    case 'darken': return Math.min(cb, cs);
    case 'lighten': return Math.max(cb, cs);
    default: return cs; // normal
  }
}

export function compositeLayers(
  width: number,
  height: number,
  background: string,
  transparent: boolean,
  layers: CompositeLayer[],
): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);

  // Initialize the backdrop.
  let bgR = 0, bgG = 0, bgB = 0, bgA = 0;
  if (!transparent) {
    const c = hexToRgb(background);
    bgR = c.r; bgG = c.g; bgB = c.b; bgA = 1; // hexToRgb returns 0..1
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[j] = bgR * 255; out[j + 1] = bgG * 255; out[j + 2] = bgB * 255; out[j + 3] = bgA * 255;
  }

  for (const layer of layers) {
    const { rgba, mask, blend } = layer;
    const op = Math.max(0, Math.min(1, layer.opacity));
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const as = (rgba[j + 3] / 255) * mask[i] * op; // source alpha after region+opacity
      if (as <= 0) continue;
      const sr = rgba[j] / 255, sg = rgba[j + 1] / 255, sb = rgba[j + 2] / 255;
      const dr = out[j] / 255, dg = out[j + 1] / 255, db = out[j + 2] / 255;
      const ab = out[j + 3] / 255;

      // Source color adjusted by backdrop per blend mode (W3C).
      const cr = (1 - ab) * sr + ab * blendChannel(blend, dr, sr);
      const cg = (1 - ab) * sg + ab * blendChannel(blend, dg, sg);
      const cb = (1 - ab) * sb + ab * blendChannel(blend, db, sb);

      const ao = as + ab * (1 - as);
      if (ao <= 0) { out[j + 3] = 0; continue; }
      out[j] = (as * cr + ab * (1 - as) * dr) / ao * 255;
      out[j + 1] = (as * cg + ab * (1 - as) * dg) / ao * 255;
      out[j + 2] = (as * cb + ab * (1 - as) * db) / ao * 255;
      out[j + 3] = ao * 255;
    }
  }
  return out;
}

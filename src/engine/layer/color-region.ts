// Color-region membership: quantize the source into N colors (median-cut +
// k-means, luminance-sorted so index order is stable) and assign each pixel to
// its nearest. A region mask for index i is 1 where the pixel belongs to color
// i. Shared by the auto-layer generator (for labels) and the worker (for the
// actual masks) so indices line up.

import { extractPalette } from '../color/extract';
import { preparePalette, nearestPaletteIndex } from '../color/palette';
import { srgbToLinear } from '../color/srgb';
import type { RgbaImage } from '../image/types';

export const COLOR_REGION_SEED = 0xc0ffee;

export function extractRegionPalette(src: RgbaImage, count: number): string[] {
  return extractPalette(src, { count, refineKMeans: true, seed: COLOR_REGION_SEED });
}

// Per-pixel nearest-color index (0..count-1), matched in sRGB space.
export function colorAssignments(src: RgbaImage, count: number): Uint8Array {
  const palette = preparePalette(extractRegionPalette(src, count));
  const n = src.width * src.height;
  const out = new Uint8Array(n);
  const d = src.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = d[j + 3] / 255;
    const r = (d[j] / 255) * a + (1 - a);
    const g = (d[j + 1] / 255) * a + (1 - a);
    const b = (d[j + 2] / 255) * a + (1 - a);
    out[i] = nearestPaletteIndex(
      { r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b) },
      palette,
      'srgb-euclid',
    );
  }
  return out;
}

export function colorRegionMask(assign: Uint8Array, index: number): Float32Array {
  const out = new Float32Array(assign.length);
  for (let i = 0; i < assign.length; i++) out[i] = assign[i] === index ? 1 : 0;
  return out;
}

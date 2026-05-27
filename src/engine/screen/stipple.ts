import type { LumImage, Sample } from '../image/types';
import { hash2 } from '../noise/hash';
import type { BlueNoiseMask } from '../noise/blue-noise-mask';
import { floydSteinberg } from '../dither/floyd';
import { atkinson } from '../dither/atkinson';
import { bayer } from '../dither/bayer';
import { clampCell, MAX_SAMPLES_STIPPLE } from './sample-budget';
import { lumToLinear } from '../image/sample';
import { linearToSrgb } from '../color/srgb';

export type StippleDither = 'floyd' | 'atkinson' | 'bayer' | 'blue-noise';

export interface StippleParams {
  pitch: number;          // grid spacing px = downsample factor = dot pitch
  jitter: number;         // 0..1 position jitter as a fraction of pitch
  dither: StippleDither;  // which 1-bit dither decides dot placement
  contrast: number;       // -1..1 pre-contrast to bias overall dot density
}

export const defaultStippleParams: StippleParams = {
  pitch: 4,
  jitter: 0.5,
  dither: 'floyd',
  contrast: 0,
};

// Stippling = 1-bit dithering on a coarse grid, then a uniform dot wherever the
// dither turns a cell "on". Density tracks tone by construction (that's what
// dithering does), detail is preserved down to the pitch, and the dot character
// (organic Floyd / even blue-noise / sparse Atkinson / structured Bayer) is just
// the choice of dither kernel — reusing the engine the rest of the app uses.
export function stippleScreen(lum: LumImage, p: StippleParams, mask: BlueNoiseMask): Sample[] {
  const pitch = clampCell(p.pitch, lum.width, lum.height, MAX_SAMPLES_STIPPLE);
  const jitter = Math.max(0, Math.min(1, p.jitter));
  const cols = Math.max(1, Math.floor(lum.width / pitch));
  const rows = Math.max(1, Math.floor(lum.height / pitch));

  // 1. Box-downsample luminance to the dot grid (averaged tone per cell),
  //    applying an optional contrast bias around mid-gray.
  const cFactor = (1 + p.contrast) / Math.max(1e-6, 1 - p.contrast);
  const small = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y0 = Math.floor((j * lum.height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((j + 1) * lum.height) / rows));
    for (let i = 0; i < cols; i++) {
      const x0 = Math.floor((i * lum.width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((i + 1) * lum.width) / cols));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * lum.width;
        for (let x = x0; x < x1; x++) { sum += lumToLinear(lum.data[row + x]); n++; }
      }
      let v = n > 0 ? linearToSrgb(sum / n) : 0;
      if (p.contrast !== 0) {
        v = (v - 0.5) * cFactor + 0.5;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
      }
      small[j * cols + i] = v;
    }
  }

  // 2. 1-bit dither the small grid → on/off per cell.
  const on = ditherToMask(small, cols, rows, p.dither, mask);

  // 3. Emit a uniform-pitch dot wherever a cell is "on" (dark), with jitter.
  const out: Sample[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!on[j * cols + i]) continue;
      const cx = (i + 0.5) * pitch;
      const cy = (j + 0.5) * pitch;
      const jx = (hash2(i, j, 1) - 0.5) * jitter * pitch;
      const jy = (hash2(i, j, 2) - 0.5) * jitter * pitch;
      out.push({ x: cx + jx, y: cy + jy, value: small[j * cols + i], cellSize: pitch });
    }
  }
  return out;
}

function ditherToMask(
  small: Float32Array, cols: number, rows: number, kind: StippleDither, mask: BlueNoiseMask,
): Uint8Array {
  const on = new Uint8Array(cols * rows);
  if (kind === 'blue-noise') {
    const N = mask.size;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        // ordered dither: cell is "on" (dot) where it's darker than the threshold
        on[idx] = small[idx] < mask.values[(j % N) * N + (i % N)] ? 1 : 0;
      }
    }
    return on;
  }
  const img: LumImage = { width: cols, height: rows, data: small };
  const dithered =
    kind === 'atkinson' ? atkinson(img) :
    kind === 'bayer' ? bayer(img, 4) :
    floydSteinberg(img);
  for (let idx = 0; idx < dithered.data.length; idx++) {
    on[idx] = dithered.data[idx] < 0.5 ? 1 : 0; // black cell → dot
  }
  return on;
}

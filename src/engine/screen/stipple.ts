import type { LumImage, Sample } from '../image/types';
import { sampleBilinear } from '../image/sample';
import { hash2 } from '../noise/hash';
import type { BlueNoiseMask } from '../noise/blue-noise-mask';
import { clampCell } from './sample-budget';

export interface StippleParams {
  pitch: number;     // grid spacing in px ≈ dot pitch
  jitter: number;    // 0..1 position jitter as a fraction of pitch
  maskSize: number;  // blue-noise mask resolution (32 / 64 / 128)
  gamma: number;     // tone curve applied to density (>1 darkens midtones)
}

export const defaultStippleParams: StippleParams = {
  pitch: 4,
  jitter: 0.6,
  maskSize: 64,
  gamma: 1,
};

// Blue-noise threshold stippling. Walk a grid at `pitch` spacing; at each cell
// compare the source's local darkness (1 - luminance, gamma-shaped) against the
// void-and-cluster blue-noise threshold for that cell. Emit a dot when darkness
// exceeds the threshold. Because the mask thresholds are evenly distributed in
// [0,1) and spatially decorrelated, a region of luminance L fills exactly the
// fraction (1-L) of its cells, distributed as clean blue noise — so density
// tracks tone faithfully AND fine detail down to the pitch is preserved
// (every cell is evaluated independently, unlike Poisson disk rejection).
export function stippleScreen(lum: LumImage, p: StippleParams, mask: BlueNoiseMask): Sample[] {
  const pitch = clampCell(p.pitch, lum.width, lum.height);
  const jitter = Math.max(0, Math.min(1, p.jitter));
  const gamma = Math.max(0.1, p.gamma);
  const N = mask.size;
  const cols = Math.ceil(lum.width / pitch);
  const rows = Math.ceil(lum.height / pitch);
  const out: Sample[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5) * pitch;
      const cy = (j + 0.5) * pitch;
      if (cx >= lum.width || cy >= lum.height) continue;
      const L = sampleBilinear(lum, cx, cy);
      const target = Math.pow(1 - L, gamma);
      const t = mask.values[(j % N) * N + (i % N)];
      if (target <= t) continue;
      const jx = (hash2(i, j, 1) - 0.5) * jitter * pitch;
      const jy = (hash2(i, j, 2) - 0.5) * jitter * pitch;
      out.push({ x: cx + jx, y: cy + jy, value: L, cellSize: pitch });
    }
  }
  return out;
}

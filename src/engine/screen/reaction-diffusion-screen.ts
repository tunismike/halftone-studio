import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import { sampleRdField, type RdField } from '../noise/reaction-diffusion';

export interface RdScreenParams {
  cellSize: number;       // grid resolution (image px) at which we sample the RD field
  textureScale: number;   // RD-units per image-pixel; <1 zooms in, >1 zooms out
  threshold: number;      // 0..1; only emit samples where field value > threshold
  modulateBySource: boolean; // multiply RD value by (1 - source lum) before threshold
  rotationDeg: number;    // optional rotation of the RD pattern
  jitter: number;         // 0..1, randomizes sample position within cell
  seed: number;
}

export const defaultRdScreenParams: RdScreenParams = {
  cellSize: 4,
  textureScale: 0.15,
  threshold: 0.05,
  modulateBySource: false,
  rotationDeg: 0,
  jitter: 0,
  seed: 1,
};

// Returns Sample[] placed on a regular grid. Each sample's `value` reflects
// the RD-field intensity (optionally modulated by source luminance) so that
// downstream mark generators draw the *shape* of the pattern as varying-size
// marks. Cells whose intensity falls below `threshold` are skipped.
//
// Sample.value semantics: 0 = darkest/biggest mark, 1 = lightest/smallest.
// We map intensity → value as `1 - intensity` so high-RD areas yield large
// marks (consistent with how mark generators interpret tone).
export function reactionDiffusionScreen(
  lum: LumImage,
  field: RdField,
  p: RdScreenParams,
): Sample[] {
  const cell = Math.max(1, p.cellSize);
  const theta = (p.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const out: Sample[] = [];

  // Jitter is deterministic per-cell using cheap integer hash.
  const jitterScale = p.jitter * cell * 0.45;

  for (let y = cell / 2; y < lum.height; y += cell) {
    for (let x = cell / 2; x < lum.width; x += cell) {
      // Map image-px → field coords (rotated, scaled).
      const cx = x - lum.width / 2;
      const cy = y - lum.height / 2;
      const fx = (cos * cx - sin * cy) * p.textureScale + lum.width / 2 * p.textureScale;
      const fy = (sin * cx + cos * cy) * p.textureScale + lum.height / 2 * p.textureScale;
      const rd = sampleRdField(field, fx, fy);
      const srcLum = sampleBilinear(lum, x, y);
      const intensity = p.modulateBySource ? rd * (1 - srcLum) : rd;
      if (intensity < p.threshold) continue;

      let px = x;
      let py = y;
      if (jitterScale > 0) {
        const h = hash01(((x | 0) * 73856093) ^ ((y | 0) * 19349663) ^ (p.seed * 83492791));
        px += (h - 0.5) * 2 * jitterScale;
        const h2 = hash01(((x | 0) * 19349663) ^ ((y | 0) * 83492791) ^ (p.seed * 73856093));
        py += (h2 - 0.5) * 2 * jitterScale;
      }
      // value = 1 - intensity so big marks form where RD field is strong.
      const v = 1 - Math.max(0, Math.min(1, intensity));
      out.push({ x: px, y: py, value: v, cellSize: cell });
    }
  }
  return out;
}

function hash01(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

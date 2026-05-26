import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import type { CircleMark } from './types';
import { distressDelta, type DistressParams } from './distress';

export interface DotParams {
  gain: number;
  minRatio: number;
  maxRatio: number;
  edgeAwareStrength?: number;
  distress?: DistressParams;
  // Optional absolute-pixel radius. When set, overrides the cellSize-derived
  // radius calculation entirely — every emitted dot is exactly `fixedRadius`
  // pixels. Size jitter (distress.scale) is intentionally NOT applied, so true
  // stipple dots stay uniform; position jitter and break/skip still apply.
  fixedRadius?: number;
}

export const defaultDotParams: DotParams = {
  gain: 1,
  minRatio: 0,
  maxRatio: 1.05,
};

export function samplesToCircles(samples: Sample[], p: DotParams, edges?: LumImage): CircleMark[] {
  const out: CircleMark[] = [];
  const ea = p.edgeAwareStrength && edges ? p.edgeAwareStrength : 0;
  const fixed = p.fixedRadius && p.fixedRadius > 0 ? p.fixedRadius : 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = distressDelta(p.distress, i);
    if (d.skip) continue;
    let r: number;
    if (fixed > 0) {
      // Uniform stipple dot: exact radius, no size jitter.
      r = fixed;
    } else {
      const half = s.cellSize / 2;
      const minR = p.minRatio * half;
      let cap = p.maxRatio * half;
      if (ea > 0 && edges) {
        const e = sampleBilinear(edges, s.x, s.y);
        cap = cap * (1 - e * ea);
      }
      // Dot AREA must be proportional to ink coverage (1 - tone), so radius
      // scales with sqrt(coverage). Linear radius makes midtones far too light
      // (area ∝ coverage²). sqrt keeps the endpoints (0 and `half`) anchored and
      // correctly darkens the mid-range.
      const coverage = Math.max(0, 1 - s.value);
      const target = Math.sqrt(coverage) * half * p.gain;
      r = Math.max(minR, Math.min(cap, target)) * d.scale;
    }
    if (r > 0.05) {
      out.push({
        kind: 'circle',
        cx: s.x + d.dx * s.cellSize,
        cy: s.y + d.dy * s.cellSize,
        r,
      });
    }
  }
  return out;
}

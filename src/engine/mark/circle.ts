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
  // pixels (still subject to distress.scale jitter). Used for stippling
  // where dot size must be decoupled from screen spacing.
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
      r = fixed;
    } else {
      const half = s.cellSize / 2;
      const minR = p.minRatio * half;
      let cap = p.maxRatio * half;
      if (ea > 0 && edges) {
        const e = sampleBilinear(edges, s.x, s.y);
        cap = cap * (1 - e * ea);
      }
      const target = (1 - s.value) * half * p.gain;
      r = Math.max(minR, Math.min(cap, target));
    }
    r *= d.scale;
    if (r > 0.05) {
      out.push({
        kind: 'circle',
        cx: s.x + d.dx * (fixed > 0 ? r * 2 : s.cellSize),
        cy: s.y + d.dy * (fixed > 0 ? r * 2 : s.cellSize),
        r,
      });
    }
  }
  return out;
}

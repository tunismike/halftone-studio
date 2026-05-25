import type { Sample } from '../image/types';
import { fbm } from '../noise/value';
import type { LineMark } from './types';
import { distressDelta, type DistressParams } from './distress';

export interface FlowParams {
  gain: number;
  minRatio: number;
  maxRatio: number;
  noiseFreq: number;
  noiseSeed: number;
  baseWidth: number;
  distress?: DistressParams;
}

export const defaultFlowParams: FlowParams = {
  gain: 1,
  minRatio: 0,
  maxRatio: 1.5,
  noiseFreq: 0.02,
  noiseSeed: 1,
  baseWidth: 1,
};

export function samplesToFlowStrokes(samples: Sample[], p: FlowParams): LineMark[] {
  const fbmCfg = { octaves: 3, lacunarity: 2, gain: 0.5 };
  const eps = 1.5;
  const out: LineMark[] = [];
  for (let idx = 0; idx < samples.length; idx++) {
    const s = samples[idx];
    const d = distressDelta(p.distress, idx);
    if (d.skip) continue;
    const half = s.cellSize / 2;
    const target = (1 - s.value) * s.cellSize * p.gain;
    let len = Math.max(p.minRatio * s.cellSize, Math.min(p.maxRatio * s.cellSize, target));
    len *= d.scale;
    if (len < 0.1) continue;
    const fx = p.noiseFreq;
    const dx =
      fbm((s.x + eps) * fx, s.y * fx, p.noiseSeed, fbmCfg) -
      fbm((s.x - eps) * fx, s.y * fx, p.noiseSeed, fbmCfg);
    const dy =
      fbm(s.x * fx, (s.y + eps) * fx, p.noiseSeed, fbmCfg) -
      fbm(s.x * fx, (s.y - eps) * fx, p.noiseSeed, fbmCfg);
    const gmag = Math.hypot(dx, dy);
    let ux: number;
    let uy: number;
    if (gmag < 1e-6) {
      ux = 1; uy = 0;
    } else {
      ux = -dy / gmag;
      uy = dx / gmag;
    }
    const halfLen = len / 2;
    const cx = s.x + d.dx * s.cellSize;
    const cy = s.y + d.dy * s.cellSize;
    out.push({
      kind: 'line',
      x1: cx - ux * halfLen,
      y1: cy - uy * halfLen,
      x2: cx + ux * halfLen,
      y2: cy + uy * halfLen,
      width: Math.max(0.5, p.baseWidth * (1 + (1 - s.value) * 0.5)),
    });
    void half;
  }
  return out;
}

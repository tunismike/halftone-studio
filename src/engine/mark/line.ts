import type { Sample } from '../image/types';
import type { LineMark } from './types';
import { distressDelta, type DistressParams } from './distress';

export interface LineParams {
  gain: number;
  minRatio: number;
  maxRatio: number;
  distress?: DistressParams;
}

export const defaultLineParams: LineParams = {
  gain: 1,
  minRatio: 0,
  maxRatio: 1,
};

export function samplesToLineSegments(samples: Sample[], p: LineParams): LineMark[] {
  const out: LineMark[] = [];
  if (samples.length === 0) return out;
  const theta = ((samples[0].angle ?? 0) * Math.PI) / 180;
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = distressDelta(p.distress, i);
    if (d.skip) continue;
    const target = (1 - s.value) * s.cellSize * p.gain;
    let w = Math.max(p.minRatio * s.cellSize, Math.min(p.maxRatio * s.cellSize, target));
    w *= d.scale;
    if (w < 0.1) continue;
    const half = s.cellSize / 2;
    const cx = s.x + d.dx * s.cellSize;
    const cy = s.y + d.dy * s.cellSize;
    out.push({
      kind: 'line',
      x1: cx - ux * half,
      y1: cy - uy * half,
      x2: cx + ux * half,
      y2: cy + uy * half,
      width: w,
    });
  }
  return out;
}

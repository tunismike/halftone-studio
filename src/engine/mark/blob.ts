import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import { hash2 } from '../noise/hash';
import type { PolyMark } from './types';
import { distressDelta, type DistressParams } from './distress';

export interface BlobParams {
  gain: number;
  minRatio: number;
  maxRatio: number;
  jitter: number;
  vertices: number;
  seed: number;
  edgeAwareStrength?: number;
  distress?: DistressParams;
}

export const defaultBlobParams: BlobParams = {
  gain: 1,
  minRatio: 0,
  maxRatio: 1,
  jitter: 0.35,
  vertices: 9,
  seed: 1,
};

export function samplesToBlobs(samples: Sample[], p: BlobParams, edges?: LumImage): PolyMark[] {
  const out: PolyMark[] = [];
  const n = Math.max(3, p.vertices | 0);
  const ea = p.edgeAwareStrength && edges ? p.edgeAwareStrength : 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = distressDelta(p.distress, i);
    if (d.skip) continue;
    const half = s.cellSize / 2;
    let cap = p.maxRatio * half;
    if (ea > 0 && edges) {
      const e = sampleBilinear(edges, s.x, s.y);
      cap = cap * (1 - e * ea);
    }
    const target = (1 - s.value) * half * p.gain;
    let r = Math.max(p.minRatio * half, Math.min(cap, target));
    r *= d.scale;
    if (r < 0.1) continue;
    const cx0 = s.x + d.dx * s.cellSize;
    const cy0 = s.y + d.dy * s.cellSize;
    const phase = hash2(i, 0, p.seed) * Math.PI * 2 + d.rotation;
    const pts: number[] = new Array(n * 2);
    for (let v = 0; v < n; v++) {
      const ang = phase + (v * Math.PI * 2) / n;
      const j = (hash2(i, v + 1, p.seed) - 0.5) * 2;
      const rr = r * (1 + p.jitter * j);
      pts[v * 2] = cx0 + Math.cos(ang) * rr;
      pts[v * 2 + 1] = cy0 + Math.sin(ang) * rr;
    }
    out.push({ kind: 'poly', pts });
  }
  return out;
}

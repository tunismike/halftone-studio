import type { Sample } from '../image/types';
import type { GlyphMark } from './types';
import { distressDelta, type DistressParams } from './distress';

export interface GlyphParams {
  pathD: string;
  viewBoxW: number;
  viewBoxH: number;
  gain: number;
  minRatio: number;
  maxRatio: number;
  rotateDeg: number;
  distress?: DistressParams;
}

export const defaultGlyphParams: GlyphParams = {
  pathD: 'M -1 0 A 1 1 0 1 0 1 0 A 1 1 0 1 0 -1 0 Z',
  viewBoxW: 2,
  viewBoxH: 2,
  gain: 1,
  minRatio: 0,
  maxRatio: 1.1,
  rotateDeg: 0,
};

export function samplesToGlyphs(samples: Sample[], p: GlyphParams): GlyphMark[] {
  const out: GlyphMark[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = distressDelta(p.distress, i);
    if (d.skip) continue;
    const half = s.cellSize / 2;
    const target = (1 - s.value) * half * p.gain;
    let r = Math.max(p.minRatio * half, Math.min(p.maxRatio * half, target));
    r *= d.scale;
    if (r < 0.1) continue;
    const longest = Math.max(p.viewBoxW, p.viewBoxH);
    const scale = (r * 2) / longest;
    out.push({
      kind: 'glyph',
      cx: s.x + d.dx * s.cellSize,
      cy: s.y + d.dy * s.cellSize,
      scale,
      rotation: p.rotateDeg + (d.rotation * 180) / Math.PI,
      pathD: p.pathD,
      viewBoxW: p.viewBoxW,
      viewBoxH: p.viewBoxH,
    });
  }
  return out;
}

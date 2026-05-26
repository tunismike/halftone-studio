import type { Sample } from '../image/types';
import type { PolyMark } from './types';
import { distressDelta, type DistressParams } from './distress';

export interface SquareParams {
  gain: number;
  minRatio: number;
  maxRatio: number;
  rotateDeg: number;
  cornerRadius?: number;
  distress?: DistressParams;
}

export const defaultSquareParams: SquareParams = {
  gain: 1,
  minRatio: 0,
  maxRatio: 1.05,
  rotateDeg: 0,
  cornerRadius: 0,
};

export const defaultDiamondParams: SquareParams = {
  gain: 1,
  minRatio: 0,
  maxRatio: 1.05,
  rotateDeg: 45,
  cornerRadius: 0,
};

export function samplesToSquares(samples: Sample[], p: SquareParams): PolyMark[] {
  const out: PolyMark[] = [];
  const baseTheta = (p.rotateDeg * Math.PI) / 180;
  const cornerR = Math.max(0, Math.min(1, p.cornerRadius ?? 0));
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = distressDelta(p.distress, i);
    if (d.skip) continue;
    const half = s.cellSize / 2;
    // Square area ∝ side²; scale the half-side with sqrt(coverage) so dot area
    // is linear in ink coverage (area-correct halftone, mids not too light).
    const target = Math.sqrt(Math.max(0, 1 - s.value)) * half * p.gain;
    let r = Math.max(p.minRatio * half, Math.min(p.maxRatio * half, target));
    r *= d.scale;
    if (r < 0.1) continue;
    const theta = baseTheta + d.rotation;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const cx = s.x + d.dx * s.cellSize;
    const cy = s.y + d.dy * s.cellSize;
    const pts = cornerR > 0
      ? roundedSquarePoints(r, cornerR * r, cx, cy, cos, sin)
      : squarePoints(r, cx, cy, cos, sin);
    out.push({ kind: 'poly', pts });
  }
  return out;
}

function squarePoints(r: number, cx: number, cy: number, cos: number, sin: number): number[] {
  const corners = [-r, -r, r, -r, r, r, -r, r];
  const out = new Array<number>(8);
  for (let j = 0; j < 4; j++) {
    const px = corners[j * 2];
    const py = corners[j * 2 + 1];
    out[j * 2] = cx + px * cos - py * sin;
    out[j * 2 + 1] = cy + px * sin + py * cos;
  }
  return out;
}

const ROUND_SEGS = 5;

function roundedSquarePoints(
  r: number,
  cornerRPx: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
): number[] {
  const cr = Math.min(cornerRPx, r * 0.99);
  const inner = r - cr;
  // 4 corners centered at (±inner, ±inner) in mark-local space; each emits
  // ROUND_SEGS+1 points spanning a 90° arc.
  const centers: Array<[number, number, number]> = [
    [inner, inner, 0],
    [-inner, inner, Math.PI / 2],
    [-inner, -inner, Math.PI],
    [inner, -inner, -Math.PI / 2],
  ];
  const out: number[] = [];
  for (const [ccx, ccy, startAngle] of centers) {
    for (let k = 0; k <= ROUND_SEGS; k++) {
      const a = startAngle + (k / ROUND_SEGS) * (Math.PI / 2);
      const lx = ccx + cr * Math.cos(a);
      const ly = ccy + cr * Math.sin(a);
      out.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);
    }
  }
  return out;
}

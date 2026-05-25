import type { Mark } from './types';

export interface RegistrationParams {
  size: number;
  stroke: number;
  inset: number;
}

export const defaultRegistration: RegistrationParams = {
  size: 14,
  stroke: 1,
  inset: 16,
};

export function registrationMarks(width: number, height: number, p: RegistrationParams): Mark[] {
  const out: Mark[] = [];
  const half = p.size / 2;
  const corners: [number, number][] = [
    [p.inset, p.inset],
    [width - p.inset, p.inset],
    [p.inset, height - p.inset],
    [width - p.inset, height - p.inset],
    [width / 2, height / 2],
  ];
  for (const [cx, cy] of corners) {
    out.push({ kind: 'line', x1: cx - half, y1: cy, x2: cx + half, y2: cy, width: p.stroke });
    out.push({ kind: 'line', x1: cx, y1: cy - half, x2: cx, y2: cy + half, width: p.stroke });
    out.push({ kind: 'circle', cx, cy, r: half * 0.6 });
    out.push({ kind: 'circle', cx, cy, r: half * 0.3 });
  }
  return out;
}

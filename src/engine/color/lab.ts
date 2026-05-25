import type { LinRgbVec, RgbVec } from './srgb';
import { srgbVecToLinear } from './srgb';

export interface LabVec {
  L: number;
  a: number;
  b: number;
}

// D65 reference white in XYZ.
const Xn = 0.95047;
const Yn = 1.0;
const Zn = 1.08883;

// Linear sRGB → CIE XYZ D65 (Bruce Lindbloom matrix).
export function linearToXyz(c: LinRgbVec): { x: number; y: number; z: number } {
  return {
    x: 0.4124564 * c.r + 0.3575761 * c.g + 0.1804375 * c.b,
    y: 0.2126729 * c.r + 0.7151522 * c.g + 0.0721750 * c.b,
    z: 0.0193339 * c.r + 0.1191920 * c.g + 0.9503041 * c.b,
  };
}

function f(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

export function xyzToLab(x: number, y: number, z: number): LabVec {
  const fx = f(x / Xn);
  const fy = f(y / Yn);
  const fz = f(z / Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function srgbToLab(c: RgbVec): LabVec {
  const lin = srgbVecToLinear(c);
  const { x, y, z } = linearToXyz(lin);
  return xyzToLab(x, y, z);
}

// CIEDE2000 (Sharma, Wu, Dalal 2005). Standard reference implementation.
export function deltaE2000(a: LabVec, b: LabVec): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const L1 = a.L;
  const a1 = a.a;
  const b1 = a.b;
  const L2 = b.L;
  const a2 = b.a;
  const b2 = b.b;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h1p = atan2deg(b1, a1p);
  const h2p = atan2deg(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else {
    const diff = Math.abs(h1p - h2p);
    if (diff <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.20 * Math.cos(deg2rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(deg2rad(2 * dTheta)) * RC;

  const dLk = dLp / (kL * SL);
  const dCk = dCp / (kC * SC);
  const dHk = dHp / (kH * SH);

  return Math.sqrt(dLk * dLk + dCk * dCk + dHk * dHk + RT * dCk * dHk);
}

function atan2deg(y: number, x: number): number {
  if (y === 0 && x === 0) return 0;
  const d = (Math.atan2(y, x) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

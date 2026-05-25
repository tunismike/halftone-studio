import { hexToRgb, srgbVecToLinear, type LinRgbVec, type RgbVec } from './srgb';
import { srgbToLab, deltaE2000, type LabVec } from './lab';

export interface PaletteEntry {
  srgb: RgbVec;
  linear: LinRgbVec;
  lab: LabVec;
}

export type ColorMetric =
  | 'srgb-euclid'
  | 'linear-euclid'
  | 'lab-de2000'
  | 'weighted-rgb';

export interface PreparedPalette {
  entries: PaletteEntry[];
  hexes: string[];
}

// 3D voxel LUT: each cell stores the palette index of the nearest color
// for a sampled (r, g, b) in linear-RGB space. Resolution 32 → 32k cells,
// ~64 KB at Uint16 — fits in cache easily.
export interface PaletteLut {
  resolution: number;
  data: Uint16Array;
}

const LUT_RESOLUTION = 32;

export function buildPaletteLut(
  palette: PreparedPalette,
  metric: ColorMetric,
  resolution: number = LUT_RESOLUTION,
): PaletteLut {
  const N = resolution;
  const data = new Uint16Array(N * N * N);
  for (let ri = 0; ri < N; ri++) {
    const r = (ri + 0.5) / N;
    for (let gi = 0; gi < N; gi++) {
      const g = (gi + 0.5) / N;
      for (let bi = 0; bi < N; bi++) {
        const b = (bi + 0.5) / N;
        data[(ri * N + gi) * N + bi] = nearestPaletteIndex({ r, g, b }, palette, metric);
      }
    }
  }
  return { resolution: N, data };
}

export function nearestPaletteIndexFromLut(p: LinRgbVec, lut: PaletteLut): number {
  const N = lut.resolution;
  let r = (p.r * N) | 0;
  let g = (p.g * N) | 0;
  let b = (p.b * N) | 0;
  if (r < 0) r = 0; else if (r >= N) r = N - 1;
  if (g < 0) g = 0; else if (g >= N) g = N - 1;
  if (b < 0) b = 0; else if (b >= N) b = N - 1;
  return lut.data[(r * N + g) * N + b];
}

export function preparePalette(hexes: readonly string[]): PreparedPalette {
  const entries: PaletteEntry[] = hexes.map((hex) => {
    const srgb = hexToRgb(hex);
    return {
      srgb,
      linear: srgbVecToLinear(srgb),
      lab: srgbToLab(srgb),
    };
  });
  return { entries, hexes: [...hexes] };
}

// Inputs are linear-RGB pixel values in [0,1]. Palette must be prepared.
export function nearestPaletteIndex(
  pLinear: LinRgbVec,
  palette: PreparedPalette,
  metric: ColorMetric,
): number {
  switch (metric) {
    case 'srgb-euclid': return nearestSrgbEuclid(pLinear, palette);
    case 'linear-euclid': return nearestLinearEuclid(pLinear, palette);
    case 'weighted-rgb': return nearestWeightedRgb(pLinear, palette);
    case 'lab-de2000': return nearestLabDe2000(pLinear, palette);
  }
}

function nearestLinearEuclid(p: LinRgbVec, palette: PreparedPalette): number {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.entries.length; i++) {
    const c = palette.entries[i].linear;
    const dr = p.r - c.r;
    const dg = p.g - c.g;
    const db = p.b - c.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function nearestSrgbEuclid(p: LinRgbVec, palette: PreparedPalette): number {
  // Convert pixel to gamma-encoded sRGB for the comparison.
  const psr = linearToSrgbFast(p.r);
  const psg = linearToSrgbFast(p.g);
  const psb = linearToSrgbFast(p.b);
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.entries.length; i++) {
    const c = palette.entries[i].srgb;
    const dr = psr - c.r;
    const dg = psg - c.g;
    const db = psb - c.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Cheap "redmean" weighted-RGB distance (good speed/quality tradeoff).
function nearestWeightedRgb(p: LinRgbVec, palette: PreparedPalette): number {
  const psr = linearToSrgbFast(p.r);
  const psg = linearToSrgbFast(p.g);
  const psb = linearToSrgbFast(p.b);
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.entries.length; i++) {
    const c = palette.entries[i].srgb;
    const rmean = (psr + c.r) / 2;
    const dr = psr - c.r;
    const dg = psg - c.g;
    const db = psb - c.b;
    const d =
      (2 + rmean) * dr * dr +
      4 * dg * dg +
      (2 + (1 - rmean)) * db * db;
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function nearestLabDe2000(p: LinRgbVec, palette: PreparedPalette): number {
  // Convert pixel linear → sRGB → Lab once.
  const psrgb: RgbVec = {
    r: linearToSrgbFast(p.r),
    g: linearToSrgbFast(p.g),
    b: linearToSrgbFast(p.b),
  };
  const lab = srgbToLab(psrgb);
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.entries.length; i++) {
    const d = deltaE2000(lab, palette.entries[i].lab);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Inline fast linear→sRGB (small overhead inside per-pixel loop).
function linearToSrgbFast(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

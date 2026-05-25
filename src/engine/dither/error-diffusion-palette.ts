import { srgbToLinear } from '../color/srgb';
import {
  nearestPaletteIndex,
  nearestPaletteIndexFromLut,
  type ColorMetric,
  type PaletteLut,
  type PreparedPalette,
} from '../color/palette';
import type { RgbaImage } from '../image/types';
import type { KernelDef } from './kernels';
import { ostromoukhovWeights } from './ostromoukhov';

export interface PaletteDitherParams {
  palette: PreparedPalette;
  kernel: KernelDef;
  metric: ColorMetric;
  serpentine: boolean;
  lut?: PaletteLut;
}

// Indexed-image output: per-pixel palette index, plus the palette in sRGB
// for the renderer to look up colors. We carry both so downstream code can
// either render to canvas or serialize separately.
export interface IndexedImage {
  width: number;
  height: number;
  indices: Uint16Array; // up to 65k palette entries
  paletteSrgb: string[]; // hex codes
}

export function paletteErrorDiffusion(
  src: RgbaImage,
  p: PaletteDitherParams,
): IndexedImage {
  const { width, height } = src;
  const data = src.data;
  const np = width * height;

  // Working buffer in linear-light RGB, premultiplied by source alpha against white.
  // Three planes for r/g/b.
  const workR = new Float32Array(np);
  const workG = new Float32Array(np);
  const workB = new Float32Array(np);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const a = data[i + 3] / 255;
    const r = (data[i] / 255) * a + (1 - a);
    const g = (data[i + 1] / 255) * a + (1 - a);
    const b = (data[i + 2] / 255) * a + (1 - a);
    workR[j] = srgbToLinear(r);
    workG[j] = srgbToLinear(g);
    workB[j] = srgbToLinear(b);
  }

  const indices = new Uint16Array(np);
  const taps = p.kernel.taps;
  const variable = p.kernel.variable === 'ostromoukhov';

  for (let y = 0; y < height; y++) {
    const rtl = p.serpentine && (y & 1) === 1;
    const xStart = rtl ? width - 1 : 0;
    const xEnd = rtl ? -1 : width;
    const step = rtl ? -1 : 1;

    for (let x = xStart; x !== xEnd; x += step) {
      const i = y * width + x;
      let r = workR[i];
      let g = workG[i];
      let b = workB[i];
      if (r < 0) r = 0; else if (r > 1) r = 1;
      if (g < 0) g = 0; else if (g > 1) g = 1;
      if (b < 0) b = 0; else if (b > 1) b = 1;

      const idx = p.lut
        ? nearestPaletteIndexFromLut({ r, g, b }, p.lut)
        : nearestPaletteIndex({ r, g, b }, p.palette, p.metric);
      indices[i] = idx;

      const q = p.palette.entries[idx].linear;
      const er = r - q.r;
      const eg = g - q.g;
      const eb = b - q.b;

      if (variable) {
        // Ostromoukhov: per-pixel weights indexed by this pixel's luminance,
        // distributed to right / below-left / below (dx mirrored on RTL rows).
        const tone = 0.299 * r + 0.587 * g + 0.114 * b;
        const [wR, wDL, wD] = ostromoukhovWeights(tone);
        const dxR = rtl ? -1 : 1;
        diffuse(workR, workG, workB, x + dxR, y, width, height, er, eg, eb, wR);
        diffuse(workR, workG, workB, x - dxR, y + 1, width, height, er, eg, eb, wDL);
        diffuse(workR, workG, workB, x, y + 1, width, height, er, eg, eb, wD);
        continue;
      }

      // Distribute error using the kernel; mirror dx on RTL rows.
      for (let t = 0; t < taps.length; t++) {
        const tap = taps[t];
        const dx = rtl ? -tap.dx : tap.dx;
        const nx = x + dx;
        const ny = y + tap.dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        workR[ni] += er * tap.w;
        workG[ni] += eg * tap.w;
        workB[ni] += eb * tap.w;
      }
    }
  }

  return {
    width, height, indices,
    paletteSrgb: p.palette.hexes,
  };
}

function diffuse(
  workR: Float32Array, workG: Float32Array, workB: Float32Array,
  nx: number, ny: number, width: number, height: number,
  er: number, eg: number, eb: number, w: number,
): void {
  if (nx < 0 || nx >= width || ny >= height || w === 0) return;
  const ni = ny * width + nx;
  workR[ni] += er * w;
  workG[ni] += eg * w;
  workB[ni] += eb * w;
}

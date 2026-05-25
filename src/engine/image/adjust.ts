import type { LumImage } from './types';

export interface AdjustParams {
  brightness: number;
  contrast: number;
  invert: boolean;
  gamma: number;
}

export const defaultAdjust: AdjustParams = {
  brightness: 0,
  contrast: 0,
  invert: false,
  gamma: 1,
};

export function adjust(src: LumImage, p: AdjustParams): LumImage {
  const { width, height, data } = src;
  const out = new Float32Array(data.length);
  const cFactor = (1 + p.contrast) / Math.max(1e-6, 1 - p.contrast);
  const invGamma = 1 / Math.max(1e-6, p.gamma);
  for (let i = 0; i < data.length; i++) {
    let v = data[i] + p.brightness;
    v = (v - 0.5) * cFactor + 0.5;
    v = v <= 0 ? 0 : v >= 1 ? 1 : Math.pow(v, invGamma);
    out[i] = p.invert ? 1 - v : v;
  }
  return { width, height, data: out };
}

export function threshold(src: LumImage, t: number): LumImage {
  const out = new Float32Array(src.data.length);
  for (let i = 0; i < src.data.length; i++) out[i] = src.data[i] < t ? 0 : 1;
  return { width: src.width, height: src.height, data: out };
}

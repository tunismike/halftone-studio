export interface RgbVec {
  r: number;
  g: number;
  b: number;
}

export interface LinRgbVec {
  r: number;
  g: number;
  b: number;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function srgbVecToLinear(c: RgbVec): LinRgbVec {
  return {
    r: srgbToLinear(c.r),
    g: srgbToLinear(c.g),
    b: srgbToLinear(c.b),
  };
}

export function linearVecToSrgb(c: LinRgbVec): RgbVec {
  return {
    r: linearToSrgb(c.r),
    g: linearToSrgb(c.g),
    b: linearToSrgb(c.b),
  };
}

export function hexToRgb(hex: string): RgbVec {
  const h = hex.replace('#', '');
  const expanded = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(expanded, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

export function rgbToHex(c: RgbVec): string {
  const r = clamp255(Math.round(c.r * 255));
  const g = clamp255(Math.round(c.g * 255));
  const b = clamp255(Math.round(c.b * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

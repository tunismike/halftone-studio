// Area-average (box) downsample in LINEAR light. Correct for downscaling:
//  - integrates the FULL source footprint → no aliasing/moiré (vs the browser's
//    'low'-quality bilinear, which under-filters large reductions);
//  - averages light, not gamma-encoded values → detailed regions don't darken
//    ("muddy") the way sRGB-space averaging makes them.
// Only meant for downscale (pw ≤ sw, ph ≤ sh); callers skip it otherwise.

import type { RgbaImage } from './types';
import { linearToSrgb } from '../color/srgb';

// 8-bit sRGB → linear decode LUT (per byte value).
const SRGB8_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

export function boxDownsampleLinear(src: RgbaImage, pw: number, ph: number): RgbaImage {
  const { width: sw, height: sh, data: s } = src;
  const out = new Uint8ClampedArray(pw * ph * 4);
  const sx = sw / pw, sy = sh / ph;
  for (let ty = 0; ty < ph; ty++) {
    const y0 = Math.floor(ty * sy);
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.floor((ty + 1) * sy)));
    for (let tx = 0; tx < pw; tx++) {
      const x0 = Math.floor(tx * sx);
      const x1 = Math.min(sw, Math.max(x0 + 1, Math.floor((tx + 1) * sx)));
      let lr = 0, lg = 0, lb = 0, aa = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let j = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, j += 4) {
          lr += SRGB8_TO_LINEAR[s[j]];
          lg += SRGB8_TO_LINEAR[s[j + 1]];
          lb += SRGB8_TO_LINEAR[s[j + 2]];
          aa += s[j + 3];
          n++;
        }
      }
      const inv = n > 0 ? 1 / n : 0;
      const o = (ty * pw + tx) * 4;
      out[o] = Math.round(linearToSrgb(lr * inv) * 255);
      out[o + 1] = Math.round(linearToSrgb(lg * inv) * 255);
      out[o + 2] = Math.round(linearToSrgb(lb * inv) * 255);
      out[o + 3] = Math.round(aa * inv);
    }
  }
  return { width: pw, height: ph, data: out };
}

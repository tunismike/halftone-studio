// Interactive-selection masks. Pure functions that turn a user gesture
// (magic-wand click, lasso/marquee polygon) into a binary mask at source
// resolution. The mask is 1 inside the selection, 0 outside.

import type { RgbaImage } from '../image/types';

export interface Pt { x: number; y: number; }

// Flood-fill from (sx,sy) selecting connected pixels whose colour is within
// `tolerance` (0..1) of the seed colour. 4-connected. Distance is normalized
// RGB euclidean (max √3·255 → 1).
export function floodSelect(
  src: RgbaImage, sx: number, sy: number, tolerance: number,
): Uint8Array {
  const { width: w, height: h, data } = src;
  const out = new Uint8Array(w * h);
  const x0 = Math.round(sx), y0 = Math.round(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return out;

  const seed = (y0 * w + x0) * 4;
  const sr = data[seed], sg = data[seed + 1], sb = data[seed + 2];
  // tolerance 0..1 → fraction of the max RGB euclidean distance (√3·255).
  // Compare squared distances to avoid a sqrt per pixel. +0.5 epsilon keeps the
  // tolerance=1 boundary inclusive despite float rounding (distances² are ints).
  const maxDist = Math.sqrt(3) * 255;
  const thresh = (tolerance * maxDist) ** 2 + 0.5;

  const stackX = new Int32Array(w * h);
  const stackY = new Int32Array(w * h);
  let sp = 0;
  stackX[sp] = x0; stackY[sp] = y0; sp++;
  out[y0 * w + x0] = 1;

  while (sp > 0) {
    sp--;
    const x = stackX[sp], y = stackY[sp];
    // 4-neighbours
    const tryPush = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const idx = ny * w + nx;
      if (out[idx]) return;
      const j = idx * 4;
      const dr = data[j] - sr, dg = data[j + 1] - sg, db = data[j + 2] - sb;
      if (dr * dr + dg * dg + db * db <= thresh) {
        out[idx] = 1;
        stackX[sp] = nx; stackY[sp] = ny; sp++;
      }
    };
    tryPush(x + 1, y); tryPush(x - 1, y);
    tryPush(x, y + 1); tryPush(x, y - 1);
  }
  return out;
}

// Rasterize a closed polygon (source-space points) into a binary mask using
// even-odd scanline fill.
export function polygonMask(points: Pt[], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const n = points.length;
  if (n < 3) return out;

  let minY = Infinity, maxY = -Infinity;
  for (const p of points) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(h - 1, Math.ceil(maxY));

  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = points[j], b = points[i];
      const ay = a.y, by = b.y;
      // Edge crosses the scanline?
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
        const t = (cy - ay) / (by - ay);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) out[y * w + x] = 1;
    }
  }
  return out;
}

// Pack a binary mask into white-on-black RGBA bytes so the worker's
// luminance-based maskAlphaFor() reads 1 inside the selection, 0 outside.
// Returns raw bytes (no ImageData) so it stays usable outside the DOM.
export function maskToRgba(mask: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const v = mask[i] ? 255 : 0;
    data[j] = v; data[j + 1] = v; data[j + 2] = v; data[j + 3] = 255;
  }
  return data;
}

export function maskIsEmpty(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i]) return false;
  return true;
}

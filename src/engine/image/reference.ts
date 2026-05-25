import type { RgbaImage } from './types';

// A small RGBA image designed to reveal what each halftone / dither effect
// looks like at thumbnail size. Composition:
//   - top band: smooth horizontal gradient black → white (tonal handling)
//   - middle band: photo-like region — vertical gradient with a dark circle
//                  on the left and a bright circle on the right (edge + halftone test)
//   - color row: 8 hue chips (palette mapping test)
//   - bottom band: horizontal gradient white → black (other direction)
export function generateReferenceImage(size = 192): RgbaImage {
  const w = size;
  const h = size;
  const data = new Uint8ClampedArray(w * h * 4);

  // Section heights (sum = h)
  const topH = Math.round(h * 0.18);
  const midH = Math.round(h * 0.46);
  const colorH = Math.round(h * 0.12);

  const colorStops = [
    [220, 50, 60],     // red
    [240, 130, 30],    // orange
    [240, 210, 40],    // yellow
    [60, 180, 75],     // green
    [40, 180, 200],    // cyan
    [60, 90, 200],     // blue
    [180, 70, 180],    // magenta
    [128, 128, 128],   // gray
  ];

  const put = (x: number, y: number, r: number, g: number, b: number): void => {
    const i = (y * w + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };

  // Band 1: horizontal gradient black → white
  for (let y = 0; y < topH; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      put(x, y, v, v, v);
    }
  }

  // Band 2: photo-like area with vertical gradient + 2 circles
  const midY0 = topH;
  const midY1 = topH + midH;
  const midCenterY = (midY0 + midY1) / 2;
  const r = midH * 0.32;
  const cxL = w * 0.28;
  const cxR = w * 0.72;
  for (let y = midY0; y < midY1; y++) {
    const t = (y - midY0) / Math.max(1, midH - 1);
    // Vertical gradient: top darker, bottom lighter
    const bgV = Math.round(80 + 130 * t);
    for (let x = 0; x < w; x++) {
      let rr = bgV;
      let gg = bgV;
      let bb = bgV;
      // Left disc — dark
      const dxL = x - cxL;
      const dyL = y - midCenterY;
      if (dxL * dxL + dyL * dyL < r * r) {
        rr = gg = bb = 20;
      }
      // Right disc — light
      const dxR = x - cxR;
      const dyR = y - midCenterY;
      if (dxR * dxR + dyR * dyR < r * r) {
        rr = gg = bb = 240;
      }
      put(x, y, rr, gg, bb);
    }
  }

  // Band 3: color chips
  const colorY0 = topH + midH;
  const colorY1 = colorY0 + colorH;
  for (let y = colorY0; y < colorY1; y++) {
    for (let x = 0; x < w; x++) {
      const idx = Math.min(colorStops.length - 1, Math.floor((x / w) * colorStops.length));
      const [cr, cg, cb] = colorStops[idx];
      put(x, y, cr, cg, cb);
    }
  }

  // Band 4: horizontal gradient white → black
  const botY0 = colorY1;
  for (let y = botY0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((1 - x / (w - 1)) * 255);
      put(x, y, v, v, v);
    }
  }

  return { width: w, height: h, data };
}

import type { RgbaImage } from '../image/types';

export interface ExtractOptions {
  count: number;
  refineKMeans?: boolean;
  refineIterations?: number;
  sampleCap?: number;
  seed?: number;
}

interface Pixel {
  r: number;
  g: number;
  b: number;
}

interface Box {
  pixels: Pixel[];
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
}

export function extractPalette(src: RgbaImage, opts: ExtractOptions): string[] {
  const k = Math.max(2, Math.min(64, opts.count | 0));
  const sampleCap = opts.sampleCap ?? 50_000;
  const samples = sampleOpaquePixels(src, sampleCap, opts.seed ?? 0xC0FFEE);
  if (samples.length === 0) return defaultGrayRamp(k);
  let centroids = medianCut(samples, k);
  if (opts.refineKMeans !== false) {
    centroids = kMeansRefine(samples, centroids, opts.refineIterations ?? 6);
  }
  const sortedByLum = centroids.slice().sort((a, b) => luminance(a) - luminance(b));
  return sortedByLum.map(pxToHex);
}

function sampleOpaquePixels(src: RgbaImage, cap: number, seed: number): Pixel[] {
  const { width, height, data } = src;
  const total = width * height;
  const stride = Math.max(1, Math.floor(total / cap));
  const out: Pixel[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < total; i += stride) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const jitter = (s >>> 8) % stride;
    const idx = Math.min(total - 1, i + jitter);
    const di = idx * 4;
    if (data[di + 3] < 16) continue;
    out.push({ r: data[di], g: data[di + 1], b: data[di + 2] });
  }
  return out;
}

function makeBox(pixels: Pixel[]): Box {
  let rMin = 256, rMax = -1, gMin = 256, gMax = -1, bMin = 256, bMax = -1;
  for (const p of pixels) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  return { pixels, rMin, rMax, gMin, gMax, bMin, bMax };
}

function boxLongestAxis(box: Box): 'r' | 'g' | 'b' {
  const dr = box.rMax - box.rMin;
  const dg = box.gMax - box.gMin;
  const db = box.bMax - box.bMin;
  if (dr >= dg && dr >= db) return 'r';
  if (dg >= db) return 'g';
  return 'b';
}

function boxRange(box: Box): number {
  return Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin);
}

function splitBox(box: Box, axis: 'r' | 'g' | 'b'): [Box, Box] {
  const sorted = box.pixels.slice().sort((a, b) => a[axis] - b[axis]);
  const mid = sorted.length >> 1;
  const lo = sorted.slice(0, mid);
  const hi = sorted.slice(mid);
  return [makeBox(lo), makeBox(hi)];
}

function medianCut(samples: Pixel[], k: number): Pixel[] {
  const boxes: Box[] = [makeBox(samples)];
  while (boxes.length < k) {
    let pickIdx = -1;
    let pickRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length < 2) continue;
      const r = boxRange(boxes[i]);
      if (r > pickRange) { pickRange = r; pickIdx = i; }
    }
    if (pickIdx < 0) break;
    const target = boxes[pickIdx];
    const axis = boxLongestAxis(target);
    const [a, b] = splitBox(target, axis);
    boxes.splice(pickIdx, 1, a, b);
  }
  return boxes.map(meanOfBox);
}

function meanOfBox(box: Box): Pixel {
  let r = 0, g = 0, b = 0;
  for (const p of box.pixels) {
    r += p.r; g += p.g; b += p.b;
  }
  const n = box.pixels.length || 1;
  return { r: r / n, g: g / n, b: b / n };
}

function kMeansRefine(samples: Pixel[], initial: Pixel[], iters: number): Pixel[] {
  const k = initial.length;
  let centroids = initial.map((p) => ({ ...p }));
  const sums = new Float64Array(k * 3);
  const counts = new Uint32Array(k);
  for (let it = 0; it < iters; it++) {
    sums.fill(0);
    counts.fill(0);
    for (const p of samples) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const dr = p.r - centroids[i].r;
        const dg = p.g - centroids[i].g;
        const db = p.b - centroids[i].b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
      sums[best * 3] += p.r;
      sums[best * 3 + 1] += p.g;
      sums[best * 3 + 2] += p.b;
      counts[best]++;
    }
    let moved = 0;
    for (let i = 0; i < k; i++) {
      if (counts[i] === 0) continue;
      const nr = sums[i * 3] / counts[i];
      const ng = sums[i * 3 + 1] / counts[i];
      const nb = sums[i * 3 + 2] / counts[i];
      const dr = nr - centroids[i].r;
      const dg = ng - centroids[i].g;
      const db = nb - centroids[i].b;
      moved += dr * dr + dg * dg + db * db;
      centroids[i] = { r: nr, g: ng, b: nb };
    }
    if (moved < 0.5) break;
  }
  return centroids;
}

function pxToHex(p: Pixel): string {
  const r = clamp255(Math.round(p.r));
  const g = clamp255(Math.round(p.g));
  const b = clamp255(Math.round(p.b));
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}

function clamp255(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
}

function luminance(p: Pixel): number {
  return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
}

function defaultGrayRamp(k: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    const v = Math.round((i / Math.max(1, k - 1)) * 255);
    const h = v.toString(16).padStart(2, '0');
    out.push(`#${h}${h}${h}`);
  }
  return out;
}

// Homegrown raster→vector tracer. Turns a binary mask into closed contour
// loops (outer boundaries + holes), simplifies them, optionally smooths to
// béziers, and emits an SVG path. Higher level: trace a quantized image into
// one grouped path per color region.
//
// Contour extraction uses directed boundary edges with "inside-on-left" winding
// so the linked loops are unambiguous (saddles resolve) and holes wind opposite
// to outer boundaries — which renders correctly under even-odd fill.

import { colorAssignments, extractRegionPalette } from '../layer/color-region';
import type { RgbaImage } from '../image/types';

export type Pt = [number, number];

export interface TraceOptions {
  colors: number;     // quantize into N color regions (2..16)
  simplify: number;   // Douglas-Peucker tolerance in px (0 = none)
  smoothing: number;  // 0 = polygons, >0 = Catmull-Rom bézier tension
  minArea: number;    // drop loops smaller than this (px²) — despeckle
}

export const defaultTraceOptions: TraceOptions = {
  colors: 6, simplify: 1.2, smoothing: 0.6, minArea: 12,
};

// ── contour extraction ───────────────────────────────────────────────
export function traceBinaryMask(mask: Uint8Array, w: number, h: number): Pt[][] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;
  const key = (x: number, y: number) => `${x},${y}`;
  const edges = new Map<string, Pt[]>(); // start corner → list of end corners
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const arr = edges.get(k);
    if (arr) arr.push([bx, by]); else edges.set(k, [[bx, by]]);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);         // top
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1); // right
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1); // bottom
      if (!inside(x - 1, y)) add(x, y + 1, x, y);         // left
    }
  }

  const loops: Pt[][] = [];
  for (const startKey of [...edges.keys()]) {
    let arr = edges.get(startKey);
    while (arr && arr.length) {
      const [sx, sy] = startKey.split(',').map(Number);
      const loop: Pt[] = [[sx, sy]];
      let cx = sx, cy = sy;
      // walk until we return to start or run out
      for (let guard = 0; guard < w * h * 4 + 8; guard++) {
        const cur = edges.get(key(cx, cy));
        if (!cur || !cur.length) break;
        const [nx, ny] = cur.pop()!;
        cx = nx; cy = ny;
        if (cx === sx && cy === sy) break;
        loop.push([cx, cy]);
      }
      if (loop.length >= 3) loops.push(loop);
      arr = edges.get(startKey);
    }
  }
  return loops;
}

// ── geometry helpers ─────────────────────────────────────────────────
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(a) / 2;
}

export function douglasPeucker(pts: Pt[], tol: number): Pt[] {
  if (tol <= 0 || pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Closed loop → SVG path data. smoothing>0 uses a Catmull-Rom→cubic-bézier pass.
export function loopToPathD(pts: Pt[], smoothing: number): string {
  if (pts.length < 2) return '';
  const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
  if (smoothing <= 0) {
    let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += `L${fmt(pts[i][0])} ${fmt(pts[i][1])}`;
    return d + 'Z';
  }
  const n = pts.length;
  const t = Math.max(0, Math.min(1, smoothing)) / 6;
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d + 'Z';
}

// ── full image → per-color grouped paths ─────────────────────────────
export interface TracedRegion { color: string; d: string; loops: number; }

export function traceImage(src: RgbaImage, opts: TraceOptions): TracedRegion[] {
  const w = src.width, h = src.height;
  const count = Math.max(2, Math.min(16, opts.colors));
  const assign = colorAssignments(src, count);
  // representative colors, luminance-ordered (matches assignment order)
  const colors = extractRegionPalette(src, count);
  const out: TracedRegion[] = [];
  for (let idx = 0; idx < count; idx++) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = assign[i] === idx ? 1 : 0;
    const loops = traceBinaryMask(mask, w, h)
      .filter((lp) => polygonArea(lp) >= opts.minArea)
      .map((lp) => douglasPeucker(lp, opts.simplify));
    if (!loops.length) continue;
    const d = loops.map((lp) => loopToPathD(lp, opts.smoothing)).join(' ');
    out.push({ color: colors[idx] ?? '#000000', d, loops: loops.length });
  }
  return out;
}

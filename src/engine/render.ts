import type { MarkSet } from './mark/types';
import type { IndexedImage } from './dither/error-diffusion-palette';
import type { TracedRegion } from './trace/trace';
import { hexToRgb } from './color/srgb';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

// Above this many circles, a single Path2D arc fill gets slow (seconds). The
// raster disc-stamper below is O(total dot area) ≈ O(pixels) and renders the
// SAME discs, so the preview stays representative of the exported SVG circles.
const STAMP_THRESHOLD = 20_000;
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

// Rasterize filled, anti-aliased discs directly into the canvas pixels. Blends
// ink over the existing content by edge coverage (1px AA band), matching how a
// browser fills an SVG <circle> of the same cx/cy/r. O(Σ disc area).
function stampDiscsToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number, circles: Array<{ cx: number; cy: number; r: number }>, fill: string,
): boolean {
  if (!HEX_RE.test(fill.trim())) return false; // non-hex → caller uses Path2D
  const rgb = hexToRgb(fill);
  const ir = Math.round(rgb.r * 255), ig = Math.round(rgb.g * 255), ib = Math.round(rgb.b * 255);
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  for (const c of circles) {
    const r = c.r;
    const x0 = Math.max(0, Math.floor(c.cx - r - 1));
    const x1 = Math.min(w - 1, Math.ceil(c.cx + r + 1));
    const y0 = Math.max(0, Math.floor(c.cy - r - 1));
    const y1 = Math.min(h - 1, Math.ceil(c.cy + r + 1));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - c.cy;
      let row = (y * w + x0) * 4;
      for (let x = x0; x <= x1; x++, row += 4) {
        const dx = x + 0.5 - c.cx;
        const cov = r + 0.5 - Math.sqrt(dx * dx + dy * dy);
        if (cov <= 0) continue;
        const a = cov >= 1 ? 1 : cov;
        data[row] = data[row] + (ir - data[row]) * a;
        data[row + 1] = data[row + 1] + (ig - data[row + 1]) * a;
        data[row + 2] = data[row + 2] + (ib - data[row + 2]) * a;
        data[row + 3] = 255;
      }
    }
  }
  ctx.putImageData(id, 0, 0);
  return true;
}

export function renderTracedToCanvas(
  regions: TracedRegion[], width: number, height: number,
  background: string, transparent: boolean, canvas: AnyCanvas,
): void {
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!transparent && background !== 'none') {
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  }
  for (const r of regions) {
    const path = new Path2D(r.d);
    ctx.fillStyle = r.color;
    ctx.fill(path, 'evenodd');
  }
}

export function renderIndexedToCanvas(img: IndexedImage, canvas: AnyCanvas): void {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return;

  // Pre-decode palette to 8-bit RGB triples.
  const palette = img.paletteSrgb;
  const pal = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    const rgb = hexToRgb(palette[i]);
    pal[i * 3] = Math.round(rgb.r * 255);
    pal[i * 3 + 1] = Math.round(rgb.g * 255);
    pal[i * 3 + 2] = Math.round(rgb.b * 255);
  }

  const id = ctx.createImageData(img.width, img.height);
  const out = id.data;
  const idx = img.indices;
  for (let i = 0, j = 0; i < idx.length; i++, j += 4) {
    const p = idx[i] * 3;
    out[j] = pal[p];
    out[j + 1] = pal[p + 1];
    out[j + 2] = pal[p + 2];
    out[j + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
}

export function renderMarkSetToCanvas(set: MarkSet, canvas: AnyCanvas): void {
  canvas.width = set.width;
  canvas.height = set.height;
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return;
  ctx.clearRect(0, 0, set.width, set.height);
  if (set.background && set.background !== 'none') {
    ctx.fillStyle = set.background;
    ctx.fillRect(0, 0, set.width, set.height);
  }
  for (const g of set.groups) {
    const fill = g.fill ?? set.foreground;
    const stroke = g.stroke ?? 'none';
    const strokeWidth = g.strokeWidth ?? 1;
    const doFill = fill !== 'none';
    const doStroke = stroke !== 'none';
    ctx.save();
    ctx.globalCompositeOperation = g.blendMode === 'multiply' ? 'multiply' : 'source-over';
    if (doFill) ctx.fillStyle = fill;
    if (doStroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
    }
    ctx.lineCap = 'round';

    // Batch marks by type so we can issue one fill/stroke per type rather
    // than per mark. Circles + polys → single Path2D + single fill.
    // Lines grouped by width since stroke-width is canvas-global per draw.
    // Glyphs are per-mark because each has its own transform.
    const circles: Array<{ cx: number; cy: number; r: number }> = [];
    const polys: number[][] = [];
    const linesByWidth = new Map<number, Array<{ x1: number; y1: number; x2: number; y2: number }>>();
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (const m of g.marks) {
      switch (m.kind) {
        case 'circle':
          circles.push(m);
          break;
        case 'line': {
          const w = m.width;
          let bucket = linesByWidth.get(w);
          if (!bucket) {
            bucket = [];
            linesByWidth.set(w, bucket);
          }
          bucket.push(m);
          break;
        }
        case 'rect':
          rects.push(m);
          break;
        case 'poly':
          if (m.pts.length >= 4) polys.push(m.pts);
          break;
        case 'glyph': {
          const path = new Path2D(m.pathD);
          ctx.save();
          ctx.translate(m.cx, m.cy);
          if (m.rotation) ctx.rotate((m.rotation * Math.PI) / 180);
          ctx.scale(m.scale, m.scale);
          ctx.translate(-m.viewBoxW / 2, -m.viewBoxH / 2);
          if (doFill) ctx.fill(path);
          if (doStroke) ctx.stroke(path);
          ctx.restore();
          break;
        }
      }
    }

    if (circles.length) {
      // Fast raster path for dense, fill-only, source-over circle groups (the
      // halftone case). Falls back to Path2D for strokes / multiply / non-hex.
      const stamped = doFill && !doStroke && g.blendMode !== 'multiply'
        && circles.length > STAMP_THRESHOLD
        && stampDiscsToCanvas(ctx, set.width, set.height, circles, fill);
      if (!stamped) {
        const path = new Path2D();
        for (const c of circles) {
          path.moveTo(c.cx + c.r, c.cy);
          path.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
        }
        if (doFill) ctx.fill(path);
        if (doStroke) ctx.stroke(path);
      }
    }

    if (polys.length) {
      const path = new Path2D();
      for (const pts of polys) {
        path.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
        path.closePath();
      }
      if (doFill) ctx.fill(path);
      if (doStroke) ctx.stroke(path);
    }

    if (rects.length) {
      // fillRect/strokeRect can't be batched cheaply; loop is already fast.
      for (const r of rects) {
        if (doFill) ctx.fillRect(r.x, r.y, r.w, r.h);
        if (doStroke) ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
    }

    if (linesByWidth.size) {
      const savedW = ctx.lineWidth;
      const savedStroke = ctx.strokeStyle;
      // Lines always stroke, even when group is fill-only (LineMark.width is its own width).
      ctx.strokeStyle = doStroke ? stroke : fill;
      for (const [w, lines] of linesByWidth) {
        ctx.lineWidth = w;
        const path = new Path2D();
        for (const ln of lines) {
          path.moveTo(ln.x1, ln.y1);
          path.lineTo(ln.x2, ln.y2);
        }
        ctx.stroke(path);
      }
      ctx.lineWidth = savedW;
      ctx.strokeStyle = savedStroke;
    }

    ctx.restore();
  }
}

import type { MarkSet } from './mark/types';
import type { IndexedImage } from './dither/error-diffusion-palette';
import { hexToRgb } from './color/srgb';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

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
      const path = new Path2D();
      for (const c of circles) {
        path.moveTo(c.cx + c.r, c.cy);
        path.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
      }
      if (doFill) ctx.fill(path);
      if (doStroke) ctx.stroke(path);
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

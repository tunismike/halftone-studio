/// <reference lib="webworker" />
import { Cache } from '../engine/cache';
import { runCachedPipeline } from '../engine/pipeline-cached';
import { renderMarkSetToCanvas, renderIndexedToCanvas } from '../engine/render';
import { generateReferenceImage } from '../engine/image/reference';
import { lumToRgba } from '../engine/image/luminance';
import { markSetToSvg } from '../engine/export/svg';
import { buildZip } from '../engine/export/zip';
import { generateTexture } from '../engine/texture/recipes';
import { findBundledTexture } from '../engine/texture/catalog';
import { textureToCanvas, compositeTextureOverlay } from '../engine/texture/composite';
import type { GrayTexture, TextureOverlay } from '../engine/texture/types';
import type { RgbaImage } from '../engine/image/types';
import type { Output } from '../engine/output';
import type { MarkSet } from '../engine/mark/types';
import type { PipelineParams } from '../engine/pipeline';
import type { Request, Response } from './protocol';

const DEFAULT_PREVIEW_MAX_SIDE = 2048;
const THUMB_MAX_SIDE = 96;

let source: RgbaImage | null = null;
let preview: RgbaImage | null = null;
let previewMaxSide = DEFAULT_PREVIEW_MAX_SIDE;
let previewResampling: 'nearest' | 'bilinear' | 'bicubic' = 'bilinear';
let thumb: RgbaImage | null = null;
let referenceImage: RgbaImage | null = null;
function getReferenceImage(): RgbaImage {
  if (!referenceImage) referenceImage = generateReferenceImage(192);
  return referenceImage;
}
const previewCache = new Cache();
const exportCache = new Cache();
const thumbCache = new Cache();
const textureCache = new Map<string, OffscreenCanvas>();

function getTextureCanvas(overlay: TextureOverlay): OffscreenCanvas | null {
  if (overlay.source === 'user') {
    return getUserTextureCanvas(overlay);
  }
  const def = findBundledTexture(overlay.textureId);
  if (!def) return null;
  const contrast = overlay.contrast ?? 1;
  const threshold = overlay.threshold ?? 0.5;
  const cacheKey = `${overlay.textureId}|${overlay.invert ? 'i' : 'n'}|c${contrast.toFixed(3)}|t${threshold.toFixed(3)}`;
  let canvas = textureCache.get(cacheKey);
  if (canvas) return canvas;
  const tex: GrayTexture = generateTexture(def.recipe, def.params);
  canvas = textureToCanvas(tex, overlay.invert, contrast, threshold);
  textureCache.set(cacheKey, canvas);
  return canvas;
}

const userTextureCanvasCache = new Map<string, OffscreenCanvas>();
const userTextureRawCache = new Map<string, ImageBitmap>();
const userMaskRawCache = new Map<string, ImageBitmap>();

function getUserTextureCanvas(overlay: TextureOverlay): OffscreenCanvas | null {
  const bm = userTextureRawCache.get(overlay.textureId);
  if (!bm) return null;
  const contrast = overlay.contrast ?? 1;
  const threshold = overlay.threshold ?? 0.5;
  const cacheKey = `${overlay.textureId}|${overlay.invert ? 'i' : 'n'}|c${contrast.toFixed(3)}|t${threshold.toFixed(3)}`;
  const cached = userTextureCanvasCache.get(cacheKey);
  if (cached) return cached;
  const size = bm.width;
  const c = new OffscreenCanvas(size, bm.height);
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bm, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const pivot = threshold;
  const k = Math.max(0.01, contrast);
  for (let i = 0; i < id.data.length; i += 4) {
    const r = id.data[i] / 255;
    const g = id.data[i + 1] / 255;
    const b = id.data[i + 2] / 255;
    let lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (overlay.invert) lum = 1 - lum;
    let t = 0.5 + (lum - pivot) * k;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const v = (t * 255) | 0;
    id.data[i] = v;
    id.data[i + 1] = v;
    id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  userTextureCanvasCache.set(cacheKey, c);
  return c;
}

function applyTextureOverlay(target: OffscreenCanvas, overlay: TextureOverlay | undefined): void {
  if (!overlay) return;
  const textureCanvas = getTextureCanvas(overlay);
  if (!textureCanvas) return;
  compositeTextureOverlay(target, textureCanvas, overlay);
}

function applyMaskOverlay(
  target: OffscreenCanvas | HTMLCanvasElement,
  src: RgbaImage | null,
  overlay: import('../engine/mask/types').MaskOverlay | undefined,
): void {
  if (!overlay || !overlay.maskId || !src) return;
  const bm = userMaskRawCache.get(overlay.maskId);
  if (!bm) return;
  const tctx = target.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  // Render mask, scaled to target size, into a working canvas.
  const work = new OffscreenCanvas(target.width, target.height);
  const wctx = work.getContext('2d') as OffscreenCanvasRenderingContext2D;
  wctx.imageSmoothingEnabled = true;
  wctx.imageSmoothingQuality = 'high';
  wctx.drawImage(bm, 0, 0, target.width, target.height);
  const maskId = wctx.getImageData(0, 0, target.width, target.height);
  // Render source, scaled to target size.
  const srcCanvas = new OffscreenCanvas(src.width, src.height);
  const sctx = srcCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const sid = sctx.createImageData(src.width, src.height);
  sid.data.set(src.data);
  sctx.putImageData(sid, 0, 0);
  const srcScaled = new OffscreenCanvas(target.width, target.height);
  const ssctx = srcScaled.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ssctx.imageSmoothingEnabled = true;
  ssctx.imageSmoothingQuality = 'high';
  ssctx.drawImage(srcCanvas, 0, 0, target.width, target.height);
  const srcId = ssctx.getImageData(0, 0, target.width, target.height);
  // Read current halftone output.
  const outId = tctx.getImageData(0, 0, target.width, target.height);
  const md = maskId.data;
  const sd = srcId.data;
  const od = outId.data;
  const t = overlay.threshold;
  const f = Math.max(0.0001, overlay.feather);
  const inv = overlay.invert;
  for (let i = 0; i < od.length; i += 4) {
    // Mask luminance in [0,1].
    let m = (md[i] * 0.299 + md[i + 1] * 0.587 + md[i + 2] * 0.114) / 255;
    if (inv) m = 1 - m;
    // Soft step at threshold.
    let a = (m - (t - f * 0.5)) / f;
    if (a < 0) a = 0; else if (a > 1) a = 1;
    // a → mix factor: 1 = full halftone, 0 = full source.
    const inv_a = 1 - a;
    od[i]     = od[i] * a     + sd[i] * inv_a;
    od[i + 1] = od[i + 1] * a + sd[i + 1] * inv_a;
    od[i + 2] = od[i + 2] * a + sd[i + 2] * inv_a;
    od[i + 3] = 255;
  }
  tctx.putImageData(outId, 0, 0);
}

async function buildSvgTextureLayer(overlay: TextureOverlay) {
  const textureCanvas = getTextureCanvas(overlay);
  if (!textureCanvas) return null;
  const blob = await textureCanvas.convertToBlob({ type: 'image/png' });
  const dataUri = await blobToDataUri(blob);
  return { overlay, pngDataUri: dataUri, textureSize: textureCanvas.width };
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
let latestProcessId = 0;
let previewCanvas: OffscreenCanvas | null = null;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    switch (msg.kind) {
      case 'set-source': {
        const full: RgbaImage = {
          width: msg.width,
          height: msg.height,
          data: new Uint8ClampedArray(msg.buffer),
        };
        source = full;
        previewMaxSide = DEFAULT_PREVIEW_MAX_SIDE;
        preview = resampleTo(full, previewMaxSide, previewResampling);
        thumb = resampleTo(full, THUMB_MAX_SIDE, previewResampling);
        previewCache.clear();
        exportCache.clear();
        thumbCache.clear();
        const pw = preview ? preview.width : full.width;
        const ph = preview ? preview.height : full.height;
        post({ id: msg.id, kind: 'set-source-ok', previewWidth: pw, previewHeight: ph });
        break;
      }

      case 'attach-canvas': {
        previewCanvas = msg.canvas;
        post({ id: msg.id, kind: 'attach-canvas-ok' });
        break;
      }

      case 'process': {
        latestProcessId = msg.id;
        post({ id: msg.id, kind: 'started' });
        if (!source) throw new Error('no source loaded');
        const t0 = performance.now();
        const desired = msg.previewMaxSide ?? DEFAULT_PREVIEW_MAX_SIDE;
        const desiredResamp = msg.params.resampling ?? 'bilinear';
        if (desired !== previewMaxSide || desiredResamp !== previewResampling) {
          previewMaxSide = desired;
          previewResampling = desiredResamp;
          preview = resampleTo(source, previewMaxSide, previewResampling);
          previewCache.clear();
        }
        const previewSrc = preview ?? source;
        const out = runCachedPipeline(previewCache, previewSrc, msg.params);
        const tPipeline = performance.now() - t0;
        if (msg.id < latestProcessId) {
          post({ id: msg.id, kind: 'dropped' });
          return;
        }
        const w = previewSrc.width;
        const h = previewSrc.height;
        const tRender0 = performance.now();
        if (previewCanvas) {
          if (previewCanvas.width !== w) previewCanvas.width = w;
          if (previewCanvas.height !== h) previewCanvas.height = h;
          drawOutput(previewCanvas, out, !!msg.params.superSample);
          applyTextureOverlay(previewCanvas, msg.params.textureOverlay);
          applyMaskOverlay(previewCanvas, previewSrc, msg.params.maskOverlay);
        }
        const tRender = performance.now() - tRender0;
        if (msg.id < latestProcessId) {
          post({ id: msg.id, kind: 'dropped' });
          return;
        }
        if (tPipeline + tRender > 50) {
          // eslint-disable-next-line no-console
          console.log(
            `[worker] pipeline=${tPipeline.toFixed(1)}ms render=${tRender.toFixed(1)}ms total=${(tPipeline + tRender).toFixed(1)}ms (preview ${w}x${h})`,
          );
        }
        post({
          id: msg.id,
          kind: 'processed',
          width: w,
          height: h,
          durationMs: performance.now() - t0,
        });
        break;
      }

      case 'render-thumb': {
        const t0 = performance.now();
        // Thumbnails always render against a built-in reference image so each
        // preset's character (tonal handling, edges, color mapping) is readable
        // at small size. Independent of whether the user has uploaded a source.
        void thumb;
        const src = getReferenceImage();
        const out = runCachedPipeline(thumbCache, src, msg.params);
        const w = src.width;
        const h = src.height;
        const c = new OffscreenCanvas(w, h);
        drawOutput(c, out, !!msg.params.superSample);
        applyTextureOverlay(c, msg.params.textureOverlay);
        applyMaskOverlay(c, src, msg.params.maskOverlay);
        const cctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
        const id = cctx.getImageData(0, 0, w, h);
        post(
          { id: msg.id, kind: 'thumb', width: w, height: h, buffer: id.data.buffer, durationMs: performance.now() - t0 },
          [id.data.buffer],
        );
        break;
      }

      case 'serialize-svg': {
        if (!source) throw new Error('no source loaded');
        const t0 = performance.now();
        const out = runCachedPipeline(exportCache, source, msg.params);
        if (out.kind !== 'marks') throw new Error('serialize-svg requires a vector mode');
        const opts = { ...msg.opts };
        if (msg.params.textureOverlay) {
          const layer = await buildSvgTextureLayer(msg.params.textureOverlay);
          if (layer) opts.texture = layer;
        }
        const xml = markSetToSvg(out.set, opts);
        post({ id: msg.id, kind: 'svg', xml, durationMs: performance.now() - t0 });
        break;
      }

      case 'render-png': {
        if (!source) throw new Error('no source loaded');
        const t0 = performance.now();
        const out = runCachedPipeline(exportCache, source, msg.params);
        const w = source.width;
        const h = source.height;
        const c = new OffscreenCanvas(w, h);
        drawOutput(c, out, !!msg.params.superSample);
        applyTextureOverlay(c, msg.params.textureOverlay);
        applyMaskOverlay(c, source, msg.params.maskOverlay);
        const blob = await c.convertToBlob({ type: 'image/png' });
        post({ id: msg.id, kind: 'png', blob, durationMs: performance.now() - t0 });
        break;
      }

      case 'export-zip': {
        if (!source) throw new Error('no source loaded');
        const t0 = performance.now();
        const out = runCachedPipeline(exportCache, source, msg.params);
        if (out.kind !== 'marks') throw new Error('export-zip requires a vector mode');
        const set = out.set;
        const files: { name: string; content: string }[] = [
          {
            name: `${msg.baseName}-composite.svg`,
            content: markSetToSvg(set, msg.opts),
          },
        ];
        const mode = (msg.params as PipelineParams).mode;
        if (mode.kind === 'cmyk') {
          const reg = set.groups.filter((g) => g.name === 'registration');
          for (const g of set.groups) {
            if (g.name === 'registration') continue;
            const single: MarkSet = { ...set, groups: [g, ...reg] };
            files.push({
              name: `${msg.baseName}-${g.name}.svg`,
              content: markSetToSvg(single, msg.opts),
            });
          }
        }
        const blob = buildZip(files);
        post({ id: msg.id, kind: 'zip', blob, durationMs: performance.now() - t0 });
        break;
      }

      case 'set-user-mask': {
        userMaskRawCache.set(msg.maskId, msg.bitmap);
        post({ id: msg.id, kind: 'user-mask-ok' });
        break;
      }

      case 'drop-user-mask': {
        const bm = userMaskRawCache.get(msg.maskId);
        bm?.close?.();
        userMaskRawCache.delete(msg.maskId);
        post({ id: msg.id, kind: 'user-mask-ok' });
        break;
      }

      case 'set-user-texture': {
        userTextureRawCache.set(msg.textureId, msg.bitmap);
        // Invalidate any per-overlay rendered cache entries for this texture.
        for (const k of [...userTextureCanvasCache.keys()]) {
          if (k.startsWith(msg.textureId + '|')) userTextureCanvasCache.delete(k);
        }
        post({ id: msg.id, kind: 'user-texture-ok' });
        break;
      }

      case 'drop-user-texture': {
        const bm = userTextureRawCache.get(msg.textureId);
        bm?.close?.();
        userTextureRawCache.delete(msg.textureId);
        for (const k of [...userTextureCanvasCache.keys()]) {
          if (k.startsWith(msg.textureId + '|')) userTextureCanvasCache.delete(k);
        }
        post({ id: msg.id, kind: 'user-texture-ok' });
        break;
      }

      case 'cache-stats': {
        const { layers, size } = previewCache.stats();
        post({ id: msg.id, kind: 'cache-stats', layers, size });
        break;
      }
    }
  } catch (err) {
    post({ id: msg.id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

function post(r: Response, transfer?: Transferable[]) {
  if (transfer && transfer.length) ctx.postMessage(r, transfer);
  else ctx.postMessage(r);
}

function drawOutput(canvas: OffscreenCanvas, out: Output, superSample = false): void {
  if (out.kind === 'raster') {
    const rgba = lumToRgba(out.image);
    const c = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    if (canvas.width !== rgba.width) canvas.width = rgba.width;
    if (canvas.height !== rgba.height) canvas.height = rgba.height;
    const id = c.createImageData(canvas.width, canvas.height);
    id.data.set(rgba.data);
    c.putImageData(id, 0, 0);
  } else if (out.kind === 'indexed') {
    renderIndexedToCanvas(out.image, canvas);
  } else if (superSample) {
    // 2× sampler: render marks at 2× resolution then downsample with the
    // canvas's built-in bilinear filter for anti-aliased edges.
    const big = new OffscreenCanvas(out.set.width * 2, out.set.height * 2);
    const scaled = {
      ...out.set,
      width: out.set.width * 2,
      height: out.set.height * 2,
      groups: out.set.groups.map((g) => ({
        ...g,
        strokeWidth: g.strokeWidth ? g.strokeWidth * 2 : g.strokeWidth,
        marks: g.marks.map(scaleMark),
      })),
    };
    renderMarkSetToCanvas(scaled, big);
    canvas.width = out.set.width;
    canvas.height = out.set.height;
    const c = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(big, 0, 0, canvas.width, canvas.height);
  } else {
    renderMarkSetToCanvas(out.set, canvas);
  }
}

function scaleMark(m: import('../engine/mark/types').Mark): import('../engine/mark/types').Mark {
  switch (m.kind) {
    case 'circle': return { ...m, cx: m.cx * 2, cy: m.cy * 2, r: m.r * 2 };
    case 'line': return { ...m, x1: m.x1 * 2, y1: m.y1 * 2, x2: m.x2 * 2, y2: m.y2 * 2, width: m.width * 2 };
    case 'rect': return { ...m, x: m.x * 2, y: m.y * 2, w: m.w * 2, h: m.h * 2 };
    case 'poly': return { ...m, pts: m.pts.map((v) => v * 2) };
    case 'glyph': return { ...m, cx: m.cx * 2, cy: m.cy * 2, scale: m.scale * 2 };
  }
}

function resampleTo(
  src: RgbaImage,
  maxSide: number,
  mode: 'nearest' | 'bilinear' | 'bicubic' = 'bilinear',
): RgbaImage | null {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxSide) return null;
  const scale = maxSide / longest;
  const pw = Math.max(1, Math.round(src.width * scale));
  const ph = Math.max(1, Math.round(src.height * scale));
  const fullC = new OffscreenCanvas(src.width, src.height);
  const fctx = fullC.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const fid = fctx.createImageData(src.width, src.height);
  fid.data.set(src.data);
  fctx.putImageData(fid, 0, 0);
  const small = new OffscreenCanvas(pw, ph);
  const sctx = small.getContext('2d') as OffscreenCanvasRenderingContext2D;
  if (mode === 'nearest') {
    sctx.imageSmoothingEnabled = false;
  } else {
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = mode === 'bicubic' ? 'high' : 'low';
  }
  sctx.drawImage(fullC, 0, 0, pw, ph);
  const pid = sctx.getImageData(0, 0, pw, ph);
  return { width: pw, height: ph, data: new Uint8ClampedArray(pid.data) };
}

export {};

/// <reference lib="webworker" />
import { Cache } from '../engine/cache';
import { runCachedPipeline } from '../engine/pipeline-cached';
import { renderMarkSetToCanvas, renderIndexedToCanvas, renderTracedToCanvas, renderCoverageToCanvas } from '../engine/render';
import { generateReferenceImage } from '../engine/image/reference';
import { lumToRgba, rgbaToLum } from '../engine/image/luminance';
import { boxDownsampleLinear } from '../engine/image/resample';
import { regionMask } from '../engine/layer/region';
import { compositeLayers, type CompositeLayer } from '../engine/layer/composite';
import { colorAssignments, colorRegionMask } from '../engine/layer/color-region';
import type { LayeredComposition, Layer } from '../engine/layer/types';
import { markSetToSvg, markSetToSvgGroups } from '../engine/export/svg';
import { traceBinaryMask, loopToPathD, type TraceOptions } from '../engine/trace/trace';
import { potrace as potraceWasm, init as potraceInit } from 'esm-potrace-wasm';
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
// One cache per layer id so layer stages don't collide; reused across renders.
const layerCaches = new Map<string, Cache>();
function layerCache(id: string): Cache {
  let c = layerCaches.get(id);
  if (!c) { c = new Cache(); layerCaches.set(id, c); }
  return c;
}

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
        const comp = msg.params.composition;
        const out = comp ? null : runCachedPipeline(previewCache, previewSrc, msg.params);
        const tPipeline = performance.now() - t0;
        if (msg.id < latestProcessId) {
          post({ id: msg.id, kind: 'dropped' });
          return;
        }
        const w = previewSrc.width;
        const h = previewSrc.height;
        const tRender0 = performance.now();
        if (previewCanvas) {
          if (comp) {
            await renderComposition(previewCanvas, comp, previewSrc);
          } else {
            if (previewCanvas.width !== w) previewCanvas.width = w;
            if (previewCanvas.height !== h) previewCanvas.height = h;
            drawOutput(previewCanvas, out!, !!msg.params.superSample);
            applyTextureOverlay(previewCanvas, msg.params.textureOverlay);
            applyMaskOverlay(previewCanvas, previewSrc, msg.params.maskOverlay);
          }
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
        if (msg.params.composition) {
          const xml = await compositionToSvg(msg.params.composition, source, msg.opts);
          post({ id: msg.id, kind: 'svg', xml, durationMs: performance.now() - t0 });
          break;
        }
        const out = runCachedPipeline(exportCache, source, msg.params);
        if (out.kind === 'traced') {
          const xml = tracedToSvg(out.regions, out.width, out.height, out.background, out.transparent);
          post({ id: msg.id, kind: 'svg', xml, durationMs: performance.now() - t0 });
          break;
        }
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
        const w = source.width;
        const h = source.height;
        const c = new OffscreenCanvas(w, h);
        if (msg.params.composition) {
          await renderComposition(c, msg.params.composition, source);
        } else {
          const out = runCachedPipeline(exportCache, source, msg.params);
          drawOutput(c, out, !!msg.params.superSample);
          applyTextureOverlay(c, msg.params.textureOverlay);
          applyMaskOverlay(c, source, msg.params.maskOverlay);
        }
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

function tracedToSvg(
  regions: { color: string; d: string }[], w: number, h: number,
  background: string, transparent: boolean,
): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  if (!transparent) parts.push(`<rect width="${w}" height="${h}" fill="${background}"/>`);
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    parts.push(`<g id="region-${i}" fill="${r.color}" fill-rule="evenodd"><path d="${r.d}"/></g>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
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
  } else if (out.kind === 'field') {
    renderCoverageToCanvas(out.coverage, out.ink, out.background, out.transparent, canvas);
  } else if (out.kind === 'traced') {
    renderTracedToCanvas(out.regions, out.width, out.height, out.background, out.transparent, canvas);
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

// ── layered composition ──────────────────────────────────────────────
const compScratch = new OffscreenCanvas(1, 1);

// Convert a cached user-mask/selection bitmap to a w×h luminance alpha (0..1).
function maskAlphaFor(id: string, w: number, h: number): Float32Array | undefined {
  const bm = userMaskRawCache.get(id);
  if (!bm) return undefined;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bm, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) / 255;
  }
  return out;
}

function layerToParams(layer: Layer): PipelineParams {
  const t = layer.treatment;
  return {
    adjust: t.adjust,
    preprocess: t.preprocess,
    mode: t.mode,
    background: '#000000',
    foreground: t.foreground,
    transparent: true,          // layers carry their own alpha; bg comes from the composition
    textureOverlay: t.textureOverlay,
  };
}

// SOTA Potrace tracing in the worker so composition trace layers match
// single trace-mode quality. esm-potrace-wasm takes ImageData directly (no DOM).
// The wasm has one shared heap and isn't concurrency-safe → serialize via a
// promise chain.
let potraceReady: Promise<void> | null = null;
let potraceChain: Promise<unknown> = Promise.resolve();
function potraceMapOpts(o: TraceOptions) {
  return {
    turdsize: Math.max(0, Math.round(o.minArea)),
    turnpolicy: 4,
    alphamax: Math.max(0, Math.min(1.334, o.smoothing * 1.334)),
    opticurve: 1,
    opttolerance: Math.max(0, Math.min(1.5, o.simplify * 0.2)),
    pathonly: false,
    extractcolors: !o.mono,      // mono → bi-level black trace (clean ink)
    posterizelevel: Math.max(1, Math.min(255, Math.round(o.colors))),
    posterizationalgorithm: 0,
  };
}
function potraceLayerSvg(src: RgbaImage, o: TraceOptions): Promise<string> {
  const run = async (): Promise<string> => {
    if (!potraceReady) potraceReady = potraceInit();
    await potraceReady;
    const id = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    let svg = await potraceWasm(id, potraceMapOpts(o));
    if (!/viewBox=/.test(svg)) svg = svg.replace(/<svg([^>]*)>/, `<svg$1 viewBox="0 0 ${src.width} ${src.height}">`);
    svg = svg.replace(/<svg([^>]*?)>/, (_m: string, a: string) =>
      `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="${src.width}" height="${src.height}">`);
    if (o.mono) svg = svg.replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="#000000"');
    return svg;
  };
  const p = potraceChain.then(run, run);
  potraceChain = p.then(() => undefined, () => undefined);
  return p;
}

async function renderComposition(canvas: OffscreenCanvas, comp: LayeredComposition, src: RgbaImage): Promise<void> {
  const w = src.width, h = src.height;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const lum = rgbaToLum(src);
  const resolveMask = (id: string) => maskAlphaFor(id, w, h);
  // Color-region assignments computed once per N for this source.
  const assignByCount = new Map<number, Uint8Array>();
  const resolveColorRegion = (count: number, index: number) => {
    let a = assignByCount.get(count);
    if (!a) { a = colorAssignments(src, count); assignByCount.set(count, a); }
    return colorRegionMask(a, index);
  };

  // Local scratch (not the shared one): renders may run concurrently because the
  // trace path awaits Potrace, so each needs its own canvas.
  const scratch = new OffscreenCanvas(w, h);
  const sctx = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const layers: CompositeLayer[] = [];
  for (const layer of comp.layers) {
    if (!layer.enabled) continue;
    const lp = layerToParams(layer);
    if (lp.mode.kind === 'trace') {
      // Trace via Potrace: rasterize its SVG into the layer scratch.
      sctx.clearRect(0, 0, w, h);
      try {
        const svg = await potraceLayerSvg(src, lp.mode.trace);
        const bm = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }));
        sctx.drawImage(bm, 0, 0, w, h);
        bm.close?.();
      } catch {
        drawOutput(scratch, runCachedPipeline(layerCache(layer.id), src, lp)); // fall back to homegrown
      }
    } else {
      drawOutput(scratch, runCachedPipeline(layerCache(layer.id), src, lp));
    }
    applyTextureOverlay(scratch, layer.treatment.textureOverlay);
    const rgba = sctx.getImageData(0, 0, w, h).data;
    const mask = regionMask(layer.region, { lum, resolveMask, resolveColorRegion }, layer.invertRegion, layer.feather);
    layers.push({ rgba: new Uint8ClampedArray(rgba), mask, blend: layer.blend, opacity: layer.opacity });
  }

  const composed = compositeLayers(w, h, comp.background, comp.transparent, layers);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const id = ctx.createImageData(w, h);
  id.data.set(composed);
  ctx.putImageData(id, 0, 0);
}

function svgEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Serialize a composition to a grouped SVG: one <g> per enabled layer, clipped
// to its region. Trace layers emit vector fills, halftone/vector layers emit
// mark geometry, and pixel modes (raster/palette/tonal) embed a clipped raster.
async function compositionToSvg(
  comp: LayeredComposition, src: RgbaImage, opts: { mode: 'editable' | 'compact' | 'production' },
): Promise<string> {
  const w = src.width, h = src.height;
  const lum = rgbaToLum(src);
  const resolveMask = (id: string) => maskAlphaFor(id, w, h);
  const assignByCount = new Map<number, Uint8Array>();
  const resolveColorRegion = (count: number, index: number) => {
    let a = assignByCount.get(count);
    if (!a) { a = colorAssignments(src, count); assignByCount.set(count, a); }
    return colorRegionMask(a, index);
  };

  const defs: string[] = [];
  const body: string[] = [];
  let i = 0;
  for (const layer of comp.layers) {
    if (!layer.enabled) continue;
    const idx = i++;

    // Region → clip path (skip for full-image, un-inverted layers).
    let clipAttr = '';
    if (layer.region.kind !== 'all' || layer.invertRegion) {
      const mask = regionMask(layer.region, { lum, resolveMask, resolveColorRegion }, layer.invertRegion, 0);
      const bin = new Uint8Array(w * h);
      for (let k = 0; k < bin.length; k++) bin[k] = mask[k] > 0.5 ? 1 : 0;
      const loops = traceBinaryMask(bin, w, h);
      if (loops.length) {
        const d = loops.map((loop) => loopToPathD(loop, 0)).join(' ');
        defs.push(`<clipPath id="clip-${idx}"><path d="${d}"/></clipPath>`);
        clipAttr = ` clip-path="url(#clip-${idx})"`;
      }
    }

    // Layer content. Trace layers go through Potrace (SOTA) like single
    // trace-mode; we lift its <path> elements straight into this group.
    const lp = layerToParams(layer);
    let content = '';
    if (lp.mode.kind === 'trace') {
      try {
        const svg = await potraceLayerSvg(src, lp.mode.trace);
        content = (svg.match(/<path[^>]*\/>|<path[\s\S]*?<\/path>/g) || []).join('');
      } catch {
        const out = runCachedPipeline(layerCache(layer.id), src, lp);
        if (out.kind === 'traced') content = out.regions.map((r) => `<path fill="${r.color}" fill-rule="evenodd" d="${r.d}"/>`).join('');
      }
      body.push(`<g id="${svgEsc(layer.name)}"${clipAttr}${layer.opacity < 1 ? ` opacity="${layer.opacity}"` : ''}${layer.blend !== 'normal' ? ` style="mix-blend-mode:${layer.blend}"` : ''}>${content}</g>`);
      continue;
    }
    const out = runCachedPipeline(layerCache(layer.id), src, lp);
    if (out.kind === 'traced') {
      content = out.regions
        .map((r) => `<path fill="${r.color}" fill-rule="evenodd" d="${r.d}"/>`)
        .join('');
    } else if (out.kind === 'marks') {
      content = markSetToSvgGroups(out.set, opts);
    } else {
      // raster / indexed → embed a PNG of the rendered layer.
      if (compScratch.width !== w) compScratch.width = w;
      if (compScratch.height !== h) compScratch.height = h;
      drawOutput(compScratch, out);
      const blob = await compScratch.convertToBlob({ type: 'image/png' });
      const uri = await blobToDataUri(blob);
      content = `<image href="${uri}" x="0" y="0" width="${w}" height="${h}"/>`;
    }

    const gAttrs = [`id="${svgEsc(layer.name)}"`];
    if (clipAttr) gAttrs.push(clipAttr.trim());
    if (layer.opacity < 1) gAttrs.push(`opacity="${layer.opacity}"`);
    if (layer.blend !== 'normal') gAttrs.push(`style="mix-blend-mode:${layer.blend}"`);
    body.push(`<g ${gAttrs.join(' ')}>${content}</g>`);
  }

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`];
  if (!comp.transparent) parts.push(`<rect width="${w}" height="${h}" fill="${comp.background}"/>`);
  if (defs.length) parts.push(`<defs>${defs.join('')}</defs>`);
  parts.push(...body);
  parts.push('</svg>');
  return parts.join('\n');
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
  if (mode === 'nearest') {
    // Pixel-art intent: no smoothing.
    const fullC = new OffscreenCanvas(src.width, src.height);
    const fctx = fullC.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const fid = fctx.createImageData(src.width, src.height);
    fid.data.set(src.data);
    fctx.putImageData(fid, 0, 0);
    const small = new OffscreenCanvas(pw, ph);
    const sctx = small.getContext('2d') as OffscreenCanvasRenderingContext2D;
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(fullC, 0, 0, pw, ph);
    return { width: pw, height: ph, data: new Uint8ClampedArray(sctx.getImageData(0, 0, pw, ph).data) };
  }
  // Downscale via an area-average box filter in LINEAR light: integrates the
  // full footprint (no aliasing/moiré with the halftone screen) and averages
  // light, not gamma (detailed regions don't darken). Both 'bilinear' and
  // 'bicubic' get this correct filter for reduction.
  return boxDownsampleLinear(src, pw, ph);
}

export {};

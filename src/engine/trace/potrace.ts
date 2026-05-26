// SOTA tracing via Potrace (esm-potrace-wasm): colour extraction + gold-standard
// curve fitting. Runs on the main thread (App owns the source RgbaImage), which
// sidesteps wasm path resolution inside the bundled Web Worker. Returns a
// self-contained SVG string used for both the crisp preview overlay and export.
//
// Potrace is GPL-2.0; this is a free, open, public tool, so that's fine.

import { init, potrace } from 'esm-potrace-wasm';
import type { RgbaImage } from '../image/types';
import type { TraceOptions } from './trace';

let ready: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!ready) ready = init();
  return ready;
}

// Map our TraceOptions to Potrace parameters.
//  colors    → posterizelevel (number of quantized colour levels)
//  smoothing → alphamax (corner→curve threshold, 0..1.334; higher = rounder)
//  simplify  → opttolerance (Bézier optimization tolerance)
//  minArea   → turdsize (suppress speckles smaller than N px)
function mapOptions(o: TraceOptions) {
  return {
    turdsize: Math.max(0, Math.round(o.minArea)),
    turnpolicy: 4, // minority — good default for organic art
    alphamax: Math.max(0, Math.min(1.334, o.smoothing * 1.334)),
    opticurve: 1,
    opttolerance: Math.max(0, Math.min(1.5, o.simplify * 0.2)),
    pathonly: false,
    extractcolors: true,
    posterizelevel: Math.max(1, Math.min(255, Math.round(o.colors))),
    posterizationalgorithm: 0, // 0 simple, 1 interpolation
  };
}

// Potrace's SVG sometimes omits an explicit viewBox/size; normalize it so the
// <img> overlay scales correctly and the file is self-contained. Optionally
// paint a background rect (Potrace output is transparent between shapes).
function normalizeSvg(svg: string, w: number, h: number, background: string, transparent: boolean): string {
  let out = svg;
  if (!/viewBox=/.test(out)) {
    out = out.replace(/<svg([^>]*)>/, `<svg$1 viewBox="0 0 ${w} ${h}">`);
  }
  // Ensure width/height attributes match the source.
  out = out.replace(/<svg([^>]*?)>/, (_m: string, attrs: string) => {
    const a = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${a} width="${w}" height="${h}">`;
  });
  if (!transparent && background && background !== 'none') {
    out = out.replace(/(<svg[^>]*>)/, `$1<rect width="${w}" height="${h}" fill="${background}"/>`);
  }
  return out;
}

async function traceNow(
  src: RgbaImage, opts: TraceOptions, background: string, transparent: boolean,
): Promise<string> {
  await ensureInit();
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const id = ctx.createImageData(src.width, src.height);
  id.data.set(src.data);
  ctx.putImageData(id, 0, 0);
  const svg = await potrace(canvas, mapOptions(opts));
  return normalizeSvg(svg, src.width, src.height, background, transparent);
}

// The wasm module has a single shared heap and is NOT concurrency-safe — two
// overlapping calls (e.g. the debounced preview overlay racing an export)
// corrupt it ("offset is out of bounds"). Serialize every call through a
// single-flight chain so they never overlap.
let chain: Promise<unknown> = Promise.resolve();

export function potraceToSvg(
  src: RgbaImage,
  opts: TraceOptions,
  background = '#ffffff',
  transparent = false,
): Promise<string> {
  const run = () => traceNow(src, opts, background, transparent);
  const p = chain.then(run, run); // run after the previous call settles
  chain = p.then(() => undefined, () => undefined); // never break the chain
  return p;
}

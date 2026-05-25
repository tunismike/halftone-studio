// Build a per-pixel alpha mask (0..1) for a layer's region over the source.
// External regions (uploaded mask / interactive selection) are resolved through
// a callback so this stays pure and testable; colorRegion is filled by the
// Phase-2 auto-selection generator.

import type { LumImage } from '../image/types';
import type { LayerRegion } from './types';

export interface RegionContext {
  lum: LumImage;
  // resolve a same-size alpha mask for an external region id (mask/selection)
  resolveMask?: (id: string) => Float32Array | undefined;
  // resolve a colorRegion membership mask (1 where pixel ∈ region.index)
  resolveColorRegion?: (count: number, index: number) => Float32Array | undefined;
}

function smoothEdge(v: number, lo: number, hi: number, feather: number): number {
  // 1 inside [lo,hi], ramping to 0 across `feather` on each side.
  const f = Math.max(1e-4, feather);
  if (v < lo) return Math.max(0, 1 - (lo - v) / f);
  if (v > hi) return Math.max(0, 1 - (v - hi) / f);
  return 1;
}

export function regionMask(
  region: LayerRegion,
  ctx: RegionContext,
  invert: boolean,
  feather: number,
): Float32Array {
  const { lum } = ctx;
  const n = lum.width * lum.height;
  const out = new Float32Array(n);

  switch (region.kind) {
    case 'all':
      out.fill(1);
      break;
    case 'toneBand': {
      const lo = Math.min(region.min, region.max);
      const hi = Math.max(region.min, region.max);
      for (let i = 0; i < n; i++) out[i] = smoothEdge(lum.data[i], lo, hi, feather);
      break;
    }
    case 'mask': {
      const m = ctx.resolveMask?.(region.maskId);
      if (m && m.length === n) out.set(m);
      else out.fill(1); // mask not loaded → treat as full (don't silently hide)
      break;
    }
    case 'selection': {
      const m = ctx.resolveMask?.(region.selectionId);
      if (m && m.length === n) out.set(m);
      else out.fill(1);
      break;
    }
    case 'colorRegion': {
      const m = ctx.resolveColorRegion?.(region.count, region.index);
      if (m && m.length === n) out.set(m);
      else out.fill(1);
      break;
    }
  }

  if (invert) for (let i = 0; i < n; i++) out[i] = 1 - out[i];
  return out;
}

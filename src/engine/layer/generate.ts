// Auto-selection generators: build a starter layered composition from an image,
// either as N luminance bands or N quantized color regions. Each band/region
// becomes its own editable layer (treatment defaults to a grid halftone in the
// band's representative color).

import { defaultVectorMode } from '../pipeline';
import { defaultAdjust } from '../image/adjust';
import type { RgbaImage } from '../image/types';
import { extractRegionPalette } from './color-region';
import type { Layer, LayeredComposition, LayerTreatment } from './types';

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function defaultTreatment(foreground = '#000000'): LayerTreatment {
  return { mode: defaultVectorMode(), adjust: { ...defaultAdjust }, foreground };
}

export function makeLayer(p: { name: string; region: Layer['region']; foreground?: string }): Layer {
  return {
    id: uid('layer'),
    name: p.name,
    region: p.region,
    invertRegion: false,
    treatment: defaultTreatment(p.foreground ?? '#000000'),
    enabled: true,
    blend: 'normal',
    opacity: 1,
    feather: 0.03,
  };
}

function clampCount(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function grayHex(v: number): string {
  const h = Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

export function toneBandLayers(count: number): Layer[] {
  const n = clampCount(count, 2, 6);
  const out: Layer[] = [];
  for (let i = 0; i < n; i++) {
    const lo = i / n, hi = (i + 1) / n;
    out.push(makeLayer({
      name: `Tone ${i + 1}`,
      region: { kind: 'toneBand', min: lo, max: hi },
      foreground: grayHex((lo + hi) / 2),
    }));
  }
  return out;
}

export function colorRegionLayers(src: RgbaImage, count: number): Layer[] {
  const n = clampCount(count, 2, 12);
  const colors = extractRegionPalette(src, n);
  return colors.map((c, i) => makeLayer({
    name: `Color ${i + 1}`,
    region: { kind: 'colorRegion', count: n, index: i },
    foreground: c,
  }));
}

export function generateComposition(
  src: RgbaImage,
  kind: 'tone' | 'color',
  count: number,
  background = '#ffffff',
): LayeredComposition {
  const layers = kind === 'tone' ? toneBandLayers(count) : colorRegionLayers(src, count);
  return { layers, background, transparent: false };
}

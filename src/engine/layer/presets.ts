// Demo compositions — ready-made layered looks that work on any image without
// segmentation (regions are tone bands, so no source analysis is required).
// These showcase the mixed-treatment / multi-plate capabilities of Phase 4-6.

import { defaultGridScreen, defaultTraceMode, defaultVectorMode } from '../pipeline';
import type { RgbaImage } from '../image/types';
import { makeLayer } from './generate';
import type { Layer, LayerBlend, LayerRegion, LayeredComposition } from './types';

function halftoneLayer(
  name: string, region: LayerRegion, color: string,
  cell: number, angleDeg: number, blend: LayerBlend,
): Layer {
  const l = makeLayer({ name, region, foreground: color });
  const mode = defaultVectorMode();
  if (mode.kind === 'vector') mode.screen = defaultGridScreen(cell, angleDeg);
  l.treatment.mode = mode;
  l.blend = blend;
  l.feather = 0.05;
  return l;
}

// Tri-tone screen-print: three ink plates at different screen angles, each
// confined to a luminance band and multiply-composited like overprinted inks.
export function triToneScreenprint(): LayeredComposition {
  return {
    layers: [
      halftoneLayer('Shadow plate', { kind: 'toneBand', min: 0, max: 0.45 }, '#1d3557', 7, 15, 'multiply'),
      halftoneLayer('Mid plate', { kind: 'toneBand', min: 0.3, max: 0.72 }, '#e63946', 7, 45, 'multiply'),
      halftoneLayer('Highlight plate', { kind: 'toneBand', min: 0.6, max: 1 }, '#f4a259', 7, 75, 'multiply'),
    ],
    background: '#f8f4e9',
    transparent: false,
  };
}

// Poster: a halftone background everywhere, with the darker "subject" tones
// traced into flat vector colour on top.
export function tracedSubjectHalftoneBg(): LayeredComposition {
  const bg = halftoneLayer('Halftone background', { kind: 'all' }, '#3a3a3a', 6, 45, 'normal');
  const subject = makeLayer({
    name: 'Traced subject',
    region: { kind: 'toneBand', min: 0, max: 0.45 },
    foreground: '#101010',
  });
  subject.treatment.mode = defaultTraceMode();
  subject.feather = 0.02;
  return { layers: [bg, subject], background: '#ffffff', transparent: false };
}

export interface CompositionPreset {
  id: string;
  name: string;
  build: (src?: RgbaImage) => LayeredComposition;
}

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  { id: 'tri-tone', name: 'Tri-tone screen-print', build: () => triToneScreenprint() },
  { id: 'traced-subject', name: 'Traced subject + halftone', build: () => tracedSubjectHalftoneBg() },
];

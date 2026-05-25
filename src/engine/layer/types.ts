// Layered composition: an ordered stack of region-masked treatments composited
// into one image. A plain single-mode document is just a one-layer composition,
// so this is a superset of the existing pipeline.

import type { AdjustParams } from '../image/adjust';
import type { PreprocessParams } from '../image/preprocess';
import type { ModeKind } from '../pipeline';
import type { TextureOverlay } from '../texture/types';

// Where a layer applies. Selection/colorRegion masks are produced upstream
// (auto-selection generators / interactive tools) and referenced by id.
export type LayerRegion =
  | { kind: 'all' }
  | { kind: 'toneBand'; min: number; max: number }      // luminance window 0..1
  | { kind: 'colorRegion'; count: number; index: number } // quantize→count, keep index
  | { kind: 'mask'; maskId: string }                     // user-uploaded mask
  | { kind: 'selection'; selectionId: string };          // interactive selection

export type LayerBlend = 'normal' | 'multiply' | 'screen' | 'darken' | 'lighten';

// A layer's visual treatment — the same knobs as a single-mode doc, minus the
// composite-global background (the composition owns that).
export interface LayerTreatment {
  mode: ModeKind;
  adjust: AdjustParams;
  preprocess?: PreprocessParams;
  textureOverlay?: TextureOverlay;
  foreground: string;
}

export interface Layer {
  id: string;
  name: string;
  region: LayerRegion;
  invertRegion: boolean;
  treatment: LayerTreatment;
  enabled: boolean;
  blend: LayerBlend;
  opacity: number; // 0..1
  feather: number; // 0..1 soft edge on the region mask
}

export interface LayeredComposition {
  layers: Layer[];     // bottom-to-top draw order
  background: string;
  transparent: boolean;
}

export function isComposition(v: unknown): v is LayeredComposition {
  return !!v && typeof v === 'object' && Array.isArray((v as LayeredComposition).layers);
}

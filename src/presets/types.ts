import type { AdjustParams } from '../engine/image/adjust';
import type { PreprocessParams } from '../engine/image/preprocess';
import type { ModeKind } from '../engine/pipeline';
import type { TextureOverlay } from '../engine/texture/types';

export type PresetCategory = 'screen' | 'grid' | 'line' | 'wave' | 'stochastic' | 'color' | 'palette' | 'organic' | 'distress' | 'texture';

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  adjust: AdjustParams;
  preprocess?: PreprocessParams;
  mode: ModeKind;
  background: string;
  foreground: string;
  transparent: boolean;
  textureOverlay?: TextureOverlay;
}

export interface PresetState {
  adjust: AdjustParams;
  preprocess?: PreprocessParams;
  mode: ModeKind;
  background: string;
  foreground: string;
  transparent: boolean;
  textureOverlay?: TextureOverlay;
}

export function presetState(p: Preset): PresetState {
  return {
    adjust: p.adjust,
    preprocess: p.preprocess,
    mode: p.mode,
    background: p.background,
    foreground: p.foreground,
    transparent: p.transparent,
    textureOverlay: p.textureOverlay,
  };
}

import type { LumImage } from './image/types';
import type { MarkSet } from './mark/types';
import type { IndexedImage } from './dither/error-diffusion-palette';
import type { TracedRegion } from './trace/trace';
import type { CoverageMap } from './screen/pattern-field';

export type Output =
  | { kind: 'raster'; image: LumImage }
  | { kind: 'indexed'; image: IndexedImage }
  | { kind: 'marks'; set: MarkSet }
  // Pattern screens: per-pixel ink coverage in one ink. Hard (knockout) output
  // carries only 0/255; soft preview carries antialiased values.
  | {
      kind: 'field';
      coverage: CoverageMap;
      ink: string;
      background: string;
      transparent: boolean;
    }
  | { kind: 'traced'; regions: TracedRegion[]; width: number; height: number; background: string; transparent: boolean };

import type { LumImage } from './image/types';
import type { MarkSet } from './mark/types';
import type { IndexedImage } from './dither/error-diffusion-palette';
import type { TracedRegion } from './trace/trace';
import type { CoverageMap } from './screen/pattern-field';

export type Output =
  | { kind: 'raster'; image: LumImage }
  | { kind: 'indexed'; image: IndexedImage }
  | { kind: 'marks'; set: MarkSet }
  // Pattern screens: per-pixel ink coverage, one map per ink. Hard (knockout)
  // output carries only 0/255; soft preview carries antialiased values.
  //
  // Colour work needs one layer per ink screened at its own angle, the same way
  // the mark-based CMYK and spot modes do it — a single luminance channel
  // throws the colour away before the screen ever runs, and saturated hues that
  // differ wildly can share a luminance, so they collapse into each other.
  | {
      kind: 'field';
      layers: Array<{ coverage: CoverageMap; ink: string }>;
      /**
       * How the layers combine. Inks multiply — cyan over yellow is green.
       * A palette instead assigns each pixel exactly one colour, so its layers
       * paint normally and multiplying them would just turn everything black.
       */
      blend: 'multiply' | 'normal';
      width: number;
      height: number;
      background: string;
      transparent: boolean;
    }
  | { kind: 'traced'; regions: TracedRegion[]; width: number; height: number; background: string; transparent: boolean };

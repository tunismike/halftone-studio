import type { LumImage } from './image/types';
import type { MarkSet } from './mark/types';
import type { IndexedImage } from './dither/error-diffusion-palette';
import type { TracedRegion } from './trace/trace';

export type Output =
  | { kind: 'raster'; image: LumImage }
  | { kind: 'indexed'; image: IndexedImage }
  | { kind: 'marks'; set: MarkSet }
  | { kind: 'traced'; regions: TracedRegion[]; width: number; height: number; background: string; transparent: boolean };

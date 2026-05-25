// Mask overlay: selectively restricts where the halftone effect renders.
// Where mask luminance is high, output shows the halftoned pixels;
// where it's low, the source image passes through.

export interface MaskOverlay {
  maskId: string;            // user-uploaded mask id, references IndexedDB blob
  invert: boolean;           // if true, swap white/black semantics
  threshold: number;         // 0..1; values above = halftone, below = source
  feather: number;           // 0..1; soft transition width around threshold
}

export const defaultMaskOverlay: MaskOverlay = {
  maskId: '',
  invert: false,
  threshold: 0.5,
  feather: 0.05,
};

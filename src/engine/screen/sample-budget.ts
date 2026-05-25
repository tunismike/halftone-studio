// Shared safety net for screen generators. A sub-2px cell on a multi-
// megapixel image yields millions of marks, which freezes the single
// Path2D fill in the renderer. clampCell raises the effective cell size
// so the emitted sample count stays under MAX_SAMPLES regardless of how
// small a cellSize the DPI helper / slider / preset / URL asks for.

export const MAX_SAMPLES = 120_000;

// Stipple dots are tiny and non-overlapping, so they rasterize far cheaper than
// big halftone circles — a higher budget is safe and lets stipple get genuinely
// dense without the mark-explosion hang the default guards against.
export const MAX_SAMPLES_STIPPLE = 400_000;

export function clampCell(
  requested: number, width: number, height: number, maxSamples = MAX_SAMPLES,
): number {
  const cell = Math.max(0.5, requested);
  const estimate = (width / cell) * (height / cell);
  if (estimate <= maxSamples) return cell;
  return Math.sqrt((width * height) / maxSamples);
}

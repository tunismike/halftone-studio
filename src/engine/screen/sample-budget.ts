// Shared safety net for screen generators. A sub-2px cell on a multi-
// megapixel image yields millions of marks, which freezes the single
// Path2D fill in the renderer. clampCell raises the effective cell size
// so the emitted sample count stays under MAX_SAMPLES regardless of how
// small a cellSize the DPI helper / slider / preset / URL asks for.

export const MAX_SAMPLES = 120_000;

// Stipple shares the default budget. The cell count bounds CANDIDATE cells, but
// emitted dots scale with image darkness — a dark region at a high cell budget
// can emit nearly that many circles, and rendering 400k+ arcs in one Path2D
// fill stalls the worker (the white-page bug). 120k worst-case dots renders
// reliably. Genuinely higher-density stipple needs a raster dot path in the
// preview instead of vector arcs — a separate change.
export const MAX_SAMPLES_STIPPLE = MAX_SAMPLES;

export function clampCell(
  requested: number, width: number, height: number, maxSamples = MAX_SAMPLES,
): number {
  const cell = Math.max(0.5, requested);
  const estimate = (width / cell) * (height / cell);
  if (estimate <= maxSamples) return cell;
  return Math.sqrt((width * height) / maxSamples);
}

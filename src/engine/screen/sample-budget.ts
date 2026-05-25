// Shared safety net for screen generators. A sub-2px cell on a multi-
// megapixel image yields millions of marks, which freezes the single
// Path2D fill in the renderer. clampCell raises the effective cell size
// so the emitted sample count stays under MAX_SAMPLES regardless of how
// small a cellSize the DPI helper / slider / preset / URL asks for.

export const MAX_SAMPLES = 120_000;

export function clampCell(requested: number, width: number, height: number): number {
  const cell = Math.max(1, requested);
  const estimate = (width / cell) * (height / cell);
  if (estimate <= MAX_SAMPLES) return cell;
  return Math.sqrt((width * height) / MAX_SAMPLES);
}

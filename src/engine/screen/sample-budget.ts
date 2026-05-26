// Shared safety net for screen generators. clampCell raises the effective cell
// size so the emitted sample (dot) count stays under MAX_SAMPLES, however small
// a cellSize the DPI helper / slider / preset / URL asks for.
//
// The renderer now stamps dense circle groups as anti-aliased raster discs
// (render.ts), which is O(total dot area) ≈ O(pixels) instead of O(dots) — so
// the ceiling is no longer the render freeze, but keeping the exported SVG
// usable (this cap ≈ a ~24 MB SVG). The preview renders the SAME dot set, so it
// stays representative of the SVG.
export const MAX_SAMPLES = 400_000;

// Stipple shares the budget; the raster disc-stamper handles dense dark regions
// without the old Path2D stall.
export const MAX_SAMPLES_STIPPLE = MAX_SAMPLES;

export function clampCell(
  requested: number, width: number, height: number, maxSamples = MAX_SAMPLES,
): number {
  const cell = Math.max(0.5, requested);
  const estimate = (width / cell) * (height / cell);
  if (estimate <= maxSamples) return cell;
  return Math.sqrt((width * height) / maxSamples);
}

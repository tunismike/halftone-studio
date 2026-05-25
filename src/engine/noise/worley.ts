import { hash2 } from './hash';

export interface WorleySample {
  f1: number;
  f2: number;
}

// Tileable Worley/cellular noise. Feature points live on a jittered grid;
// each pixel surveys 9 neighbor cells in the periodic lattice, picking the
// nearest two distances (F1, F2). Cell size in [0,1] grid units —
// 0.1 means ~100 features across the tile (10×10 cells).
export function tileableWorley(
  u: number, v: number,
  cellsPerSide: number,
  jitter: number,
  seed: number,
): WorleySample {
  const cu = u * cellsPerSide;
  const cv = v * cellsPerSide;
  const cellX = Math.floor(cu);
  const cellY = Math.floor(cv);
  const fx = cu - cellX;
  const fy = cv - cellY;

  let f1 = Infinity, f2 = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = ((cellY + dy) % cellsPerSide + cellsPerSide) % cellsPerSide;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = ((cellX + dx) % cellsPerSide + cellsPerSide) % cellsPerSide;
      const px = hash2(nx, ny, seed);
      const py = hash2(nx, ny, seed + 9173);
      const featX = dx + jitter * px + (1 - jitter) * 0.5;
      const featY = dy + jitter * py + (1 - jitter) * 0.5;
      const ddx = featX - fx;
      const ddy = featY - fy;
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  // Convert squared distances back to linear, normalize by max cell-diag.
  const norm = Math.sqrt(2);
  return { f1: Math.sqrt(f1) / norm, f2: Math.sqrt(f2) / norm };
}

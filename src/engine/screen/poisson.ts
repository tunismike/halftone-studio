import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import { rng } from '../noise/hash';

export interface PoissonParams {
  minRadius: number;
  maxRadius: number;
  densityFromLum: boolean;
  seed: number;
  k: number;
}

export function poissonScreen(img: LumImage, p: PoissonParams): Sample[] {
  const { width, height } = img;
  const minR = Math.max(1, p.minRadius);
  const maxR = Math.max(minR, p.maxRadius);
  const cellSize = minR / Math.SQRT2;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const grid = new Int32Array(cols * rows);
  grid.fill(-1);

  const samples: Sample[] = [];
  const radii: number[] = [];
  const active: number[] = [];
  const rand = rng(p.seed | 0 || 1);
  const span = Math.ceil(maxR / cellSize) + 1;

  const radiusAt = (lum: number): number => {
    if (!p.densityFromLum) return minR;
    return minR + (maxR - minR) * lum;
  };

  const fits = (x: number, y: number, r: number): boolean => {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    for (let dy = -span; dy <= span; dy++) {
      const ny = gy + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let dx = -span; dx <= span; dx++) {
        const nx = gx + dx;
        if (nx < 0 || nx >= cols) continue;
        const idx = grid[ny * cols + nx];
        if (idx === -1) continue;
        const s = samples[idx];
        const need = Math.max(r, radii[idx]);
        const ddx = s.x - x;
        const ddy = s.y - y;
        if (ddx * ddx + ddy * ddy < need * need) return false;
      }
    }
    return true;
  };

  const emit = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const lum = sampleBilinear(img, x, y);
    const r = radiusAt(lum);
    if (!fits(x, y, r)) return false;
    const idx = samples.length;
    samples.push({ x, y, value: lum, cellSize: r * 2 });
    radii.push(r);
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    grid[gy * cols + gx] = idx;
    active.push(idx);
    return true;
  };

  emit(rand() * width, rand() * height);

  while (active.length > 0) {
    const aIdx = Math.floor(rand() * active.length);
    const sIdx = active[aIdx];
    const s = samples[sIdx];
    const sr = radii[sIdx];
    let placed = false;
    for (let i = 0; i < p.k; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = sr + rand() * sr;
      if (emit(s.x + Math.cos(ang) * dist, s.y + Math.sin(ang) * dist)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      active[aIdx] = active[active.length - 1];
      active.pop();
    }
  }

  return samples;
}

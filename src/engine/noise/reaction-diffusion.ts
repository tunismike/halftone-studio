// Gray-Scott reaction-diffusion simulator.
//
// Reference: Pearson 1993, "Complex Patterns in a Simple System" (Science 261).
// Catalog of canonical (F, k) values curated from Mrob's xmorphia gallery
// (https://mrob.com/pub/comp/xmorphia/) and standard surveys.
//
// Output: Float32Array of V concentrations in approximately [0, 1], tileable
// because the simulation uses toroidal boundary conditions.

import { rng } from './hash';

export interface GrayScottParams {
  F: number;   // feed rate
  k: number;   // kill rate
  Du?: number; // diffusion of U; default 0.16 (Pearson/Mrob convention)
  Dv?: number; // diffusion of V; default 0.08
  dt?: number; // timestep; default 1.0 — paired with Du/Dv above for CFL stability
}

export interface SimulateOptions extends GrayScottParams {
  size: number;       // grid side length (toroidal)
  iterations: number; // typical 1000–4000
  seed: number;
  seedPatches?: number; // initial perturbation patch count; default 20
}

export type PatternId =
  | 'coral' | 'coral-maze' | 'coral-dots' | 'coral-lines'
  | 'amoeba' | 'reptile' | 'chameleon' | 'fingerprint'
  | 'maze' | 'network' | 'waves' | 'squiggles'
  | 'wormy' | 'seismic' | 'zig-zag' | 'sausage'
  | 'circles' | 'spirals' | 'pebbles' | 'blobs'
  | 'diamonds' | 'gravel' | 'gator-skin' | 'leafy';

export interface PatternDef {
  id: PatternId;
  name: string;
  F: number;
  k: number;
  // Some patterns need more iterations to settle.
  recommendedIterations: number;
  notes?: string;
}

// Canonical (F, k) values per pattern. Sourced from Mrob's xmorphia catalog
// and Pearson 1993. Some values are choices among nearby points that produce
// the named visual character — Gray-Scott parameter space is continuous and
// pattern names are user-applied not formal.
export const PATTERN_CATALOG: PatternDef[] = [
  { id: 'coral',       name: 'Coral',        F: 0.0620, k: 0.0620, recommendedIterations: 4000 },
  { id: 'coral-maze',  name: 'Coral maze',   F: 0.0390, k: 0.0580, recommendedIterations: 4000 },
  { id: 'coral-dots',  name: 'Coral dots',   F: 0.0250, k: 0.0600, recommendedIterations: 4000 },
  { id: 'coral-lines', name: 'Coral lines',  F: 0.0620, k: 0.0610, recommendedIterations: 4000 },
  { id: 'amoeba',      name: 'Amoeba',       F: 0.0220, k: 0.0510, recommendedIterations: 4000 },
  { id: 'reptile',     name: 'Reptile',      F: 0.0260, k: 0.0590, recommendedIterations: 4000 },
  { id: 'chameleon',   name: 'Chameleon',    F: 0.0340, k: 0.0600, recommendedIterations: 4000 },
  { id: 'fingerprint', name: 'Fingerprint',  F: 0.0550, k: 0.0620, recommendedIterations: 5000 },
  { id: 'maze',        name: 'Maze',         F: 0.0290, k: 0.0570, recommendedIterations: 5000 },
  { id: 'network',     name: 'Network',      F: 0.0300, k: 0.0590, recommendedIterations: 4000 },
  { id: 'waves',       name: 'Waves',        F: 0.0140, k: 0.0450, recommendedIterations: 3000 },
  { id: 'squiggles',   name: 'Squiggles',    F: 0.0300, k: 0.0590, recommendedIterations: 3000 },
  { id: 'wormy',       name: 'Wormy',        F: 0.0780, k: 0.0610, recommendedIterations: 4000 },
  { id: 'seismic',     name: 'Seismic',      F: 0.0200, k: 0.0460, recommendedIterations: 3000 },
  { id: 'zig-zag',     name: 'Zig zag',      F: 0.0340, k: 0.0630, recommendedIterations: 4000 },
  { id: 'sausage',     name: 'Sausage',      F: 0.0540, k: 0.0630, recommendedIterations: 4000 },
  { id: 'circles',     name: 'Circles',      F: 0.0390, k: 0.0580, recommendedIterations: 3000 },
  { id: 'spirals',     name: 'Spirals',      F: 0.0180, k: 0.0510, recommendedIterations: 4000 },
  { id: 'pebbles',     name: 'Pebbles',      F: 0.0250, k: 0.0600, recommendedIterations: 4000 },
  { id: 'blobs',       name: 'Blobs',        F: 0.0220, k: 0.0510, recommendedIterations: 3000 },
  { id: 'diamonds',    name: 'Diamonds',     F: 0.0340, k: 0.0650, recommendedIterations: 4000 },
  { id: 'gravel',      name: 'Gravel',       F: 0.0450, k: 0.0610, recommendedIterations: 4000 },
  { id: 'gator-skin',  name: 'Gator skin',   F: 0.0580, k: 0.0650, recommendedIterations: 4000 },
  { id: 'leafy',       name: 'Leafy',        F: 0.0450, k: 0.0580, recommendedIterations: 4000 },
];

export function findPattern(id: PatternId): PatternDef | undefined {
  return PATTERN_CATALOG.find((p) => p.id === id);
}

export interface RdField {
  size: number;
  values: Float32Array; // V concentrations, tileable
}

export function simulateGrayScott(opts: SimulateOptions): RdField {
  const size = Math.max(16, opts.size | 0);
  const N = size * size;
  const F = opts.F;
  const k = opts.k;
  const Du = opts.Du ?? 0.16;
  const Dv = opts.Dv ?? 0.08;
  const dt = opts.dt ?? 1.0;
  const iters = Math.max(1, opts.iterations | 0);
  const seed = opts.seed | 0 || 1;
  const patches = opts.seedPatches ?? 20;

  let U = new Float32Array(N);
  let V = new Float32Array(N);
  U.fill(1.0);

  const rand = rng(seed);
  for (let i = 0; i < patches; i++) {
    const cx = Math.floor(rand() * size);
    const cy = Math.floor(rand() * size);
    const r = 3 + Math.floor(rand() * 5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy >= r * r) continue;
        const x = ((cx + dx) % size + size) % size;
        const y = ((cy + dy) % size + size) % size;
        const idx = y * size + x;
        V[idx] = 0.5 + rand() * 0.5;
        U[idx] = 0.25;
      }
    }
  }

  // Precompute wrap tables to avoid mod ops in the inner loop.
  const ym1 = new Int32Array(size);
  const yp1 = new Int32Array(size);
  for (let y = 0; y < size; y++) {
    ym1[y] = (y - 1 + size) % size;
    yp1[y] = (y + 1) % size;
  }

  let Un = new Float32Array(N);
  let Vn = new Float32Array(N);

  for (let iter = 0; iter < iters; iter++) {
    for (let y = 0; y < size; y++) {
      const rowY = y * size;
      const rowYm = ym1[y] * size;
      const rowYp = yp1[y] * size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;
        const i = rowY + x;
        const u = U[i];
        const v = V[i];
        const lU = U[rowYm + x] + U[rowYp + x] + U[rowY + xm] + U[rowY + xp] - 4 * u;
        const lV = V[rowYm + x] + V[rowYp + x] + V[rowY + xm] + V[rowY + xp] - 4 * v;
        const uvv = u * v * v;
        Un[i] = u + dt * (Du * lU - uvv + F * (1 - u));
        Vn[i] = v + dt * (Dv * lV + uvv - (F + k) * v);
      }
    }
    const tmpU = U; U = Un; Un = tmpU;
    const tmpV = V; V = Vn; Vn = tmpV;
  }

  // Normalize V to [0, 1] so downstream consumers can treat it as
  // luminance-like without worrying about Gray-Scott's actual range.
  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < N; i++) {
    const v = V[i];
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  const range = vmax - vmin;
  if (range > 1e-6) {
    const inv = 1 / range;
    for (let i = 0; i < N; i++) V[i] = (V[i] - vmin) * inv;
  }

  return { size, values: V };
}

// Convenience: simulate by pattern id, using its recommended iteration count
// (unless overridden).
export function simulatePattern(opts: {
  pattern: PatternId;
  size: number;
  iterations?: number;
  seed: number;
}): RdField {
  const def = findPattern(opts.pattern);
  if (!def) throw new Error(`unknown reaction-diffusion pattern: ${opts.pattern}`);
  return simulateGrayScott({
    size: opts.size,
    F: def.F,
    k: def.k,
    iterations: opts.iterations ?? def.recommendedIterations,
    seed: opts.seed,
  });
}

// Bilinear toroidal sample for using the (tileable) field as a screen mask.
export function sampleRdField(field: RdField, x: number, y: number): number {
  const n = field.size;
  // wrap into [0, n)
  let fx = x - Math.floor(x / n) * n;
  let fy = y - Math.floor(y / n) * n;
  if (fx < 0) fx += n;
  if (fy < 0) fy += n;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = (x0 + 1) % n;
  const y1 = (y0 + 1) % n;
  const tx = fx - x0;
  const ty = fy - y0;
  const v = field.values;
  const a = v[y0 * n + x0];
  const b = v[y0 * n + x1];
  const c = v[y1 * n + x0];
  const d = v[y1 * n + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

// Void-and-cluster blue-noise threshold mask generator.
// Ulichney 1993, with incremental density updates for browser-friendly speed.
//
// Per the engineering brief at docs/dither-and-palettes-reference.md:
// - Cyclic (toroidal) Gaussian filter so the mask tiles seamlessly
// - σ ≈ 1.5 for typical 64×64
// - Three-phase ranking turns the binary prototype into a 0..N-1 rank matrix
// - Threshold mask = (rank + 0.5) / N

import { rng } from './hash';

export interface BlueNoiseMask {
  size: number;
  // Threshold values in [0,1), tileable.
  values: Float32Array;
}

export interface GenerateOptions {
  size: number;
  sigma: number;
  seed: number;
  initialDensity: number; // fraction of ON pixels at start, typical 0.1
}

const defaultOpts: Omit<GenerateOptions, 'size'> = {
  sigma: 1.5,
  seed: 1,
  initialDensity: 0.1,
};

export function generateBlueNoiseMask(opts: Partial<GenerateOptions> & { size: number }): BlueNoiseMask {
  const o: GenerateOptions = { ...defaultOpts, ...opts };
  const n = o.size;
  const N = n * n;

  // Build a small Gaussian kernel. For σ=1.5, ~4σ support = radius 6.
  const radius = Math.max(2, Math.ceil(4 * o.sigma));
  const kSide = radius * 2 + 1;
  const kernel = new Float32Array(kSide * kSide);
  let kSum = 0;
  for (let ky = -radius; ky <= radius; ky++) {
    for (let kx = -radius; kx <= radius; kx++) {
      const w = Math.exp(-(kx * kx + ky * ky) / (2 * o.sigma * o.sigma));
      kernel[(ky + radius) * kSide + (kx + radius)] = w;
      kSum += w;
    }
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= kSum;

  const bits = new Uint8Array(N);
  const density = new Float32Array(N);
  const rand = rng(o.seed | 0 || 1);

  const sprinkle = Math.max(1, Math.round(o.initialDensity * N));
  for (let placed = 0; placed < sprinkle;) {
    const idx = (rand() * N) | 0;
    if (bits[idx] === 0) { bits[idx] = 1; placed++; }
  }

  function addContribution(idx: number, sign: 1 | -1): void {
    const px = idx % n;
    const py = (idx - px) / n;
    for (let ky = -radius; ky <= radius; ky++) {
      const ny = wrap(py + ky, n);
      const krow = (ky + radius) * kSide + radius;
      for (let kx = -radius; kx <= radius; kx++) {
        const nx = wrap(px + kx, n);
        density[ny * n + nx] += sign * kernel[krow + kx];
      }
    }
  }

  // Initialize density from bits.
  for (let i = 0; i < N; i++) if (bits[i]) addContribution(i, 1);

  function tightestCluster(): number {
    let best = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < N; i++) {
      if (bits[i] && density[i] > bestVal) {
        bestVal = density[i];
        best = i;
      }
    }
    return best;
  }

  function largestVoid(): number {
    let best = -1;
    let bestVal = Infinity;
    for (let i = 0; i < N; i++) {
      if (!bits[i] && density[i] < bestVal) {
        bestVal = density[i];
        best = i;
      }
    }
    return best;
  }

  // Relax prototype: move tightest cluster into largest void until stable.
  for (let iter = 0; iter < N; iter++) {
    const c = tightestCluster();
    if (c < 0) break;
    bits[c] = 0;
    addContribution(c, -1);
    const v = largestVoid();
    if (v < 0 || v === c) {
      bits[c] = 1;
      addContribution(c, 1);
      break;
    }
    bits[v] = 1;
    addContribution(v, 1);
  }

  // Snapshot the prototype for Phase I (removal pass keeps mutating bits).
  const proto = bits.slice();
  const m = proto.reduce((s, b) => s + b, 0);

  const ranks = new Int32Array(N).fill(-1);

  // PHASE I — rank existing minority pixels by removing tightest cluster each step.
  for (let rank = m - 1; rank >= 0; rank--) {
    const c = tightestCluster();
    if (c < 0) break;
    ranks[c] = rank;
    bits[c] = 0;
    addContribution(c, -1);
  }

  // Restore prototype for Phase II.
  for (let i = 0; i < N; i++) {
    if (bits[i] !== proto[i]) {
      bits[i] = proto[i];
      addContribution(i, bits[i] ? 1 : -1);
    }
  }
  // density is now back to prototype state; sanity: recompute if drift suspected.

  // PHASE II — grow from prototype to 50% by filling largest voids.
  for (let rank = m; rank < N / 2; rank++) {
    const v = largestVoid();
    if (v < 0) break;
    ranks[v] = rank;
    bits[v] = 1;
    addContribution(v, 1);
  }

  // PHASE III — continue 50% → 100% by ranking tightest cluster of HOLES.
  // Work on the complement: invert bits + invert density sign for the "holes" view.
  for (let rank = Math.floor(N / 2); rank < N; rank++) {
    // tightest cluster of holes = pixel where (1 - bits[i]) == 1 AND density[i] is MIN
    // (low density = surrounded by other holes = tightest hole cluster)
    let best = -1;
    let bestVal = Infinity;
    for (let i = 0; i < N; i++) {
      if (!bits[i] && density[i] < bestVal) {
        bestVal = density[i];
        best = i;
      }
    }
    if (best < 0) break;
    ranks[best] = rank;
    bits[best] = 1;
    addContribution(best, 1);
  }

  // Convert ranks to thresholds in [0, 1).
  const values = new Float32Array(N);
  for (let i = 0; i < N; i++) values[i] = (ranks[i] + 0.5) / N;

  return { size: n, values };
}

function wrap(v: number, n: number): number {
  const m = v % n;
  return m < 0 ? m + n : m;
}

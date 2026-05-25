// Procedural texture recipes. All produce a GrayTexture (square, tileable,
// values in [0,1]).
//
// Tileability strategy:
//   - Recipes built on periodic primitives (sin, cos, modulo) tile naturally.
//   - Noise-based recipes use the 4-corner cross-fade trick so opposite edges
//     of the texture match seamlessly.
//   - Gray-Scott already produces tileable output (toroidal boundaries).

import { fbm } from '../noise/value';
import { hash2, rng } from '../noise/hash';
import { simulateGrayScott } from '../noise/reaction-diffusion';
import { tileableWorley } from '../noise/worley';
import type { GrayTexture, RecipeParams, TextureRecipeId } from './types';

export function generateTexture(recipe: TextureRecipeId, params: RecipeParams): GrayTexture {
  switch (recipe) {
    case 'noise-grit':         return noiseGrit(params);
    case 'fabric-weave':       return fabricWeave(params);
    case 'paint-scuff':        return paintScuff(params);
    case 'distressed-paper':   return distressedPaper(params);
    case 'line-scratches':     return lineScratches(params);
    case 'brush-strokes':      return brushStrokes(params);
    case 'halftone-noise':     return halftoneNoise(params);
    case 'cellular-cracks':    return cellularCracks(params);
    case 'cellular-speckle':   return cellularSpeckle(params);
    case 'binarized-noise':    return binarizedNoise(params);
    case 'anisotropic-fabric': return anisotropicFabric(params);
    case 'crack-network':      return crackNetwork(params);
    case 'warped-halftone':    return warpedHalftone(params);
    case 'ink-stroke':         return inkStroke(params);
    case 'crackle-glaze':      return crackleGlaze(params);
    case 'spatter':            return spatter(params);
    case 'woven-fiber':        return wovenFiber(params);
  }
}

// ─── 13. Warped halftone (sine-displaced dot grid — ThrashTones feel) ─

function warpedHalftone(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const cell = p.cellSize ?? 10;
  const warpAmt = (p.intensity ?? 0.4) * cell;
  const contrast = p.contrast ?? 1.4;
  const values = new Float32Array(size * size);
  values.fill(1);
  const cellsPerSide = Math.max(1, Math.round(size / cell));
  const actual = size / cellsPerSide;
  const twoPi = Math.PI * 2;
  for (let cy = 0; cy < cellsPerSide; cy++) {
    for (let cx = 0; cx < cellsPerSide; cx++) {
      const u = (cx + 0.5) / cellsPerSide;
      const v = (cy + 0.5) / cellsPerSide;
      // Sine warp + a little tileable noise on the dot centers.
      const wx = Math.sin(v * twoPi * 2 + seed) * warpAmt;
      const wy = Math.cos(u * twoPi * 2 + seed) * warpAmt;
      const n = tileableFbm(u, v, 3, 3, 0.5, 2, seed);
      const r = contrastCurve(n, contrast) * actual * 0.55;
      const ccx = (cx + 0.5) * actual + wx;
      const ccy = (cy + 0.5) * actual + wy;
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = (((ccx + dx) | 0) % size + size) % size;
          const py = (((ccy + dy) | 0) % size + size) % size;
          values[py * size + px] = 0;
        }
      }
    }
  }
  return { size, values };
}

// ─── 14. Ink stroke (broken hatching strokes — scratchboard) ─────────

function inkStroke(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const angleDeg = p.angleDeg ?? 45;
  const density = p.density ?? 0.5;
  const breakAmt = p.jitter ?? 0.4;
  const values = new Float32Array(size * size);
  values.fill(1);
  const rand = rng(seed);
  const theta = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const count = Math.round(density * size * 1.5);
  for (let i = 0; i < count; i++) {
    const x0 = rand() * size;
    const y0 = rand() * size;
    const len = size * (0.2 + rand() * 0.5);
    const width = 0.6 + rand() * 1.6;
    const steps = Math.ceil(len);
    for (let s = 0; s < steps; s++) {
      // Broken strokes: skip segments to mimic a dry nib.
      if (rand() < breakAmt * 0.15) continue;
      const sx = x0 + ux * s;
      const sy = y0 + uy * s;
      const wi = Math.ceil(width);
      for (let w = -wi; w <= wi; w++) {
        const px = (((sx - uy * w) | 0) % size + size) % size;
        const py = (((sy + ux * w) | 0) % size + size) % size;
        if (Math.abs(w) <= width) values[py * size + px] = 0;
      }
    }
  }
  return { size, values };
}

// ─── 15. Crackle glaze (multi-scale Worley ridges — ceramic) ─────────

function crackleGlaze(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const cells = p.cellsPerSide ?? 8;
  const jitter = p.jitter ?? 0.85;
  const threshold = p.threshold ?? 0.05;
  const contrast = p.contrast ?? 9;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Two octaves of Voronoi ridges → big cracks with fine sub-cracks.
      const a = tileableWorley(u, v, cells, jitter, seed);
      const b = tileableWorley(u, v, cells * 3, jitter, seed + 71);
      const edgeA = clamp01(((a.f2 - a.f1) - threshold) * contrast);
      const edgeB = clamp01(((b.f2 - b.f1) - threshold * 1.5) * contrast * 1.4);
      values[y * size + x] = Math.min(edgeA, edgeB === 0 ? edgeA : Math.min(edgeA, 1 - (1 - edgeB) * 0.6));
    }
  }
  return { size, values };
}

// ─── 16. Spatter (sparse variable-size ink droplets) ─────────────────

function spatter(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const density = p.density ?? 0.25;
  const maxR = p.scale ?? 6;
  const values = new Float32Array(size * size);
  values.fill(1);
  const rand = rng(seed);
  const count = Math.round(density * size);
  for (let i = 0; i < count; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    // Power-law size: many tiny specks, a few big blots.
    const t = rand();
    const r = 0.5 + Math.pow(t, 3) * maxR;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = (((cx + dx) | 0) % size + size) % size;
        const py = (((cy + dy) | 0) % size + size) % size;
        values[py * size + px] = 0;
      }
    }
  }
  return { size, values };
}

// ─── 17. Woven fiber (two-direction thread lines — canvas/denim) ─────

function wovenFiber(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const threads = p.threads ?? 48;
  const contrast = p.contrast ?? 2.2;
  const noiseAmt = p.intensity ?? 0.4;
  const values = new Float32Array(size * size);
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Over/under weave: warp and weft alternate which is on top per cell.
      const warp = 0.5 + 0.5 * Math.sin(u * twoPi * threads);
      const weft = 0.5 + 0.5 * Math.sin(v * twoPi * threads);
      const cellX = Math.floor(u * threads);
      const cellY = Math.floor(v * threads);
      const over = (cellX + cellY) & 1 ? warp : weft;
      const n = tileableFbm(u, v, threads * 0.5, 3, 0.55, 2, seed);
      let val = over * (1 - noiseAmt) + n * noiseAmt;
      val = clamp01(0.5 + (val - 0.5) * contrast);
      values[y * size + x] = val;
    }
  }
  return { size, values };
}

// ─── helpers ─────────────────────────────────────────────────────────

function normalize(values: Float32Array): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  if (range < 1e-6) {
    values.fill(0.5);
    return;
  }
  const inv = 1 / range;
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - lo) * inv;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Tileable FBM via 4-corner cross-fade. Inputs u, v in [0, 1).
function tileableFbm(
  u: number, v: number,
  freq: number, octaves: number, gain: number, lacunarity: number, seed: number,
): number {
  const cfg = { octaves, gain, lacunarity };
  const a = fbm(u * freq,       v * freq,       seed, cfg);
  const b = fbm((u - 1) * freq, v * freq,       seed, cfg);
  const c = fbm(u * freq,       (v - 1) * freq, seed, cfg);
  const d = fbm((u - 1) * freq, (v - 1) * freq, seed, cfg);
  // Cross-fade weights ensure edges meet smoothly.
  return (1 - u) * (1 - v) * a
       +     u   * (1 - v) * b
       + (1 - u) *     v   * c
       +     u   *     v   * d;
}

function contrastCurve(v: number, contrast: number): number {
  // contrast > 1 sharpens, < 1 softens. Mid-point 0.5.
  const c = Math.max(0.01, contrast);
  return clamp01(0.5 + (v - 0.5) * c);
}

// ─── 1. Noise grit (FBM-based grayscale noise) ───────────────────────

function noiseGrit(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const freq = (p.scale ?? 4);
  const oct = p.octaves ?? 4;
  const gain = p.gain ?? 0.5;
  const lac = p.lacunarity ?? 2.0;
  const contrast = p.contrast ?? 1.2;
  const values = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      values[y * size + x] = tileableFbm(u, v, freq, oct, gain, lac, seed);
    }
  }
  normalize(values);
  for (let i = 0; i < values.length; i++) values[i] = contrastCurve(values[i], contrast);
  return { size, values };
}

// ─── 2. Fabric weave (sine stripe interference) ──────────────────────

function fabricWeave(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const threads = p.threads ?? 24; // stripes per side
  const warp = p.warpRatio ?? 0.5;
  const noiseAmount = p.intensity ?? 0.15;
  const values = new Float32Array(size * size);
  const twoPi = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Two-way interference; phase offset so stripes interlock as a weave.
      const h = 0.5 + 0.5 * Math.sin(x / size * twoPi * threads);
      const v = 0.5 + 0.5 * Math.sin(y / size * twoPi * threads + Math.PI * 0.5);
      let weave = h * warp + v * (1 - warp);
      // Sprinkle a touch of tileable noise to break perfection.
      const n = tileableFbm(x / size, y / size, threads * 0.6, 3, 0.5, 2, seed);
      weave += (n - 0.5) * noiseAmount;
      values[y * size + x] = clamp01(weave);
    }
  }
  return { size, values };
}

// ─── 3. Paint scuff (Gray-Scott RD at high contrast) ─────────────────

function paintScuff(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const contrast = p.contrast ?? 2.5;
  // Pick a (F, k) that yields rough cellular blots — close to "amoeba".
  const F = 0.024;
  const k = 0.055;
  const field = simulateGrayScott({
    size, F, k, iterations: 3000, seed,
    Du: 0.16, Dv: 0.08, dt: 1.0,
  });
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i++) {
    values[i] = contrastCurve(field.values[i], contrast);
  }
  return { size, values };
}

// ─── 4. Distressed paper (layered noise + speckle) ───────────────────

function distressedPaper(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const speckleAmount = p.intensity ?? 0.5;
  const erosion = p.contrast ?? 1.3;
  const values = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Soft large-scale variation.
      const base = tileableFbm(u, v, 2, 3, 0.5, 2.0, seed);
      // High-freq speckle, modulated by base.
      const speckle = tileableFbm(u, v, 32, 2, 0.7, 2.0, seed + 9173);
      // Erosion mask — random small dropouts.
      const er = hash2((x * 31) | 0, (y * 31) | 0, seed + 5);
      let val = base * (1 - speckleAmount * 0.5) + speckle * speckleAmount * 0.5;
      if (er < 0.04) val *= 0.3; // occasional ink dropouts
      values[y * size + x] = val;
    }
  }
  normalize(values);
  for (let i = 0; i < values.length; i++) values[i] = contrastCurve(values[i], erosion);
  return { size, values };
}

// ─── 5. Line scratches (oriented streaks via noise-warped lines) ─────

function lineScratches(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const density = p.density ?? 0.35;     // 0..1 — fraction of canvas area covered
  const angleDeg = p.angleDeg ?? 0;
  const jitter = p.jitter ?? 0.25;
  const intensity = p.intensity ?? 0.7;
  const values = new Float32Array(size * size);
  values.fill(1.0); // white = no scratch

  const rand = rng(seed);
  const theta = (angleDeg * Math.PI) / 180;
  const baseDx = Math.cos(theta);
  const baseDy = Math.sin(theta);
  const scratchCount = Math.round(density * size * 2);

  for (let i = 0; i < scratchCount; i++) {
    const x0 = rand() * size;
    const y0 = rand() * size;
    const length = 8 + rand() * (size * 0.3);
    const j = (rand() - 0.5) * 2 * jitter;
    const dx = baseDx + j * baseDy;
    const dy = baseDy - j * baseDx;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const steps = Math.ceil(length);
    const opacity = (0.3 + rand() * 0.7) * intensity;
    for (let s = 0; s < steps; s++) {
      const sx = x0 + ux * s;
      const sy = y0 + uy * s;
      const px = ((sx | 0) % size + size) % size;
      const py = ((sy | 0) % size + size) % size;
      const idx = py * size + px;
      // Subtract opacity per stroke — overlapping strokes darken further.
      values[idx] = Math.max(0, values[idx] - opacity * 0.15);
      // Also tile-wrap by also writing at sx ± size, sy ± size if near edge,
      // to ensure scratches that cross the boundary appear on the other side.
      // Modulo above handles that.
    }
  }
  return { size, values };
}

// ─── 6. Brush strokes (curl noise + sparse marks) ────────────────────

function brushStrokes(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const density = p.density ?? 0.4;
  const length = p.scale ?? 24;
  const intensity = p.intensity ?? 0.6;
  const values = new Float32Array(size * size);
  values.fill(1.0);

  const rand = rng(seed);
  const noiseFreq = 6;
  const strokeCount = Math.round(density * size * 1.2);

  for (let i = 0; i < strokeCount; i++) {
    let x = rand() * size;
    let y = rand() * size;
    const steps = Math.round(length * (0.5 + rand()));
    const opacity = (0.2 + rand() * 0.6) * intensity;
    for (let s = 0; s < steps; s++) {
      // Curl noise direction: tangent to the gradient of an FBM scalar field.
      const eps = 1;
      const u = x / size;
      const v = y / size;
      const cfg = { octaves: 3, gain: 0.5, lacunarity: 2 };
      const fx = fbm((u + eps / size) * noiseFreq, v * noiseFreq, seed, cfg)
               - fbm((u - eps / size) * noiseFreq, v * noiseFreq, seed, cfg);
      const fy = fbm(u * noiseFreq, (v + eps / size) * noiseFreq, seed, cfg)
               - fbm(u * noiseFreq, (v - eps / size) * noiseFreq, seed, cfg);
      // Perpendicular = curl direction in 2D.
      const cx = -fy;
      const cy = fx;
      const mag = Math.hypot(cx, cy);
      if (mag < 1e-6) break;
      x += (cx / mag);
      y += (cy / mag);
      const px = ((x | 0) % size + size) % size;
      const py = ((y | 0) % size + size) % size;
      const idx = py * size + px;
      values[idx] = Math.max(0, values[idx] - opacity * 0.2);
    }
  }
  return { size, values };
}

// ─── 8. Cellular cracks (Voronoi F2-F1 — ridges between cells) ───────

function cellularCracks(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const cells = p.cellsPerSide ?? 14;
  const jitter = p.jitter ?? 0.9;
  const threshold = p.threshold ?? 0.06;
  const contrast = p.contrast ?? 8;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const { f1, f2 } = tileableWorley(u, v, cells, jitter, seed);
      const edge = f2 - f1; // small near cell borders, large in interior
      // 1 - smoothstep so ridges are dark on white background.
      const t = clamp01((edge - threshold) * contrast);
      values[y * size + x] = t;
    }
  }
  return { size, values };
}

// ─── 9. Cellular speckle (hard-thresholded Worley F1) ────────────────

function cellularSpeckle(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const cells = p.cellsPerSide ?? 28;
  const jitter = p.jitter ?? 0.95;
  const threshold = p.threshold ?? 0.35;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const { f1 } = tileableWorley(u, v, cells, jitter, seed);
      values[y * size + x] = f1 < threshold ? 0 : 1;
    }
  }
  return { size, values };
}

// ─── 10. Hard-threshold multi-band noise (sharp speckle) ─────────────

function binarizedNoise(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const freq = p.scale ?? 18;
  const oct = p.octaves ?? 4;
  const threshold = p.threshold ?? 0.5;
  const contrast = p.contrast ?? 12;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = tileableFbm(u, v, freq, oct, 0.5, 2.0, seed);
      // Soft-then-hard transition: contrast curve sharpens around threshold.
      const t = clamp01(0.5 + (n - threshold) * contrast);
      values[y * size + x] = t;
    }
  }
  return { size, values };
}

// ─── 11. Anisotropic fabric (directional grain + thread modulation) ──

function anisotropicFabric(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const threads = p.threads ?? 36;
  const angleDeg = p.angleDeg ?? 0;
  const intensity = p.intensity ?? 0.7;
  const contrast = p.contrast ?? 3.5;
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const values = new Float32Array(size * size);
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Rotate UV into thread axis.
      const tu = u * cos + v * sin;
      const tv = -u * sin + v * cos;
      // Thick threads in the across-direction, modulated by along-direction noise.
      const across = 0.5 + 0.5 * Math.sin(tv * twoPi * threads);
      const along = tileableFbm(u, v, threads * 0.6, 4, 0.55, 2.1, seed);
      // Sharp dark gaps between threads, modulated by fiber noise.
      let val = across * (1 - intensity) + along * intensity;
      val = clamp01(0.5 + (val - 0.5) * contrast);
      // Hard fiber pulses (lighter strands).
      const tu2 = (tu + along * 0.05) * twoPi * (threads * 1.4);
      val *= 0.7 + 0.3 * Math.abs(Math.sin(tu2));
      values[y * size + x] = clamp01(val);
    }
  }
  return { size, values };
}

// ─── 12. Crack network (vector-traced Voronoi edges as black strokes) ─

function crackNetwork(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const cells = p.cellsPerSide ?? 18;
  const jitter = p.jitter ?? 0.85;
  const thickness = p.intensity ?? 1.5;
  const breakChance = p.threshold ?? 0.25;
  const values = new Float32Array(size * size);
  values.fill(1); // start white
  // Sample F2-F1 at slightly higher resolution to anti-alias the edges.
  const SUB = 2;
  const w = size * SUB;
  const stamp = (px: number, py: number, alpha: number) => {
    const ix = ((px | 0) % size + size) % size;
    const iy = ((py | 0) % size + size) % size;
    values[iy * size + ix] = Math.min(values[iy * size + ix], 1 - alpha);
  };
  for (let yi = 0; yi < w; yi++) {
    for (let xi = 0; xi < w; xi++) {
      const u = xi / w;
      const v = yi / w;
      const { f1, f2 } = tileableWorley(u, v, cells, jitter, seed);
      const edge = (f2 - f1) * cells;
      if (edge < thickness * 0.04) {
        // Optional break: hash a per-edge cell to decide whether to render.
        const breakKey = hash2((xi / SUB) | 0, (yi / SUB) | 0, seed + 99);
        if (breakKey > breakChance) {
          const alpha = clamp01(1 - edge / (thickness * 0.04));
          stamp(xi / SUB, yi / SUB, alpha);
        }
      }
    }
  }
  return { size, values };
}

// ─── 7. Halftone of noise (recursive aesthetic) ──────────────────────

function halftoneNoise(p: RecipeParams): GrayTexture {
  const size = p.size ?? 256;
  const seed = p.seed ?? 1;
  const cellSize = p.cellSize ?? 8;
  const contrast = p.contrast ?? 1.4;
  const values = new Float32Array(size * size);
  values.fill(1.0);

  // For each cell, sample tileable noise and draw a circle whose radius
  // varies with the noise value.
  const cellsPerSide = Math.floor(size / cellSize);
  const actualCell = size / cellsPerSide;
  for (let cy = 0; cy < cellsPerSide; cy++) {
    for (let cx = 0; cx < cellsPerSide; cx++) {
      const u = (cx + 0.5) / cellsPerSide;
      const v = (cy + 0.5) / cellsPerSide;
      const n = tileableFbm(u, v, 3, 4, 0.55, 2, seed);
      // Map noise to dot radius (darker noise = bigger dot).
      const r = contrastCurve(1 - n, contrast) * (actualCell * 0.5);
      const centerX = (cx + 0.5) * actualCell;
      const centerY = (cy + 0.5) * actualCell;
      // Rasterize circle (tiled wrap).
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = (((centerX + dx) | 0) % size + size) % size;
          const py = (((centerY + dy) | 0) % size + size) % size;
          values[py * size + px] = 0;
        }
      }
    }
  }
  // Soften
  for (let i = 0; i < values.length; i++) values[i] = contrastCurve(values[i], 0.85);
  return { size, values };
}

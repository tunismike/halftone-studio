import type { BundledTextureDef } from './types';

// Generic descriptive names. Each entry is a recipe + params combo.
export const BUNDLED_TEXTURES: BundledTextureDef[] = [
  // Noise grit family
  { id: 'fine-grit',      name: 'Fine grit',       recipe: 'noise-grit', params: { size: 256, seed: 1, scale: 12, octaves: 4, contrast: 1.4 } },
  { id: 'coarse-grit',    name: 'Coarse grit',     recipe: 'noise-grit', params: { size: 256, seed: 3, scale: 4,  octaves: 5, contrast: 1.5 } },
  { id: 'static-dust',    name: 'Static dust',     recipe: 'noise-grit', params: { size: 256, seed: 7, scale: 20, octaves: 3, contrast: 1.6 } },
  { id: 'aerosol-mist',   name: 'Aerosol mist',    recipe: 'noise-grit', params: { size: 256, seed: 11, scale: 6, octaves: 4, contrast: 0.9 } },
  { id: 'sandpaper',      name: 'Sandpaper',       recipe: 'noise-grit', params: { size: 256, seed: 13, scale: 18, octaves: 5, contrast: 1.8 } },

  // Fabric weave family
  { id: 'linen-cross',    name: 'Linen cross',     recipe: 'fabric-weave', params: { size: 256, seed: 1,  threads: 24, warpRatio: 0.5, intensity: 0.15 } },
  { id: 'tight-weave',    name: 'Tight weave',     recipe: 'fabric-weave', params: { size: 256, seed: 2,  threads: 40, warpRatio: 0.5, intensity: 0.1 } },
  { id: 'open-weave',     name: 'Open weave',      recipe: 'fabric-weave', params: { size: 256, seed: 3,  threads: 12, warpRatio: 0.5, intensity: 0.2 } },
  { id: 'denim-twill',    name: 'Denim twill',     recipe: 'fabric-weave', params: { size: 256, seed: 4,  threads: 32, warpRatio: 0.7, intensity: 0.18 } },

  // Paint scuff family
  { id: 'paint-flake',    name: 'Paint flake',     recipe: 'paint-scuff', params: { size: 256, seed: 1, contrast: 2.2 } },
  { id: 'worn-enamel',    name: 'Worn enamel',     recipe: 'paint-scuff', params: { size: 256, seed: 5, contrast: 3.0 } },
  { id: 'rust-patch',     name: 'Rust patch',      recipe: 'paint-scuff', params: { size: 256, seed: 9, contrast: 1.8 } },
  { id: 'scuffed-leather', name: 'Scuffed leather', recipe: 'paint-scuff', params: { size: 256, seed: 13, contrast: 2.5 } },

  // Distressed paper family
  { id: 'old-paper',      name: 'Old paper',       recipe: 'distressed-paper', params: { size: 256, seed: 1, intensity: 0.4, contrast: 1.2 } },
  { id: 'newsprint',      name: 'Newsprint',       recipe: 'distressed-paper', params: { size: 256, seed: 3, intensity: 0.7, contrast: 1.5 } },
  { id: 'vintage-card',   name: 'Vintage card',    recipe: 'distressed-paper', params: { size: 256, seed: 5, intensity: 0.3, contrast: 1.1 } },
  { id: 'pulp-grain',     name: 'Pulp grain',      recipe: 'distressed-paper', params: { size: 256, seed: 7, intensity: 0.55, contrast: 1.3 } },

  // Line scratches family
  { id: 'pen-hatch',      name: 'Pen hatch',       recipe: 'line-scratches', params: { size: 256, seed: 1, density: 0.6, angleDeg: 45, jitter: 0.1, intensity: 0.6 } },
  { id: 'brush-rake',     name: 'Brush rake',      recipe: 'line-scratches', params: { size: 256, seed: 3, density: 0.4, angleDeg: 0,  jitter: 0.3, intensity: 0.5 } },
  { id: 'drag-streak',    name: 'Drag streak',     recipe: 'line-scratches', params: { size: 256, seed: 5, density: 0.25, angleDeg: 15, jitter: 0.5, intensity: 0.7 } },
  { id: 'wire-brush',     name: 'Wire brush',      recipe: 'line-scratches', params: { size: 256, seed: 7, density: 0.8, angleDeg: 90, jitter: 0.15, intensity: 0.5 } },

  // Brush stroke family
  { id: 'dry-brush',      name: 'Dry brush',       recipe: 'brush-strokes', params: { size: 256, seed: 1, density: 0.5, scale: 30, intensity: 0.6 } },
  { id: 'ink-fleck',      name: 'Ink fleck',       recipe: 'brush-strokes', params: { size: 256, seed: 3, density: 0.3, scale: 12, intensity: 0.8 } },
  { id: 'paint-splatter', name: 'Paint splatter',  recipe: 'brush-strokes', params: { size: 256, seed: 5, density: 0.15, scale: 18, intensity: 0.9 } },
  { id: 'stipple',        name: 'Stipple',         recipe: 'brush-strokes', params: { size: 256, seed: 7, density: 1.0, scale: 6,  intensity: 0.4 } },

  // Halftone-of-noise family
  { id: 'photo-grain',    name: 'Photo grain',     recipe: 'halftone-noise', params: { size: 256, seed: 1, cellSize: 6,  contrast: 1.3 } },
  { id: 'soft-dot-field', name: 'Soft dot field',  recipe: 'halftone-noise', params: { size: 256, seed: 3, cellSize: 12, contrast: 1.1 } },
  { id: 'print-dust',     name: 'Print dust',      recipe: 'halftone-noise', params: { size: 256, seed: 5, cellSize: 4,  contrast: 1.5 } },

  // ── Cellular cracks (Voronoi ridges) ──────────────────────
  { id: 'gator-skin',     name: 'Gator skin',      recipe: 'cellular-cracks', params: { size: 256, seed: 1,  cellsPerSide: 16, jitter: 0.9, threshold: 0.04, contrast: 10 } },
  { id: 'pebble-cracks',  name: 'Pebble cracks',   recipe: 'cellular-cracks', params: { size: 256, seed: 3,  cellsPerSide: 24, jitter: 0.95, threshold: 0.05, contrast: 12 } },
  { id: 'mosaic-grout',   name: 'Mosaic grout',    recipe: 'cellular-cracks', params: { size: 256, seed: 5,  cellsPerSide: 10, jitter: 0.7, threshold: 0.08, contrast: 8 } },

  // ── Cellular speckle (Worley dots) ────────────────────────
  { id: 'big-halftone',   name: 'Big halftone',    recipe: 'cellular-speckle', params: { size: 256, seed: 1, cellsPerSide: 22, jitter: 0.0, threshold: 0.42 } },
  { id: 'thrown-ink',     name: 'Thrown ink',      recipe: 'cellular-speckle', params: { size: 256, seed: 3, cellsPerSide: 32, jitter: 1.0, threshold: 0.28 } },
  { id: 'pinprick',       name: 'Pinprick',        recipe: 'cellular-speckle', params: { size: 256, seed: 5, cellsPerSide: 48, jitter: 0.95, threshold: 0.22 } },

  // ── Binarized noise (high-contrast speckle) ───────────────
  { id: 'beatgrit',       name: 'Beatgrit',        recipe: 'binarized-noise', params: { size: 256, seed: 1, scale: 32, octaves: 4, threshold: 0.5, contrast: 14 } },
  { id: 'riffraff',       name: 'Riffraff',        recipe: 'binarized-noise', params: { size: 256, seed: 3, scale: 16, octaves: 5, threshold: 0.5, contrast: 18 } },
  { id: 'photo-dots',     name: 'Photo dots',      recipe: 'binarized-noise', params: { size: 256, seed: 5, scale: 24, octaves: 3, threshold: 0.5, contrast: 22 } },
  { id: 'iceberg',        name: 'Iceberg',         recipe: 'binarized-noise', params: { size: 256, seed: 7, scale: 8,  octaves: 6, threshold: 0.5, contrast: 10 } },

  // ── Anisotropic fabric ────────────────────────────────────
  { id: 'linen',          name: 'Linen',           recipe: 'anisotropic-fabric', params: { size: 256, seed: 1, threads: 40, angleDeg: 0,  intensity: 0.5, contrast: 4 } },
  { id: 'denim',          name: 'Denim',           recipe: 'anisotropic-fabric', params: { size: 256, seed: 3, threads: 28, angleDeg: 30, intensity: 0.6, contrast: 5 } },
  { id: 'fiberglass',     name: 'Fiberglass',      recipe: 'anisotropic-fabric', params: { size: 256, seed: 5, threads: 60, angleDeg: 0,  intensity: 0.7, contrast: 3 } },

  // ── Crack network ─────────────────────────────────────────
  { id: 'plastisol-crack', name: 'Plastisol crack', recipe: 'crack-network', params: { size: 256, seed: 1,  cellsPerSide: 22, jitter: 0.85, intensity: 1.8, threshold: 0.0 } },
  { id: 'shattered-glass', name: 'Shattered glass', recipe: 'crack-network', params: { size: 256, seed: 5,  cellsPerSide: 14, jitter: 0.95, intensity: 1.4, threshold: 0.0 } },

  // ── Warped halftone (ThrashTones) ─────────────────────────
  { id: 'thrash-dots',    name: 'Thrash dots',     recipe: 'warped-halftone', params: { size: 256, seed: 1, cellSize: 10, intensity: 0.45, contrast: 1.4 } },
  { id: 'wavy-dots',      name: 'Wavy dots',       recipe: 'warped-halftone', params: { size: 256, seed: 4, cellSize: 14, intensity: 0.6, contrast: 1.2 } },

  // ── Ink stroke / scratchboard ─────────────────────────────
  { id: 'scratchboard',   name: 'Scratchboard',    recipe: 'ink-stroke', params: { size: 256, seed: 1, angleDeg: 45, density: 0.6, jitter: 0.4 } },
  { id: 'cross-hatch',    name: 'Cross-hatch',     recipe: 'ink-stroke', params: { size: 256, seed: 2, angleDeg: 20, density: 0.45, jitter: 0.3 } },

  // ── Crackle glaze ─────────────────────────────────────────
  { id: 'crackle-glaze',  name: 'Crackle glaze',   recipe: 'crackle-glaze', params: { size: 256, seed: 1, cellsPerSide: 8, jitter: 0.85, threshold: 0.05, contrast: 9 } },

  // ── Spatter ───────────────────────────────────────────────
  { id: 'ink-spatter',    name: 'Ink spatter',     recipe: 'spatter', params: { size: 256, seed: 3, density: 0.3, scale: 7 } },

  // ── Woven fiber ───────────────────────────────────────────
  { id: 'canvas-weave',   name: 'Canvas weave',    recipe: 'woven-fiber', params: { size: 256, seed: 1, threads: 44, contrast: 2.2, intensity: 0.4 } },
];

export function findBundledTexture(id: string): BundledTextureDef | undefined {
  return BUNDLED_TEXTURES.find((t) => t.id === id);
}

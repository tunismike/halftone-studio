// Procedural texture types. All textures are grayscale, square, and
// tileable so they can be drawn at any canvas size via repeated stamping.

export type TextureRecipeId =
  | 'noise-grit'
  | 'fabric-weave'
  | 'paint-scuff'
  | 'distressed-paper'
  | 'line-scratches'
  | 'brush-strokes'
  | 'halftone-noise'
  | 'cellular-cracks'
  | 'cellular-speckle'
  | 'binarized-noise'
  | 'anisotropic-fabric'
  | 'crack-network';

export interface GrayTexture {
  size: number;
  values: Float32Array; // [0,1] grayscale, row-major, tileable
}

export interface RecipeParams {
  // Common
  size?: number;     // texture resolution, default 256
  seed?: number;     // RNG seed, default 1
  // Recipe-specific (each recipe reads what it needs)
  scale?: number;
  intensity?: number;
  contrast?: number;
  density?: number;
  angleDeg?: number;
  octaves?: number;
  gain?: number;
  lacunarity?: number;
  threads?: number;   // fabric weave: stripes per side
  warpRatio?: number; // fabric weave: warp vs weft weight
  cellSize?: number;  // halftone-noise / scratches
  jitter?: number;    // scratches direction jitter; also cellular jitter
  threshold?: number; // 0..1 binarization threshold for cellular/binarized recipes
  cellsPerSide?: number; // Worley density
}

export interface BundledTextureDef {
  id: string;
  name: string;
  recipe: TextureRecipeId;
  params: RecipeParams;
}

// Blend modes match Canvas2D / CSS mix-blend-mode names.
export type TextureBlendMode =
  | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten'
  | 'soft-light' | 'hard-light'
  | 'color-burn' | 'color-dodge';

export interface TextureOverlay {
  // Either a bundled texture id OR a user-saved key.
  textureId: string;
  source: 'bundled' | 'user';
  blendMode: TextureBlendMode;
  opacity: number;   // 0..1
  scale: number;     // 1 = native tile size on canvas; >1 zooms in
  offsetX: number;   // canvas pixels
  offsetY: number;
  rotationDeg: number;
  invert: boolean;
  // Per-overlay tweaks applied to the generated/uploaded gray map before
  // blending: contrast curve (1 = identity) and a soft threshold pivot
  // (0.5 = midpoint, lower = brighter cut, higher = darker cut).
  contrast?: number;
  threshold?: number;
}

export const defaultTextureOverlay: TextureOverlay = {
  textureId: 'fine-grit',
  source: 'bundled',
  blendMode: 'multiply',
  opacity: 0.4,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0,
  invert: false,
  contrast: 1,
  threshold: 0.5,
};

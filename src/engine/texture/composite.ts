// Tile-draw a grayscale texture over a canvas with the chosen blend mode.

import type { GrayTexture, TextureOverlay } from './types';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

// Convert a tileable GrayTexture to an ImageBitmap-like Canvas at native size
// so we can use ctx.drawImage() with proper transform stacking.
// Applies invert, contrast (1 = identity), and soft threshold (0.5 = midpoint)
// before writing pixel bytes.
export function textureToCanvas(
  tex: GrayTexture,
  invert: boolean,
  contrast = 1,
  threshold = 0.5,
): OffscreenCanvas {
  const c = new OffscreenCanvas(tex.size, tex.size);
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const id = ctx.createImageData(tex.size, tex.size);
  const pivot = threshold;
  const k = Math.max(0.01, contrast);
  for (let i = 0, j = 0; i < tex.values.length; i++, j += 4) {
    let raw = tex.values[i];
    if (invert) raw = 1 - raw;
    let t = 0.5 + (raw - pivot) * k;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const v = Math.round(t * 255);
    id.data[j] = v;
    id.data[j + 1] = v;
    id.data[j + 2] = v;
    id.data[j + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// Composite the texture over `target` using the overlay settings.
// Tile size on canvas = tex.size * overlay.scale. Offset + rotation supported.
export function compositeTextureOverlay(
  target: AnyCanvas,
  textureCanvas: OffscreenCanvas,
  overlay: TextureOverlay,
): void {
  const ctx = target.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return;
  const tw = textureCanvas.width;
  const th = textureCanvas.height;
  const tileW = Math.max(1, tw * overlay.scale);
  const tileH = Math.max(1, th * overlay.scale);

  ctx.save();
  ctx.globalCompositeOperation = overlay.blendMode;
  ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity));

  if (overlay.rotationDeg !== 0) {
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate((overlay.rotationDeg * Math.PI) / 180);
    ctx.translate(-target.width / 2, -target.height / 2);
  }

  // Cover the full canvas (including rotated bounding) by tiling. When rotated,
  // canvas diagonal is the max radius we need to cover.
  const diag = Math.hypot(target.width, target.height);
  const margin = overlay.rotationDeg !== 0 ? Math.ceil(diag) : 0;
  const startX = -margin + (overlay.offsetX % tileW);
  const startY = -margin + (overlay.offsetY % tileH);
  const endX = target.width + margin;
  const endY = target.height + margin;

  for (let ty = startY; ty < endY; ty += tileH) {
    for (let tx = startX; tx < endX; tx += tileW) {
      ctx.drawImage(textureCanvas, tx, ty, tileW, tileH);
    }
  }
  ctx.restore();
}

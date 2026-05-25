import { lumToRgba } from '../image/luminance';
import type { LumImage } from '../image/types';

export async function exportPng(img: LumImage, filename = 'halftone.png'): Promise<void> {
  const rgba = lumToRgba(img);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(rgba.data);
  ctx.putImageData(id, 0, 0);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    ),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

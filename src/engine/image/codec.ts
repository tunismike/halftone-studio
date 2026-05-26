// Encode/decode an RgbaImage to/from a PNG blob or data URL. Used for project
// persistence and portable .json export (raw pixel buffers are too large to
// store directly; PNG is compact and the decode path matches image upload).

import type { RgbaImage } from './types';

export async function rgbaToPngBlob(img: RgbaImage): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(img.data);
  ctx.putImageData(id, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export async function decodeBlobToRgba(blob: Blob): Promise<RgbaImage> {
  const url = URL.createObjectURL(blob);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error('image decode failed'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = im.width;
    canvas.height = im.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(im, 0, 0);
    const id = ctx.getImageData(0, 0, im.width, im.height);
    return { width: id.width, height: id.height, data: id.data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

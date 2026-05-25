import { useCallback, useState } from 'react';
import type { RgbaImage } from '../engine/image/types';

interface Props {
  onImage: (img: RgbaImage, name: string) => void;
}

export function ImageUploader({ onImage }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const handleFile = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      try {
        const bitmap = await loadBitmap(url);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas 2d unavailable');
        ctx.drawImage(bitmap, 0, 0);
        const id = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        onImage(
          { width: id.width, height: id.height, data: id.data },
          file.name,
        );
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [onImage],
  );

  return (
    <label
      className={`upload${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith('image/')) void handleFile(f);
      }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      {dragOver ? 'Drop to load image' : 'Click or drop image here'}
    </label>
  );
}

function loadBitmap(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

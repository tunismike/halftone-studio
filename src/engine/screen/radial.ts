import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import { clampCell } from './sample-budget';

export interface RadialParams {
  cellSize: number;
  cxFrac: number;
  cyFrac: number;
}

export function radialScreen(img: LumImage, p: RadialParams): Sample[] {
  const cell = clampCell(p.cellSize, img.width, img.height);
  const cx = p.cxFrac * img.width;
  const cy = p.cyFrac * img.height;
  const maxR = Math.hypot(
    Math.max(cx, img.width - cx),
    Math.max(cy, img.height - cy),
  );
  const out: Sample[] = [];
  out.push({ x: cx, y: cy, value: sampleBilinear(img, cx, cy), cellSize: cell });
  const ringCount = Math.ceil(maxR / cell);
  for (let i = 1; i <= ringCount; i++) {
    const r = i * cell;
    const circumference = 2 * Math.PI * r;
    const n = Math.max(6, Math.round(circumference / cell));
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (x < -cell || y < -cell || x > img.width + cell || y > img.height + cell) continue;
      out.push({
        x,
        y,
        value: sampleBilinear(img, x, y),
        cellSize: cell,
        angle: (ang * 180) / Math.PI,
      });
    }
  }
  return out;
}

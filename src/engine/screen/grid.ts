import type { LumImage, Sample } from '../image/types';
import { sampleBilinear } from '../image/sample';
import { clampCell } from './sample-budget';

export interface GridParams {
  cellSize: number;
  angleDeg: number;
}

export function gridScreen(img: LumImage, p: GridParams): Sample[] {
  const cell = clampCell(p.cellSize, img.width, img.height);
  const theta = (p.angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cosI = Math.cos(-theta);
  const sinI = Math.sin(-theta);
  const cx0 = img.width / 2;
  const cy0 = img.height / 2;

  const corners = [
    rotate(0 - cx0, 0 - cy0, cosI, sinI),
    rotate(img.width - cx0, 0 - cy0, cosI, sinI),
    rotate(0 - cx0, img.height - cy0, cosI, sinI),
    rotate(img.width - cx0, img.height - cy0, cosI, sinI),
  ];
  const minU = Math.min(...corners.map((c) => c[0]));
  const maxU = Math.max(...corners.map((c) => c[0]));
  const minV = Math.min(...corners.map((c) => c[1]));
  const maxV = Math.max(...corners.map((c) => c[1]));

  const startI = Math.floor(minU / cell);
  const endI = Math.ceil(maxU / cell);
  const startJ = Math.floor(minV / cell);
  const endJ = Math.ceil(maxV / cell);

  const out: Sample[] = [];
  for (let j = startJ; j <= endJ; j++) {
    for (let i = startI; i <= endI; i++) {
      const u = i * cell + cell / 2;
      const v = j * cell + cell / 2;
      const [dx, dy] = rotate(u, v, cos, sin);
      const x = dx + cx0;
      const y = dy + cy0;
      if (x < -cell || y < -cell || x > img.width + cell || y > img.height + cell) continue;
      const value = sampleBilinear(img, x, y);
      out.push({ x, y, value, cellSize: cell, angle: p.angleDeg });
    }
  }
  return out;
}

function rotate(x: number, y: number, cos: number, sin: number): [number, number] {
  return [x * cos - y * sin, x * sin + y * cos];
}

import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import { clampCell } from './sample-budget';

export interface HexParams {
  cellSize: number;
  angleDeg: number;
}

export function hexScreen(img: LumImage, p: HexParams): Sample[] {
  const cell = clampCell(p.cellSize, img.width, img.height);
  const rowH = cell * Math.sqrt(3) / 2;
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

  const startI = Math.floor(minU / cell) - 1;
  const endI = Math.ceil(maxU / cell) + 1;
  const startJ = Math.floor(minV / rowH) - 1;
  const endJ = Math.ceil(maxV / rowH) + 1;

  const out: Sample[] = [];
  for (let j = startJ; j <= endJ; j++) {
    const offset = j & 1 ? cell / 2 : 0;
    const v = j * rowH;
    for (let i = startI; i <= endI; i++) {
      const u = i * cell + offset;
      const [dx, dy] = rotate(u, v, cos, sin);
      const x = dx + cx0;
      const y = dy + cy0;
      if (x < -cell || y < -cell || x > img.width + cell || y > img.height + cell) continue;
      out.push({ x, y, value: sampleBilinear(img, x, y), cellSize: cell, angle: p.angleDeg });
    }
  }
  return out;
}

function rotate(x: number, y: number, cos: number, sin: number): [number, number] {
  return [x * cos - y * sin, x * sin + y * cos];
}

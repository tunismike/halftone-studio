// Marching squares iso-contour extraction.
//
// Walks a 2D scalar field and emits line segments where the field crosses
// a given threshold. Standard 16-case table; linear edge interpolation.
// Saddle cases (5 and 10) resolved deterministically (no center-sample).

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Cell corners (counterclockwise from bottom-left in field coords):
//   3 ─── 2
//   │     │
//   0 ─── 1
//
// Edges:
//   0: bottom (corner 0 ↔ 1)
//   1: right  (corner 1 ↔ 2)
//   2: top    (corner 2 ↔ 3)
//   3: left   (corner 3 ↔ 0)
//
// For each case (4-bit corner-above-threshold mask), list edge pairs forming segments.
const SEGMENTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [],                                       // 0000
  [[3, 0]],                                 // 0001
  [[0, 1]],                                 // 0010
  [[3, 1]],                                 // 0011
  [[1, 2]],                                 // 0100
  [[3, 0], [1, 2]],                         // 0101 — saddle (corners 0+2)
  [[0, 2]],                                 // 0110
  [[3, 2]],                                 // 0111
  [[2, 3]],                                 // 1000
  [[2, 0]],                                 // 1001
  [[0, 1], [2, 3]],                         // 1010 — saddle (corners 1+3)
  [[2, 1]],                                 // 1011
  [[1, 3]],                                 // 1100
  [[0, 1]],                                 // 1101
  [[0, 3]],                                 // 1110
  [],                                       // 1111
];

interface Field2D {
  size: number;
  values: Float32Array; // row-major, size×size
}

// Rectangular variant.
interface RectField {
  width: number;
  height: number;
  values: Float32Array;
}

// Returns segments in field coords (0..size-1).
export function marchingSquares(field: Field2D | RectField, threshold: number): Segment[] {
  const w = 'width' in field ? field.width : field.size;
  const h = 'height' in field ? field.height : field.size;
  const n = w; // legacy alias for the inner loop
  const v = field.values;
  const out: Segment[] = [];

  // Edge interpolation: at edge `e` of cell (i, j) with corner values a/b/c/d,
  // return the (x, y) coordinate where the contour crosses.
  // Corners:
  //   a = v[j   * n + i  ]  (corner 0, bottom-left)
  //   b = v[j   * n + i+1]  (corner 1, bottom-right)
  //   c = v[(j+1)*n + i+1]  (corner 2, top-right)
  //   d = v[(j+1)*n + i  ]  (corner 3, top-left)

  for (let j = 0; j < h - 1; j++) {
    const row0 = j * n;
    const row1 = (j + 1) * n;
    for (let i = 0; i < w - 1; i++) {
      const a = v[row0 + i];
      const b = v[row0 + i + 1];
      const c = v[row1 + i + 1];
      const d = v[row1 + i];

      // Fast path: skip cells where all corners are on the same side
      // of the threshold (most cells in typical fields). Short-circuits
      // on the first mismatch to avoid 4 OR + array-lookup per cell.
      const aAbove = a > threshold;
      if (aAbove === (b > threshold) && aAbove === (c > threshold) && aAbove === (d > threshold)) {
        continue;
      }

      let code = 1;
      if (b > threshold) code |= 2;
      if (c > threshold) code |= 4;
      if (d > threshold) code |= 8;
      if (!aAbove) code &= ~1;

      const segs = SEGMENTS[code];
      if (segs.length === 0) continue;

      for (let s = 0; s < segs.length; s++) {
        const [e1, e2] = segs[s];
        const p1 = edgePoint(e1, i, j, a, b, c, d, threshold);
        const p2 = edgePoint(e2, i, j, a, b, c, d, threshold);
        out.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
    }
  }
  return out;
}

function edgePoint(
  edge: number,
  i: number,
  j: number,
  a: number, b: number, c: number, d: number,
  t: number,
): { x: number; y: number } {
  // Edge 0: a↔b at y=j, x from i to i+1
  if (edge === 0) return { x: i + frac(a, b, t), y: j };
  // Edge 1: b↔c at x=i+1, y from j to j+1
  if (edge === 1) return { x: i + 1, y: j + frac(b, c, t) };
  // Edge 2: c↔d at y=j+1, x from i+1 down to i
  if (edge === 2) return { x: i + 1 - frac(c, d, t), y: j + 1 };
  // Edge 3: d↔a at x=i, y from j+1 down to j
  return { x: i, y: j + 1 - frac(d, a, t) };
}

function frac(lo: number, hi: number, t: number): number {
  const d = hi - lo;
  if (Math.abs(d) < 1e-9) return 0.5;
  const f = (t - lo) / d;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

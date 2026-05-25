// Standard Hilbert curve traversal. Converts a scalar distance d on a
// square of side n (power of two) to (x, y) coordinates and back.
// Reference: https://en.wikipedia.org/wiki/Hilbert_curve

export function hilbertD2xy(n: number, d: number): { x: number; y: number } {
  let rx: number;
  let ry: number;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t / 2);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return { x, y };
}

// Iterate (x, y) along a Hilbert curve covering w×h. The curve is computed
// on the smallest power-of-two square that contains the rect; off-rect
// points are skipped so the iteration is dense and in-order over the rect.
export function* hilbertTraversal(w: number, h: number): IterableIterator<{ x: number; y: number }> {
  let n = 1;
  const m = Math.max(w, h);
  while (n < m) n *= 2;
  const total = n * n;
  for (let d = 0; d < total; d++) {
    const p = hilbertD2xy(n, d);
    if (p.x < w && p.y < h) yield p;
  }
}

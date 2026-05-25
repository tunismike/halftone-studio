export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695040);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function hash2v(x: number, y: number, seed: number): [number, number] {
  return [hash2(x, y, seed), hash2(x, y, seed + 0x9e3779b1)];
}

export function rng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s = s ^ (s >>> 16);
    return (s >>> 0) / 4294967296;
  };
}

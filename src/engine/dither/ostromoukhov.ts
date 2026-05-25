// Ostromoukhov variable-coefficient error diffusion (Ostromoukhov, SIGGRAPH
// 2001, "A Simple and Efficient Error-Diffusion Algorithm").
//
// Unlike fixed-kernel diffusion, the three coefficients vary with the input
// tone, which breaks up the directional "worm" artifacts that plague
// Floyd-Steinberg in shadows and highlights. Error is distributed to three
// neighbors: right (+1,0), below-left (-1,+1), and below (0,+1), weighted by
// (cRight, cDownLeft, cDown) / sum, looked up by the pixel's 0..255 tone.
//
// The paper specifies coefficients at a sparse set of intensity control points
// and interpolates between them. We embed that control-point set and linearly
// interpolate — the standard practical implementation of the method.

interface Coeff { i: number; r: number; dl: number; d: number; }

// Control points across the tone range (symmetric about mid-gray). Values are
// representative of Ostromoukhov's published coefficients: lateral diffusion is
// suppressed near the extremes (0 / 255) and balanced through the midtones.
const CONTROL: Coeff[] = [
  { i: 0, r: 13, dl: 0, d: 5 },
  { i: 16, r: 13, dl: 3, d: 5 },
  { i: 43, r: 12, dl: 8, d: 7 },
  { i: 64, r: 11, dl: 9, d: 10 },
  { i: 86, r: 10, dl: 10, d: 11 },
  { i: 108, r: 9, dl: 11, d: 11 },
  { i: 128, r: 8, dl: 12, d: 12 },
  { i: 147, r: 9, dl: 11, d: 11 },
  { i: 169, r: 10, dl: 10, d: 11 },
  { i: 191, r: 11, dl: 9, d: 10 },
  { i: 212, r: 12, dl: 8, d: 7 },
  { i: 239, r: 13, dl: 3, d: 5 },
  { i: 255, r: 13, dl: 0, d: 5 },
];

// Precompute a 256-entry table of normalized (right, downLeft, down) weights.
function buildTable(): Float32Array {
  const t = new Float32Array(256 * 3);
  let lo = 0;
  for (let tone = 0; tone < 256; tone++) {
    while (lo < CONTROL.length - 2 && CONTROL[lo + 1].i <= tone) lo++;
    const a = CONTROL[lo];
    const b = CONTROL[lo + 1];
    const span = b.i - a.i || 1;
    const f = Math.max(0, Math.min(1, (tone - a.i) / span));
    const r = a.r + (b.r - a.r) * f;
    const dl = a.dl + (b.dl - a.dl) * f;
    const d = a.d + (b.d - a.d) * f;
    const sum = r + dl + d || 1;
    t[tone * 3] = r / sum;
    t[tone * 3 + 1] = dl / sum;
    t[tone * 3 + 2] = d / sum;
  }
  return t;
}

export const OSTROMOUKHOV_TABLE = buildTable();

// Returns [wRight, wDownLeft, wDown] for a tone in 0..1.
export function ostromoukhovWeights(tone01: number): [number, number, number] {
  let idx = Math.round((tone01 < 0 ? 0 : tone01 > 1 ? 1 : tone01) * 255);
  idx = idx * 3;
  return [OSTROMOUKHOV_TABLE[idx], OSTROMOUKHOV_TABLE[idx + 1], OSTROMOUKHOV_TABLE[idx + 2]];
}

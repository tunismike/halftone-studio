// Map desired ink coverage (0..1) → circle radius as a ratio of the half-cell,
// so a round dot's AREA tracks tone exactly AND a fully-inked cell goes solid.
//
// A circle inscribed in its square cell (r = half) covers only π/4 ≈ 78.5% —
// the four corners stay white. To reach 100% the dot must grow to the cell
// corner (r = √2·half), where neighbouring dots overlap and the corners fill.
// Between r=half and r=√2·half the covered area is the disc minus the four
// edge segments that spill past the cell. We invert that exact coverage curve
// into a small LUT (no closed-form inverse for the segment term).

const N = 512;
const SQRT2 = Math.SQRT2;

// Coverage of a unit cell (half = 0.5) by a centred disc of radius rr·half.
function coverageForRatio(rr: number): number {
  if (rr <= 0) return 0;
  if (rr >= SQRT2) return 1;
  const r = rr * 0.5;
  if (rr <= 1) return Math.PI * r * r; // disc fully inside the cell
  // Overlap regime: subtract the four circular segments past the edges.
  const seg = r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25);
  return Math.min(1, Math.PI * r * r - 4 * seg);
}

// coverage (i/N) → radius ratio. Built by walking rr up monotonically.
const LUT: Float32Array = (() => {
  const lut = new Float32Array(N + 1);
  let rr = 0;
  const step = SQRT2 / (N * 8);
  for (let i = 0; i <= N; i++) {
    const target = i / N;
    while (rr < SQRT2 && coverageForRatio(rr) < target) rr += step;
    lut[i] = rr;
  }
  lut[0] = 0;
  lut[N] = SQRT2;
  return lut;
})();

// Largest radius ratio any dot needs (corner-filling). Callers should allow at
// least this as the max-dot cap so fully-inked cells can go solid.
export const SOLID_RATIO = SQRT2;

export function radiusRatioForCoverage(coverage: number): number {
  if (coverage <= 0) return 0;
  if (coverage >= 1) return SQRT2;
  return LUT[Math.round(coverage * N)];
}

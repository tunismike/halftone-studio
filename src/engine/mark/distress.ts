// Distress modifier — applied per-mark by the various mark generators.
// Three modes:
//   jitter — random position / rotation / scale offset
//   break  — random whole-mark elision (~strength fraction skipped)
//   erode  — radius/scale reduction by per-mark noise
//
// All randomness is deterministic from (markIndex, seed) so output is stable.

import { hash2 } from '../noise/hash';

export type DistressMode = 'jitter' | 'break' | 'erode';

export interface DistressParams {
  strength: number; // 0..1
  seed: number;
  mode: DistressMode;
}

export const defaultDistress: DistressParams = {
  strength: 0,
  seed: 1,
  mode: 'jitter',
};

export interface DistressDelta {
  skip: boolean;
  dx: number; // jitter offset (fraction of cellSize)
  dy: number;
  scale: number; // multiplicative on radius/size, ≤1 typically
  rotation: number; // radians
}

export function distressDelta(p: DistressParams | undefined, markIndex: number): DistressDelta {
  if (!p || p.strength <= 0) {
    return { skip: false, dx: 0, dy: 0, scale: 1, rotation: 0 };
  }
  const s = p.strength;
  const h1 = hash2(markIndex, 0, p.seed);
  const h2 = hash2(markIndex, 1, p.seed);
  const h3 = hash2(markIndex, 2, p.seed);
  const h4 = hash2(markIndex, 3, p.seed);

  switch (p.mode) {
    case 'jitter':
      return {
        skip: false,
        dx: (h1 - 0.5) * s,
        dy: (h2 - 0.5) * s,
        scale: 1 - h3 * s * 0.3,
        rotation: (h4 - 0.5) * s * Math.PI * 0.5,
      };
    case 'break':
      // Skip ~strength fraction of marks
      return {
        skip: h1 < s,
        dx: 0, dy: 0, scale: 1, rotation: 0,
      };
    case 'erode':
      // Shrink each mark variably; occasional total skips at high strength
      return {
        skip: h1 < s * 0.15,
        dx: 0, dy: 0,
        scale: Math.max(0.1, 1 - h2 * s * 0.7),
        rotation: 0,
      };
  }
}

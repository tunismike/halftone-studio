// Canonical error-diffusion kernels. All weights are LTR convention; the
// runtime mirrors dx around the current pixel on right-to-left serpentine rows.
//
// Source: docs/dither-and-palettes-reference.md, the standard halftoning literature.

export interface KernelTap {
  dx: number;
  dy: number;
  w: number;
}

export interface KernelDef {
  id: KernelId;
  name: string;
  taps: KernelTap[];
  // Whether to trust the kernel sum as a complete error transport.
  // Atkinson deliberately drops 25% — propagated total = 6/8.
  partial: boolean;
}

export type KernelId =
  | 'floyd-steinberg'
  | 'jjn'
  | 'stucki'
  | 'burkes'
  | 'sierra-full'
  | 'sierra-2'
  | 'sierra-lite'
  | 'atkinson'
  | 'stevenson-arce'
  | 'shiau-fan'
  | 'pigeon';

export type KernelCategory = 'diffusion' | 'bi-thread';

function k(parts: ReadonlyArray<[number, number, number]>, denom: number): KernelTap[] {
  return parts.map(([dx, dy, w]) => ({ dx, dy, w: w / denom }));
}

export const KERNELS: Record<KernelId, KernelDef> = {
  'floyd-steinberg': {
    id: 'floyd-steinberg',
    name: 'Floyd-Steinberg',
    taps: k(
      [
        [+1, 0, 7],
        [-1, +1, 3], [0, +1, 5], [+1, +1, 1],
      ],
      16,
    ),
    partial: false,
  },
  jjn: {
    id: 'jjn',
    name: 'Jarvis-Judice-Ninke',
    taps: k(
      [
        [+1, 0, 7], [+2, 0, 5],
        [-2, +1, 3], [-1, +1, 5], [0, +1, 7], [+1, +1, 5], [+2, +1, 3],
        [-2, +2, 1], [-1, +2, 3], [0, +2, 5], [+1, +2, 3], [+2, +2, 1],
      ],
      48,
    ),
    partial: false,
  },
  stucki: {
    id: 'stucki',
    name: 'Stucki',
    taps: k(
      [
        [+1, 0, 8], [+2, 0, 4],
        [-2, +1, 2], [-1, +1, 4], [0, +1, 8], [+1, +1, 4], [+2, +1, 2],
        [-2, +2, 1], [-1, +2, 2], [0, +2, 4], [+1, +2, 2], [+2, +2, 1],
      ],
      42,
    ),
    partial: false,
  },
  burkes: {
    id: 'burkes',
    name: 'Burkes',
    taps: k(
      [
        [+1, 0, 8], [+2, 0, 4],
        [-2, +1, 2], [-1, +1, 4], [0, +1, 8], [+1, +1, 4], [+2, +1, 2],
      ],
      32,
    ),
    partial: false,
  },
  'sierra-full': {
    id: 'sierra-full',
    name: 'Sierra (full)',
    taps: k(
      [
        [+1, 0, 5], [+2, 0, 3],
        [-2, +1, 2], [-1, +1, 4], [0, +1, 5], [+1, +1, 4], [+2, +1, 2],
        [-1, +2, 2], [0, +2, 3], [+1, +2, 2],
      ],
      32,
    ),
    partial: false,
  },
  'sierra-2': {
    id: 'sierra-2',
    name: 'Sierra-2',
    taps: k(
      [
        [+1, 0, 4], [+2, 0, 3],
        [-2, +1, 1], [-1, +1, 2], [0, +1, 3], [+1, +1, 2], [+2, +1, 1],
      ],
      16,
    ),
    partial: false,
  },
  'sierra-lite': {
    id: 'sierra-lite',
    name: 'Sierra Lite',
    taps: k(
      [
        [+1, 0, 2],
        [-1, +1, 1], [0, +1, 1],
      ],
      4,
    ),
    partial: false,
  },
  atkinson: {
    id: 'atkinson',
    name: 'Atkinson',
    taps: k(
      [
        [+1, 0, 1], [+2, 0, 1],
        [-1, +1, 1], [0, +1, 1], [+1, +1, 1],
        [0, +2, 1],
      ],
      8,
    ),
    partial: true,
  },
  // ── Bi-Thread (specialty kernels) ──────────────────────────
  'stevenson-arce': {
    id: 'stevenson-arce',
    name: 'Stevenson-Arce',
    taps: k(
      [
        [+2, 0, 32],
        [-3, +1, 12], [-1, +1, 26], [+1, +1, 30], [+3, +1, 16],
        [-2, +2, 12], [0, +2, 26], [+2, +2, 12],
        [-3, +3, 5], [-1, +3, 12], [+1, +3, 12], [+3, +3, 5],
      ],
      200,
    ),
    partial: false,
  },
  'shiau-fan': {
    id: 'shiau-fan',
    name: 'Shiau-Fan',
    taps: k(
      [
        [+1, 0, 4],
        [-2, +1, 1], [-1, +1, 1], [0, +1, 2],
      ],
      8,
    ),
    partial: false,
  },
  pigeon: {
    id: 'pigeon',
    name: 'Pigeon',
    taps: k(
      [
        [+1, 0, 2], [+2, 0, 1],
        [-2, +1, 1], [-1, +1, 2], [0, +1, 2], [+1, +1, 2], [+2, +1, 1],
        [-1, +2, 1], [0, +2, 1], [+1, +2, 1],
      ],
      14,
    ),
    partial: false,
  },
};

export const KERNEL_IDS: KernelId[] = [
  'floyd-steinberg', 'jjn', 'stucki', 'burkes',
  'sierra-full', 'sierra-2', 'sierra-lite', 'atkinson',
  'stevenson-arce', 'shiau-fan', 'pigeon',
];

export const KERNEL_CATEGORY: Record<KernelId, KernelCategory> = {
  'floyd-steinberg': 'diffusion',
  jjn: 'diffusion',
  stucki: 'diffusion',
  burkes: 'diffusion',
  'sierra-full': 'diffusion',
  'sierra-2': 'diffusion',
  'sierra-lite': 'diffusion',
  atkinson: 'diffusion',
  'stevenson-arce': 'bi-thread',
  'shiau-fan': 'bi-thread',
  pigeon: 'bi-thread',
};

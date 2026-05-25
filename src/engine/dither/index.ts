export { bayer } from './bayer';
export { floydSteinberg } from './floyd';
export { atkinson } from './atkinson';

export type DitherKind =
  | { kind: 'none' }
  | { kind: 'threshold'; t: number }
  | { kind: 'bayer'; size: 2 | 4 | 8 }
  | { kind: 'floyd' }
  | { kind: 'atkinson' };

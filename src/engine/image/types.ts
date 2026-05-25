export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface LumImage {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

export interface MaskImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface Sample {
  x: number;
  y: number;
  value: number;
  cellSize: number;
  angle?: number;
}

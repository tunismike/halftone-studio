export interface CircleMark {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface LineMark {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface RectMark {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PolyMark {
  kind: 'poly';
  pts: number[];
}

export interface GlyphMark {
  kind: 'glyph';
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
  pathD: string;
  viewBoxW: number;
  viewBoxH: number;
}

export type Mark = CircleMark | LineMark | RectMark | PolyMark | GlyphMark;

export interface MarkGroup {
  name: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  blendMode?: 'normal' | 'multiply';
  marks: Mark[];
}

export interface MarkSet {
  width: number;
  height: number;
  background: string;
  foreground: string;
  groups: MarkGroup[];
}

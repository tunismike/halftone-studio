import { describe, it, expect } from 'vitest';
import { Cache } from '../cache';
import { runCachedPipeline } from '../pipeline-cached';
import { markSetToSvg, markSetToSvgGroups } from './svg';
import { defaultAdjust } from '../image/adjust';
import { defaultVectorMode, type PipelineParams } from '../pipeline';
import type { RgbaImage } from '../image/types';
import type { MarkSet } from '../mark/types';

function gradient(w = 40, h = 24): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.round((x / (w - 1)) * 255); const j = (y * w + x) * 4;
    data[j] = v; data[j + 1] = v; data[j + 2] = v; data[j + 3] = 255;
  }
  return { width: w, height: h, data };
}

function vectorMarks(): MarkSet {
  const p: PipelineParams = {
    adjust: { ...defaultAdjust }, mode: defaultVectorMode(),
    background: '#ffffff', foreground: '#000000', transparent: false,
  };
  const out = runCachedPipeline(new Cache(), gradient(), p);
  if (out.kind !== 'marks') throw new Error('expected marks');
  return out.set;
}

describe('markSetToSvg', () => {
  const set = vectorMarks();
  it('emits a well-formed <svg> with the source viewBox/size', () => {
    const xml = markSetToSvg(set, { mode: 'editable' });
    expect(xml.startsWith('<svg')).toBe(true);
    expect(xml.trim().endsWith('</svg>')).toBe(true);
    expect(xml).toContain(`width="${set.width}"`);
    expect(xml).toContain(`viewBox="0 0 ${set.width} ${set.height}"`);
  });
  it('emits one <circle> per dot', () => {
    const xml = markSetToSvg(set, { mode: 'editable' });
    const circles = (xml.match(/<circle/g) || []).length;
    const dots = set.groups.reduce((s, g) => s + g.marks.length, 0);
    expect(circles).toBe(dots);
    expect(circles).toBeGreaterThan(0);
  });
});

describe('markSetToSvgGroups', () => {
  it('returns the inner <g> groups with no <svg> wrapper (for composition export)', () => {
    const set = vectorMarks();
    const inner = markSetToSvgGroups(set, { mode: 'editable' });
    expect(inner).not.toContain('<svg');
    expect(inner).toContain('<g ');
    expect((inner.match(/<circle/g) || []).length).toBeGreaterThan(0);
  });
});

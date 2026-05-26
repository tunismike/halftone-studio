import type { MarkSet } from '../mark/types';
import type { TextureOverlay } from '../texture/types';

export type SvgMode = 'editable' | 'compact' | 'production';

export interface SvgTextureLayer {
  overlay: TextureOverlay;
  pngDataUri: string; // "data:image/png;base64,..." or any image URL
  textureSize: number; // tile dimension in pixels
}

export interface SvgOptions {
  mode: SvgMode;
  title?: string;
  description?: string;
  texture?: SvgTextureLayer;
}

export function markSetToSvg(set: MarkSet, opts: SvgOptions = { mode: 'editable' }): string {
  const { mode } = opts;
  const compact = mode === 'compact';
  const indent = compact ? '' : '  ';
  const nl = compact ? '' : '\n';
  const w = set.width;
  const h = set.height;

  const out: string[] = [];
  const ns = `xmlns="http://www.w3.org/2000/svg"`;
  const open =
    mode === 'production'
      ? `<svg ${ns} xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
      : `<svg ${ns} viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
  out.push(open);

  if (mode === 'production') {
    if (opts.title) out.push(`${indent}<title>${esc(opts.title)}</title>`);
    if (opts.description) out.push(`${indent}<desc>${esc(opts.description)}</desc>`);
  }

  if (set.background && set.background !== 'none') {
    out.push(`${indent}<rect width="${w}" height="${h}" fill="${attr(set.background)}"/>`);
  }

  out.push(markSetToSvgGroups(set, opts, indent));

  // Texture overlay: define a pattern that tiles the texture image, then a
  // covering <rect> filled with the pattern. mix-blend-mode applied so the
  // texture composites against the marks below.
  if (opts.texture) {
    const tex = opts.texture;
    const ov = tex.overlay;
    const tileW = Math.max(1, tex.textureSize * ov.scale);
    const tileH = Math.max(1, tex.textureSize * ov.scale);
    const patId = 'texture-overlay';
    const transform = ov.rotationDeg !== 0
      ? ` patternTransform="rotate(${f(ov.rotationDeg)} ${f(w / 2)} ${f(h / 2)})"`
      : '';
    out.push(`${indent}<defs>`);
    out.push(`${indent}  <pattern id="${patId}" x="${f(ov.offsetX)}" y="${f(ov.offsetY)}" width="${f(tileW)}" height="${f(tileH)}" patternUnits="userSpaceOnUse"${transform}>`);
    out.push(`${indent}    <image href="${attr(tex.pngDataUri)}" x="0" y="0" width="${f(tileW)}" height="${f(tileH)}"/>`);
    out.push(`${indent}  </pattern>`);
    out.push(`${indent}</defs>`);
    out.push(`${indent}<rect width="${w}" height="${h}" fill="url(#${patId})" opacity="${f(ov.opacity)}" style="mix-blend-mode:${ov.blendMode}"/>`);
  }

  out.push(`</svg>`);
  return out.join(nl);
}

// Serialize just the <g> mark groups (no <svg> wrapper, no background) so a
// composition exporter can wrap them in a clipped, blended per-layer group.
export function markSetToSvgGroups(set: MarkSet, opts: SvgOptions, indent = ''): string {
  const compact = opts.mode === 'compact';
  const nl = compact ? '' : '\n';
  const out: string[] = [];
  for (const g of set.groups) {
    const fill = g.fill ?? set.foreground;
    const stroke = g.stroke ?? 'none';
    const sw = g.strokeWidth ?? 1;
    const gAttrs: string[] = [`id="${attr(g.name)}"`];
    if (fill !== set.foreground || opts.mode === 'production') gAttrs.push(`fill="${attr(fill)}"`);
    else gAttrs.push(`fill="${attr(set.foreground)}"`);
    if (stroke !== 'none') {
      gAttrs.push(`stroke="${attr(stroke)}"`);
      gAttrs.push(`stroke-width="${f(sw)}"`);
    }
    if (g.blendMode === 'multiply') gAttrs.push(`style="mix-blend-mode:multiply"`);
    if (opts.mode !== 'compact') gAttrs.push(`stroke-linecap="round"`);

    out.push(`${indent}<g ${gAttrs.join(' ')}>`);
    const child = compact ? '' : `${indent}  `;
    for (const m of g.marks) {
      switch (m.kind) {
        case 'circle':
          out.push(`${child}<circle cx="${f(m.cx)}" cy="${f(m.cy)}" r="${f(m.r)}"/>`);
          break;
        case 'line': {
          const sAttr = stroke !== 'none' ? '' : ` stroke="${attr(fill)}"`;
          out.push(
            `${child}<line x1="${f(m.x1)}" y1="${f(m.y1)}" x2="${f(m.x2)}" y2="${f(m.y2)}"${sAttr} stroke-width="${f(m.width)}"/>`,
          );
          break;
        }
        case 'rect':
          out.push(`${child}<rect x="${f(m.x)}" y="${f(m.y)}" width="${f(m.w)}" height="${f(m.h)}"/>`);
          break;
        case 'poly': {
          const pairs: string[] = [];
          for (let i = 0; i < m.pts.length; i += 2) {
            pairs.push(`${f(m.pts[i])},${f(m.pts[i + 1])}`);
          }
          out.push(`${child}<polygon points="${pairs.join(' ')}"/>`);
          break;
        }
        case 'glyph': {
          const tx = f(m.cx - (m.viewBoxW / 2) * m.scale);
          const ty = f(m.cy - (m.viewBoxH / 2) * m.scale);
          const xform = m.rotation
            ? `translate(${f(m.cx)} ${f(m.cy)}) rotate(${f(m.rotation)}) scale(${f(m.scale)}) translate(${f(-m.viewBoxW / 2)} ${f(-m.viewBoxH / 2)})`
            : `translate(${tx} ${ty}) scale(${f(m.scale)})`;
          out.push(`${child}<path transform="${xform}" d="${attr(m.pathD)}"/>`);
          break;
        }
      }
    }
    out.push(`${indent}</g>`);
  }
  return out.join(nl);
}

export async function exportSvg(
  set: MarkSet,
  filename = 'halftone.svg',
  opts: SvgOptions = { mode: 'editable' },
): Promise<void> {
  const xml = markSetToSvg(set, opts);
  triggerSvgDownload(xml, filename);
}

export function triggerSvgDownload(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function f(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function attr(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HalftoneClient } from '../worker/client';
import { BUILTIN_PRESETS } from '../presets/builtin';
import { presetState, type Preset, type PresetCategory, type PresetState } from '../presets/types';
import { BUILTIN_PALETTES } from '../engine/color/palettes-builtin';
import { loadCustomPalettes } from '../engine/color/custom-palettes';
import { KERNELS } from '../engine/dither/kernels';

interface Props {
  client: HalftoneClient;
  hasSource: boolean;
  sourceVersion: number;
  customPresets: Preset[];
  onApply: (state: PresetState, presetId: string) => void;
  onSaveCurrent: () => void;
  onDeleteCustom: (id: string) => void;
  activeId: string | null;
}

const CATEGORY_ORDER: PresetCategory[] = ['grid', 'line', 'wave', 'stochastic', 'organic', 'distress', 'color', 'palette', 'texture'];
const CATEGORY_LABEL: Record<PresetCategory, string> = {
  grid: 'Grid',
  line: 'Lines',
  wave: 'Waves',
  stochastic: 'Stochastic',
  organic: 'Organic (RD)',
  distress: 'Distress',
  color: 'Color',
  palette: 'Palette dither',
  texture: 'Print + texture',
};

// Build a flat searchable string per preset (name + category + palette + algorithm + kernel + mode kind).
function searchableTerms(p: Preset): string {
  const parts: string[] = [
    p.name.toLowerCase(),
    p.category,
    CATEGORY_LABEL[p.category].toLowerCase(),
    p.mode.kind.toLowerCase(),
  ];
  if (p.mode.kind === 'paletteDither') {
    const mode = p.mode;
    const paletteDef = BUILTIN_PALETTES.find((x) => x.id === mode.paletteId)
      ?? loadCustomPalettes().find((x) => x.id === mode.paletteId);
    if (paletteDef) parts.push(paletteDef.name.toLowerCase());
    parts.push(mode.algorithm.kind.toLowerCase());
    if (mode.algorithm.kind === 'error-diffusion') {
      parts.push(KERNELS[mode.algorithm.kernel].name.toLowerCase());
    }
    parts.push(mode.metric);
  } else if (p.mode.kind === 'vector') {
    parts.push(p.mode.screen.kind, p.mode.mark.kind);
  } else if (p.mode.kind === 'cmyk') {
    for (const ch of p.mode.channels) parts.push(ch.key.toLowerCase());
  } else if (p.mode.kind === 'spot') {
    for (const ch of p.mode.channels) parts.push(ch.name.toLowerCase());
  }
  return parts.join(' ');
}

function matchesQuery(p: Preset, q: string): boolean {
  if (!q) return true;
  const terms = q.toLowerCase().trim().split(/\s+/);
  const hay = searchableTerms(p);
  return terms.every((t) => hay.includes(t));
}

export function PresetGallery(props: Props) {
  const [query, setQuery] = useState('');
  const allPresets = [...BUILTIN_PRESETS, ...props.customPresets];
  const customIds = new Set(props.customPresets.map((p) => p.id));

  const filtered = useMemo(
    () => allPresets.filter((p) => matchesQuery(p, query)),
    [allPresets, query],
  );

  const byCategory = new Map<PresetCategory, Preset[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const p of filtered) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const noResults = query.length > 0 && filtered.length === 0;

  return (
    <div className="group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Presets</h2>
        <button className="ghost" onClick={props.onSaveCurrent} disabled={!props.hasSource}
          title="Save current settings as a custom preset">
          + Save
        </button>
      </div>
      <div className="preset-search-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${allPresets.length} presets…`}
          className="preset-search"
        />
        {query && (
          <button className="preset-search-clear" onClick={() => setQuery('')} title="clear search">
            ×
          </button>
        )}
      </div>
      {noResults && (
        <div className="preset-no-results">
          No presets match "{query}"
        </div>
      )}
      {CATEGORY_ORDER.map((cat) => {
        const list = byCategory.get(cat);
        if (!list || list.length === 0) return null;
        return (
          <section key={cat} style={{ marginTop: 10 }}>
            <div style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 6,
            }}>{CATEGORY_LABEL[cat]} ({list.length})</div>
            <div className="preset-grid">
              {list.map((p) => (
                <PresetTile
                  key={p.id}
                  preset={p}
                  client={props.client}
                  isActive={p.id === props.activeId}
                  onApply={() => props.onApply(presetState(p), p.id)}
                  onDelete={customIds.has(p.id) ? () => props.onDeleteCustom(p.id) : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PresetTile({
  preset, client, isActive, onApply, onDelete,
}: {
  preset: Preset;
  client: HalftoneClient;
  isActive: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLButtonElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);

  // Become "visible" when near the scroll viewport (then render and stop watching).
  // The preset gallery lives inside the .controls scroll container, so we use
  // that as the IntersectionObserver root instead of the page viewport.
  useEffect(() => {
    if (visible) return;
    const el = wrapperRef.current;
    if (!el) return;
    let root: Element | null = el.parentElement;
    while (root && root !== document.body) {
      const overflowY = getComputedStyle(root).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      root = root.parentElement;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: root === document.body ? null : root, rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // Render thumb only after the tile has scrolled near viewport.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const frame = await client.renderThumb(presetState(preset));
        if (cancelled) return;
        const c = canvasRef.current;
        if (!c) return;
        c.width = frame.width;
        c.height = frame.height;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const id = ctx.createImageData(frame.width, frame.height);
        id.data.set(frame.data);
        ctx.putImageData(id, 0, 0);
        setLoaded(true);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [client, preset, visible]);

  return (
    <button
      ref={wrapperRef}
      className={`preset-tile${isActive ? ' active' : ''}`}
      onClick={onApply}
      title={preset.name}
    >
      <div className="preset-thumb">
        <canvas ref={canvasRef} style={{ opacity: loaded ? 1 : 0.2 }} />
      </div>
      <div className="preset-name">{preset.name}</div>
      {onDelete && (
        <span className="preset-del" onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="delete custom preset">×</span>
      )}
    </button>
  );
}

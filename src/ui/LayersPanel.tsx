import { useState } from 'react';
import type { RgbaImage } from '../engine/image/types';
import { generateComposition } from '../engine/layer/generate';
import type { Layer, LayerBlend, LayeredComposition } from '../engine/layer/types';

const BLENDS: LayerBlend[] = ['normal', 'multiply', 'screen', 'darken', 'lighten'];

interface Props {
  source: RgbaImage | null;
  composition: LayeredComposition | null;
  setComposition: (c: LayeredComposition | null) => void;
  activeLayerId: string | null;
  setActiveLayerId: (id: string | null) => void;
}

export function LayersPanel({
  source, composition, setComposition, activeLayerId, setActiveLayerId,
}: Props) {
  const [kind, setKind] = useState<'tone' | 'color'>('color');
  const [count, setCount] = useState(4);

  const generate = () => {
    if (!source) return;
    const comp = generateComposition(source, kind, count);
    setComposition(comp);
    setActiveLayerId(comp.layers[comp.layers.length - 1]?.id ?? null);
  };

  if (!composition) {
    return (
      <>
        <p className="hint">
          Split the image into editable layers, then give each its own halftone,
          stipple, trace, or texture treatment. Layers composite top-to-bottom.
        </p>
        <div className="row">
          <label>Split by</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'tone' | 'color')}>
            <option value="color">Color regions</option>
            <option value="tone">Tone bands</option>
          </select>
        </div>
        <Slider label="Layers" value={count} min={2} max={kind === 'tone' ? 6 : 12} step={1}
          onChange={setCount} />
        <button className="btn" style={{ width: '100%', marginTop: 6 }}
          disabled={!source} onClick={generate}>
          Generate {count} layers
        </button>
        {!source && <p className="hint" style={{ marginTop: 8 }}>Load an image first.</p>}
      </>
    );
  }

  const update = (id: string, patch: Partial<Layer>) =>
    setComposition({
      ...composition,
      layers: composition.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });

  const remove = (id: string) => {
    const layers = composition.layers.filter((l) => l.id !== id);
    if (layers.length === 0) { setComposition(null); setActiveLayerId(null); return; }
    setComposition({ ...composition, layers });
    if (activeLayerId === id) setActiveLayerId(layers[layers.length - 1].id);
  };

  // Display top layer first (draw order is bottom-to-top).
  const display = [...composition.layers].reverse();

  return (
    <>
      <p className="hint">
        Click a layer to make it active, then edit its style in the Mode / Tone /
        Texture / Colors panels. Drag-reorder and grouped SVG land next.
      </p>
      <div className="layer-list">
        {display.map((l) => (
          <div key={l.id}
            className={`layer-row${l.id === activeLayerId ? ' on' : ''}`}
            onClick={() => setActiveLayerId(l.id)}>
            <input type="checkbox" checked={l.enabled} title="Show/hide layer"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => update(l.id, { enabled: e.target.checked })} />
            <span className="swatch" style={{ background: l.treatment.foreground }} />
            <input className="layer-name" value={l.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => update(l.id, { name: e.target.value })} />
            <span className="layer-mode">{l.treatment.mode.kind}</span>
            <button className="x" title="Delete layer"
              onClick={(e) => { e.stopPropagation(); remove(l.id); }}>✕</button>
          </div>
        ))}
      </div>

      {(() => {
        const active = composition.layers.find((l) => l.id === activeLayerId);
        if (!active) return null;
        return (
          <div className="layer-detail">
            <div className="row">
              <label>Blend</label>
              <select value={active.blend}
                onChange={(e) => update(active.id, { blend: e.target.value as LayerBlend })}>
                {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Slider label="Opacity" value={active.opacity} min={0} max={1} step={0.05}
              onChange={(v) => update(active.id, { opacity: v })} />
            <Slider label="Feather" value={active.feather} min={0} max={0.3} step={0.01}
              onChange={(v) => update(active.id, { feather: v })} />
            <label className="checkbox-row">
              <input type="checkbox" checked={active.invertRegion}
                onChange={(e) => update(active.id, { invertRegion: e.target.checked })} />
              Invert region
            </label>
          </div>
        );
      })()}

      <button className="ghost" style={{ width: '100%', marginTop: 10 }}
        onClick={() => { setComposition(null); setActiveLayerId(null); }}>
        Back to single mode
      </button>
    </>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="val">{Number.isInteger(step) ? value : value.toFixed(2)}</span>
    </div>
  );
}

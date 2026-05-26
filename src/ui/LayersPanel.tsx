import { useRef, useState } from 'react';
import type { RgbaImage } from '../engine/image/types';
import { generateComposition } from '../engine/layer/generate';
import type { Layer, LayerBlend, LayeredComposition } from '../engine/layer/types';
import type { SelectTool } from './CanvasPreview';

const BLENDS: LayerBlend[] = ['normal', 'multiply', 'screen', 'darken', 'lighten'];
const TOOLS: { id: Exclude<SelectTool, null>; label: string }[] = [
  { id: 'wand', label: 'Wand' },
  { id: 'lasso', label: 'Lasso' },
  { id: 'marquee', label: 'Box' },
];

interface Props {
  source: RgbaImage | null;
  composition: LayeredComposition | null;
  setComposition: (c: LayeredComposition | null) => void;
  activeLayerId: string | null;
  setActiveLayerId: (id: string | null) => void;
  selectTool: SelectTool;
  setSelectTool: (t: SelectTool) => void;
  tolerance: number;
  setTolerance: (v: number) => void;
  hasPendingSelection: boolean;
  onMakeLayerFromSelection: () => void;
  onClearSelection: () => void;
}

export function LayersPanel({
  source, composition, setComposition, activeLayerId, setActiveLayerId,
  selectTool, setSelectTool, tolerance, setTolerance,
  hasPendingSelection, onMakeLayerFromSelection, onClearSelection,
}: Props) {
  const [kind, setKind] = useState<'tone' | 'color'>('color');
  const [count, setCount] = useState(4);
  const dragFrom = useRef<number | null>(null);

  const selectionSection = (
    <div className="select-tools">
      <div className="seg">
        {TOOLS.map((t) => (
          <button key={t.id}
            className={`seg-btn${selectTool === t.id ? ' on' : ''}`}
            disabled={!source}
            onClick={() => setSelectTool(selectTool === t.id ? null : t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {selectTool === 'wand' && (
        <Slider label="Tolerance" value={tolerance} min={0} max={0.6} step={0.01}
          onChange={setTolerance} />
      )}
      {selectTool && (
        <p className="hint" style={{ margin: '6px 0 0' }}>
          {selectTool === 'wand' ? 'Click a region on the canvas.'
            : selectTool === 'lasso' ? 'Drag to draw a freehand outline.'
            : 'Drag a rectangle on the canvas.'} Close this panel for a full view — the tool stays on.
        </p>
      )}
      {hasPendingSelection && (
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onMakeLayerFromSelection}>
            Make layer from selection
          </button>
          <button className="ghost" onClick={onClearSelection} title="Discard selection">Clear</button>
        </div>
      )}
    </div>
  );

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
        <h3 className="sub-h">Select a region</h3>
        {selectionSection}
        <hr className="divider" />
        <h3 className="sub-h">Auto-split</h3>
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

  // Reorder within the (reversed) display list, then write back draw order.
  const reorderDisplay = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...display];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setComposition({ ...composition, layers: [...next].reverse() });
  };

  return (
    <>
      <p className="hint">
        Click a layer to make it active, then edit its style in the Mode / Tone /
        Texture / Colors panels. Drag the handle to reorder; export grouped SVG.
      </p>
      {selectionSection}
      <div className="layer-list">
        {display.map((l, di) => (
          <div key={l.id}
            className={`layer-row${l.id === activeLayerId ? ' on' : ''}`}
            onClick={() => setActiveLayerId(l.id)}
            onDragOver={(e) => { if (dragFrom.current !== null) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) reorderDisplay(dragFrom.current, di); dragFrom.current = null; }}>
            <span className="drag-handle" draggable title="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => { dragFrom.current = di; e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { dragFrom.current = null; }}>⠿</span>
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
        const rk = active.region.kind;
        return (
          <div className="layer-detail">
            <div className="row">
              <label>Region</label>
              <select value={rk}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'all') update(active.id, { region: { kind: 'all' } });
                  else if (v === 'toneBand') update(active.id, { region: { kind: 'toneBand', min: 0, max: 0.5 } });
                }}>
                <option value="all">Whole image</option>
                <option value="toneBand">Tone band</option>
                {rk === 'colorRegion' && <option value="colorRegion">Color region</option>}
                {rk === 'selection' && <option value="selection">Selection</option>}
                {rk === 'mask' && <option value="mask">Mask</option>}
              </select>
            </div>
            {active.region.kind === 'toneBand' && (
              <>
                <Slider label="Tone min" value={active.region.min} min={0} max={1} step={0.02}
                  onChange={(v) => update(active.id, { region: { kind: 'toneBand', min: v, max: (active.region as { max: number }).max } })} />
                <Slider label="Tone max" value={active.region.max} min={0} max={1} step={0.02}
                  onChange={(v) => update(active.id, { region: { kind: 'toneBand', min: (active.region as { min: number }).min, max: v } })} />
              </>
            )}
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

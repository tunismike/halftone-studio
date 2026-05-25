import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageUploader } from './ImageUploader';
import { CanvasPreview } from './CanvasPreview';
import { ControlsPanel } from './ControlsPanel';
import { PresetGallery } from './PresetGallery';
import { defaultAdjust, type AdjustParams } from '../engine/image/adjust';
import { defaultPreprocess, type PreprocessParams } from '../engine/image/preprocess';
import { defaultMode, type ModeKind, type ResamplingMode } from '../engine/pipeline';
import type { RgbaImage } from '../engine/image/types';
import type { SvgMode } from '../engine/export/svg';
import type { TextureOverlay } from '../engine/texture/types';
import { getUserTextureBlob, listUserTextures } from '../engine/texture/user-store';
import type { MaskOverlay } from '../engine/mask/types';
import { getUserMaskBlob, listUserMasks } from '../engine/mask/store';
import { HalftoneClient, type JobEvent } from '../worker/client';
import type { Preset, PresetState } from '../presets/types';

const CUSTOM_PRESETS_KEY = 'halftone-app:custom-presets';

export function App() {
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [filename, setFilename] = useState<string>('image.png');
  const [adjust, setAdjust] = useState<AdjustParams>(defaultAdjust);
  const [preprocess, setPreprocess] = useState<PreprocessParams>(defaultPreprocess);
  const [mode, setMode] = useState<ModeKind>(defaultMode);
  const [background, setBackground] = useState<string>('#ffffff');
  const [foreground, setForeground] = useState<string>('#000000');
  const [transparent, setTransparent] = useState<boolean>(false);
  const [svgMode, setSvgMode] = useState<SvgMode>('editable');
  const [busy, setBusy] = useState<boolean>(false);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => loadCustomPresets());
  const [sourceZoom, setSourceZoom] = useState(0);
  const [idle, setIdle] = useState(false);
  const [textureOverlay, setTextureOverlay] = useState<TextureOverlay | undefined>(undefined);
  const [maskOverlay, setMaskOverlay] = useState<MaskOverlay | undefined>(undefined);
  const [superSample, setSuperSample] = useState<boolean>(false);
  const [resampling, setResampling] = useState<ResamplingMode>('bilinear');

  const clientRef = useRef<HalftoneClient | null>(null);
  if (!clientRef.current) clientRef.current = new HalftoneClient();
  const client = clientRef.current;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAttached = useRef(false);

  const setCanvas = useCallback((c: HTMLCanvasElement | null) => {
    canvasRef.current = c;
    if (c && !canvasAttached.current) {
      canvasAttached.current = true;
      void client.attachCanvas(c);
    }
  }, [client]);

  // Restore state from URL hash on mount
  useEffect(() => {
    const state = readStateFromHash();
    if (state) {
      setAdjust(state.adjust);
      if (state.preprocess) setPreprocess(state.preprocess);
      setMode(state.mode);
      setBackground(state.background);
      setForeground(state.foreground);
      setTransparent(state.transparent);
    }
  }, []);

  // Spinner shown only if a job has been running > 100ms
  useEffect(() => {
    const inFlight = new Map<number, number>();
    const timers = new Map<number, number>();
    const off = client.onJob((e: JobEvent) => {
      if (e.state === 'started') {
        inFlight.set(e.id, performance.now());
        const t = window.setTimeout(() => {
          if (inFlight.has(e.id)) setBusy(true);
        }, 100);
        timers.set(e.id, t);
      } else {
        inFlight.delete(e.id);
        const t = timers.get(e.id);
        if (t) { clearTimeout(t); timers.delete(e.id); }
        if (inFlight.size === 0) setBusy(false);
        if (e.state === 'finished' && e.durationMs !== undefined) {
          setLastDurationMs(e.durationMs);
        }
      }
    });
    return () => {
      off();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, [client]);

  // Push source to worker on upload and bump sourceVersion so thumbs re-render
  useEffect(() => {
    if (!source) return;
    void client.setSource(source).then(() => setSourceVersion((v) => v + 1));
  }, [source, client]);

  // Hydrate all persisted user textures into the worker on app boot.
  useEffect(() => {
    (async () => {
      for (const meta of listUserTextures()) {
        try {
          const blob = await getUserTextureBlob(meta.id);
          if (!blob) continue;
          const bitmap = await createImageBitmap(blob);
          await client.setUserTexture(meta.id, bitmap);
        } catch {
          // ignore missing/broken entries
        }
      }
      for (const meta of listUserMasks()) {
        try {
          const blob = await getUserMaskBlob(meta.id);
          if (!blob) continue;
          const bitmap = await createImageBitmap(blob);
          await client.setUserMask(meta.id, bitmap);
        } catch {
          // ignore
        }
      }
    })();
  }, [client]);

  const params = useMemo(
    () => ({ adjust, preprocess, mode, background, foreground, transparent, textureOverlay, maskOverlay, superSample, resampling }),
    [adjust, preprocess, mode, background, foreground, transparent, textureOverlay, maskOverlay, superSample, resampling],
  );

  // Idle timer driven by a ref so high-frequency user interactions (drag, wheel)
  // don't trigger React re-renders on each event.
  const idleTimerRef = useRef<number | null>(null);
  const resetIdle = useCallback(() => {
    setIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      setIdle(true);
      idleTimerRef.current = null;
    }, 400);
  }, []);

  // Reset on every params / source change.
  useEffect(() => { resetIdle(); }, [params, source, resetIdle]);

  // Pick preview resolution. Fast (2048) while interacting; bump to match
  // displayed size when idle + zoomed-in, capped at source resolution.
  const previewMaxSide = useMemo(() => {
    const BASE = 2048;
    if (!source) return BASE;
    const sourceMax = Math.max(source.width, source.height);
    if (sourceMax <= BASE) return sourceMax;
    if (!idle) return BASE;
    const targetForZoom = Math.ceil(sourceZoom * sourceMax);
    return Math.min(sourceMax, Math.max(BASE, targetForZoom));
  }, [source, idle, sourceZoom]);

  // Write current state to URL hash (debounced via timeout)
  useEffect(() => {
    const t = window.setTimeout(() => writeStateToHash(params), 400);
    return () => clearTimeout(t);
  }, [params]);

  // Request a fresh preview whenever params/source/preview-resolution changes; rAF coalesces.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let raf = 0;
    raf = requestAnimationFrame(async () => {
      const r = await client.process(params, previewMaxSide);
      if (cancelled || !r) return;
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [source, params, previewMaxSide, client]);

  const onImage = useCallback((img: RgbaImage, name: string) => {
    setSource(img);
    setFilename(name);
  }, []);

  const handleDroppedFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const bitmap = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('image load failed'));
        im.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0);
      const id = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      onImage({ width: id.width, height: id.height, data: id.data }, file.name);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [onImage]);

  // Full-window drag-and-drop. Show overlay when any file is dragged over the
  // window; on drop, route the first image-type file to onImage.
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
      e.preventDefault();
      depth++;
      setDragOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
      depth--;
      if (depth <= 0) { depth = 0; setDragOver(false); }
    };
    const onDrop = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
      e.preventDefault();
      depth = 0;
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f && f.type.startsWith('image/')) void handleDroppedFile(f);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleDroppedFile]);

  const baseName = filename.replace(/\.[^.]+$/, '');

  const onExportPng = async () => {
    if (!source) return;
    const blob = await client.renderPng(params);
    triggerDownload(blob, `${baseName}-halftone.png`);
  };

  const onExportSvg = async () => {
    if (!source || !svgEnabled) return;
    const xml = await client.serializeSvg(params, {
      mode: svgMode,
      title: `${baseName} halftone`,
      description: `Generated halftone — mode ${mode.kind}`,
    });
    triggerDownload(new Blob([xml], { type: 'image/svg+xml' }), `${baseName}-halftone.svg`);
  };

  const onExportZip = async () => {
    if (!source || !bundleEnabled) return;
    const blob = await client.exportZip(params, { mode: svgMode }, baseName);
    triggerDownload(blob, `${baseName}-halftone.zip`);
  };

  const applyPresetState = (state: PresetState, presetId: string) => {
    setAdjust(state.adjust);
    setPreprocess(state.preprocess ?? defaultPreprocess);
    setMode(state.mode);
    setBackground(state.background);
    setForeground(state.foreground);
    setTransparent(state.transparent);
    setTextureOverlay(state.textureOverlay);
    setActivePresetId(presetId);
  };

  const onSaveCurrent = () => {
    const name = window.prompt('Preset name?', 'My preset');
    if (!name) return;
    const newPreset: Preset = {
      id: `custom-${Date.now()}`,
      name,
      category: 'grid',
      adjust, preprocess, mode, background, foreground, transparent,
    };
    const next = [...customPresets, newPreset];
    setCustomPresets(next);
    saveCustomPresets(next);
    setActivePresetId(newPreset.id);
  };

  const onDeleteCustom = (id: string) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    saveCustomPresets(next);
    if (activePresetId === id) setActivePresetId(null);
  };

  // Clear active preset highlight when user manually edits anything
  useEffect(() => {
    if (activePresetId) setActivePresetId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjust, preprocess, mode, background, foreground, transparent]);

  const svgEnabled = source != null && mode.kind !== 'raster' && mode.kind !== 'paletteDither' && mode.kind !== 'tonal';
  const bundleEnabled = svgEnabled && (mode.kind === 'cmyk' || mode.kind === 'spot');

  return (
    <div className="app">
      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Drop image to load</div>
        </div>
      )}
      <header className="header">
        <h1>Halftone Studio</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {busy && <span className="spinner" title="rendering…" />}
          {lastDurationMs !== null && !busy && (
            <span className="duration">{lastDurationMs.toFixed(0)}ms</span>
          )}
          <select className="header-select" value={svgMode}
            onChange={(e) => setSvgMode(e.target.value as SvgMode)}>
            <option value="editable">SVG: editable</option>
            <option value="compact">SVG: compact</option>
            <option value="production">SVG: production</option>
          </select>
          <button className="ghost" disabled={!bundleEnabled} onClick={onExportZip}
            title="Export composite + per-channel SVGs in a ZIP">
            Export ZIP
          </button>
          <button className="ghost" disabled={!svgEnabled} onClick={onExportSvg}>
            Export SVG
          </button>
          <button className="btn" disabled={!source} onClick={onExportPng}>
            Export PNG
          </button>
        </div>
      </header>

      <aside className="controls">
        <div className="group">
          <h2>Source</h2>
          <ImageUploader onImage={onImage} />
          {source && (
            <div className="row" style={{ marginTop: 8 }}>
              <label>Size</label>
              <span className="val" style={{ flex: 1, textAlign: 'right' }}>
                {source.width} × {source.height}
              </span>
            </div>
          )}
        </div>

        <ControlsPanel
          adjust={adjust}
          setAdjust={setAdjust}
          preprocess={preprocess}
          setPreprocess={setPreprocess}
          mode={mode}
          setMode={setMode}
          background={background}
          setBackground={setBackground}
          foreground={foreground}
          setForeground={setForeground}
          transparent={transparent}
          setTransparent={setTransparent}
          textureOverlay={textureOverlay}
          setTextureOverlay={setTextureOverlay}
          maskOverlay={maskOverlay}
          setMaskOverlay={setMaskOverlay}
          superSample={superSample}
          setSuperSample={setSuperSample}
          resampling={resampling}
          setResampling={setResampling}
          sourceWidth={source?.width ?? 0}
          client={client}
        />

        <PresetGallery
          client={client}
          hasSource={!!source}
          sourceVersion={sourceVersion}
          customPresets={customPresets}
          activeId={activePresetId}
          onApply={applyPresetState}
          onSaveCurrent={onSaveCurrent}
          onDeleteCustom={onDeleteCustom}
        />
      </aside>

      <main className="preview">
        <CanvasPreview
          ref={setCanvas}
          hasSource={!!source}
          isRaster={mode.kind === 'raster' || mode.kind === 'paletteDither' || mode.kind === 'tonal'}
          sourceWidth={source?.width ?? 0}
          onSourceZoomChange={setSourceZoom}
          onUserZoom={resetIdle}
        />
      </main>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Preset[];
  } catch {
    // ignore
  }
  return [];
}

function saveCustomPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore (e.g., quota)
  }
}

interface HashState {
  adjust: AdjustParams;
  preprocess?: PreprocessParams;
  mode: ModeKind;
  background: string;
  foreground: string;
  transparent: boolean;
}

function writeStateToHash(state: HashState): void {
  try {
    const json = JSON.stringify(state);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    history.replaceState(null, '', `#s=${b64}`);
  } catch {
    // ignore
  }
}

function readStateFromHash(): HashState | null {
  try {
    const m = location.hash.match(/[#&]s=([^&]+)/);
    if (!m) return null;
    const json = decodeURIComponent(escape(atob(m[1])));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && 'adjust' in parsed && 'mode' in parsed) {
      return parsed as HashState;
    }
  } catch {
    // ignore
  }
  return null;
}

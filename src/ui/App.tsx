import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageUploader } from './ImageUploader';
import { CanvasPreview, type SelectTool } from './CanvasPreview';
import { ControlsPanel, type ToolView as ControlsView } from './ControlsPanel';
import { PresetGallery } from './PresetGallery';
import { AiRecipePanel } from './AiRecipePanel';
import { LayersPanel } from './LayersPanel';
import type { Layer, LayeredComposition } from '../engine/layer/types';
import { makeLayer } from '../engine/layer/generate';
import { floodSelect, polygonMask, maskToRgba, maskIsEmpty, type Pt } from '../engine/select/select';
import { traceBinaryMask } from '../engine/trace/trace';
import { potraceToSvg } from '../engine/trace/potrace';
import {
  saveProjectState, loadProjectState, saveProjectSource, loadProjectSource, clearProject,
} from '../engine/project/store';
import { putSelection, getSelection, listSelectionIds } from '../engine/select/store';
import { serializeProject, deserializeProject } from '../engine/project/serialize';
import { rgbaToPngBlob, decodeBlobToRgba } from '../engine/image/codec';
import type { PipelineParams } from '../engine/pipeline';
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

type ToolId = 'source' | 'mode' | 'adjust' | 'texture' | 'mask' | 'colors' | 'render' | 'layers' | 'recipe' | 'presets';

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
  const [composition, setComposition] = useState<LayeredComposition | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId | null>('mode');
  const [selectTool, setSelectTool] = useState<SelectTool>(null);
  const [tolerance, setTolerance] = useState(0.15);
  const [pendingSelection, setPendingSelection] =
    useState<{ mask: Uint8Array; w: number; h: number; outline: Pt[][] } | null>(null);
  const [restored, setRestored] = useState(false);
  // Crisp vector preview for Vector-trace mode (full-res, matches SVG export).
  const [vectorPreviewUrl, setVectorPreviewUrl] = useState<string | null>(null);
  const vecUrlRef = useRef<string | null>(null);
  // Undo/redo of the document (= params, which includes composition). Snapshots
  // are committed when the user goes idle, so one gesture = one step.
  const historyRef = useRef<{ stack: PipelineParams[]; index: number }>({ stack: [], index: -1 });
  const applyingHistory = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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

  // On mount: prefer the autosaved IndexedDB project (full state incl. source +
  // composition); fall back to the URL-hash single-mode snapshot.
  useEffect(() => {
    (async () => {
      try {
        const [savedState, savedSource] = await Promise.all([loadProjectState(), loadProjectSource()]);
        if (savedState && savedSource) {
          const img = await decodeBlobToRgba(savedSource);
          setSource(img);
          setFilename(savedState.filename);
          restoreParams(savedState.params);
          setRestored(true);
          return;
        }
      } catch {
        // fall through to hash restore
      }
      const state = readStateFromHash();
      if (state) {
        setAdjust(state.adjust);
        if (state.preprocess) setPreprocess(state.preprocess);
        setMode(state.mode);
        setBackground(state.background);
        setForeground(state.foreground);
        setTransparent(state.transparent);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Interactive-selection masks referenced by a restored composition.
      for (const id of listSelectionIds()) {
        try {
          const blob = await getSelection(id);
          if (!blob) continue;
          const bitmap = await createImageBitmap(blob);
          await client.setUserMask(id, bitmap);
        } catch {
          // ignore
        }
      }
    })();
  }, [client]);

  const params = useMemo(
    () => ({ adjust, preprocess, mode, background, foreground, transparent, textureOverlay, maskOverlay, superSample, resampling, composition: composition ?? undefined }),
    [adjust, preprocess, mode, background, foreground, transparent, textureOverlay, maskOverlay, superSample, resampling, composition],
  );

  // When a composition is active and a layer is selected, the shared control
  // panels (Mode/Tone/Texture/Colors) edit that layer's treatment instead of
  // the global single-mode state. Mixed styles fall out of this routing.
  const activeLayer = composition && activeLayerId
    ? composition.layers.find((l) => l.id === activeLayerId) ?? null
    : null;

  const patchActiveLayer = useCallback((patch: (l: Layer) => Layer) => {
    setComposition((c) => {
      if (!c || !activeLayerId) return c;
      return { ...c, layers: c.layers.map((l) => (l.id === activeLayerId ? patch(l) : l)) };
    });
  }, [activeLayerId]);

  const eff = activeLayer
    ? {
        mode: activeLayer.treatment.mode,
        setMode: (m: ModeKind) => patchActiveLayer((l) => ({ ...l, treatment: { ...l.treatment, mode: m } })),
        adjust: activeLayer.treatment.adjust,
        setAdjust: (a: AdjustParams) => patchActiveLayer((l) => ({ ...l, treatment: { ...l.treatment, adjust: a } })),
        preprocess: activeLayer.treatment.preprocess ?? defaultPreprocess,
        setPreprocess: (p: PreprocessParams) => patchActiveLayer((l) => ({ ...l, treatment: { ...l.treatment, preprocess: p } })),
        textureOverlay: activeLayer.treatment.textureOverlay,
        setTextureOverlay: (t: TextureOverlay | undefined) => patchActiveLayer((l) => ({ ...l, treatment: { ...l.treatment, textureOverlay: t } })),
        foreground: activeLayer.treatment.foreground,
        setForeground: (c: string) => patchActiveLayer((l) => ({ ...l, treatment: { ...l.treatment, foreground: c } })),
      }
    : { mode, setMode, adjust, setAdjust, preprocess, setPreprocess, textureOverlay, setTextureOverlay, foreground, setForeground };

  // Background + transparency are composition-global when layered.
  const effBackground = composition ? composition.background : background;
  const effSetBackground = composition
    ? (c: string) => setComposition((p) => (p ? { ...p, background: c } : p))
    : setBackground;
  const effTransparent = composition ? composition.transparent : transparent;
  const effSetTransparent = composition
    ? (t: boolean) => setComposition((p) => (p ? { ...p, transparent: t } : p))
    : setTransparent;

  // ── Interactive selection (P5) ────────────────────────────────────────
  const commitMask = useCallback((mask: Uint8Array, w: number, h: number) => {
    if (maskIsEmpty(mask)) { setPendingSelection(null); return; }
    // traceBinaryMask returns [x,y] tuples; the overlay draws {x,y}.
    const outline: Pt[][] = traceBinaryMask(mask, w, h).map((loop) =>
      loop.map(([x, y]) => ({ x, y })));
    setPendingSelection({ mask, w, h, outline });
  }, []);

  const onWandPick = useCallback((sx: number, sy: number) => {
    if (!source) return;
    commitMask(floodSelect(source, sx, sy, tolerance), source.width, source.height);
  }, [source, tolerance, commitMask]);

  const onPolygonSelect = useCallback((pts: Pt[]) => {
    if (!source) return;
    commitMask(polygonMask(pts, source.width, source.height), source.width, source.height);
  }, [source, commitMask]);

  const clearSelection = useCallback(() => setPendingSelection(null), []);

  const makeLayerFromSelection = useCallback(async () => {
    if (!source || !pendingSelection) return;
    const { mask, w, h } = pendingSelection;
    const selId = `sel-${Date.now().toString(36)}`;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const cx = canvas.getContext('2d');
    if (!cx) return;
    const id = cx.createImageData(w, h);
    id.data.set(maskToRgba(mask, w, h));
    cx.putImageData(id, 0, 0);
    const bitmap = await createImageBitmap(canvas);
    await client.setUserMask(selId, bitmap);
    // Persist so the selection survives reload (re-hydrated on boot).
    canvas.toBlob((blob) => { if (blob) void putSelection(selId, blob); }, 'image/png');
    const selLayer = makeLayer({ name: 'Selection', region: { kind: 'selection', selectionId: selId } });
    setComposition((c) => {
      if (!c) {
        const base = makeLayer({ name: 'Base', region: { kind: 'all' }, foreground });
        return { layers: [base, selLayer], background, transparent };
      }
      return { ...c, layers: [...c.layers, selLayer] };
    });
    setActiveLayerId(selLayer.id);
    setPendingSelection(null);
    setSelectTool(null);
  }, [source, pendingSelection, client, foreground, background, transparent]);

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
    // Composition is excluded from the hash (color-region palettes balloon the URL).
    const { composition: _omit, ...hashState } = params;
    const t = window.setTimeout(() => writeStateToHash(hashState), 400);
    return () => clearTimeout(t);
  }, [params]);

  // Autosave the source image (PNG) whenever it changes — rare, so no debounce.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await rgbaToPngBlob(source);
        if (!cancelled) await saveProjectSource(blob);
      } catch { /* storage unavailable */ }
    })();
    return () => { cancelled = true; };
  }, [source]);

  // Autosave the project state (params + composition) on every edit, debounced.
  // Guarded by `source` so a fresh empty session never clobbers a saved project.
  useEffect(() => {
    if (!source) return;
    const selectionIds = composition
      ? composition.layers
          .filter((l) => l.region.kind === 'selection')
          .map((l) => (l.region as { selectionId: string }).selectionId)
      : [];
    const t = window.setTimeout(() => {
      void saveProjectState({ version: 1, filename, params, selectionIds, savedAt: Date.now() });
    }, 500);
    return () => clearTimeout(t);
  }, [params, filename, source, composition]);

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

  // Vector-trace preview: show the real (full-res) SVG while working, and only
  // the raster canvas while it recomputes. Swaps the crisp vectors in 250ms
  // after edits settle. Revokes the previous blob URL when replacing it.
  const setVecUrl = useCallback((u: string | null) => {
    if (vecUrlRef.current && vecUrlRef.current !== u) URL.revokeObjectURL(vecUrlRef.current);
    vecUrlRef.current = u;
    setVectorPreviewUrl(u);
  }, []);
  useEffect(() => {
    const k = params.mode.kind;
    const vectorMode = k === 'vector' || k === 'cmyk' || k === 'spot' || k === 'rdContour' || k === 'trace';
    if (!source || params.composition || !vectorMode) {
      setVecUrl(null);
      return;
    }
    setVecUrl(null); // raster shows while we (re)build the full-res vectors
    let cancelled = false;
    const show = (xml: string) => {
      // Guard against pathologically large output (deep zoom would re-raster it
      // every step); keep the raster preview in that case.
      if (!cancelled && xml.length <= 28_000_000) {
        setVecUrl(URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' })));
      }
    };
    const t = window.setTimeout(async () => {
      try {
        if (params.mode.kind === 'trace' && source) {
          // SOTA tracer (Potrace) on the main thread for trace mode.
          show(await potraceToSvg(source, params.mode.trace, params.background, params.transparent));
        } else {
          show(await client.serializeSvg(params, { mode: 'editable' }));
        }
      } catch {
        // Potrace failed → fall back to the homegrown worker SVG so trace
        // mode still previews.
        if (params.mode.kind === 'trace') {
          try { show(await client.serializeSvg(params, { mode: 'editable' })); } catch { /* keep raster */ }
        }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [params, source, client, setVecUrl]);

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
    // Trace mode exports the SOTA Potrace SVG (same as the live preview).
    if (mode.kind === 'trace') {
      let xml: string;
      try {
        xml = await potraceToSvg(source, mode.trace, background, transparent);
      } catch {
        // Fall back to the homegrown tracer if Potrace fails for any reason.
        xml = await client.serializeSvg(params, { mode: svgMode });
      }
      triggerDownload(new Blob([xml], { type: 'image/svg+xml' }), `${baseName}-trace.svg`);
      return;
    }
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

  // Save the whole project (source + params + composition + selection masks)
  // as a portable .json.
  const onExportProject = async () => {
    if (!source) return;
    const selBlobs = new Map<string, Blob>();
    if (composition) {
      for (const l of composition.layers) {
        if (l.region.kind === 'selection') {
          const b = await getSelection(l.region.selectionId);
          if (b) selBlobs.set(l.region.selectionId, b);
        }
      }
    }
    const json = await serializeProject(filename, params, source, selBlobs);
    triggerDownload(new Blob([json], { type: 'application/json' }), `${baseName}.halftone.json`);
  };

  const onImportProject = async (file: File) => {
    try {
      const proj = await deserializeProject(await file.text());
      // Register + persist any embedded selection masks before applying state.
      for (const { id, blob } of proj.selections) {
        const bitmap = await createImageBitmap(blob);
        await client.setUserMask(id, bitmap);
        await putSelection(id, blob);
      }
      setSource(proj.source);
      setFilename(proj.filename);
      restoreParams(proj.params);
      setRestored(false);
    } catch (e) {
      window.alert(`Could not open project: ${e instanceof Error ? e.message : 'invalid file'}`);
    }
  };

  const startFresh = async () => {
    await clearProject();
    location.reload();
  };

  // Apply a fully-mapped PipelineParams from the AI recipe validator. The
  // validator has already clamped/validated everything, so we just fan it out
  // into the individual state slices the rest of the app reads.
  const applyPipelineParams = useCallback((p: PipelineParams) => {
    setAdjust(p.adjust);
    setPreprocess(p.preprocess ?? defaultPreprocess);
    setMode(p.mode);
    setBackground(p.background);
    setForeground(p.foreground);
    setTransparent(p.transparent);
    setActivePresetId(null);
  }, []);

  // Apply a layered composition (from a multi-layer AI recipe or a demo preset).
  const applyComposition = useCallback((c: LayeredComposition) => {
    setComposition(c);
    setActiveLayerId(c.layers[c.layers.length - 1]?.id ?? null);
    setActivePresetId(null);
  }, []);

  // Fan a full PipelineParams (from a saved/imported project) into state slices.
  const restoreParams = useCallback((p: PipelineParams) => {
    setAdjust(p.adjust);
    setPreprocess(p.preprocess ?? defaultPreprocess);
    setMode(p.mode);
    setBackground(p.background);
    setForeground(p.foreground);
    setTransparent(p.transparent);
    setTextureOverlay(p.textureOverlay);
    setMaskOverlay(p.maskOverlay);
    setSuperSample(p.superSample ?? false);
    setResampling(p.resampling ?? 'bilinear');
    setComposition(p.composition ?? null);
    setActiveLayerId(p.composition?.layers[p.composition.layers.length - 1]?.id ?? null);
    setActivePresetId(null);
  }, []);

  // New source = new document → reset the undo history.
  useEffect(() => {
    historyRef.current = { stack: [], index: -1 };
    setCanUndo(false);
    setCanRedo(false);
  }, [source]);

  // Commit a history snapshot once the user settles (idle). Coalesces a drag
  // into one entry; skips the change that an undo/redo itself produced.
  useEffect(() => {
    if (!idle || !source) return;
    if (applyingHistory.current) { applyingHistory.current = false; return; }
    const h = historyRef.current;
    const cur = h.stack[h.index];
    if (cur && JSON.stringify(cur) === JSON.stringify(params)) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(params);
    if (h.stack.length > 50) h.stack.shift();
    h.index = h.stack.length - 1;
    setCanUndo(h.index > 0);
    setCanRedo(false);
  }, [idle, params, source]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applyingHistory.current = true;
    restoreParams(h.stack[h.index]);
    setCanUndo(h.index > 0);
    setCanRedo(true);
  }, [restoreParams]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applyingHistory.current = true;
    restoreParams(h.stack[h.index]);
    setCanUndo(true);
    setCanRedo(h.index < h.stack.length - 1);
  }, [restoreParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

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

  // Compositions always export as grouped SVG; single-mode docs export only
  // for vector-producing modes.
  const svgEnabled = source != null && (
    composition != null || (mode.kind !== 'raster' && mode.kind !== 'paletteDither' && mode.kind !== 'tonal')
  );
  const bundleEnabled = svgEnabled && !composition && (mode.kind === 'cmyk' || mode.kind === 'spot');

  const controlsProps = {
    adjust: eff.adjust, setAdjust: eff.setAdjust,
    preprocess: eff.preprocess, setPreprocess: eff.setPreprocess,
    mode: eff.mode, setMode: eff.setMode,
    background: effBackground, setBackground: effSetBackground,
    foreground: eff.foreground, setForeground: eff.setForeground,
    transparent: effTransparent, setTransparent: effSetTransparent,
    textureOverlay: eff.textureOverlay, setTextureOverlay: eff.setTextureOverlay,
    maskOverlay, setMaskOverlay, superSample, setSuperSample,
    resampling, setResampling, sourceWidth: source?.width ?? 0, client,
  };

  const DOCK: { id: ToolId; glyph: string; label: string }[] = [
    { id: 'source', glyph: '⊕', label: 'Source' },
    { id: 'mode', glyph: '◉', label: 'Mode' },
    { id: 'adjust', glyph: '◑', label: 'Tone & preprocess' },
    { id: 'texture', glyph: '▦', label: 'Texture' },
    { id: 'mask', glyph: '◐', label: 'Mask' },
    { id: 'colors', glyph: '⬗', label: 'Colors' },
    { id: 'render', glyph: '⊞', label: 'Render & DPI' },
    { id: 'layers', glyph: '❏', label: 'Layers' },
    { id: 'recipe', glyph: '⌘', label: 'AI recipe' },
    { id: 'presets', glyph: '✦', label: 'Presets' },
  ];
  const activeMeta = DOCK.find((d) => d.id === activeTool);
  const wide = activeTool === 'presets' || activeTool === 'recipe';

  const toolBody = () => {
    switch (activeTool) {
      case 'source':
        return (
          <>
            <ImageUploader onImage={onImage} />
            {source && (
              <div className="row" style={{ marginTop: 10 }}>
                <label>Size</label>
                <span className="val">{source.width} × {source.height}</span>
              </div>
            )}
            <hr className="divider" />
            <h3 className="sub-h">Project</h3>
            <button className="ghost" style={{ width: '100%', marginBottom: 6 }}
              disabled={!source} onClick={onExportProject}>
              Save project (.json)
            </button>
            <label className="ghost file-label" style={{ width: '100%', textAlign: 'center', display: 'block' }}>
              Open project (.json)
              <input type="file" accept="application/json,.json" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportProject(f); e.currentTarget.value = ''; }} />
            </label>
            <p className="hint" style={{ marginTop: 8 }}>
              Your work autosaves in this browser and restores on reload.
            </p>
          </>
        );
      case 'layers':
        return (
          <LayersPanel
            source={source}
            composition={composition} setComposition={setComposition}
            activeLayerId={activeLayerId} setActiveLayerId={setActiveLayerId}
            selectTool={selectTool} setSelectTool={setSelectTool}
            tolerance={tolerance} setTolerance={setTolerance}
            hasPendingSelection={!!pendingSelection}
            onMakeLayerFromSelection={makeLayerFromSelection}
            onClearSelection={clearSelection}
          />
        );
      case 'recipe':
        return <AiRecipePanel source={source} applyParams={applyPipelineParams} applyComposition={applyComposition} />;
      case 'presets':
        return (
          <PresetGallery
            client={client} hasSource={!!source} sourceVersion={sourceVersion}
            customPresets={customPresets} activeId={activePresetId}
            onApply={applyPresetState} onSaveCurrent={onSaveCurrent} onDeleteCustom={onDeleteCustom}
          />
        );
      default:
        return <ControlsPanel {...controlsProps} view={activeTool as ControlsView} />;
    }
  };

  return (
    <div className="app">
      {dragOver && (
        <div className="drop-overlay"><div className="drop-overlay-inner">Drop image to load</div></div>
      )}

      {restored && (
        <div className="restored-banner">
          <span>Restored your last session.</span>
          <button onClick={() => setRestored(false)}>Dismiss</button>
          <button onClick={startFresh}>Start fresh</button>
        </div>
      )}

      <main className="stage">
        <CanvasPreview
          ref={setCanvas}
          hasSource={!!source}
          isRaster={!!composition || mode.kind === 'raster' || mode.kind === 'paletteDither' || mode.kind === 'tonal'}
          sourceWidth={source?.width ?? 0}
          onSourceZoomChange={setSourceZoom}
          onUserZoom={resetIdle}
          selectTool={selectTool}
          onWandPick={onWandPick}
          onPolygonSelect={onPolygonSelect}
          pendingOutline={pendingSelection?.outline ?? null}
          overlaySvgUrl={vectorPreviewUrl}
        />
      </main>

      <header className="header">
        <div className="brand"><span className="mark"></span><h1>Halftone Studio</h1></div>
        <div className="actions">
          {busy && <span className="spinner" title="rendering…" />}
          {lastDurationMs !== null && !busy && <span className="duration">{lastDurationMs.toFixed(0)}ms</span>}
          <button className="ghost icon" disabled={!canUndo} onClick={undo} title="Undo (Cmd/Ctrl+Z)">↶</button>
          <button className="ghost icon" disabled={!canRedo} onClick={redo} title="Redo (Cmd/Ctrl+Shift+Z)">↷</button>
          <select className="header-select" value={svgMode} onChange={(e) => setSvgMode(e.target.value as SvgMode)}>
            <option value="editable">SVG: editable</option>
            <option value="compact">SVG: compact</option>
            <option value="production">SVG: production</option>
          </select>
          <button className="ghost" disabled={!bundleEnabled} onClick={onExportZip} title="Export composite + per-channel SVGs in a ZIP">ZIP</button>
          <button className="ghost" disabled={!svgEnabled} onClick={onExportSvg}>SVG</button>
          <button className="btn" disabled={!source} onClick={onExportPng}>Export PNG</button>
        </div>
      </header>

      <nav className="dock">
        {DOCK.map((d, i) => (
          <span key={d.id} style={{ display: 'contents' }}>
            {(i === 8) && <span className="dock-sep" />}
            <button
              className={`dock-btn${activeTool === d.id ? ' on' : ''}`}
              onClick={() => setActiveTool((t) => (t === d.id ? null : d.id))}
            >
              {d.glyph}<span className="tip">{d.label}</span>
            </button>
          </span>
        ))}
      </nav>

      {activeTool && (
        <div className={`popover${wide ? ' wide' : ''}`}>
          <div className="popover-head">
            <span className="t">{activeMeta?.label}</span>
            <button className="x" onClick={() => setActiveTool(null)} title="close">✕</button>
          </div>
          {toolBody()}
        </div>
      )}
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

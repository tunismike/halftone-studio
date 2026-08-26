import { useEffect, useRef, useState } from 'react';
import type { AdjustParams } from '../engine/image/adjust';
import { defaultPreprocess, type PreprocessParams } from '../engine/image/preprocess';
import type { DitherKind } from '../engine/dither';
import {
  defaultCmykMode,
  defaultGridScreen,
  defaultHexScreen,
  defaultPaletteDitherMode,
  defaultPatternScreenMode,
  defaultPoissonScreen,
  defaultRadialScreen,
  defaultRdContourMode,
  defaultRdScreen,
  defaultSpotMode,
  defaultStippleScreen,
  defaultTonalMode,
  defaultTonalRamp,
  defaultTraceMode,
  defaultVectorMode,
  makeMark,
  type ChannelConfig,
  type MarkKind,
  type ModeKind,
  type PaletteAlgorithm,
  type ResamplingMode,
  type ScreenKind,
  type SpotChannel,
  type StrokeStyle,
} from '../engine/pipeline';
import { PATTERN_CATALOG, type PatternId } from '../engine/noise/reaction-diffusion';
import { PATTERN_PRESETS, findPatternPreset, matchPatternPreset } from '../engine/screen/pattern-presets';
import { defaultDistress, type DistressMode, type DistressParams } from '../engine/mark/distress';
import {
  defaultTextureOverlay,
  type TextureBlendMode,
  type TextureOverlay,
} from '../engine/texture/types';
import { defaultMaskOverlay, type MaskOverlay } from '../engine/mask/types';
import {
  addUserMask,
  deleteUserMask,
  getUserMaskBlob,
  listUserMasks,
} from '../engine/mask/store';
import { BUNDLED_TEXTURES } from '../engine/texture/catalog';
import {
  addUserTexture,
  deleteUserTexture,
  getUserTextureBlob,
  listUserTextures,
} from '../engine/texture/user-store';
import { BUILTIN_PALETTES } from '../engine/color/palettes-builtin';
import {
  addCustomPalette,
  deleteCustomPalette,
  loadCustomPalettes,
  subscribeCustomPalettes,
} from '../engine/color/custom-palettes';
import { extractPalette } from '../engine/color/extract';
import { KERNELS, KERNEL_IDS, KERNEL_CATEGORY, type KernelId } from '../engine/dither/kernels';
import type { ColorMetric } from '../engine/color/palette';
import type { WarpParams } from '../engine/screen/warp';

interface Props {
  adjust: AdjustParams;
  setAdjust: (a: AdjustParams) => void;
  preprocess: PreprocessParams;
  setPreprocess: (p: PreprocessParams) => void;
  mode: ModeKind;
  setMode: (m: ModeKind) => void;
  background: string;
  setBackground: (s: string) => void;
  foreground: string;
  setForeground: (s: string) => void;
  transparent: boolean;
  setTransparent: (b: boolean) => void;
  textureOverlay: TextureOverlay | undefined;
  setTextureOverlay: (o: TextureOverlay | undefined) => void;
  maskOverlay: MaskOverlay | undefined;
  setMaskOverlay: (o: MaskOverlay | undefined) => void;
  superSample: boolean;
  setSuperSample: (b: boolean) => void;
  resampling: ResamplingMode;
  setResampling: (r: ResamplingMode) => void;
  sourceWidth: number;
  client: import('../worker/client').HalftoneClient;
  /** When set, render only this tool's group(s) — used by the dock popover. */
  view?: ToolView;
}

export type ToolView = 'mode' | 'adjust' | 'texture' | 'mask' | 'colors' | 'render';

type ModeTag = 'raster' | 'vector' | 'patternScreen' | 'cmyk' | 'spot' | 'paletteDither' | 'tonal' | 'rdContour' | 'trace';
type DitherTag = 'none' | 'threshold' | 'bayer' | 'floyd' | 'atkinson';

export function ControlsPanel(props: Props) {
  const {
    adjust, setAdjust, preprocess, setPreprocess, mode, setMode,
    background, setBackground, foreground, setForeground,
    transparent, setTransparent,
    textureOverlay, setTextureOverlay,
    maskOverlay, setMaskOverlay,
    superSample, setSuperSample,
    resampling, setResampling, sourceWidth,
    client, view,
  } = props;

  const show = (v: ToolView) => !view || view === v;

  const activeCellSize = getActiveCellSize(mode);
  const setActiveCellSize = (newCell: number) => {
    const next = withActiveCellSize(mode, newCell);
    if (next) setMode(next);
  };

  const updateAdjust = <K extends keyof AdjustParams>(k: K, v: AdjustParams[K]) =>
    setAdjust({ ...adjust, [k]: v });

  const updatePreprocess = <K extends keyof PreprocessParams>(k: K, v: PreprocessParams[K]) =>
    setPreprocess({ ...preprocess, [k]: v });

  const onModeChange = (tag: ModeTag) => {
    if (tag === 'raster') setMode({ kind: 'raster', dither: { kind: 'floyd' } });
    else if (tag === 'vector') setMode(defaultVectorMode());
    else if (tag === 'cmyk') setMode(defaultCmykMode());
    else if (tag === 'spot') setMode(defaultSpotMode());
    else if (tag === 'paletteDither') setMode(defaultPaletteDitherMode());
    else if (tag === 'tonal') setMode(defaultTonalMode());
    else if (tag === 'patternScreen') setMode(defaultPatternScreenMode());
    else if (tag === 'trace') setMode(defaultTraceMode());
    else setMode(defaultRdContourMode());
  };

  return (
    <>
      {show('adjust') && <div className="group">
        <h2>Tone</h2>
        <Slider label="Brightness" value={adjust.brightness} min={-1} max={1} step={0.01}
          onChange={(v) => updateAdjust('brightness', v)} />
        <Slider label="Contrast" value={adjust.contrast} min={-1} max={1} step={0.01}
          onChange={(v) => updateAdjust('contrast', v)} />
        <Slider label="Gamma" value={adjust.gamma} min={0.1} max={3} step={0.01}
          onChange={(v) => updateAdjust('gamma', v)} />
        <label className="checkbox-row">
          <input type="checkbox" checked={adjust.invert}
            onChange={(e) => updateAdjust('invert', e.target.checked)} />
          Invert
        </label>
      </div>}

      {show('adjust') && <div className="group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Preprocess</h2>
          <button className="ghost" onClick={() => setPreprocess(defaultPreprocess)}
            title="reset all preprocess sliders">Reset</button>
        </div>
        <Slider label="Blur" value={preprocess.blurRadius} min={0} max={10} step={0.1}
          onChange={(v) => updatePreprocess('blurRadius', v)} />
        <Slider label="Sharpen" value={preprocess.sharpenStrength} min={0} max={2} step={0.01}
          onChange={(v) => updatePreprocess('sharpenStrength', v)} />
        <Slider label="Sharpen radius" value={preprocess.sharpenRadius} min={0.5} max={10} step={0.1}
          onChange={(v) => updatePreprocess('sharpenRadius', v)} />
        <Slider label="Denoise / Noise" value={preprocess.denoiseNoise} min={-100} max={100} step={1}
          onChange={(v) => updatePreprocess('denoiseNoise', v)} />
        <Slider label="Black point" value={preprocess.blackPoint} min={0} max={254} step={1}
          onChange={(v) => updatePreprocess('blackPoint', Math.min(v, preprocess.whitePoint - 1))} />
        <Slider label="White point" value={preprocess.whitePoint} min={1} max={255} step={1}
          onChange={(v) => updatePreprocess('whitePoint', Math.max(v, preprocess.blackPoint + 1))} />
        <Slider label="Mid gamma" value={preprocess.midGamma} min={0.1} max={3} step={0.01}
          onChange={(v) => updatePreprocess('midGamma', v)} />
      </div>}

      {show('mode') && <div className="group">
        <h2>Mode</h2>
        <div className="row">
          <label>Type</label>
          <select value={mode.kind} onChange={(e) => onModeChange(e.target.value as ModeTag)}>
            <option value="raster">Dither / threshold</option>
            <option value="vector">Vector halftone</option>
            <option value="patternScreen">Pattern screen</option>
            <option value="cmyk">CMYK separation</option>
            <option value="spot">Spot color (duotone)</option>
            <option value="paletteDither">Palette dither</option>
            <option value="tonal">Tonal (1–5 inks)</option>
            <option value="rdContour">RD contour strokes</option>
            <option value="trace">Vector trace (raster → SVG)</option>
          </select>
        </div>

        {mode.kind === 'raster' && (
          <DitherSubControls d={mode.dither}
            onChange={(d) => setMode({ kind: 'raster', dither: d })} />
        )}

        {mode.kind === 'vector' && (
          <VectorControls
            mode={mode}
            onChange={(m) => setMode(m)}
          />
        )}

        {(mode.kind === 'cmyk' || mode.kind === 'spot') && (
          <MultiInkControls
            mode={mode}
            onChange={(m) => setMode(m)}
          />
        )}

        {mode.kind === 'paletteDither' && (
          <PaletteDitherControls mode={mode} onChange={(m) => setMode(m)} />
        )}

        {mode.kind === 'tonal' && (
          <TonalControls mode={mode} onChange={(m) => setMode(m)} />
        )}

        {mode.kind === 'rdContour' && (
          <RdContourControls mode={mode} onChange={(m) => setMode(m)} />
        )}

        {mode.kind === 'patternScreen' && (
          <PatternScreenControls mode={mode} onChange={(m) => setMode(m)} />
        )}

        {mode.kind === 'trace' && (
          <TraceControls mode={mode} onChange={(m) => setMode(m)} />
        )}
      </div>}

      {show('texture') && <div className="group">
        <h2>Texture overlay</h2>
        <TextureSection overlay={textureOverlay} onChange={setTextureOverlay} client={client} />
      </div>}

      {show('mask') && <div className="group">
        <h2>Mask</h2>
        <MaskSection overlay={maskOverlay} onChange={setMaskOverlay} client={client} />
      </div>}

      {show('colors') && <div className="group">
        <h2>Colors</h2>
        <label className="checkbox-row">
          <input type="checkbox" checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)} />
          Transparent background (knockout)
        </label>
        {!transparent && (
          <div className="row">
            <label>Background</label>
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
          </div>
        )}
        <div className="row">
          <label>Foreground</label>
          <input type="color" value={foreground} onChange={(e) => setForeground(e.target.value)} />
        </div>
      </div>}

      {show('render') && <div className="group">
        <h2>Render</h2>
        <label className="checkbox-row">
          <input type="checkbox" checked={superSample}
            onChange={(e) => setSuperSample(e.target.checked)} />
          2× Sampler (anti-aliased mark edges, ~2× render cost)
        </label>
        <div className="row">
          <label>Resampling</label>
          {/* Downscale now uses a linear-light area-average box filter, so the
              old bilinear/bicubic distinction no longer applies — it's Smooth
              vs Pixelated. 'bicubic' kept as an alias for older saved links. */}
          <select value={resampling === 'bicubic' ? 'bilinear' : resampling}
            onChange={(e) => setResampling(e.target.value as ResamplingMode)}>
            <option value="bilinear">Smooth (area average)</option>
            <option value="nearest">Pixelated (nearest)</option>
          </select>
        </div>
        {activeCellSize !== null && sourceWidth > 0 && (
          <DpiHelper
            sourceWidth={sourceWidth}
            cellSize={activeCellSize}
            onSetCellSize={setActiveCellSize}
          />
        )}
      </div>}
    </>
  );
}

function getActiveCellSize(mode: ModeKind): number | null {
  if (mode.kind === 'vector') {
    const s = mode.screen;
    if (s.kind === 'grid' || s.kind === 'hex' || s.kind === 'radial') return s.cellSize;
    if (s.kind === 'reaction-diffusion') return s.rd.cellSize;
    if (s.kind === 'stipple') return s.stipple.pitch;
  }
  if (mode.kind === 'cmyk' || mode.kind === 'spot') return mode.baseCellSize;
  return null;
}

function withActiveCellSize(mode: ModeKind, cell: number): ModeKind | null {
  if (mode.kind === 'vector') {
    const s = mode.screen;
    if (s.kind === 'grid' || s.kind === 'hex') {
      return { ...mode, screen: { ...s, cellSize: cell } };
    }
    if (s.kind === 'radial') {
      return { ...mode, screen: { ...s, cellSize: cell } };
    }
    if (s.kind === 'reaction-diffusion') {
      return { ...mode, screen: { ...s, rd: { ...s.rd, cellSize: cell } } };
    }
    if (s.kind === 'stipple') {
      return { ...mode, screen: { ...s, stipple: { ...s.stipple, pitch: cell } } };
    }
  }
  if (mode.kind === 'cmyk' || mode.kind === 'spot') {
    return { ...mode, baseCellSize: cell };
  }
  return null;
}

function DpiHelper({
  sourceWidth,
  cellSize,
  onSetCellSize,
}: {
  sourceWidth: number;
  cellSize: number;
  onSetCellSize: (cell: number) => void;
}) {
  const ASSUMED_INCHES = 8;
  // Floor on cell size: 2px cells are the smallest that render a visible dot
  // (~1px radius). Below that, dots vanish AND the mark count explodes into a
  // multi-second render. The engine clamps sample count regardless, but the
  // helper shouldn't suggest a DPI that produces nothing useful. Max DPI is
  // bounded by the source's own resolution — a small source can't carry many
  // distinct dots.
  const MIN_CELL = 2;
  const maxDpi = Math.max(10, Math.floor(sourceWidth / (ASSUMED_INCHES * MIN_CELL)));
  const currentDpi = Math.max(1, Math.round((sourceWidth / cellSize) / ASSUMED_INCHES));
  // Free-typing string state so intermediate values ("5" on the way to "50",
  // or a cleared field) aren't clobbered by clamping on each keystroke.
  // We only clamp when Apply is pressed. Resets to the live currentDpi
  // whenever an applied cellSize changes it.
  const [dpiText, setDpiText] = useState<string>(String(currentDpi));
  useEffect(() => { setDpiText(String(currentDpi)); }, [currentDpi]);
  const targetDpi = Number(dpiText);
  const validTarget = Number.isFinite(targetDpi) && targetDpi > 0;

  // Cell size the target DPI would produce — warn when it gets faint.
  const projectedCell = validTarget ? sourceWidth / (targetDpi * ASSUMED_INCHES) : Infinity;
  const faint = validTarget && projectedCell < 2;
  const overCeiling = validTarget && targetDpi > maxDpi;

  const applyDpi = () => {
    const dpi = validTarget ? targetDpi : currentDpi;
    const clampedDpi = Math.max(10, Math.min(dpi, maxDpi));
    const next = sourceWidth / (clampedDpi * ASSUMED_INCHES);
    onSetCellSize(Math.max(MIN_CELL, +next.toFixed(2)));
    setDpiText(String(clampedDpi));
  };
  return (
    <>
      <div className="row">
        <label>Current DPI</label>
        <span className="val" style={{ flex: 1, textAlign: 'right' }}>
          {currentDpi} / max {maxDpi} ({sourceWidth}px src)
        </span>
      </div>
      <div className="row">
        <label>Set DPI</label>
        <input type="number" min={10} max={maxDpi} value={dpiText}
          onChange={(e) => setDpiText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyDpi(); }}
          style={{ width: 64 }} />
        <button className="ghost" onClick={applyDpi}
          title={`apply target DPI as cell size for ${ASSUMED_INCHES}″ paper`}>
          Apply
        </button>
      </div>
      {(faint || overCeiling) && (
        <div className="preset-no-results" style={{ marginTop: 0 }}>
          {overCeiling
            ? `Max DPI for a ${sourceWidth}px source is ${maxDpi}. Upload a higher-res image to go finer (clamps to ${maxDpi} on Apply).`
            : `${targetDpi} DPI → ${projectedCell.toFixed(1)}px cells: faint in preview, visible in full-res export.`}
        </div>
      )}
    </>
  );
}

function VectorControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'vector' }>;
  onChange: (m: ModeKind) => void;
}) {
  const setScreen = (s: ScreenKind) => onChange({ ...mode, screen: s });
  const setMark = (m: MarkKind) => onChange({ ...mode, mark: m });
  const setWarp = (w: WarpParams) => onChange({ ...mode, warp: w });
  const setStroke = (s: StrokeStyle) => onChange({ ...mode, stroke: s });

  return (
    <>
      <div className="row">
        <label>Screen</label>
        <select value={mode.screen.kind} onChange={(e) => {
          const k = e.target.value as ScreenKind['kind'];
          if (k === 'grid') setScreen(defaultGridScreen(10, 45));
          else if (k === 'hex') setScreen(defaultHexScreen(10, 0));
          else if (k === 'radial') setScreen(defaultRadialScreen(10));
          else if (k === 'poisson') setScreen(defaultPoissonScreen());
          else if (k === 'stipple') setScreen(defaultStippleScreen());
          else setScreen(defaultRdScreen('coral'));
        }}>
          <option value="grid">Square grid</option>
          <option value="hex">Hex grid</option>
          <option value="radial">Radial</option>
          <option value="poisson">Stochastic (Poisson)</option>
          <option value="stipple">Stipple (blue-noise)</option>
          <option value="reaction-diffusion">Reaction-diffusion (organic)</option>
        </select>
      </div>

      {mode.screen.kind === 'grid' && (
        <>
          <Slider label="Cell" value={mode.screen.cellSize} min={2} max={40} step={0.5}
            onChange={(v) => setScreen({ ...mode.screen, kind: 'grid', cellSize: v, angleDeg: (mode.screen as { angleDeg: number }).angleDeg })} />
          <Slider label="Angle" value={mode.screen.angleDeg} min={-90} max={90} step={1}
            onChange={(v) => setScreen({ ...mode.screen, kind: 'grid', cellSize: (mode.screen as { cellSize: number }).cellSize, angleDeg: v })} />
        </>
      )}
      {mode.screen.kind === 'hex' && (
        <>
          <Slider label="Cell" value={mode.screen.cellSize} min={2} max={40} step={0.5}
            onChange={(v) => setScreen({ kind: 'hex', cellSize: v, angleDeg: (mode.screen as { angleDeg: number }).angleDeg })} />
          <Slider label="Angle" value={mode.screen.angleDeg} min={-90} max={90} step={1}
            onChange={(v) => setScreen({ kind: 'hex', cellSize: (mode.screen as { cellSize: number }).cellSize, angleDeg: v })} />
        </>
      )}
      {mode.screen.kind === 'radial' && (
        <>
          <Slider label="Cell" value={mode.screen.cellSize} min={2} max={40} step={0.5}
            onChange={(v) => setScreen({ kind: 'radial', cellSize: v, cxFrac: (mode.screen as { cxFrac: number }).cxFrac, cyFrac: (mode.screen as { cyFrac: number }).cyFrac })} />
          <Slider label="Center X" value={mode.screen.cxFrac} min={0} max={1} step={0.01}
            onChange={(v) => setScreen({ kind: 'radial', cellSize: (mode.screen as { cellSize: number }).cellSize, cxFrac: v, cyFrac: (mode.screen as { cyFrac: number }).cyFrac })} />
          <Slider label="Center Y" value={mode.screen.cyFrac} min={0} max={1} step={0.01}
            onChange={(v) => setScreen({ kind: 'radial', cellSize: (mode.screen as { cellSize: number }).cellSize, cxFrac: (mode.screen as { cxFrac: number }).cxFrac, cyFrac: v })} />
        </>
      )}
      {mode.screen.kind === 'reaction-diffusion' && (() => {
        const sc = mode.screen;
        return (
          <>
            <div className="row">
              <label>Pattern</label>
              <select value={sc.pattern}
                onChange={(e) => setScreen({ ...sc, pattern: e.target.value as PatternId })}>
                {PATTERN_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <Slider label="Iters" value={sc.iterations} min={500} max={6000} step={100}
              onChange={(v) => setScreen({ ...sc, iterations: v })} />
            <Slider label="Grid" value={sc.gridSize} min={64} max={256} step={8}
              onChange={(v) => setScreen({ ...sc, gridSize: v })} />
            <Slider label="Cell" value={sc.rd.cellSize} min={2} max={20} step={0.5}
              onChange={(v) => setScreen({ ...sc, rd: { ...sc.rd, cellSize: v } })} />
            <Slider label="Tex scale" value={sc.rd.textureScale} min={0.05} max={2} step={0.01}
              onChange={(v) => setScreen({ ...sc, rd: { ...sc.rd, textureScale: v } })} />
            <Slider label="Threshold" value={sc.rd.threshold} min={0} max={1} step={0.01}
              onChange={(v) => setScreen({ ...sc, rd: { ...sc.rd, threshold: v } })} />
            <Slider label="Rotate" value={sc.rd.rotationDeg} min={-90} max={90} step={1}
              onChange={(v) => setScreen({ ...sc, rd: { ...sc.rd, rotationDeg: v } })} />
            <Slider label="Jitter" value={sc.rd.jitter} min={0} max={1} step={0.01}
              onChange={(v) => setScreen({ ...sc, rd: { ...sc.rd, jitter: v } })} />
            <Slider label="Seed" value={sc.rd.seed} min={1} max={999} step={1}
              onChange={(v) => setScreen({ ...sc, rd: { ...sc.rd, seed: v } })} />
            <label className="checkbox-row">
              <input type="checkbox" checked={sc.rd.modulateBySource}
                onChange={(e) => setScreen({ ...sc, rd: { ...sc.rd, modulateBySource: e.target.checked } })} />
              Modulate by image luminance
            </label>
          </>
        );
      })()}
      {mode.screen.kind === 'poisson' && (() => {
        const ps = mode.screen.poisson;
        return (
          <>
            <Slider label="Min r" value={ps.minRadius} min={1} max={20} step={0.5}
              onChange={(v) => setScreen({ kind: 'poisson', poisson: { ...ps, minRadius: v } })} />
            <Slider label="Max r" value={ps.maxRadius} min={2} max={40} step={0.5}
              onChange={(v) => setScreen({ kind: 'poisson', poisson: { ...ps, maxRadius: v } })} />
            <label className="checkbox-row">
              <input type="checkbox" checked={ps.densityFromLum}
                onChange={(e) => setScreen({ kind: 'poisson', poisson: { ...ps, densityFromLum: e.target.checked } })} />
              Vary density by luminance
            </label>
            <Slider label="Seed" value={ps.seed} min={1} max={999} step={1}
              onChange={(v) => setScreen({ kind: 'poisson', poisson: { ...ps, seed: v } })} />
          </>
        );
      })()}
      {mode.screen.kind === 'stipple' && (() => {
        const sp = mode.screen.stipple;
        return (
          <>
            <div className="row">
              <label>Dither</label>
              <select value={sp.dither}
                onChange={(e) => setScreen({ kind: 'stipple', stipple: { ...sp, dither: e.target.value as typeof sp.dither } })}>
                <option value="floyd">Floyd-Steinberg (organic)</option>
                <option value="atkinson">Atkinson (sparse)</option>
                <option value="blue-noise">Blue noise (even)</option>
                <option value="bayer">Bayer (structured)</option>
              </select>
            </div>
            <Slider label="Pitch" value={sp.pitch} min={1.5} max={20} step={0.25}
              onChange={(v) => setScreen({ kind: 'stipple', stipple: { ...sp, pitch: v } })} />
            <Slider label="Density bias" value={sp.contrast} min={-0.8} max={0.8} step={0.02}
              onChange={(v) => setScreen({ kind: 'stipple', stipple: { ...sp, contrast: v } })} />
            <Slider label="Jitter" value={sp.jitter} min={0} max={1} step={0.05}
              onChange={(v) => setScreen({ kind: 'stipple', stipple: { ...sp, jitter: v } })} />
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Density = tone via the chosen dither. Pair with a circle mark + Fixed radius for uniform dots.
            </div>
          </>
        );
      })()}

      <div className="row" style={{ marginTop: 6 }}>
        <label>Mark</label>
        <select value={mode.mark.kind} onChange={(e) => setMark(makeMark(e.target.value as MarkKind['kind']))}>
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="diamond">Diamond</option>
          <option value="line">Line segment</option>
          <option value="blob">Blob / organic</option>
          <option value="flow">Flow stroke (plasma)</option>
          <option value="glyph">Custom SVG glyph</option>
        </select>
      </div>

      <MarkControls mark={mode.mark} onChange={setMark} />

      <label className="checkbox-row" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={mode.stroke.enabled}
          onChange={(e) => setStroke({ ...mode.stroke, enabled: e.target.checked })} />
        Outline only (no fill)
      </label>
      {mode.stroke.enabled && (
        <Slider label="Stroke w" value={mode.stroke.width} min={0.2} max={6} step={0.1}
          onChange={(v) => setStroke({ ...mode.stroke, width: v })} />
      )}

      <WarpSubControls warp={mode.warp} onChange={setWarp} />
    </>
  );
}

function DistressBlock({
  distress,
  onChange,
}: {
  distress: DistressParams | undefined;
  onChange: (d: DistressParams | undefined) => void;
}) {
  const d = distress ?? defaultDistress;
  const enabled = !!distress && d.strength > 0;
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Distress {enabled ? `(${d.mode} ${d.strength.toFixed(2)})` : ''}
      </summary>
      <Slider label="Strength" value={d.strength} min={0} max={1} step={0.01}
        onChange={(v) => onChange(v === 0 ? undefined : { ...d, strength: v })} />
      <div className="row">
        <label>Mode</label>
        <select value={d.mode}
          onChange={(e) => onChange({ ...d, mode: e.target.value as DistressMode })}>
          <option value="jitter">Jitter (offset / rotate)</option>
          <option value="break">Break (skip marks)</option>
          <option value="erode">Erode (shrink marks)</option>
        </select>
      </div>
      <Slider label="Seed" value={d.seed} min={1} max={999} step={1}
        onChange={(v) => onChange({ ...d, seed: v })} />
    </details>
  );
}

function MarkControls({ mark, onChange }: { mark: MarkKind; onChange: (m: MarkKind) => void }) {
  if (mark.kind === 'circle') {
    const p = mark.params;
    return (
      <>
        <Slider label="Bleed" value={p.gain} min={0} max={2} step={0.01}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, gain: v } })} />
        <Slider label="Min dot" value={p.minRatio} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, minRatio: v } })} />
        <Slider label="Max dot" value={p.maxRatio} min={0.1} max={1.5} step={0.01}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, maxRatio: v } })} />
        <Slider label="Solid below" value={p.solidAt ?? 0} min={0} max={0.5} step={0.01}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, solidAt: v } })} />
        <Slider label="Drop above" value={p.dropAt ?? 1} min={0.5} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, dropAt: v } })} />
        <Slider label="Edge-aware" value={p.edgeAwareStrength ?? 0} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, edgeAwareStrength: v } })} />
        <Slider label="Fixed radius (px)" value={p.fixedRadius ?? 0} min={0} max={20} step={0.05}
          onChange={(v) => onChange({ kind: 'circle', params: { ...p, fixedRadius: v } })} />
        <DistressBlock distress={p.distress}
          onChange={(d) => onChange({ kind: 'circle', params: { ...p, distress: d } })} />
      </>
    );
  }
  if (mark.kind === 'square' || mark.kind === 'diamond') {
    const p = mark.params;
    return (
      <>
        <Slider label="Bleed" value={p.gain} min={0} max={2} step={0.01}
          onChange={(v) => onChange({ kind: mark.kind, params: { ...p, gain: v } })} />
        <Slider label="Min" value={p.minRatio} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: mark.kind, params: { ...p, minRatio: v } })} />
        <Slider label="Max" value={p.maxRatio} min={0.1} max={1.5} step={0.01}
          onChange={(v) => onChange({ kind: mark.kind, params: { ...p, maxRatio: v } })} />
        <Slider label="Rotate" value={p.rotateDeg} min={-90} max={90} step={1}
          onChange={(v) => onChange({ kind: mark.kind, params: { ...p, rotateDeg: v } })} />
        <Slider label="Corner radius" value={p.cornerRadius ?? 0} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: mark.kind, params: { ...p, cornerRadius: v } })} />
        <DistressBlock distress={p.distress}
          onChange={(d) => onChange({ kind: mark.kind, params: { ...p, distress: d } })} />
      </>
    );
  }
  if (mark.kind === 'line') {
    const p = mark.params;
    return (
      <>
        <Slider label="Bleed" value={p.gain} min={0} max={2} step={0.01}
          onChange={(v) => onChange({ kind: 'line', params: { ...p, gain: v } })} />
        <Slider label="Min w" value={p.minRatio} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'line', params: { ...p, minRatio: v } })} />
        <Slider label="Max w" value={p.maxRatio} min={0.1} max={1.5} step={0.01}
          onChange={(v) => onChange({ kind: 'line', params: { ...p, maxRatio: v } })} />
        <DistressBlock distress={p.distress}
          onChange={(d) => onChange({ kind: 'line', params: { ...p, distress: d } })} />
      </>
    );
  }
  if (mark.kind === 'blob') {
    const p = mark.params;
    return (
      <>
        <Slider label="Bleed" value={p.gain} min={0} max={2} step={0.01}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, gain: v } })} />
        <Slider label="Min" value={p.minRatio} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, minRatio: v } })} />
        <Slider label="Max" value={p.maxRatio} min={0.1} max={1.5} step={0.01}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, maxRatio: v } })} />
        <Slider label="Jitter" value={p.jitter} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, jitter: v } })} />
        <Slider label="Vertices" value={p.vertices} min={3} max={20} step={1}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, vertices: v } })} />
        <Slider label="Seed" value={p.seed} min={1} max={999} step={1}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, seed: v } })} />
        <Slider label="Edge-aware" value={p.edgeAwareStrength ?? 0} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'blob', params: { ...p, edgeAwareStrength: v } })} />
        <DistressBlock distress={p.distress}
          onChange={(d) => onChange({ kind: 'blob', params: { ...p, distress: d } })} />
      </>
    );
  }
  if (mark.kind === 'flow') {
    const p = mark.params;
    return (
      <>
        <Slider label="Bleed" value={p.gain} min={0} max={2} step={0.01}
          onChange={(v) => onChange({ kind: 'flow', params: { ...p, gain: v } })} />
        <Slider label="Max" value={p.maxRatio} min={0.1} max={3} step={0.01}
          onChange={(v) => onChange({ kind: 'flow', params: { ...p, maxRatio: v } })} />
        <Slider label="Noise freq" value={p.noiseFreq} min={0.001} max={0.2} step={0.001}
          onChange={(v) => onChange({ kind: 'flow', params: { ...p, noiseFreq: v } })} />
        <Slider label="Width" value={p.baseWidth} min={0.5} max={5} step={0.1}
          onChange={(v) => onChange({ kind: 'flow', params: { ...p, baseWidth: v } })} />
        <Slider label="Seed" value={p.noiseSeed} min={1} max={999} step={1}
          onChange={(v) => onChange({ kind: 'flow', params: { ...p, noiseSeed: v } })} />
        <DistressBlock distress={p.distress}
          onChange={(d) => onChange({ kind: 'flow', params: { ...p, distress: d } })} />
      </>
    );
  }
  // glyph
  const p = mark.params;
  return (
    <>
      <div className="row">
        <label>Path d</label>
        <input type="text" value={p.pathD}
          onChange={(e) => onChange({ kind: 'glyph', params: { ...p, pathD: e.target.value } })}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
      </div>
      <Slider label="vbox W" value={p.viewBoxW} min={1} max={200} step={1}
        onChange={(v) => onChange({ kind: 'glyph', params: { ...p, viewBoxW: v } })} />
      <Slider label="vbox H" value={p.viewBoxH} min={1} max={200} step={1}
        onChange={(v) => onChange({ kind: 'glyph', params: { ...p, viewBoxH: v } })} />
      <Slider label="Bleed" value={p.gain} min={0} max={2} step={0.01}
        onChange={(v) => onChange({ kind: 'glyph', params: { ...p, gain: v } })} />
      <Slider label="Max" value={p.maxRatio} min={0.1} max={2} step={0.01}
        onChange={(v) => onChange({ kind: 'glyph', params: { ...p, maxRatio: v } })} />
      <Slider label="Rotate" value={p.rotateDeg} min={-180} max={180} step={1}
        onChange={(v) => onChange({ kind: 'glyph', params: { ...p, rotateDeg: v } })} />
      <DistressBlock distress={p.distress}
        onChange={(d) => onChange({ kind: 'glyph', params: { ...p, distress: d } })} />
    </>
  );
}

function RdContourControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'rdContour' }>;
  onChange: (m: ModeKind) => void;
}) {
  const p = mode.params;
  const set = (next: Partial<typeof p>): void =>
    onChange({ ...mode, params: { ...p, ...next } });
  return (
    <>
      <div className="row">
        <label>Pattern</label>
        <select value={p.pattern}
          onChange={(e) => set({ pattern: e.target.value as PatternId })}>
          {PATTERN_CATALOG.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
      </div>
      <Slider label="Iters" value={p.iterations} min={500} max={6000} step={100}
        onChange={(v) => set({ iterations: v })} />
      <Slider label="Grid" value={p.gridSize} min={64} max={256} step={8}
        onChange={(v) => set({ gridSize: v })} />
      <Slider label="Tex scale" value={p.textureScale} min={0.05} max={1} step={0.01}
        onChange={(v) => set({ textureScale: v })} />
      <Slider label="Levels" value={p.levels} min={1} max={20} step={1}
        onChange={(v) => set({ levels: v })} />
      <Slider label="Image weight" value={p.sourceWeight} min={0} max={4} step={0.1}
        onChange={(v) => set({ sourceWeight: v })} />
      <Slider label="Image midpoint" value={p.sourceMidpoint} min={0} max={1} step={0.01}
        onChange={(v) => set({ sourceMidpoint: v })} />
      <Slider label="Stroke w" value={p.strokeWidth} min={0.25} max={4} step={0.25}
        onChange={(v) => set({ strokeWidth: v })} />
      <Slider label="Rotate" value={p.rotationDeg} min={-90} max={90} step={1}
        onChange={(v) => set({ rotationDeg: v })} />
      <Slider label="Seed" value={p.seed} min={1} max={999} step={1}
        onChange={(v) => set({ seed: v })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={p.invert}
          onChange={(e) => set({ invert: e.target.checked })} />
        Invert tonal mapping
      </label>
    </>
  );
}

function PatternScreenControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'patternScreen' }>;
  onChange: (m: ModeKind) => void;
}) {
  const p = mode.pattern;
  const v = mode.vector;
  const setP = (next: Partial<typeof p>): void =>
    onChange({ ...mode, pattern: { ...p, ...next } });
  const setV = (next: Partial<typeof v>): void =>
    onChange({ ...mode, vector: { ...v, ...next } });
  const setShaping = (next: Partial<typeof p.shaping>): void =>
    setP({ shaping: { ...p.shaping, ...next } });
  const setWarp = (next: Partial<typeof p.warp>): void =>
    setP({ warp: { ...p.warp, ...next } });

  // Which preset, if any, the current params still match exactly.
  const activePreset = matchPatternPreset(p);

  return (
    <>
      <p className="hint">
        Compares every pixel against a rank-equalized threshold field, so tone
        stays linear and the screen keeps structure end to end — dots through
        the highlights, a checkerboard at 50%, holes in the shadows. Output is
        binary, so PNG export has no semi-transparent pixels.
      </p>
      <div className="row">
        <label>Preset</label>
        <select value={activePreset?.id ?? ''}
          onChange={(e) => {
            const found = findPatternPreset(e.target.value);
            if (found) onChange({ ...mode, pattern: structuredClone(found.params) });
          }}>
          {!activePreset && <option value="">Custom</option>}
          {PATTERN_PRESETS.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
      </div>
      <Slider label="Cell size" value={p.cellSize} min={1} max={40} step={0.5}
        onChange={(val) => setP({ cellSize: val })} />
      <Slider label="Angle" value={p.angleDeg} min={0} max={180} step={0.5}
        onChange={(val) => setP({ angleDeg: val })} />
      <p className="hint">
        An axis-aligned screen (0°/90°) samples every cell at the same phase, so
        tone quantizes — the reason print screens sit at 15/22.5/45/75°.
      </p>

      <h3>Ink response</h3>
      <Slider label="Gamma" value={p.shaping.gamma} min={0.2} max={3} step={0.01}
        onChange={(val) => setShaping({ gamma: val })} />
      <Slider label="Solid below" value={p.shaping.solidAt} min={0} max={0.9} step={0.01}
        onChange={(val) => setShaping({ solidAt: Math.min(val, p.shaping.dropAt - 0.01) })} />
      <Slider label="Drop above" value={p.shaping.dropAt} min={0.1} max={1} step={0.01}
        onChange={(val) => setShaping({ dropAt: Math.max(val, p.shaping.solidAt + 0.01) })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={p.shaping.invert}
          onChange={(e) => setShaping({ invert: e.target.checked })} />
        Invert (negative)
      </label>

      <h3>Warp</h3>
      <Slider label="Wave amount" value={p.warp.waveAmp} min={0} max={40} step={0.5}
        onChange={(val) => setWarp({ waveAmp: val })} />
      <Slider label="Wave scale" value={p.warp.waveFreq} min={0.002} max={0.08} step={0.001}
        onChange={(val) => setWarp({ waveFreq: val })} />
      <Slider label="Noise amount" value={p.warp.noiseAmp} min={0} max={40} step={0.5}
        onChange={(val) => setWarp({ noiseAmp: val })} />
      <Slider label="Noise scale" value={p.warp.noiseFreq} min={0.002} max={0.08} step={0.001}
        onChange={(val) => setWarp({ noiseFreq: val })} />

      <h3>Vector export</h3>
      <p className="hint">
        SVG export re-renders the screen at {v.supersample}× and traces that, so
        curves stay smooth regardless of the source image's pixel grid.
      </p>
      <Slider label="Supersample" value={v.supersample} min={1} max={4} step={1}
        onChange={(val) => setV({ supersample: val })} />
      <Slider label="Simplify" value={v.simplify} min={0} max={3} step={0.1}
        onChange={(val) => setV({ simplify: val })} />
      <Slider label="Smoothing" value={v.smoothing} min={0} max={1} step={0.05}
        onChange={(val) => setV({ smoothing: val })} />
      <Slider label="Min feature (px²)" value={v.minFeature} min={0} max={40} step={0.5}
        onChange={(val) => setV({ minFeature: val })} />

      <label className="checkbox-row">
        <input type="checkbox" checked={p.softPreview}
          onChange={(e) => setP({ softPreview: e.target.checked })} />
        Anti-aliased preview (print export stays hard-edged either way)
      </label>
    </>
  );
}

function TraceControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'trace' }>;
  onChange: (m: ModeKind) => void;
}) {
  const t = mode.trace;
  const set = (next: Partial<typeof t>): void =>
    onChange({ ...mode, trace: { ...t, ...next } });
  return (
    <>
      <p className="hint">
        Posterizes to N flat colors, then traces each color into editable SVG
        paths. Export as SVG to get vector regions.
      </p>
      <Slider label="Colors" value={t.colors} min={2} max={16} step={1}
        onChange={(v) => set({ colors: v })} />
      <Slider label="Simplify" value={t.simplify} min={0} max={4} step={0.1}
        onChange={(v) => set({ simplify: v })} />
      <Slider label="Smoothing" value={t.smoothing} min={0} max={1} step={0.05}
        onChange={(v) => set({ smoothing: v })} />
      <Slider label="Min area" value={t.minArea} min={0} max={200} step={1}
        onChange={(v) => set({ minArea: v })} />
    </>
  );
}

function PaletteDitherControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'paletteDither' }>;
  onChange: (m: ModeKind) => void;
}) {
  const algo = mode.algorithm;
  const algoTag = algo.kind;
  const [customPalettes, setCustomPalettes] = useState(() => loadCustomPalettes());
  useEffect(() => subscribeCustomPalettes(() => setCustomPalettes(loadCustomPalettes())), []);
  const isCustom = mode.paletteId.startsWith('custom:');
  return (
    <>
      <div className="row">
        <label>Palette</label>
        <select value={mode.paletteId}
          onChange={(e) => onChange({ ...mode, paletteId: e.target.value })}>
          <optgroup label="Built-in">
            {BUILTIN_PALETTES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
          {customPalettes.length > 0 && (
            <optgroup label="Custom">
              {customPalettes.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.colors.length})</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <PaletteImportRow
        onImported={(id) => onChange({ ...mode, paletteId: id })}
        canDelete={isCustom}
        onDelete={() => {
          deleteCustomPalette(mode.paletteId);
          onChange({ ...mode, paletteId: 'mono-1bit' });
        }}
      />
      <PaletteSwatchStrip paletteId={mode.paletteId} />
      <div className="row">
        <label>Metric</label>
        <select value={mode.metric}
          onChange={(e) => onChange({ ...mode, metric: e.target.value as ColorMetric })}>
          <option value="lab-de2000">Lab ΔE 2000 (best)</option>
          <option value="linear-euclid">Linear RGB</option>
          <option value="srgb-euclid">sRGB</option>
          <option value="weighted-rgb">Weighted RGB (fast)</option>
        </select>
      </div>
      <div className="row">
        <label>Algorithm</label>
        <select value={algoTag} onChange={(e) => {
          const t = e.target.value as PaletteAlgorithm['kind'];
          if (t === 'error-diffusion') onChange({ ...mode, algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true } });
          else if (t === 'riemersma') onChange({ ...mode, algorithm: { kind: 'riemersma', historyLen: 16, decay: 0.5 } });
          else if (t === 'ordered-bayer') onChange({ ...mode, algorithm: { kind: 'ordered-bayer', size: 4, amplitude: 0.18 } });
          else if (t === 'ordered-bluenoise') onChange({ ...mode, algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.18 } });
          else onChange({ ...mode, algorithm: { kind: 'knuth' } });
        }}>
          <option value="error-diffusion">Error diffusion (kernel)</option>
          <option value="riemersma">Riemersma / Hilbert</option>
          <option value="ordered-bayer">Ordered (Bayer)</option>
          <option value="ordered-bluenoise">Ordered (blue noise)</option>
          <option value="knuth">Knuth dot diffusion</option>
        </select>
      </div>
      {algo.kind === 'error-diffusion' && (
        <>
          <div className="row">
            <label>Kernel</label>
            <select value={algo.kernel}
              onChange={(e) => onChange({ ...mode, algorithm: { ...algo, kernel: e.target.value as KernelId } })}>
              <optgroup label="Diffusion (classic)">
                {KERNEL_IDS.filter((k) => KERNEL_CATEGORY[k] === 'diffusion').map((k) => (
                  <option key={k} value={k}>{KERNELS[k].name}</option>
                ))}
              </optgroup>
              <optgroup label="Bi-Thread (specialty)">
                {KERNEL_IDS.filter((k) => KERNEL_CATEGORY[k] === 'bi-thread').map((k) => (
                  <option key={k} value={k}>{KERNELS[k].name}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={algo.serpentine}
              onChange={(e) => onChange({ ...mode, algorithm: { ...algo, serpentine: e.target.checked } })} />
            Serpentine traversal
          </label>
        </>
      )}
      {algo.kind === 'riemersma' && (
        <>
          <Slider label="History" value={algo.historyLen} min={4} max={64} step={1}
            onChange={(v) => onChange({ ...mode, algorithm: { ...algo, historyLen: v } })} />
          <Slider label="Decay" value={algo.decay} min={0.1} max={0.95} step={0.01}
            onChange={(v) => onChange({ ...mode, algorithm: { ...algo, decay: v } })} />
        </>
      )}
      {algo.kind === 'ordered-bayer' && (
        <>
          <div className="row">
            <label>Matrix</label>
            <select value={algo.size}
              onChange={(e) => onChange({ ...mode, algorithm: { ...algo, size: Number(e.target.value) as 2 | 4 | 8 } })}>
              <option value={2}>2 × 2</option>
              <option value={4}>4 × 4</option>
              <option value={8}>8 × 8</option>
            </select>
          </div>
          <Slider label="Amplitude" value={algo.amplitude} min={0} max={0.5} step={0.01}
            onChange={(v) => onChange({ ...mode, algorithm: { ...algo, amplitude: v } })} />
        </>
      )}
      {algo.kind === 'ordered-bluenoise' && (
        <>
          <div className="row">
            <label>Mask size</label>
            <select value={algo.size}
              onChange={(e) => onChange({ ...mode, algorithm: { ...algo, size: Number(e.target.value) } })}>
              <option value={32}>32 × 32</option>
              <option value={64}>64 × 64 (recommended)</option>
              <option value={128}>128 × 128</option>
            </select>
          </div>
          <Slider label="Amplitude" value={algo.amplitude} min={0} max={0.5} step={0.01}
            onChange={(v) => onChange({ ...mode, algorithm: { ...algo, amplitude: v } })} />
        </>
      )}
    </>
  );
}

function TonalControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'tonal' }>;
  onChange: (m: ModeKind) => void;
}) {
  const algo = mode.algorithm;
  const algoTag = algo.kind;
  const labelFor = (i: number): string => {
    const n = mode.bandCount;
    if (n === 1) return 'Ink';
    if (n === 2) return i === 0 ? 'Shadow' : 'Highlight';
    if (n === 3) return ['Shadows', 'Midtones', 'Highlights'][i];
    return `Band ${i + 1}`;
  };
  const setColor = (i: number, hex: string) => {
    const next = mode.bandColors.slice();
    next[i] = hex;
    onChange({ ...mode, bandColors: next });
  };
  const setCount = (n: 1 | 2 | 3 | 4 | 5) => {
    const cur = mode.bandColors.slice(0, n);
    if (cur.length < n) {
      const ramp = defaultTonalRamp(n);
      while (cur.length < n) cur.push(ramp[cur.length]);
    }
    onChange({ ...mode, bandCount: n, bandColors: cur });
  };
  return (
    <>
      <div className="row">
        <label>Tonal mapping</label>
        <select value={mode.bandCount}
          onChange={(e) => setCount(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}>
          <option value={1}>1 color</option>
          <option value={2}>2 colors (duotone)</option>
          <option value={3}>3 colors (tritone)</option>
          <option value={4}>4 colors</option>
          <option value={5}>5 colors</option>
        </select>
      </div>
      {Array.from({ length: mode.bandCount }).map((_, i) => (
        <div key={i} className="row">
          <label>{labelFor(i)}</label>
          <input type="color"
            value={mode.bandColors[i] ?? '#808080'}
            onChange={(e) => setColor(i, e.target.value)} />
          <span className="val" style={{ minWidth: 70 }}>{mode.bandColors[i]}</span>
        </div>
      ))}
      <div className="row">
        <label>Metric</label>
        <select value={mode.metric}
          onChange={(e) => onChange({ ...mode, metric: e.target.value as ColorMetric })}>
          <option value="lab-de2000">Lab ΔE 2000 (best)</option>
          <option value="linear-euclid">Linear RGB</option>
          <option value="srgb-euclid">sRGB</option>
          <option value="weighted-rgb">Weighted RGB (fast)</option>
        </select>
      </div>
      <div className="row">
        <label>Algorithm</label>
        <select value={algoTag} onChange={(e) => {
          const t = e.target.value as PaletteAlgorithm['kind'];
          if (t === 'error-diffusion') onChange({ ...mode, algorithm: { kind: 'error-diffusion', kernel: 'floyd-steinberg', serpentine: true } });
          else if (t === 'riemersma') onChange({ ...mode, algorithm: { kind: 'riemersma', historyLen: 16, decay: 0.5 } });
          else if (t === 'ordered-bayer') onChange({ ...mode, algorithm: { kind: 'ordered-bayer', size: 4, amplitude: 0.18 } });
          else if (t === 'ordered-bluenoise') onChange({ ...mode, algorithm: { kind: 'ordered-bluenoise', size: 64, amplitude: 0.18 } });
          else onChange({ ...mode, algorithm: { kind: 'knuth' } });
        }}>
          <option value="error-diffusion">Error diffusion (kernel)</option>
          <option value="riemersma">Riemersma / Hilbert</option>
          <option value="ordered-bayer">Ordered (Bayer)</option>
          <option value="ordered-bluenoise">Ordered (blue noise)</option>
          <option value="knuth">Knuth dot diffusion</option>
        </select>
      </div>
      {algo.kind === 'error-diffusion' && (
        <div className="row">
          <label>Kernel</label>
          <select value={algo.kernel}
            onChange={(e) => onChange({ ...mode, algorithm: { ...algo, kernel: e.target.value as KernelId } })}>
            <optgroup label="Diffusion (classic)">
              {KERNEL_IDS.filter((k) => KERNEL_CATEGORY[k] === 'diffusion').map((k) => (
                <option key={k} value={k}>{KERNELS[k].name}</option>
              ))}
            </optgroup>
            <optgroup label="Bi-Thread (specialty)">
              {KERNEL_IDS.filter((k) => KERNEL_CATEGORY[k] === 'bi-thread').map((k) => (
                <option key={k} value={k}>{KERNELS[k].name}</option>
              ))}
            </optgroup>
          </select>
        </div>
      )}
      {algo.kind === 'ordered-bayer' && (
        <div className="row">
          <label>Matrix</label>
          <select value={algo.size}
            onChange={(e) => onChange({ ...mode, algorithm: { ...algo, size: Number(e.target.value) as 2 | 4 | 8 } })}>
            <option value={2}>2 × 2</option>
            <option value={4}>4 × 4</option>
            <option value={8}>8 × 8</option>
          </select>
        </div>
      )}
    </>
  );
}

function PaletteSwatchStrip({ paletteId }: { paletteId: string }) {
  const builtin = BUILTIN_PALETTES.find((p) => p.id === paletteId);
  const custom = builtin ? null : loadCustomPalettes().find((p) => p.id === paletteId);
  const def = builtin ?? custom;
  if (!def) return null;
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 2,
      margin: '2px 0 8px 0',
      borderRadius: 4,
      overflow: 'hidden',
      border: '1px solid var(--border)',
    }}>
      {def.colors.map((c, i) => (
        <div key={i} title={c}
          style={{ background: c, width: 16, height: 16, flex: '0 0 16px' }} />
      ))}
    </div>
  );
}

function PaletteImportRow({
  onImported,
  canDelete,
  onDelete,
}: {
  onImported: (id: string) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const url = URL.createObjectURL(file);
      const bitmap = await new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('image load failed'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d unavailable');
      ctx.drawImage(bitmap, 0, 0);
      const id = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      URL.revokeObjectURL(url);
      const colors = extractPalette(
        { width: id.width, height: id.height, data: id.data },
        { count, refineKMeans: true },
      );
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'palette';
      const promptName = window.prompt('Palette name?', `${baseName} (${colors.length})`);
      if (!promptName) return;
      const newId = `custom:${Date.now().toString(36)}`;
      addCustomPalette({
        id: newId,
        name: promptName,
        category: 'modern-designer',
        colors,
        notes: 'Imported from image',
      });
      onImported(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row">
        <label>Import N</label>
        <input type="number" min={2} max={64} value={count}
          onChange={(e) => setCount(Math.max(2, Math.min(64, Number(e.target.value) || 8)))}
          style={{ width: 56 }} />
        <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Extracting…' : 'Import from image…'}
        </button>
        {canDelete && (
          <button className="ghost" onClick={onDelete} title="delete this custom palette">
            Delete
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }} />
      {error && <div className="preset-no-results">Import failed: {error}</div>}
    </>
  );
}

function MultiInkControls({
  mode,
  onChange,
}: {
  mode: Extract<ModeKind, { kind: 'cmyk' } | { kind: 'spot' }>;
  onChange: (m: ModeKind) => void;
}) {
  return (
    <>
      <Slider label="Cell" value={mode.baseCellSize} min={2} max={30} step={0.5}
        onChange={(v) => onChange({ ...mode, baseCellSize: v })} />
      <div className="row">
        <label>LPI @ 300 dpi</label>
        <span className="val" style={{ flex: 1, textAlign: 'right' }}>
          {(300 / Math.max(1, mode.baseCellSize)).toFixed(0)}
        </span>
      </div>
      <Slider label="Bleed" value={mode.dot.gain} min={0} max={2} step={0.01}
        onChange={(v) => onChange({ ...mode, dot: { ...mode.dot, gain: v } })} />
      <Slider label="Max dot" value={mode.dot.maxRatio} min={0.1} max={1.5} step={0.01}
        onChange={(v) => onChange({ ...mode, dot: { ...mode.dot, maxRatio: v } })} />
      <div style={{ marginTop: 8 }}>
        {mode.kind === 'cmyk' &&
          mode.channels.map((ch, idx) => (
            <CmykRow key={ch.key} ch={ch}
              onChange={(next) => {
                const channels = mode.channels.slice();
                channels[idx] = next;
                onChange({ ...mode, channels });
              }} />
          ))}
        {mode.kind === 'spot' && (
          <>
            {mode.channels.map((ch, idx) => (
              <SpotRow key={idx} ch={ch} idx={idx}
                onChange={(next) => {
                  const channels = mode.channels.slice();
                  channels[idx] = next;
                  onChange({ ...mode, channels });
                }}
                onRemove={mode.channels.length > 1 ? () => {
                  const channels = mode.channels.slice();
                  channels.splice(idx, 1);
                  onChange({ ...mode, channels });
                } : undefined}
              />
            ))}
            <button className="ghost" style={{ marginTop: 4 }}
              onClick={() => onChange({
                ...mode,
                channels: [...mode.channels, {
                  name: `ink-${mode.channels.length + 1}`,
                  color: '#777777',
                  enabled: true,
                  angleDeg: 30,
                  scale: 1,
                }],
              })}>
              + Add ink
            </button>
          </>
        )}
      </div>
      <label className="checkbox-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={mode.registration}
          onChange={(e) => onChange({ ...mode, registration: e.target.checked })} />
        Registration marks
      </label>
      <WarpSubControls warp={mode.warp} onChange={(w) => onChange({ ...mode, warp: w })} />
    </>
  );
}

function CmykRow({ ch, onChange }: { ch: ChannelConfig; onChange: (c: ChannelConfig) => void }) {
  return (
    <div style={channelRowStyle}>
      <input type="checkbox" checked={ch.enabled}
        onChange={(e) => onChange({ ...ch, enabled: e.target.checked })} />
      <span style={{ color: 'var(--muted)' }}>{ch.key}</span>
      <input type="number" value={ch.angleDeg} min={-90} max={90} step={1}
        onChange={(e) => onChange({ ...ch, angleDeg: Number(e.target.value) })}
        style={{ width: 50 }} title="Angle" />
      <input type="color" value={ch.color}
        onChange={(e) => onChange({ ...ch, color: e.target.value })} />
    </div>
  );
}

function SpotRow({
  ch, idx, onChange, onRemove,
}: {
  ch: SpotChannel;
  idx: number;
  onChange: (c: SpotChannel) => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{ ...channelRowStyle, gridTemplateColumns: 'auto 1fr auto auto auto' }}>
      <input type="checkbox" checked={ch.enabled}
        onChange={(e) => onChange({ ...ch, enabled: e.target.checked })} />
      <input type="text" value={ch.name}
        onChange={(e) => onChange({ ...ch, name: e.target.value })}
        style={{ fontSize: 11, minWidth: 0 }} />
      <input type="number" value={ch.angleDeg} min={-90} max={90} step={1}
        onChange={(e) => onChange({ ...ch, angleDeg: Number(e.target.value) })}
        style={{ width: 50 }} title="Angle" />
      <input type="color" value={ch.color}
        onChange={(e) => onChange({ ...ch, color: e.target.value })} />
      <button onClick={onRemove} disabled={!onRemove}
        title="remove ink" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: onRemove ? 'pointer' : 'default' }}>×</button>
      <span style={{ display: 'none' }}>{idx}</span>
    </div>
  );
}

const channelRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto auto',
  gap: 6,
  alignItems: 'center',
  marginBottom: 4,
  fontSize: 11,
};

function WarpSubControls({
  warp,
  onChange,
}: {
  warp: WarpParams;
  onChange: (w: WarpParams) => void;
}) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Warp
      </summary>
      <Slider label="Wave amp" value={warp.waveAmp} min={0} max={40} step={0.5}
        onChange={(v) => onChange({ ...warp, waveAmp: v })} />
      <Slider label="Wave freq" value={warp.waveFreq} min={0.001} max={0.2} step={0.001}
        onChange={(v) => onChange({ ...warp, waveFreq: v })} />
      <Slider label="Wave phase" value={warp.wavePhase} min={0} max={6.28} step={0.05}
        onChange={(v) => onChange({ ...warp, wavePhase: v })} />
      <Slider label="Noise amp" value={warp.noiseAmp} min={0} max={40} step={0.5}
        onChange={(v) => onChange({ ...warp, noiseAmp: v })} />
      <Slider label="Noise freq" value={warp.noiseFreq} min={0.001} max={0.2} step={0.001}
        onChange={(v) => onChange({ ...warp, noiseFreq: v })} />
      <Slider label="Noise seed" value={warp.noiseSeed} min={1} max={999} step={1}
        onChange={(v) => onChange({ ...warp, noiseSeed: v })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={warp.resample}
          onChange={(e) => onChange({ ...warp, resample: e.target.checked })} />
        Resample image at warped position
      </label>
    </details>
  );
}

function DitherSubControls({
  d,
  onChange,
}: {
  d: DitherKind;
  onChange: (d: DitherKind) => void;
}) {
  const onTagChange = (tag: DitherTag) => {
    switch (tag) {
      case 'none': onChange({ kind: 'none' }); break;
      case 'threshold': onChange({ kind: 'threshold', t: 0.5 }); break;
      case 'bayer': onChange({ kind: 'bayer', size: 4 }); break;
      case 'floyd': onChange({ kind: 'floyd' }); break;
      case 'atkinson': onChange({ kind: 'atkinson' }); break;
    }
  };
  return (
    <>
      <div className="row">
        <label>Algorithm</label>
        <select value={d.kind} onChange={(e) => onTagChange(e.target.value as DitherTag)}>
          <option value="none">None (grayscale)</option>
          <option value="threshold">Threshold</option>
          <option value="bayer">Bayer ordered</option>
          <option value="floyd">Floyd-Steinberg</option>
          <option value="atkinson">Atkinson</option>
        </select>
      </div>
      {d.kind === 'threshold' && (
        <Slider label="Threshold" value={d.t} min={0} max={1} step={0.01}
          onChange={(v) => onChange({ kind: 'threshold', t: v })} />
      )}
      {d.kind === 'bayer' && (
        <div className="row">
          <label>Matrix</label>
          <select value={d.size} onChange={(e) =>
            onChange({ kind: 'bayer', size: Number(e.target.value) as 2 | 4 | 8 })}>
            <option value={2}>2 × 2</option>
            <option value={4}>4 × 4</option>
            <option value={8}>8 × 8</option>
          </select>
        </div>
      )}
    </>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function TextureSection({
  overlay,
  onChange,
  client,
}: {
  overlay: TextureOverlay | undefined;
  onChange: (o: TextureOverlay | undefined) => void;
  client: import('../worker/client').HalftoneClient;
}) {
  const [userTextures, setUserTextures] = useState(() =>
    typeof window !== 'undefined' ? listUserTextures() : [],
  );
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const refreshUser = () => setUserTextures(listUserTextures());

  const handleUpload = async (file: File) => {
    setUploadBusy(true);
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'texture';
      const name = window.prompt('Texture name?', baseName) || baseName;
      const meta = await addUserTexture(name, file);
      const blob = await getUserTextureBlob(meta.id);
      if (blob) {
        const bm = await createImageBitmap(blob);
        await client.setUserTexture(meta.id, bm);
      }
      refreshUser();
      onChange({ ...defaultTextureOverlay, textureId: meta.id, source: 'user' });
    } catch (e) {
      window.alert('Texture upload failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Delete this uploaded texture?')) return;
    await deleteUserTexture(id);
    await client.dropUserTexture(id);
    refreshUser();
    if (overlay && overlay.source === 'user' && overlay.textureId === id) {
      onChange({ ...defaultTextureOverlay });
    }
  };

  if (!overlay) {
    return (
      <>
        <button className="ghost" style={{ width: '100%' }}
          onClick={() => onChange({ ...defaultTextureOverlay })}>
          + Add texture overlay
        </button>
      </>
    );
  }
  const active = overlay.source === 'user'
    ? userTextures.find((t) => t.id === overlay.textureId)
    : BUNDLED_TEXTURES.find((t) => t.id === overlay.textureId);
  const set = (next: Partial<TextureOverlay>): void =>
    onChange({ ...overlay, ...next });
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {active ? active.name : 'unknown'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="ghost" disabled={uploadBusy} onClick={() => fileRef.current?.click()}>
            {uploadBusy ? 'Uploading…' : 'Upload…'}
          </button>
          <button className="ghost" onClick={() => onChange(undefined)} title="remove texture">
            Remove
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }} />
      {userTextures.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 2px' }}>
            Uploaded
          </div>
          <div className="texture-strip">
            {userTextures.map((t) => (
              <button key={t.id}
                className={`texture-chip${overlay.source === 'user' && t.id === overlay.textureId ? ' active' : ''}`}
                onClick={() => set({ textureId: t.id, source: 'user' })}
                onContextMenu={(e) => { e.preventDefault(); void handleDeleteUser(t.id); }}
                title={`${t.name} (right-click to delete)`}>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 2px' }}>
        Bundled
      </div>
      <div className="texture-strip">
        {BUNDLED_TEXTURES.map((t) => (
          <button key={t.id}
            className={`texture-chip${overlay.source === 'bundled' && t.id === overlay.textureId ? ' active' : ''}`}
            onClick={() => set({ textureId: t.id, source: 'bundled' })}
            title={t.name}>
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <label>Blend</label>
        <select value={overlay.blendMode}
          onChange={(e) => set({ blendMode: e.target.value as TextureBlendMode })}>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
          <option value="darken">Darken</option>
          <option value="lighten">Lighten</option>
          <option value="soft-light">Soft light</option>
          <option value="hard-light">Hard light</option>
          <option value="color-burn">Color burn</option>
          <option value="color-dodge">Color dodge</option>
        </select>
      </div>
      <Slider label="Opacity" value={overlay.opacity} min={0} max={1} step={0.01}
        onChange={(v) => set({ opacity: v })} />
      <Slider label="Scale" value={overlay.scale} min={0.25} max={4} step={0.05}
        onChange={(v) => set({ scale: v })} />
      <Slider label="Rotate" value={overlay.rotationDeg} min={-180} max={180} step={1}
        onChange={(v) => set({ rotationDeg: v })} />
      <Slider label="Contrast" value={overlay.contrast ?? 1} min={0.1} max={6} step={0.05}
        onChange={(v) => set({ contrast: v })} />
      <Slider label="Threshold" value={overlay.threshold ?? 0.5} min={0} max={1} step={0.01}
        onChange={(v) => set({ threshold: v })} />
      <Slider label="Off X" value={overlay.offsetX} min={-256} max={256} step={1}
        onChange={(v) => set({ offsetX: v })} />
      <Slider label="Off Y" value={overlay.offsetY} min={-256} max={256} step={1}
        onChange={(v) => set({ offsetY: v })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={overlay.invert}
          onChange={(e) => set({ invert: e.target.checked })} />
        Invert texture
      </label>
    </>
  );
}

function MaskSection({
  overlay,
  onChange,
  client,
}: {
  overlay: MaskOverlay | undefined;
  onChange: (o: MaskOverlay | undefined) => void;
  client: import('../worker/client').HalftoneClient;
}) {
  const [masks, setMasks] = useState(() => listUserMasks());
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => setMasks(listUserMasks());

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'mask';
      const name = window.prompt('Mask name?', baseName) || baseName;
      const meta = await addUserMask(name, file);
      const blob = await getUserMaskBlob(meta.id);
      if (blob) {
        const bm = await createImageBitmap(blob);
        await client.setUserMask(meta.id, bm);
      }
      refresh();
      onChange({ ...defaultMaskOverlay, maskId: meta.id });
    } catch (e) {
      window.alert('Mask upload failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this mask?')) return;
    await deleteUserMask(id);
    await client.dropUserMask(id);
    refresh();
    if (overlay && overlay.maskId === id) onChange(undefined);
  };

  if (!overlay) {
    return (
      <button className="ghost" style={{ width: '100%' }} disabled={busy}
        onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = '';
          }} />
        {busy ? 'Uploading…' : '+ Upload mask image'}
      </button>
    );
  }
  const set = (next: Partial<MaskOverlay>) => onChange({ ...overlay, ...next });
  const active = masks.find((m) => m.id === overlay.maskId);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {active ? active.name : 'unknown'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload…'}
          </button>
          <button className="ghost" onClick={() => onChange(undefined)} title="disable mask">
            Remove
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }} />
      {masks.length > 0 && (
        <div className="texture-strip">
          {masks.map((m) => (
            <button key={m.id}
              className={`texture-chip${m.id === overlay.maskId ? ' active' : ''}`}
              onClick={() => set({ maskId: m.id })}
              onContextMenu={(e) => { e.preventDefault(); void handleDelete(m.id); }}
              title={`${m.name} (right-click to delete)`}>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <Slider label="Threshold" value={overlay.threshold} min={0} max={1} step={0.01}
        onChange={(v) => set({ threshold: v })} />
      <Slider label="Feather" value={overlay.feather} min={0.001} max={0.5} step={0.005}
        onChange={(v) => set({ feather: v })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={overlay.invert}
          onChange={(e) => set({ invert: e.target.checked })} />
        Invert mask (halftone in dark regions)
      </label>
    </>
  );
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return (
    <div className="row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{value.toFixed(decimals)}</span>
    </div>
  );
}

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Pt } from '../engine/select/select';

export type SelectTool = 'wand' | 'lasso' | 'marquee' | null;

interface Props {
  hasSource: boolean;
  isRaster: boolean;
  sourceWidth: number;
  onSourceZoomChange?: (sourceZoom: number) => void;
  onUserZoom?: () => void;
  // Interactive selection (P5). Coordinates are in SOURCE pixel space.
  selectTool?: SelectTool;
  onWandPick?: (sx: number, sy: number) => void;
  onPolygonSelect?: (pts: Pt[]) => void;
  pendingOutline?: Pt[][] | null; // source-space loops → marching ants
  // Crisp vector preview (e.g. Vector trace). When set, shown over the raster
  // canvas so zooming stays sharp; null during (re)compute → raster shows.
  overlaySvgUrl?: string | null;
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const FIT = -1;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const WHEEL_STEP = 1.15;

export const CanvasPreview = forwardRef<HTMLCanvasElement, Props>(function CanvasPreview(
  {
    hasSource, isRaster, sourceWidth, onSourceZoomChange, onUserZoom,
    selectTool = null, onWandPick, onPolygonSelect, pendingOutline = null,
    overlaySvgUrl = null,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const innerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<View>({ zoom: FIT, panX: 0, panY: 0 });
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [canvasIntrinsic, setCanvasIntrinsic] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [displayZoom, setDisplayZoom] = useState(1);

  const setCanvasRef = useCallback(
    (c: HTMLCanvasElement | null) => {
      innerCanvasRef.current = c;
      if (typeof ref === 'function') ref(c);
      else if (ref) (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = c;
    },
    [ref],
  );

  // Observe viewport size for fit calculations.
  useLayoutEffect(() => {
    if (!viewportRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      const cr = e.contentRect;
      setViewportSize({ w: cr.width, h: cr.height });
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  // Poll canvas intrinsic dimensions (they change after worker renders).
  useEffect(() => {
    if (!hasSource) return;
    let raf = 0;
    const tick = () => {
      const c = innerCanvasRef.current;
      if (c && (c.width !== canvasIntrinsic.w || c.height !== canvasIntrinsic.h)) {
        setCanvasIntrinsic({ w: c.width, h: c.height });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasSource, canvasIntrinsic.w, canvasIntrinsic.h]);

  // Compute the effective zoom (resolves FIT -> actual multiplier) and recenter.
  useLayoutEffect(() => {
    if (!canvasIntrinsic.w || !viewportSize.w) return;
    let z = view.zoom;
    if (z === FIT) {
      z = Math.min(
        viewportSize.w / canvasIntrinsic.w,
        viewportSize.h / canvasIntrinsic.h,
      );
    }
    setDisplayZoom(z);
  }, [view.zoom, canvasIntrinsic, viewportSize]);

  // Handle two distinct cases:
  // (a) source changed (new upload) → reset zoom + pan to fit
  // (b) preview resolution swapped under us → keep visual size stable by
  //     rescaling displayZoom inversely to the intrinsic change
  const lastSrcWidth = useRef(0);
  const lastIntrinsic = useRef(0);
  useEffect(() => {
    if (!canvasIntrinsic.w) return;
    if (lastSrcWidth.current !== sourceWidth) {
      lastSrcWidth.current = sourceWidth;
      lastIntrinsic.current = canvasIntrinsic.w;
      setView({ zoom: FIT, panX: 0, panY: 0 });
      return;
    }
    if (lastIntrinsic.current !== canvasIntrinsic.w) {
      const ratio = lastIntrinsic.current / canvasIntrinsic.w;
      lastIntrinsic.current = canvasIntrinsic.w;
      setView((v) => {
        if (v.zoom === FIT) return v;
        return { ...v, zoom: v.zoom * ratio };
      });
    }
  }, [canvasIntrinsic.w, sourceWidth]);

  const previewScale = sourceWidth > 0 && canvasIntrinsic.w > 0
    ? canvasIntrinsic.w / sourceWidth
    : 1;

  const notifyUser = useCallback(() => { onUserZoom?.(); }, [onUserZoom]);

  const fit = useCallback(() => { setView({ zoom: FIT, panX: 0, panY: 0 }); notifyUser(); }, [notifyUser]);
  const actual = useCallback(() => {
    setView({ zoom: 1 / Math.max(0.0001, previewScale), panX: 0, panY: 0 });
    notifyUser();
  }, [previewScale, notifyUser]);

  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    notifyUser();
    setView((v) => {
      const z0 = v.zoom === FIT ? displayZoom : v.zoom;
      const z1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z0 * factor));
      if (!anchor || !viewportRef.current) {
        return { zoom: z1, panX: v.panX * (z1 / z0), panY: v.panY * (z1 / z0) };
      }
      // Adjust pan so the point under the anchor stays fixed.
      const vr = viewportRef.current.getBoundingClientRect();
      const ax = anchor.x - vr.left - vr.width / 2;
      const ay = anchor.y - vr.top - vr.height / 2;
      const r = z1 / z0;
      return {
        zoom: z1,
        panX: v.panX * r + ax * (1 - r),
        panY: v.panY * r + ay * (1 - r),
      };
    });
  }, [displayZoom, notifyUser]);

  // Wheel zoom (Ctrl/Cmd or plain wheel — most apps use plain wheel for canvas viewers).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!hasSource) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      zoomBy(factor, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [hasSource, zoomBy]);

  // Click-drag pan.
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    if (!hasSource) return;
    if (selectTool) return; // selection overlay owns the pointer
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setView((v) => ({ ...v, panX: start.panX + dx, panY: start.panY + dy }));
      onUserZoom?.();
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '0') { e.preventDefault(); fit(); }
      else if (e.key === '1') { e.preventDefault(); actual(); }
      else if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomBy(WHEEL_STEP); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / WHEEL_STEP); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fit, actual, zoomBy]);

  const dragging = !!dragRef.current;
  const showAtSourceSize = canvasIntrinsic.w > 0 && canvasIntrinsic.h > 0;
  const cssW = showAtSourceSize ? canvasIntrinsic.w * displayZoom : 0;
  const cssH = showAtSourceSize ? canvasIntrinsic.h * displayZoom : 0;
  const sourceZoom = displayZoom * previewScale;
  const zoomPct = Math.round(sourceZoom * 100);

  useEffect(() => {
    if (onSourceZoomChange && sourceZoom > 0) onSourceZoomChange(sourceZoom);
  }, [sourceZoom, onSourceZoomChange]);
  // Vector marks look better with browser smoothing when upscaling.
  // Raster dither / threshold should stay pixel-crisp so users can inspect bitmaps.
  const imageRendering: 'auto' | 'pixelated' =
    isRaster && displayZoom >= 1 ? 'pixelated' : 'auto';

  // ── Interactive selection overlay ──────────────────────────────────────
  // Map an overlay-canvas client point to SOURCE pixel coordinates.
  const clientToSource = useCallback((clientX: number, clientY: number): Pt | null => {
    const c = overlayRef.current;
    if (!c || !previewScale) return null;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ox = ((clientX - r.left) / r.width) * c.width;   // overlay intrinsic px
    const oy = ((clientY - r.top) / r.height) * c.height;
    return { x: ox / previewScale, y: oy / previewScale };
  }, [previewScale]);

  // In-progress gesture, in SOURCE coords. Kept in a ref to avoid re-renders
  // on every pointermove; the RAF loop reads it for live drawing.
  const gestureRef = useRef<{ type: 'lasso' | 'marquee'; pts: Pt[] } | null>(null);

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    if (!selectTool || !hasSource) return;
    e.stopPropagation();
    e.preventDefault();
    const p = clientToSource(e.clientX, e.clientY);
    if (!p) return;
    try { overlayRef.current?.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
    if (selectTool === 'wand') { onWandPick?.(p.x, p.y); return; }
    gestureRef.current = { type: selectTool, pts: [p] };
  };
  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = clientToSource(e.clientX, e.clientY);
    if (!p) return;
    if (g.type === 'marquee') g.pts[1] = p;
    else {
      const last = g.pts[g.pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.5 / Math.max(0.1, sourceZoom)) g.pts.push(p);
    }
  };
  const onOverlayPointerUp = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    try { overlayRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* not captured */ }
    if (!g) return;
    if (g.type === 'marquee' && g.pts.length === 2) {
      const [a, b] = g.pts;
      onPolygonSelect?.([{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]);
    } else if (g.type === 'lasso' && g.pts.length >= 3) {
      onPolygonSelect?.(g.pts);
    }
  };

  // Marching-ants + live-gesture drawing on the overlay, animated via RAF.
  useEffect(() => {
    const c = overlayRef.current;
    if (!c || !canvasIntrinsic.w) return;
    if (c.width !== canvasIntrinsic.w) c.width = canvasIntrinsic.w;
    if (c.height !== canvasIntrinsic.h) c.height = canvasIntrinsic.h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const active = !!selectTool || (pendingOutline?.length ?? 0) > 0;
    if (!active) { ctx.clearRect(0, 0, c.width, c.height); return; }
    let raf = 0;
    const s = previewScale; // source → overlay-px
    const draw = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      const lw = Math.max(1, 1.5 / displayZoom);
      // committed selection → animated dashed ants
      if (pendingOutline) {
        for (const loop of pendingOutline) {
          if (loop.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(loop[0].x * s, loop[0].y * s);
          for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x * s, loop[i].y * s);
          ctx.closePath();
          ctx.lineWidth = lw;
          ctx.setLineDash([6 / displayZoom, 4 / displayZoom]);
          ctx.lineDashOffset = -(t / 50) % 10;
          ctx.strokeStyle = '#000'; ctx.stroke();
          ctx.lineDashOffset = (-(t / 50) % 10) + 5 / displayZoom;
          ctx.strokeStyle = '#fff'; ctx.stroke();
        }
      }
      // live gesture → solid accent path
      const g = gestureRef.current;
      if (g) {
        ctx.setLineDash([]);
        ctx.lineWidth = lw;
        ctx.strokeStyle = '#e9663f';
        ctx.fillStyle = 'rgba(233,102,63,0.15)';
        ctx.beginPath();
        if (g.type === 'marquee' && g.pts.length === 2) {
          const [a, b] = g.pts;
          ctx.rect(a.x * s, a.y * s, (b.x - a.x) * s, (b.y - a.y) * s);
        } else {
          ctx.moveTo(g.pts[0].x * s, g.pts[0].y * s);
          for (let i = 1; i < g.pts.length; i++) ctx.lineTo(g.pts[i].x * s, g.pts[i].y * s);
        }
        ctx.fill(); ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [selectTool, pendingOutline, canvasIntrinsic.w, canvasIntrinsic.h, previewScale, displayZoom, sourceZoom]);

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      style={{ cursor: hasSource ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      onMouseDown={onMouseDown}
    >
      <div
        className="canvas-stack"
        style={{
          display: hasSource ? 'block' : 'none',
          position: 'relative',
          width: `${cssW}px`,
          height: `${cssH}px`,
          transform: `translate(${view.panX}px, ${view.panY}px)`,
          transition: dragging ? 'none' : 'transform 80ms linear',
        }}
      >
        <canvas
          ref={setCanvasRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            imageRendering,
          }}
        />
        {overlaySvgUrl && (
          <img
            src={overlaySvgUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}
        <canvas
          ref={overlayRef}
          className="select-overlay"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: selectTool ? 'auto' : 'none',
            cursor: selectTool === 'wand' ? 'crosshair' : selectTool ? 'crosshair' : 'default',
          }}
          onPointerDown={onOverlayPointerDown}
          onPointerMove={onOverlayPointerMove}
          onPointerUp={onOverlayPointerUp}
        />
      </div>
      {!hasSource && <div className="placeholder">Upload an image to begin.</div>}
      {hasSource && (
        <div className="zoom-controls" onMouseDown={(e) => e.stopPropagation()}>
          <button className="zoom-btn" onClick={() => zoomBy(1 / WHEEL_STEP)} title="Zoom out (-)"></button>
          <span className="zoom-readout" title="Zoom level">{zoomPct}%</span>
          <button className="zoom-btn" onClick={() => zoomBy(WHEEL_STEP)} title="Zoom in (+)">+</button>
          <button className="zoom-btn wide" onClick={fit} title="Fit to viewport (0)">Fit</button>
          <button className="zoom-btn wide" onClick={actual} title="Actual pixels (1)">1:1</button>
        </div>
      )}
    </div>
  );
});

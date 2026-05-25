import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  hasSource: boolean;
  isRaster: boolean;
  sourceWidth: number;
  onSourceZoomChange?: (sourceZoom: number) => void;
  onUserZoom?: () => void;
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
  { hasSource, isRaster, sourceWidth, onSourceZoomChange, onUserZoom },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const innerCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      style={{ cursor: hasSource ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      onMouseDown={onMouseDown}
    >
      <canvas
        ref={setCanvasRef}
        style={{
          display: hasSource ? 'block' : 'none',
          width: `${cssW}px`,
          height: `${cssH}px`,
          transform: `translate(${view.panX}px, ${view.panY}px)`,
          imageRendering,
          transition: dragging ? 'none' : 'transform 80ms linear',
        }}
      />
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

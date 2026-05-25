import type { PipelineParams } from '../engine/pipeline';
import type { SvgOptions } from '../engine/export/svg';
import type { RgbaImage } from '../engine/image/types';
import type { Request, Response } from './protocol';

export interface JobEvent {
  id: number;
  state: 'started' | 'finished' | 'dropped';
  durationMs?: number;
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  kind: Request['kind'];
};

export class HalftoneClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private latestProcessId = 0;
  private listeners = new Set<(e: JobEvent) => void>();

  constructor() {
    this.worker = new Worker(
      new URL('./halftone.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (e: MessageEvent<Response>) => this.handle(e.data);
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'worker error'));
      this.pending.clear();
    };
  }

  onJob(cb: (e: JobEvent) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emit(e: JobEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  private handle(msg: Response): void {
    if (msg.kind === 'started') {
      this.emit({ id: msg.id, state: 'started' });
      return;
    }
    // Emit the terminal job event up front, independent of whether a pending
    // promise still exists. Otherwise a missing pending entry would swallow
    // the 'finished'/'dropped' event after 'started' was already counted,
    // leaving the busy spinner stuck on forever.
    if (msg.kind === 'processed') {
      this.emit({ id: msg.id, state: 'finished', durationMs: msg.durationMs });
    } else if (msg.kind === 'dropped') {
      this.emit({ id: msg.id, state: 'dropped' });
    } else if (msg.kind === 'error') {
      this.emit({ id: msg.id, state: 'finished' });
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.kind === 'error') {
      p.reject(new Error(msg.message));
      return;
    }
    if (msg.kind === 'dropped') {
      p.resolve(null);
      return;
    }
    if (msg.kind === 'processed') {
      p.resolve({ width: msg.width, height: msg.height });
      return;
    }
    if (msg.kind === 'thumb') {
      const data = new Uint8ClampedArray(msg.buffer);
      p.resolve({ width: msg.width, height: msg.height, data });
      return;
    }
    if (msg.kind === 'attach-canvas-ok') {
      p.resolve(undefined);
      return;
    }
    if (msg.kind === 'svg') {
      this.emit({ id: msg.id, state: 'finished', durationMs: msg.durationMs });
      p.resolve(msg.xml);
      return;
    }
    if (msg.kind === 'png' || msg.kind === 'zip') {
      this.emit({ id: msg.id, state: 'finished', durationMs: msg.durationMs });
      p.resolve(msg.blob);
      return;
    }
    if (msg.kind === 'set-source-ok') {
      p.resolve({ previewWidth: msg.previewWidth, previewHeight: msg.previewHeight });
      return;
    }
    if (msg.kind === 'cache-stats') {
      p.resolve({ layers: msg.layers, size: msg.size });
      return;
    }
    if (msg.kind === 'user-texture-ok' || msg.kind === 'user-mask-ok') {
      p.resolve(undefined);
      return;
    }
  }

  setSource(rgba: RgbaImage): Promise<{ previewWidth: number; previewHeight: number }> {
    const id = this.nextId++;
    const buffer = rgba.data.buffer.slice(0);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'set-source' });
      this.worker.postMessage(
        { id, kind: 'set-source', width: rgba.width, height: rgba.height, buffer },
        [buffer],
      );
    });
  }

  attachCanvas(canvas: HTMLCanvasElement): Promise<void> {
    const off = canvas.transferControlToOffscreen();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'attach-canvas' });
      this.worker.postMessage({ id, kind: 'attach-canvas', canvas: off }, [off]);
    });
  }

  renderThumb(params: PipelineParams): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'render-thumb' });
      this.worker.postMessage({ id, kind: 'render-thumb', params, size: 96 });
    });
  }

  process(params: PipelineParams, previewMaxSide?: number): Promise<{ width: number; height: number } | null> {
    const id = this.nextId++;
    this.latestProcessId = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'process' });
      this.worker.postMessage({ id, kind: 'process', params, previewMaxSide });
    });
  }

  serializeSvg(params: PipelineParams, opts: SvgOptions): Promise<string> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'serialize-svg' });
      this.worker.postMessage({ id, kind: 'serialize-svg', params, opts });
    });
  }

  renderPng(params: PipelineParams): Promise<Blob> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'render-png' });
      this.worker.postMessage({ id, kind: 'render-png', params });
    });
  }

  exportZip(params: PipelineParams, opts: SvgOptions, baseName: string): Promise<Blob> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'export-zip' });
      this.worker.postMessage({ id, kind: 'export-zip', params, opts, baseName });
    });
  }

  setUserTexture(textureId: string, bitmap: ImageBitmap): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'set-user-texture' });
      this.worker.postMessage({ id, kind: 'set-user-texture', textureId, bitmap }, [bitmap]);
    });
  }

  dropUserTexture(textureId: string): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'drop-user-texture' });
      this.worker.postMessage({ id, kind: 'drop-user-texture', textureId });
    });
  }

  setUserMask(maskId: string, bitmap: ImageBitmap): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'set-user-mask' });
      this.worker.postMessage({ id, kind: 'set-user-mask', maskId, bitmap }, [bitmap]);
    });
  }

  dropUserMask(maskId: string): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'drop-user-mask' });
      this.worker.postMessage({ id, kind: 'drop-user-mask', maskId });
    });
  }

  cacheStats(): Promise<{ layers: string[]; size: number }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, kind: 'cache-stats' });
      this.worker.postMessage({ id, kind: 'cache-stats' });
    });
  }

  get latestId(): number {
    return this.latestProcessId;
  }

  terminate(): void {
    this.worker.terminate();
  }
}

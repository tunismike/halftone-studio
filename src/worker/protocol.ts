import type { PipelineParams } from '../engine/pipeline';
import type { SvgOptions } from '../engine/export/svg';

export type Request =
  | { id: number; kind: 'set-source'; width: number; height: number; buffer: ArrayBuffer }
  | { id: number; kind: 'attach-canvas'; canvas: OffscreenCanvas }
  | { id: number; kind: 'process'; params: PipelineParams; previewMaxSide?: number }
  | { id: number; kind: 'render-thumb'; params: PipelineParams; size: number }
  | { id: number; kind: 'serialize-svg'; params: PipelineParams; opts: SvgOptions }
  | { id: number; kind: 'render-png'; params: PipelineParams }
  | { id: number; kind: 'export-zip'; params: PipelineParams; opts: SvgOptions; baseName: string }
  | { id: number; kind: 'set-user-texture'; textureId: string; bitmap: ImageBitmap }
  | { id: number; kind: 'drop-user-texture'; textureId: string }
  | { id: number; kind: 'set-user-mask'; maskId: string; bitmap: ImageBitmap }
  | { id: number; kind: 'drop-user-mask'; maskId: string }
  | { id: number; kind: 'cache-stats' };

export type Response =
  | { id: number; kind: 'set-source-ok'; previewWidth: number; previewHeight: number }
  | { id: number; kind: 'attach-canvas-ok' }
  | { id: number; kind: 'started' }
  | { id: number; kind: 'processed'; width: number; height: number; durationMs: number }
  | { id: number; kind: 'thumb'; width: number; height: number; buffer: ArrayBuffer; durationMs: number }
  | { id: number; kind: 'dropped' }
  | { id: number; kind: 'svg'; xml: string; durationMs: number }
  | { id: number; kind: 'png'; blob: Blob; durationMs: number }
  | { id: number; kind: 'zip'; blob: Blob; durationMs: number }
  | { id: number; kind: 'user-texture-ok' }
  | { id: number; kind: 'user-mask-ok' }
  | { id: number; kind: 'cache-stats'; layers: string[]; size: number }
  | { id: number; kind: 'error'; message: string };

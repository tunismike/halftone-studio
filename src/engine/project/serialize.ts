// Portable project file (.json): params + composition + the source image and
// any referenced selection masks embedded as PNG data URLs, so a project moves
// between machines/browsers as a single self-contained file.

import type { PipelineParams } from '../pipeline';
import type { RgbaImage } from '../image/types';
import { rgbaToPngBlob, decodeBlobToRgba, blobToDataUrl, dataUrlToBlob } from '../image/codec';

const FILE_VERSION = 1;

export interface ProjectFile {
  app: 'halftone-studio';
  version: number;
  filename: string;
  params: PipelineParams;
  sourcePng: string;                 // data URL
  selections: Record<string, string>; // selectionId → data URL
}

export async function serializeProject(
  filename: string,
  params: PipelineParams,
  source: RgbaImage,
  selectionBlobs: Map<string, Blob>,
): Promise<string> {
  const sourcePng = await blobToDataUrl(await rgbaToPngBlob(source));
  const selections: Record<string, string> = {};
  for (const [id, blob] of selectionBlobs) selections[id] = await blobToDataUrl(blob);
  const file: ProjectFile = {
    app: 'halftone-studio', version: FILE_VERSION, filename, params, sourcePng, selections,
  };
  return JSON.stringify(file);
}

export interface LoadedProject {
  filename: string;
  params: PipelineParams;
  source: RgbaImage;
  selections: { id: string; blob: Blob }[];
}

// Parse + decode a .json project. Throws on a malformed/foreign file; callers
// wrap in try/catch and surface a friendly message.
export async function deserializeProject(jsonText: string): Promise<LoadedProject> {
  const raw = JSON.parse(jsonText) as Partial<ProjectFile>;
  if (raw.app !== 'halftone-studio' || !raw.params || !raw.sourcePng) {
    throw new Error('Not a Halftone Studio project file.');
  }
  const source = await decodeBlobToRgba(await dataUrlToBlob(raw.sourcePng));
  const selections: { id: string; blob: Blob }[] = [];
  for (const [id, uri] of Object.entries(raw.selections ?? {})) {
    selections.push({ id, blob: await dataUrlToBlob(uri) });
  }
  return { filename: raw.filename ?? 'project.png', params: raw.params as PipelineParams, source, selections };
}

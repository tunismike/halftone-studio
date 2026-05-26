// Local-first project persistence. The autosaved project lives in IndexedDB:
// the source image as a PNG blob (compact) plus a small JSON state record
// (params + composition + filename + referenced selection ids). One slot —
// the app autosaves the current document and restores it on next load.

import type { PipelineParams } from '../pipeline';

const DB_NAME = 'halftone-projects';
const STORE = 'current';
const DB_VERSION = 1;
const KEY_STATE = 'state';
const KEY_SOURCE = 'source';

export interface ProjectState {
  version: 1;
  filename: string;
  params: PipelineParams;        // includes composition when layered
  selectionIds: string[];        // selection masks the composition references
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function put(key: string, value: unknown): Promise<void> {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function get<T>(key: string): Promise<T | null> {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  }));
}

export function saveProjectState(state: ProjectState): Promise<void> {
  return put(KEY_STATE, state);
}

export function loadProjectState(): Promise<ProjectState | null> {
  return get<ProjectState>(KEY_STATE);
}

export function saveProjectSource(blob: Blob): Promise<void> {
  return put(KEY_SOURCE, blob);
}

export function loadProjectSource(): Promise<Blob | null> {
  return get<Blob>(KEY_SOURCE);
}

export async function clearProject(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

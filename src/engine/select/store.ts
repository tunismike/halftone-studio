// Persistent storage for interactive-selection masks. Interactive selections
// register worker-only bitmaps (setUserMask) keyed by a `sel-…` id; without
// persistence they vanish on reload, breaking any composition layer whose
// region is that selection. We store the mask PNG blobs in IndexedDB and the
// id list in localStorage, then re-hydrate them into the worker on boot.

const DB_NAME = 'halftone-selections';
const STORE = 'selections';
const DB_VERSION = 1;
const META_KEY = 'halftone-app:selection-ids';

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

export function listSelectionIds(): string[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(ids)); } catch { /* quota */ }
}

export async function putSelection(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const ids = listSelectionIds();
  if (!ids.includes(id)) writeIds([...ids, id]);
}

export async function getSelection(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

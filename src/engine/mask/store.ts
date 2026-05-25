// Persistent storage for user-uploaded mask images. Identical pattern to
// texture user-store but a separate IDB store + metadata key.

const DB_NAME = 'halftone-masks';
const STORE_NAME = 'masks';
const DB_VERSION = 1;
const META_KEY = 'halftone-app:user-masks';

export interface MaskMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  addedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function listUserMasks(): MaskMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is MaskMeta =>
      !!p && typeof p.id === 'string' && typeof p.name === 'string',
    );
  } catch {
    return [];
  }
}

function writeMeta(list: MaskMeta[]): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export async function getUserMaskBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function addUserMask(name: string, file: Blob): Promise<MaskMeta> {
  const bitmap = await createImageBitmap(file);
  const meta: MaskMeta = {
    id: `mask:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    width: bitmap.width,
    height: bitmap.height,
    addedAt: Date.now(),
  };
  bitmap.close?.();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, meta.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  writeMeta([...listUserMasks(), meta]);
  return meta;
}

export async function deleteUserMask(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  writeMeta(listUserMasks().filter((m) => m.id !== id));
}

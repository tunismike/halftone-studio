// Persistent storage for user-uploaded textures. Metadata in localStorage,
// raw blobs in IndexedDB so textures survive page reloads without bloating
// the synchronous storage quota.

const DB_NAME = 'halftone-textures';
const STORE_NAME = 'textures';
const DB_VERSION = 1;
const META_KEY = 'halftone-app:user-textures';

export interface UserTextureMeta {
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

export function listUserTextures(): UserTextureMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is UserTextureMeta =>
      !!p && typeof p.id === 'string' && typeof p.name === 'string',
    );
  } catch {
    return [];
  }
}

function writeMeta(list: UserTextureMeta[]): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list));
  } catch {
    // ignore quota
  }
}

export async function getUserTextureBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function addUserTexture(name: string, file: Blob): Promise<UserTextureMeta> {
  const bitmap = await createImageBitmap(file);
  const meta: UserTextureMeta = {
    id: `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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
  writeMeta([...listUserTextures(), meta]);
  return meta;
}

export async function deleteUserTexture(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  writeMeta(listUserTextures().filter((m) => m.id !== id));
}

import type { PaletteDef } from './palettes-builtin';

const STORAGE_KEY = 'halftone-app:custom-palettes';

let cache: PaletteDef[] | null = null;
const listeners = new Set<() => void>();

export function loadCustomPalettes(): PaletteDef[] {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) { cache = []; return cache; }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cache = parsed.filter((p): p is PaletteDef =>
        !!p && typeof p.id === 'string' && Array.isArray(p.colors),
      );
      return cache;
    }
  } catch {
    // ignore
  }
  cache = [];
  return cache;
}

export function saveCustomPalettes(palettes: PaletteDef[]): void {
  cache = palettes;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(palettes));
    }
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

export function addCustomPalette(p: PaletteDef): void {
  const list = loadCustomPalettes();
  saveCustomPalettes([...list, p]);
}

export function deleteCustomPalette(id: string): void {
  const list = loadCustomPalettes();
  saveCustomPalettes(list.filter((p) => p.id !== id));
}

export function findCustomPalette(id: string): PaletteDef | undefined {
  return loadCustomPalettes().find((p) => p.id === id);
}

export function subscribeCustomPalettes(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

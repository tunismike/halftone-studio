interface Slot {
  key: string;
  value: unknown;
}

export class Cache {
  private slots = new Map<string, Slot>();

  get<V>(layerId: string, key: string, compute: () => V): V {
    const cur = this.slots.get(layerId);
    if (cur && cur.key === key) return cur.value as V;
    const value = compute();
    this.slots.set(layerId, { key, value });
    return value;
  }

  invalidate(layerId: string): void {
    this.slots.delete(layerId);
  }

  invalidatePrefix(prefix: string): void {
    for (const k of [...this.slots.keys()]) {
      if (k.startsWith(prefix)) this.slots.delete(k);
    }
  }

  clear(): void {
    this.slots.clear();
  }

  stats(): { layers: string[]; size: number } {
    return { layers: [...this.slots.keys()], size: this.slots.size };
  }
}

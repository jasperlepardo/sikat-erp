/**
 * A tiny fake "API" over seed data. Every call is async with a small delay so
 * screens handle loading states like they would against a real backend, and
 * writes persist to localStorage. Swap a collection for `fetch` calls later
 * without touching the UI.
 */
const LATENCY_MS = 250;

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

export function createCollection<T extends { id: string }>(storageKey: string, seed: T[], idPrefix: string) {
  let records: T[] = load();

  function load(): T[] {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as T[];
    } catch {
      /* storage unavailable or corrupt — fall back to seed */
    }
    return structuredClone(seed);
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(records));
    } catch {
      /* storage unavailable — changes live for this page load only */
    }
  }

  return {
    async list(): Promise<T[]> {
      await wait();
      return structuredClone(records);
    },

    async get(id: string): Promise<T | undefined> {
      await wait();
      const record = records.find((r) => r.id === id);
      return record && structuredClone(record);
    },

    async save(input: Omit<T, 'id'> & { id?: string }): Promise<T> {
      await wait();
      const record = { ...input, id: input.id ?? `${idPrefix}-${crypto.randomUUID().slice(0, 8)}` } as T;
      const index = records.findIndex((r) => r.id === record.id);
      records = index === -1 ? [...records, record] : records.map((r) => (r.id === record.id ? record : r));
      persist();
      return structuredClone(record);
    },

    /** Restore the seed data (handy while demoing). */
    async reset(): Promise<void> {
      records = structuredClone(seed);
      persist();
    },
  };
}

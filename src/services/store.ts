import { filterRows, type ListQuery } from './listQuery';

/**
 * A tiny fake "API" over seed data. Every call is async with a small delay so
 * screens handle loading states like they would against a real backend, and
 * writes persist to localStorage. Swap a collection for `fetch` calls later
 * without touching the UI.
 */
const LATENCY_MS = 250;

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

/**
 * Bump whenever a file in `src/mocks` changes. Saved collections otherwise
 * shadow the seed forever, so a browser holding an older version drops every
 * `sikat-erp:` key on load and starts again from the current seed.
 */
const SEED_VERSION = 21;
const VERSION_KEY = 'sikat-erp:seed-version';

// Runs once at module load — before any collection below reads storage.
try {
  if (localStorage.getItem(VERSION_KEY) !== String(SEED_VERSION)) {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('sikat-erp:'))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(VERSION_KEY, String(SEED_VERSION));
  }
} catch {
  /* storage unavailable — collections fall back to seed anyway */
}

export function createCollection<T extends { id: string }>(storageKey: string, seed: T[], idPrefix: string) {
  let records: T[] = load();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());

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
    /** All records, or those matching `query.filter` (AIP-160 text). Throws `InvalidFilterError` on bad text. */
    async list(query?: ListQuery<T>): Promise<T[]> {
      await wait();
      return structuredClone(filterRows(records, query?.filter, query?.fields));
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
      changed();
      return structuredClone(record);
    },

    /** Delete a record (for records nothing refers to yet, such as unposted drafts). */
    async remove(id: string): Promise<void> {
      await wait();
      records = records.filter((r) => r.id !== id);
      persist();
      changed();
    },

    /** The records as they are now, without the fake latency — for sync lookups such as a payment term's days. */
    snapshot(): readonly T[] {
      return records;
    },

    /** Call `fn` after every write, so open pickers pick up a record added elsewhere. Returns the unsubscribe. */
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Restore the seed data (handy while demoing). */
    async reset(): Promise<void> {
      records = structuredClone(seed);
      persist();
      changed();
    },
  };
}

export type Collection<T extends { id: string }> = ReturnType<typeof createCollection<T>>;

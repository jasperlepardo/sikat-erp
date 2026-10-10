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
const SEED_VERSION = 43;
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

/**
 * What a collection keeps in storage: only the records saved since the seed (changed or new) and
 * the ids removed — not the whole list. Seeds can be large (a year of documents) while storage
 * holds a few megabytes.
 */
interface StoredChanges<T> {
  saved: T[];
  removed: string[];
}

/**
 * A collection over a seed. The seed may be a function: it's built on first use, not when the
 * module loads — seeds built from other collections' seeds (the replayed history) need that, or
 * modules that import each other would read one another before they're ready.
 */
export function createCollection<T extends { id: string }>(storageKey: string, seedOrBuild: T[] | (() => T[]), idPrefix: string) {
  /** Ids saved or removed since the seed: what `persist` writes. */
  const dirty = new Set<string>();
  let built: T[] | undefined;
  const seed = () => (built ??= typeof seedOrBuild === 'function' ? seedOrBuild() : seedOrBuild);
  let loaded: T[] | undefined;
  /** The records, loaded on first use. */
  const current = () => (loaded ??= load());
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());

  function load(): T[] {
    const base = structuredClone(seed());
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return base;
      const stored = JSON.parse(raw) as StoredChanges<T>;
      const removed = new Set(stored.removed);
      const saved = new Map(stored.saved.map((r) => [r.id, r]));
      for (const id of [...removed, ...saved.keys()]) dirty.add(id);
      // Seed order, with saved versions in place; records added since go at the end, in the order saved.
      const merged = base.filter((r) => !removed.has(r.id)).map((r) => saved.get(r.id) ?? r);
      const seeded = new Set(base.map((r) => r.id));
      return [...merged, ...stored.saved.filter((r) => !seeded.has(r.id))];
    } catch {
      /* storage unavailable or corrupt — fall back to seed */
      return base;
    }
  }

  function persist() {
    const records = current();
    const byId = new Map(records.map((r) => [r.id, r]));
    const stored: StoredChanges<T> = {
      saved: records.filter((r) => dirty.has(r.id)),
      removed: [...dirty].filter((id) => !byId.has(id)),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      /* storage unavailable — changes live for this page load only */
    }
  }

  return {
    /** All records, or those matching `query.filter` (AIP-160 text). Throws `InvalidFilterError` on bad text. */
    async list(query?: ListQuery<T>): Promise<T[]> {
      await wait();
      return structuredClone(filterRows(current(), query?.filter, query?.fields));
    },

    async get(id: string): Promise<T | undefined> {
      await wait();
      const record = current().find((r) => r.id === id);
      return record && structuredClone(record);
    },

    async save(input: Omit<T, 'id'> & { id?: string }): Promise<T> {
      await wait();
      const record = { ...input, id: input.id ?? `${idPrefix}-${crypto.randomUUID().slice(0, 8)}` } as T;
      const records = current();
      const index = records.findIndex((r) => r.id === record.id);
      loaded = index === -1 ? [...records, record] : records.map((r) => (r.id === record.id ? record : r));
      dirty.add(record.id);
      persist();
      changed();
      return structuredClone(record);
    },

    /** Delete a record (for records nothing refers to yet, such as unposted drafts). */
    async remove(id: string): Promise<void> {
      await wait();
      loaded = current().filter((r) => r.id !== id);
      dirty.add(id);
      persist();
      changed();
    },

    /** The records as they are now, without the fake latency — for sync lookups such as a payment term's days. */
    snapshot(): readonly T[] {
      return current();
    },

    /** Call `fn` after every write, so open pickers pick up a record added elsewhere. Returns the unsubscribe. */
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Restore the seed data (handy while demoing). */
    async reset(): Promise<void> {
      loaded = structuredClone(seed());
      dirty.clear();
      persist();
      changed();
    },
  };
}

export type Collection<T extends { id: string }> = ReturnType<typeof createCollection<T>>;

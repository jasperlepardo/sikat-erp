import { CURRENT_USER } from '../mocks/common';
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
const SEED_VERSION = 111;
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

/** Bumped by every write to any collection: the key for values derived from several of them. */
let storeVersion = 0;

/**
 * `build`, run once and shared until any collection changes — for values derived from many
 * collections at once, such as the document link graph. A failed build isn't kept.
 */
export function cachedUntilChange<T>(build: () => Promise<T>): () => Promise<T> {
  let at = -1;
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached || at !== storeVersion) {
      at = storeVersion;
      const pending = build();
      cached = pending;
      pending.catch(() => {
        if (cached === pending) cached = undefined;
      });
    }
    return cached;
  };
}

export interface CollectionOptions {
  /** Record kind ('PO', 'ITEM', 'BP'…): log each save and removal in `auditLog` under it. */
  audit?: string;
  /**
   * False for a collection no `cachedUntilChange` value is built from (the audit log): its writes
   * then leave those caches alone, rather than every audited save rebuilding the document graphs.
   */
  invalidatesCaches?: boolean;
}

/**
 * A collection over a seed. The seed may be a function: it's built on first use, not when the
 * module loads — seeds built from other collections' seeds (the replayed history) need that, or
 * modules that import each other would read one another before they're ready.
 */
export function createCollection<T extends { id: string }>(
  storageKey: string,
  seedOrBuild: T[] | (() => T[]),
  idPrefix: string,
  options: CollectionOptions = {},
) {
  /** Ids saved or removed since the seed: what `persist` writes. */
  const dirty = new Set<string>();
  let built: T[] | undefined;
  const seed = () => (built ??= typeof seedOrBuild === 'function' ? seedOrBuild() : seedOrBuild);
  let loaded: T[] | undefined;
  /** The records, loaded on first use. */
  const current = () => (loaded ??= load());
  const listeners = new Set<() => void>();
  const changed = () => {
    if (options.invalidatesCaches !== false) storeVersion++;
    listeners.forEach((fn) => fn());
  };

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

  async function writeMany(inputs: (Omit<T, 'id'> & { id?: string })[]): Promise<T[]> {
    if (!inputs.length) return [];
    await wait();
    const records = inputs.map((input) => ({ ...input, id: input.id ?? `${idPrefix}-${crypto.randomUUID().slice(0, 8)}` }) as T);
    const next = [...current()];
    const at = new Map(next.map((r, i) => [r.id, i]));
    const befores = records.map((record) => {
      const index = at.get(record.id);
      const before = index === undefined ? undefined : next[index];
      if (index === undefined) at.set(record.id, next.push(record) - 1);
      else next[index] = record;
      dirty.add(record.id);
      return before;
    });
    loaded = next;
    persist();
    changed();
    if (options.audit) recordAudit(records.map((record, i) => [options.audit!, record.id, befores[i], record]));
    return structuredClone(records);
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
      return (await writeMany([input]))[0];
    },

    /**
     * Save several records as one write: one round trip, one storage write and one change notice,
     * rather than one of each per record. Posting a document touches many items or cost layers at once.
     */
    saveMany(inputs: (Omit<T, 'id'> & { id?: string })[]): Promise<T[]> {
      return writeMany(inputs);
    },

    /** Delete a record (for records nothing refers to yet, such as unposted drafts). */
    async remove(id: string): Promise<void> {
      await wait();
      const before = current().find((r) => r.id === id);
      loaded = current().filter((r) => r.id !== id);
      dirty.add(id);
      persist();
      changed();
      if (options.audit && before) recordAudit([[options.audit, id, before, undefined]]);
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

/** One change made in the app: who saved which record, when, and what changed. */
export interface AuditEvent {
  id: string;
  /** Record kind, as passed to `createCollection`'s `audit` option. */
  kind: string;
  recordId: string;
  /** ISO timestamp. */
  at: string;
  by: string;
  action: 'created' | 'updated' | 'removed';
  /** "Status Open → Closed", "Changed remarks, due date"… Empty when a save changed nothing. */
  changes: string[];
}

/**
 * Saves and removals made in the app, for the Activity tabs. Seeded history isn't here: a
 * record's timeline derives that from its documents. Not audited itself.
 */
export const auditLog = createCollection<AuditEvent>('sikat-erp:audit', [], 'aud', { invalidatesCaches: false });

/** "dueDate" → "due date". */
const words = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

/** What a save changed, as short phrases: status and posting first, then the other fields by name. */
export function describeChanges(before: object, after: object): string[] {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const out: string[] = [];
  if (a.status !== b.status && b.status !== undefined) out.push(`Status ${String(a.status ?? '—')} → ${String(b.status)}`);
  if (!a.docNum && b.docNum) out.push('Posted');
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => k !== 'id' && k !== 'status' && k !== 'docNum' && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
  if (keys.length) out.push(`Changed ${keys.slice(0, 4).map(words).join(', ')}${keys.length > 4 ? ` and ${keys.length - 4} more` : ''}`);
  return out;
}

/** Log a write's saves and removals (kind, record id, before, after) — one audit write for the lot. */
function recordAudit(writes: [kind: string, recordId: string, before: object | undefined, after: object | undefined][]) {
  const at = new Date().toISOString();
  const events = writes.flatMap(([kind, recordId, before, after]) => {
    const changes = before && after ? describeChanges(before, after) : [];
    // A save that changed nothing isn't news.
    if (before && after && !changes.length) return [];
    const action: AuditEvent['action'] = !before ? 'created' : !after ? 'removed' : 'updated';
    return [{ kind, recordId, at, by: CURRENT_USER, action, changes }];
  });
  void auditLog.saveMany(events);
}

/**
 * Shared setup for the scripts that run the app's services under tsx (seed-fingerprint, posting-check,
 * fifo-check, bench-data-layer). Call `memoryStorage()` and `stubLatency()` before loading anything
 * from src/, then load it with `fromSrc`.
 *
 * Each script runs against this repo, or against another checkout given as the first argument, so
 * the same check can be run on code before and after a change and the outputs diffed:
 *
 *   git worktree add ../before HEAD~1
 *   npx tsx scripts/posting-check.ts ../before > before.json
 *   npx tsx scripts/posting-check.ts > after.json
 *   diff before.json after.json
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The source tree to run against: the first argument when it isn't a flag, or this repo. */
const first = process.argv[2];
const root = resolve(first && !first.startsWith('-') ? first : fileURLToPath(new URL('../..', import.meta.url)));

/** Whether a `--flag` was passed. */
export const flag = (name: string) => process.argv.includes(`--${name}`);

/** A module from that tree's src/ (e.g. `services/items.ts`). Untyped: it may be another version of the code. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the module comes from whichever checkout is given
export const fromSrc = (path: string): Promise<any> => import(`${root}/src/${path}`);

/** localStorage in memory, as scripts/check-seeds.ts does: the store reads it when it loads. */
export function memoryStorage() {
  const memory = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
      key: (i: number) => [...memory.keys()][i] ?? null,
      get length() {
        return memory.size;
      },
    },
  });
  return memory;
}

/**
 * The store's fake 250 ms latency (services/store.ts): resolved at once, or after `realMs` when
 * timing how waits overlap. Counts every wait either way.
 */
export function stubLatency({ realMs = 0 } = {}) {
  let waits = 0;
  const real = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms !== 250) return real(fn, ms, ...(rest as []));
    waits++;
    if (realMs) return real(fn, realMs);
    queueMicrotask(fn);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  return {
    get waits() {
      return waits;
    },
  };
}

/**
 * Test harness for the Vitest unit suite. Loaded via vitest.config.ts `setupFiles`, so it runs
 * before any service module imports — the services capture `localStorage` and the clock at load.
 *
 * It provides:
 * - a Map-backed localStorage shim that supports `Object.keys` (store.ts purges by key prefix)
 * - a frozen clock in the company's time zone (only Date is faked; real microtasks/timers still run)
 * - near-zero service latency (the fake 250 ms `wait()` resolves on the next tick)
 * - a fresh localStorage before every test
 */
import { beforeEach, vi } from 'vitest';

/** A localStorage whose data keys are own enumerable props, so `Object.keys(localStorage)` works. */
function createLocalStorage(): Storage {
  const ls = {} as Storage & Record<string, string>;
  // Methods are configurable + writable so tests can `vi.spyOn(localStorage, 'setItem')`.
  const method = (value: (...a: never[]) => unknown) => ({ value, configurable: true, writable: true, enumerable: false });
  Object.defineProperties(ls, {
    getItem: method(function (this: Record<string, string>, key: string) {
      return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null;
    }),
    setItem: method(function (this: Record<string, string>, key: string, val: string) {
      this[key] = String(val);
    }),
    removeItem: method(function (this: Record<string, string>, key: string) {
      delete this[key];
    }),
    clear: method(function (this: Record<string, string>) {
      for (const key of Object.keys(this)) delete this[key];
    }),
    key: method(function (this: Record<string, string>, i: number) {
      return Object.keys(this)[i] ?? null;
    }),
    length: { get() { return Object.keys(this).length; }, configurable: true, enumerable: false },
  });
  return ls;
}

globalThis.localStorage = createLocalStorage();

// Frozen clock so todayISO()/timestamps are deterministic. Fake only Date — leaving setTimeout real
// so awaited service calls still resolve. The instant is mid-year, well inside the seeded books.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-06-15T12:00:00+08:00'));

// Skip the fake 250 ms service latency: run setTimeout callbacks on the next tick instead.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
globalThis.setTimeout = ((fn: (...a: unknown[]) => void, _ms?: number, ...args: unknown[]) =>
  realSetTimeout(fn as () => void, 0, ...args)) as typeof globalThis.setTimeout;

// A clean store before each test. Collections that a test mutates should also call `await coll.reset()`
// (module-level `loaded` is shared across tests in the same file); pure-function tests need nothing.
beforeEach(() => {
  localStorage.clear();
});

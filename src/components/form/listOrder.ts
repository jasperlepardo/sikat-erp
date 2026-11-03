import { useSyncExternalStore } from 'react';

/**
 * The rows a list page shows, filtered, searched and sorted, as record keys (ids, or document
 * numbers once posted), per list path. `ListPage` publishes them and a detail page's Previous / Next
 * steps through them, so it follows the filter you opened the record from. The last order stays after
 * the list unmounts, so a full-page detail opened from it still follows it too.
 */
const orders = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

const same = (a: readonly string[] | undefined, b: readonly string[]) =>
  !!a && a.length === b.length && a.every((key, i) => key === b[i]);

export function publishListOrder(path: string, keys: readonly string[]) {
  if (same(orders.get(path), keys)) return;
  orders.set(path, keys);
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** The keys the list at `path` last showed, in order; undefined until it has shown any. */
export const useListOrder = (path: string) => useSyncExternalStore(subscribe, () => orders.get(path));

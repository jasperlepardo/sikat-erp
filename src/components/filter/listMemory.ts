import type { TableSort } from '@jasperlepardo/sikat-design-system';
import type { FilterGroup } from './engine';

/** What a list was showing: its view, the filter and sort on top of it, and the search text. */
export interface RememberedList {
  viewId: string;
  filter: FilterGroup;
  sort: TableSort | null;
  search: string;
}

/**
 * A list's view, filter, sort and search, kept for the browser tab's session. Opening a record
 * remounts the list (full width → the compact column beside the detail) on a URL without the
 * list's query, and closing the record remounts it again: both restore from here, so the filter
 * and search carry over to the record and back. Session storage, so a refresh keeps them too.
 */
const memory = new Map<string, RememberedList>();
const storageKey = (key: string) => `sikat.list.${key}`;

/** One entry per list and built-in set — the All and Drafts sub-tabs share a list key. */
export const listMemoryKey = (list: string, builtInIds: readonly string[]) => `${list}|${builtInIds.join(',')}`;

export function recallList(key: string): RememberedList | undefined {
  const held = memory.get(key);
  if (held) return held;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as RememberedList;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function rememberList(key: string, patch: Partial<RememberedList>) {
  const prev = memory.get(key) ?? recallList(key);
  if (!prev && !patch.viewId) return; // the search box before the view state is ever written
  const next = { search: '', sort: null, filter: { match: 'all', rules: [] }, ...prev, ...patch } as RememberedList;
  memory.set(key, next);
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(next));
  } catch {
    // Private mode or full storage: the in-memory copy still carries over within the session.
  }
}

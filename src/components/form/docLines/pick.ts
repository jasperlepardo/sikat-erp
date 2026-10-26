import type { PrefColumn } from '../columnPrefs';

export type Vis = 'always' | 'opt' | 'hide';

/**
 * Choose a document's columns, in order, from a column registry — and their default
 * visibility. 'always' = shown, not hideable; 'opt' = shown, in the Columns menu;
 * 'hide' = available but hidden by default.
 */
export function pick<T>(cols: Record<string, PrefColumn<T>>, list: [string, Vis][]): PrefColumn<T>[] {
  return list.map(([key, vis]) => {
    const c = cols[key];
    if (!c) throw new Error(`pick: unknown column "${key}"`);
    // Set both flags explicitly — the registry primitives default to optional+defaultHidden,
    // so 'always'/'opt' must clear them, not just leave them untouched.
    const flags =
      vis === 'always' ? { optional: false, defaultHidden: false }
      : vis === 'opt' ? { optional: true, defaultHidden: false }
      : { optional: true, defaultHidden: true };
    return { ...c, ...flags };
  });
}

/**
 * Global search (the ⌘K palette): ranks a flat index of records, pages and settings against a query.
 * Pure — the index is built in `components/search/searchSources.ts`.
 */

export type SearchGroup = 'Documents' | 'Partners' | 'Items' | 'Pages' | 'Settings';

/** Groups in the order the palette lists them. */
const SEARCH_GROUPS: readonly SearchGroup[] = ['Documents', 'Partners', 'Items', 'Pages', 'Settings'];

export type SearchIntent = 'default' | 'primary' | 'warning' | 'success' | 'danger';

/** One thing the palette can open. */
export interface SearchEntry {
  /** Unique across the index, e.g. `PO:po-001`, `page:sales/quotations`. */
  key: string;
  group: SearchGroup;
  /** Material Symbols glyph. */
  icon: string;
  /** "PO-2026-0001", "Power Mac Center", "Purchase orders". */
  title: string;
  /** "Purchase order · Power Mac Center · 12 Mar 2026". */
  subtitle?: string;
  status?: string;
  intent?: SearchIntent;
  /** Route to open, without the `#`. */
  href: string;
  /** What the query matches against, already `normalize`d. */
  terms: string[];
  /** ISO date; newer documents rank first on a tie. */
  date?: string;
}

/** Case, spaces and separators don't matter: "PO-2026 0001" → "po20260001". */
export const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_./·,()]+/g, '');

/**
 * Search terms for a document number: the number itself, plus its prefix and last number without
 * zero padding, so "PO-2026-0042" is found by "po42" as well as "0042" or "2026-0042".
 */
export function numberTerms(number: string): string[] {
  const full = normalize(number);
  const m = /^([a-z]+)\D*(?:\d+\D+)*?0*(\d+)$/i.exec(number.trim());
  return m ? [full, `${m[1].toLowerCase()}${m[2]}`] : [full];
}

/** Normalized terms from free text, dropping empties and duplicates. */
export const termsOf = (...values: (string | undefined)[]): string[] => [
  ...new Set(values.filter((v): v is string => !!v).map(normalize).filter(Boolean)),
];

/** How well an entry matches: 0 = no match. */
function score(entry: SearchEntry, whole: string, tokens: string[]): number {
  let best = 0;
  for (const term of entry.terms) {
    if (term === whole) return 100;
    if (term.startsWith(whole)) best = Math.max(best, 80);
    else if (best < 60 && term.includes(whole)) best = 60;
  }
  if (best) return best;
  // Several words, each somewhere: "mac center" → "Power Mac Center".
  if (tokens.length > 1 && tokens.every((t) => entry.terms.some((term) => term.includes(t)))) return 40;
  return 0;
}

export interface SearchResultGroup {
  group: SearchGroup;
  hits: SearchEntry[];
  /** Matches in the group, before the cap. */
  total: number;
}

/**
 * Matches for `query`, best first, grouped in `SEARCH_GROUPS` order with at most `perGroup` hits
 * each (`expanded` groups are uncapped). An empty query returns nothing.
 */
export function search(
  entries: readonly SearchEntry[],
  query: string,
  { perGroup = 5, expanded = [] }: { perGroup?: number; expanded?: readonly SearchGroup[] } = {},
): SearchResultGroup[] {
  const whole = normalize(query);
  if (!whole) return [];
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  const scored = new Map<SearchGroup, { entry: SearchEntry; score: number }[]>();
  for (const entry of entries) {
    const s = score(entry, whole, tokens);
    if (!s) continue;
    const list = scored.get(entry.group) ?? [];
    list.push({ entry, score: s });
    scored.set(entry.group, list);
  }
  return SEARCH_GROUPS.flatMap((group) => {
    const list = scored.get(group);
    if (!list) return [];
    list.sort(
      (a, b) =>
        b.score - a.score ||
        (b.entry.date ?? '').localeCompare(a.entry.date ?? '') ||
        a.entry.title.localeCompare(b.entry.title),
    );
    const cap = expanded.includes(group) ? list.length : perGroup;
    return [{ group, hits: list.slice(0, cap).map((s) => s.entry), total: list.length }];
  });
}

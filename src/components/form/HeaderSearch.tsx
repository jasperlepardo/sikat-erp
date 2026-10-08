import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PanelHeaderProps } from '@jasperlepardo/sikat-design-system';

/**
 * Puts a list's search box in the page's `PanelHeader` (the middle of its 3-column bar).
 * The page hosts it — `useHeaderSearchHost()`, spreading `headerProps` on its header and
 * wrapping the body in `provide()` — and a list inside claims it with `useHeaderSearch()`.
 * The search shows only while some list has claimed it; a list with no host keeps its own box.
 */

interface HeaderSearch {
  query: string;
  setQuery: (query: string) => void;
  /** Shows the search with this label; returns the release. */
  claim: (label: string) => () => void;
}

const HeaderSearchContext = createContext<HeaderSearch | null>(null);

export function useHeaderSearchHost() {
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState<string>();
  const claim = useCallback((next: string) => {
    setLabel(next);
    return () => setLabel((current) => (current === next ? undefined : current));
  }, []);
  const host = useMemo(() => ({ query, setQuery, claim }), [query, claim]);

  const headerProps: Partial<PanelHeaderProps> = label
    ? { showSearch: true, searchLabel: label, searchPlaceholder: label, searchValue: query, onSearchChange: setQuery }
    : {};

  return {
    headerProps,
    provide: (children: ReactNode) => <HeaderSearchContext.Provider value={host}>{children}</HeaderSearchContext.Provider>,
    reset: () => setQuery(''),
  };
}

/** The header search to filter by, or `null` when the page has none (render your own box). */
export function useHeaderSearch(label: string): Pick<HeaderSearch, 'query' | 'setQuery'> | null {
  const host = useContext(HeaderSearchContext);
  const claim = host?.claim;
  useEffect(() => claim?.(label), [claim, label]);
  return host;
}

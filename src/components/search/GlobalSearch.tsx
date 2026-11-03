import { Badge, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { search, type SearchEntry, type SearchGroup, type SearchResultGroup } from '../../services/globalSearch';
import { recordEntries, staticEntries } from './searchSources';

const RECENT_KEY = 'sikat-erp:search-recent';
const RECENT_MAX = 8;

type Recent = Omit<SearchEntry, 'terms' | 'status' | 'intent' | 'date'>;

function readRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as Recent[]).filter((r) => r && typeof r.href === 'string') : [];
  } catch {
    return [];
  }
}

function remember(entry: SearchEntry) {
  try {
    const { key, group, icon, title, subtitle, href } = entry;
    const next = [{ key, group, icon, title, subtitle, href }, ...readRecent().filter((r) => r.key !== key)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: search still works, it just won't remember.
  }
}

interface Section {
  title: string;
  group?: SearchGroup;
  hits: SearchEntry[];
  total: number;
}

/** Sets the navbar field's value the way typing does, so the Navbar's own state (and `onSearchChange`) follow. */
function setFieldValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Fixed position just under the navbar search field, at least 560px wide, kept inside the viewport. */
function placeUnder(input: HTMLInputElement): CSSProperties {
  const field = (input.closest('.sikat-navbar__search') ?? input).getBoundingClientRect();
  const width = Math.min(Math.max(field.width, 560), window.innerWidth - 32);
  const left = Math.min(Math.max(field.left, 16), window.innerWidth - 16 - width);
  return { top: field.bottom + 6, left, width };
}

/**
 * Results for the navbar search field: documents, partners, items, pages and settings,
 * in a dropdown under the field. The field stays the Navbar's own; this wires its keys and ARIA.
 * Pages and settings show at once; records join when their collections have loaded.
 * The results always render in light mode.
 */
export default function GlobalSearch({ input, query, onClose }: { input: HTMLInputElement; query: string; onClose: () => void }) {
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const deferred = useDeferredValue(query);
  const [records, setRecords] = useState<SearchEntry[]>();
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<SearchGroup[]>([]);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>(() => placeUnder(input));

  useEffect(() => {
    let live = true;
    recordEntries().then(
      (r) => live && setRecords(r),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  // Follow the field when the window resizes (the navbar reflows).
  useEffect(() => {
    const onResize = () => setPlace(placeUnder(input));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [input]);

  // A mouse-down outside the field and the results closes them.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !input.closest('.sikat-navbar__search')?.contains(t)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [input, onClose]);

  const index = useMemo(() => [...staticEntries(), ...(records ?? [])], [records]);

  const sections: Section[] = useMemo(() => {
    if (!deferred.trim()) {
      const recent = readRecent().map((r): SearchEntry => ({ ...r, terms: [] }));
      return recent.length ? [{ title: 'Recent', hits: recent, total: recent.length }] : [];
    }
    return search(index, deferred, { expanded }).map((g: SearchResultGroup) => ({ title: g.group, ...g }));
  }, [deferred, index, expanded]);

  const flat = useMemo(() => sections.flatMap((s) => s.hits), [sections]);

  // A new query starts from the top.
  useEffect(() => {
    setActive(0);
    setExpanded([]);
  }, [deferred]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const optionId = (n: number) => `${id}-option-${n}`;

  // The field is a combobox while the results are open.
  useLayoutEffect(() => {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', `${id}-list`);
    input.setAttribute('aria-autocomplete', 'list');
    return () => {
      for (const a of ['role', 'aria-expanded', 'aria-controls', 'aria-autocomplete', 'aria-activedescendant']) input.removeAttribute(a);
    };
  }, [input, id]);
  useLayoutEffect(() => {
    if (flat[active]) input.setAttribute('aria-activedescendant', optionId(active));
    else input.removeAttribute('aria-activedescendant');
  });

  const open = (entry: SearchEntry, newTab = false) => {
    remember(entry);
    if (newTab) {
      window.open(`#${entry.href}`, '_blank', 'noopener');
      return;
    }
    navigate(entry.href);
    setFieldValue(input, '');
    input.blur();
    onClose();
  };

  // Keys on the navbar field; re-bound each render so they see the current results.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!flat.length) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + step + flat.length) % flat.length);
      } else if (e.key === 'Enter' && flat[active]) {
        e.preventDefault();
        open(flat[active], e.metaKey || e.ctrlKey);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.blur();
        onClose();
      } else if (e.key === 'Tab') {
        onClose();
      }
    };
    input.addEventListener('keydown', onKeyDown);
    return () => input.removeEventListener('keydown', onKeyDown);
  });

  const loading = !records && !failed && !!deferred.trim();
  let n = -1;

  return (
    <div
      ref={panel}
      data-theme="light"
      style={place}
      className="fixed z-50 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl border border-default bg-default text-body shadow-md"
      // Clicks keep focus in the field, so the keys keep working.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Search results" className="min-h-0 flex-1 overflow-y-auto p-2">
        {sections.map((s) => (
          <div key={s.title} role="group" aria-labelledby={`${id}-${s.title}`} className="mb-2 last:mb-0">
            <div id={`${id}-${s.title}`} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {s.title}
            </div>
            {s.hits.map((hit) => {
              n += 1;
              const index = n;
              const selected = index === active;
              return (
                <div
                  key={hit.key}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 ${selected ? 'bg-neutral-subtle' : ''}`}
                  onMouseMove={() => !selected && setActive(index)}
                  onClick={(e) => open(hit, e.metaKey || e.ctrlKey)}
                >
                  <Icon size={20} className="flex-none text-muted">{hit.icon}</Icon>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{hit.title}</div>
                    {hit.subtitle ? <div className="truncate text-xs text-muted">{hit.subtitle}</div> : null}
                  </div>
                  {hit.status ? (
                    <Badge size="small" intent={hit.intent ?? 'default'} className="flex-none">
                      {hit.status}
                    </Badge>
                  ) : null}
                </div>
              );
            })}
            {s.group && s.total > s.hits.length ? (
              <button
                type="button"
                className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-neutral-subtle"
                onClick={() => setExpanded((g) => [...g, s.group!])}
              >
                Show all {s.total} {s.title.toLowerCase()}
              </button>
            ) : null}
          </div>
        ))}
        {loading ? (
          <Text tone="muted" className="px-2 py-2 text-sm">Searching records…</Text>
        ) : null}
        {failed ? (
          <Text tone="muted" className="px-2 py-2 text-sm">{"Couldn't load records. Pages and settings are still searchable."}</Text>
        ) : null}
        {!deferred.trim() && !flat.length ? (
          <Text tone="muted" className="px-2 py-6 text-center text-sm">Type to search documents, partners, items, pages and settings.</Text>
        ) : null}
        {deferred.trim() && !flat.length && !loading ? (
          <Text tone="muted" className="px-2 py-6 text-center text-sm">No results for {`"${deferred.trim()}"`}</Text>
        ) : null}
      </div>

      <div className="hidden gap-4 border-t border-default px-4 py-2 text-xs text-muted sm:flex">
        <span>↑↓ to move</span>
        <span>Enter to open</span>
        <span>⌘ Enter for a new tab</span>
        <span>Esc to close</span>
      </div>
    </div>
  );
}

import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { Card, Icon, IconButton, Panel, Table, TableContent, TableStatus, Text, type BadgeIntent, type BadgeProps, type TableColumn, type TableSort } from '@jasperlepardo/sikat-design-system';
import { useNavigate } from 'react-router';
import { PageHeader } from './PageHeader';
import { cap, type Noun } from './noun';
import { DEFAULT_PAGE_SIZE, fillCardClass, useListPage } from './DataTable';
import type { FilterField, FilterGroup } from '../filter/engine';
import type { BuiltInView } from '../filter/useListViews';
import { useListPresets } from '../filter/useListPresets';
import { publishListOrder } from './listOrder';

interface ListPageProps<T> {
  /** Raw rows from the data layer (undefined while loading). */
  rows: T[] | undefined;
  columns: TableColumn<T>[];
  fields: FilterField<T>[];
  getRowId?: (row: T) => string;
  noun: Noun;
  icon: string;
  /** Storage key for saved filter presets. */
  listKey: string;
  /** Base path for the create button (navigates to `${basePath}/new`). */
  basePath: string;
  /** Overrides `basePath` for the create button when the new-record path differs. */
  createPath?: string;
  builtIns?: BuiltInView[];
  defaultSort?: TableSort | null;
  /** Invisible AND-ed scope (e.g. `draftScope(draftsOnly, STATUSES)` for draft sub-tabs). */
  scope?: FilterGroup;
  search?: { placeholder: string; label?: string };
  /** Rendered above the toolbar — use for transient notice alerts. */
  header?: ReactNode;
  /** Replaces the default empty-state message. */
  emptyMessage?: ReactNode;
  /** Rendered next to the toolbar (e.g. a column manager). */
  toolbarExtra?: ReactNode;
  /** 3/9 split mode: hides the toolbar. */
  compact?: boolean;
  /** Highlights this row id (forwarded to Table's selectedIds). */
  selectedId?: string;
  /**
   * Applied after `useListPresets.apply()`. Receives `(row, searchText)` —
   * use for domain-specific row hiding and custom text search.
   * Without this prop, all rows from `apply()` are shown.
   */
  filterFn?: (row: T, searchText: string) => boolean;
  /**
   * Custom sort comparator. Return -1 / 0 / 1; direction is applied by ListPage.
   * Without this prop, rows are sorted by direct field value comparison.
   */
  sortFn?: (a: T, b: T, sort: TableSort) => number;
}

export function ListPage<T>({
  rows,
  columns,
  fields,
  getRowId,
  noun,
  icon,
  listKey,
  basePath,
  createPath,
  builtIns = [],
  defaultSort = null,
  scope,
  search,
  header,
  emptyMessage,
  compact = false,
  selectedId,
  filterFn,
  toolbarExtra,
  sortFn,
}: ListPageProps<T>) {
  const navigate = useNavigate();
  const { resetPage, showIndex, paginate } = useListPage();
  // Beside an open record the list has no pagination: it renders the first `limit` rows and
  // grows by a page each time its scroller nears the bottom.
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const restart = useCallback(() => { resetPage(); setLimit(DEFAULT_PAGE_SIZE); }, [resetPage]);
  const presets = useListPresets({ list: listKey, fields, builtIns, defaultSort, rows, onChange: restart, search, scope });
  const { sort, setSort } = presets;

  // Apply preset filter then optional domain/search filter.
  // Deps use presets.filter + presets.searchText (state values), not presets.apply (new fn each render).
  const filtered = useMemo(() => {
    const applied = presets.apply(rows ?? []);
    if (!filterFn) return applied;
    return applied.filter((row) => filterFn(row, presets.searchText));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, presets.filter, presets.searchText, filterFn]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortFn) return sortFn(a, b, sort) * dir;
      const v = (r: T) => {
        const val = (r as Record<string, unknown>)[sort.key];
        return typeof val === 'number' ? val : String(val ?? '').toLowerCase();
      };
      const x = v(a); const y = v(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [filtered, sort, sortFn]);

  const rowId = getRowId ?? ((r: T) => (r as { id: string }).id);
  const compactColumns = useMemo(() => (compact ? compactColumnsOf(columns) : columns), [compact, columns]);
  const paged = paginate(sorted);
  const { visible, pagination } = compact ? { visible: sorted.slice(0, limit), pagination: undefined } : paged;
  const hasMore = compact && limit < sorted.length;
  const loadMore = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < 200) setLimit((n) => n + DEFAULT_PAGE_SIZE);
  };

  // A new sort starts the compact list from the top again.
  useEffect(() => { setLimit(DEFAULT_PAGE_SIZE); }, [sort]);

  // The order Previous / Next on a record follows: every filtered, sorted row, not just this page.
  useEffect(() => {
    if (rows) publishListOrder(basePath, sorted.map(rowId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sorted, basePath]);

  // Beside an open record, load the list down to it and scroll it into view, so Previous / Next
  // keeps the highlighted row visible. Only when the open record changes (or first loads), so
  // scrolling the list by hand while a record is open isn't undone.
  const followed = useRef<string | undefined>(undefined);
  const [reveal, setReveal] = useState(0);
  useEffect(() => {
    if (!selectedId || !rows || followed.current === selectedId) return;
    const at = sorted.findIndex((r) => rowId(r) === selectedId);
    if (at < 0) return;
    followed.current = selectedId;
    if (!compact) { showIndex(at); return; }
    setLimit((n) => Math.max(n, at + DEFAULT_PAGE_SIZE));
    setReveal((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, rows, sorted, showIndex, compact]);
  useEffect(() => {
    if (!reveal || !selectedId) return;
    document.querySelector(`[data-list-card="${listKey}"] tr[data-row-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  return (
    <Panel className="flex-1">
      <PageHeader
        icon={icon}
        title={cap(noun.many)}
        {...(compact ? {
          actions: <IconButton intent="primary" onClick={() => navigate(`${createPath ?? basePath}/new`)} label={`New ${noun.one}`}><Icon size={20}>add</Icon></IconButton>,
        } : {
          create: { noun, to: createPath ?? basePath },
        })}
      />
      <Panel.Body className={`flex flex-col gap-2${compact ? ' overflow-x-hidden' : ''}`}>
        {header}
        {presets.toolbar(undefined, !compact ? toolbarExtra : undefined)}
        <Card data-list-card={listKey} onScrollCapture={compact ? loadMore : undefined} className={`${fillCardClass(visible.length)}${compact ? ' overflow-x-hidden [&_.sikat-table__td]:whitespace-normal [&_.sikat-table__td]:h-auto' : ''}`}>
          {!rows ? (
            <Text tone="muted" className="p-4">Loading {noun.many}…</Text>
          ) : rows.length > 0 ? (
            <Table
              caption={cap(noun.many)}
              columns={compactColumns}
              rows={visible}
              getRowId={rowId}
              selectedIds={selectedId ? [selectedId] : undefined}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              pagination={pagination}
            />
          ) : (
            <Text tone="muted" className="p-4">
              {emptyMessage ?? <>No {noun.many} yet. Create one with New {noun.one}.</>}
            </Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}

/** Dot colour per status intent: the same icon tokens the design system's Badge uses. */
const DOT_COLOR: Record<BadgeIntent, string> = {
  default: 'bg-[var(--color-fg-default-solid)]',
  primary: 'bg-[var(--color-fg-primary)]',
  success: 'bg-[var(--color-fg-success)]',
  warning: 'bg-[var(--color-fg-warning)]',
  danger: 'bg-[var(--color-fg-danger)]',
  information: 'bg-[var(--color-fg-information)]',
  automation: 'bg-[var(--color-fg-automation)]',
  white: 'bg-[var(--color-fg-white)]',
  black: 'bg-[var(--color-fg-black)]',
};

/** Turns a list's `TableStatus` cell into a coloured dot and plain caption text for the compact row; anything else passes through. */
function statusText(cell: ReactNode): ReactNode {
  if (!isValidElement<BadgeProps>(cell) || cell.type !== TableStatus) return cell;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT_COLOR[cell.props.intent ?? 'default']}`} />
      <Text as="span" variant="caption" weight="semibold" tone="muted" className="uppercase">{cell.props.children}</Text>
    </span>
  );
}

/** Drops the sub line from a `TableContent` cell, so the compact row is just the main text. */
function withoutSubcopy(cell: ReactNode): ReactNode {
  if (!isValidElement<{ subcopy?: ReactNode }>(cell) || cell.type !== TableContent) return cell;
  return cloneElement(cell, { subcopy: undefined });
}

/**
 * The compact list beside an open record shows only the first column, without its sub text.
 * When the list has a `status` column, its status goes under the main text as a dot and caption.
 */
function compactColumnsOf<T>(columns: TableColumn<T>[]): TableColumn<T>[] {
  const [first] = columns;
  if (!first) return [];
  const status = columns.find((c) => c.key === 'status');
  const firstCell = first.cell;
  const statusCell = status !== first ? status?.cell : undefined;
  if (!firstCell) return [first];
  return [{
    ...first,
    cell: (row) => (
      <div className="flex flex-col items-start gap-0.5">
        {withoutSubcopy(firstCell(row))}
        {statusCell ? statusText(statusCell(row)) : null}
      </div>
    ),
  }];
}

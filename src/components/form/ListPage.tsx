import { useMemo, type ReactNode } from 'react';
import { Card, Icon, IconButton, Panel, Table, Text, type TableColumn, type TableSort } from '@jasperlepardo/sikat-design-system';
import { useNavigate } from 'react-router';
import { PageHeader } from './PageHeader';
import { cap, type Noun } from './noun';
import { fillCardClass, useListPage } from './DataTable';
import type { FilterField, FilterGroup } from '../filter/engine';
import type { BuiltInView } from '../filter/useListViews';
import { useListPresets } from '../filter/useListPresets';

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
  const { resetPage, paginate } = useListPage();
  const presets = useListPresets({ list: listKey, fields, builtIns, defaultSort, rows, onChange: resetPage, search, scope });
  const { sort, setSort } = presets;

  // Apply preset filter then optional domain/search filter.
  // Deps use presets.filter + presets.searchText (state values), not presets.apply (new fn each render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const applied = presets.apply(rows ?? []);
    if (!filterFn) return applied;
    return applied.filter((row) => filterFn(row, presets.searchText));
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
  const { visible, pagination } = paginate(sorted);

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
        <Card className={`${fillCardClass(visible.length)}${compact ? ' overflow-x-hidden [&_.sikat-table__td]:whitespace-normal [&_.sikat-table__td]:h-auto' : ''}`}>
          {!rows ? (
            <Text tone="muted" className="p-4">Loading {noun.many}…</Text>
          ) : rows.length > 0 ? (
            <Table
              caption={cap(noun.many)}
              columns={compact ? columns.slice(0, 1) : columns}
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

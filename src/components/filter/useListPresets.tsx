import { useMemo, useState, type ReactNode } from 'react';
import { Button, Icon, TextField, type TableSort } from '@jasperlepardo/sikat-design-system';
import { InvalidFilterError, filterRows } from '../../services/listQuery';
import { formatFilter } from './aip160';
import { EMPTY_FILTER, applyFilter, oneRule, type FilterField, type FilterGroup } from './engine';
import { FilterBar } from './FilterBar';
import { FilterToolbar } from './FilterToolbar';
import { PresetPanel } from './PresetPanel';
import { ViewMenu } from './ViewMenu';
import { useListViews, type BuiltInView } from './useListViews';

/**
 * Built-in presets from a status list — what a list's status tabs used to be:
 * "All A/R invoices", "Open A/R invoices"… `noun` is the plural shown after the
 * status; pass `''` for status-only labels ("All", "Open") when the page title
 * already names the entity.
 */
export function statusViews(noun: string, statuses: readonly string[], field = 'status'): BuiltInView[] {
  const name = (prefix: string) => (noun ? `${prefix} ${noun}` : prefix);
  return [
    { id: 'all', name: 'All', filter: EMPTY_FILTER },
    ...statuses.map((status) => ({
      id: status.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: name(status),
      filter: oneRule(field, 'in', [status]),
    })),
  ];
}

/**
 * A list that splits its drafts into a separate sub-tab (sidebar "Drafts" page). "Drafts" means every
 * *non-official* document — not yet posted: `Draft` and `Not Confirmed` (submitted for approval).
 * "Official" is everything posted/committed (Open, Posted, Approved, On Hold, Closed, Cancelled,
 * Terminated). The Drafts ↔ All split is an invisible page *scope* (`draftScope`, applied via
 * `useListPresets`'s `scope`), NOT a status filter — so it never shows as a removable chip. The views
 * (`draftSplit`) are just the in-scope status options, with an empty default ("All" / "Draft {noun}").
 */
const NON_OFFICIAL = ['Draft', 'Not Confirmed'];
/** The statuses a Drafts/All sub-tab is bounded to: non-official (Draft + Not Confirmed) when
 *  `draftsOnly`, else the official (posted) ones. Use for the scope, the views, and the status field. */
export const scopeStatuses = (draftsOnly: boolean, statuses: readonly string[]) =>
  statuses.filter((s) => NON_OFFICIAL.includes(s) === draftsOnly);

/** The invisible status scope that bounds a Drafts/All sub-tab (pass to `useListPresets`'s `scope`). */
export function draftScope(draftsOnly: boolean, statuses: readonly string[], field = 'status'): FilterGroup {
  return oneRule(field, 'in', scopeStatuses(draftsOnly, statuses));
}

/**
 * In-scope status views for a Drafts/All sub-tab. The Drafts sub-tab is a single "Draft" view (its
 * status set — Draft + Not Confirmed — is the invisible scope). The All sub-tab is an empty "All"
 * default plus one quick view per official status.
 */
export function draftSplit(draftsOnly: boolean, noun: string, statuses: readonly string[], field = 'status'): BuiltInView[] {
  if (draftsOnly) return [{ id: 'all', name: 'Draft', filter: EMPTY_FILTER }];
  const name = (prefix: string) => (noun ? `${prefix} ${noun}` : prefix);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [
    { id: 'all', name: name('All'), filter: EMPTY_FILTER },
    ...scopeStatuses(false, statuses).map((status) => ({ id: slug(status), name: name(status), filter: oneRule(field, 'in', [status]) })),
  ];
}

/**
 * Everything a list page needs for filter presets:
 * - `menu` — the `PanelHeader` title (preset picker),
 * - `bar(search)` — the search field with the Filter button and builder,
 * - `panel` — the new/edit preset side panel (render anywhere in the page),
 * - `apply(rows)`, `sort`, `setSort` — to filter and sort the table,
 * - `query` — the filter as AIP-160 text, as a list API would take it (`listX({ filter: query })`).
 */
export function useListPresets<T>({
  list,
  fields,
  builtIns,
  defaultSort,
  rows,
  onChange,
  urlSync,
  scope,
  search,
}: {
  /** Storage key for saved presets: 'ar-invoices', 'items'… */
  list: string;
  fields: FilterField<T>[];
  builtIns: BuiltInView[];
  defaultSort: TableSort | null;
  /** All rows, for the counts in the preset menu. */
  rows: T[] | undefined;
  /** Called when the filter or view changes — reset the table to page 1. */
  onChange?: () => void;
  /** Mirror the filter/view to the page URL. Off for embedded use (e.g. a modal). Default true. */
  urlSync?: boolean;
  /** An invisible page scope AND-ed into every query/count (e.g. a Drafts sub-tab's status set).
   *  Unlike the view filter it never appears as a removable chip. */
  scope?: FilterGroup;
  /** Free-text search field rendered at the top of the filter bar. `searchText` in the return
   *  value is trimmed + lowercased, ready to use in `.filter()` calls. */
  search?: { placeholder: string; label?: string };
}) {
  const views = useListViews({ list, fields, builtIns, defaultSort, urlSync });
  const [panel, setPanel] = useState<'new' | 'edit' | null>(null);
  const [rawSearch, setRawSearch] = useState('');
  const searchText = rawSearch.trim().toLowerCase();
  // Rows already narrowed to the scope — the baseline for both counts and `apply`.
  const scopedRows = useMemo(
    () => (rows && scope?.rules.length ? applyFilter(rows, scope, fields) : rows),
    [rows, scope, fields],
  );

  const setFilter = (next: FilterGroup) => {
    views.setFilter(next);
    onChange?.();
  };
  const menuViews = {
    ...views,
    select: (id: string) => {
      views.select(id);
      onChange?.();
    },
  };

  const counts = useMemo(
    () => (scopedRows ? new Map(views.views.map((v) => [v.id, applyFilter(scopedRows, v.filter, fields).length])) : null),
    [scopedRows, views.views, fields],
  );

  const menu = (
    <ViewMenu
      views={menuViews}
      count={counts ? (view) => counts.get(view.id) : undefined}
      onNew={() => setPanel('new')}
      onEdit={() => setPanel('edit')}
    />
  );

  const searchEl = search ? (
    <TextField
      aria-label={search.label ?? 'Search'}
      placeholder={search.placeholder}
      leadingIcon={<Icon size={20}>search</Icon>}
      value={rawSearch}
      onChange={(e) => { setRawSearch(e.currentTarget.value); onChange?.(); }}
    />
  ) : null;

  const saveActions = views.edited ? (
    <>
      {!views.current.builtIn ? (
        <Button type="button" intent="primary" variant="ghost" size="medium" onClick={() => void views.saveChanges()}>
          Save changes
        </Button>
      ) : null}
      <Button type="button" intent="primary" variant="ghost" size="medium" onClick={() => setPanel('new')}>
        Save as preset…
      </Button>
    </>
  ) : null;

  const bar = (extra?: ReactNode) => (
    <FilterBar fields={fields} value={views.filter} onChange={setFilter} showChips={views.edited} actions={saveActions}>
      {searchEl || extra ? <>{searchEl}{extra}</> : null}
    </FilterBar>
  );

  /** The new chip-first toolbar: view selector + Add filter + chips + reset/save. */
  const toolbar = (extra?: ReactNode, trailing?: ReactNode) => (
    <FilterToolbar
      fields={fields}
      value={views.filter}
      onChange={setFilter}
      viewMenu={menu}
      edited={views.edited}
      onReset={views.reset}
      onSaveView={() => setPanel('new')}
      search={searchEl || extra ? <>{searchEl}{extra}</> : undefined}
      trailing={trailing}
    />
  );

  const query = formatFilter(views.filter, fields);

  const editing = panel === 'edit';
  const panelEl = panel ? (
    <PresetPanel
      title={editing ? `Edit “${views.current.name}”` : 'New filter preset'}
      isNew={!editing}
      fields={fields}
      initial={{ name: editing ? views.current.name : '', filter: views.filter }}
      takenNames={views.views.filter((v) => !(editing && v.id === views.current.id)).map((v) => v.name)}
      onCancel={() => setPanel(null)}
      onSave={async (name, filter) => {
        if (editing) await views.update(views.current.id, { name, filter, sort: views.sort });
        else await views.saveNew(name, filter, views.sort);
        setPanel(null);
        onChange?.();
      }}
    />
  ) : null;

  return {
    menu,
    bar,
    toolbar,
    panel: panelEl,
    filter: views.filter,
    sort: views.sort,
    setSort: views.setSort,
    searchText,
    query,
    apply: (all: T[]) => {
      // Narrow to the invisible page scope first (e.g. the Drafts sub-tab's status set), then the view
      // filter — through the AIP-160 text, the same path a list API call takes.
      const inScope = scope?.rules.length ? applyFilter(all, scope, fields) : all;
      try {
        return filterRows(inScope, query, fields);
      } catch (e) {
        if (!(e instanceof InvalidFilterError)) throw e;
        console.warn(`Filter text didn't read back (${e.message}): ${e.filter}`);
        return applyFilter(inScope, views.filter, fields);
      }
    },
  };
}

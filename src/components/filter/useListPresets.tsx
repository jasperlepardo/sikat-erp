import { useState, type ReactNode } from 'react';
import { Button, type TableSort } from '@jasperlepardo/sikat-design-system';
import { EMPTY_FILTER, applyFilter, oneRule, type FilterField, type FilterGroup } from './engine';
import { FilterBar } from './FilterBar';
import { PresetPanel } from './PresetPanel';
import { ViewMenu } from './ViewMenu';
import { useListViews, type BuiltInView } from './useListViews';

/**
 * Built-in presets from a status list — what a list's status tabs used to be:
 * "All A/R invoices", "Open A/R invoices"… `noun` is the plural shown after the status.
 */
export function statusViews(noun: string, statuses: readonly string[], field = 'status'): BuiltInView[] {
  return [
    { id: 'all', name: `All ${noun}`, filter: EMPTY_FILTER },
    ...statuses.map((status) => ({
      id: status.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: `${status} ${noun}`,
      filter: oneRule(field, 'is', status),
    })),
  ];
}

/**
 * Everything a list page needs for filter presets:
 * - `menu` — the `PanelHeader` title (preset picker),
 * - `bar(search)` — the search field with the Filter button and builder,
 * - `panel` — the new/edit preset side panel (render anywhere in the page),
 * - `apply(rows)`, `sort`, `setSort` — to filter and sort the table.
 */
export function useListPresets<T>({
  list,
  fields,
  builtIns,
  defaultSort,
  rows,
  onChange,
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
}) {
  const views = useListViews({ list, builtIns, defaultSort });
  const [panel, setPanel] = useState<'new' | 'edit' | null>(null);

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

  const menu = (
    <ViewMenu
      views={menuViews}
      count={(view) => (rows ? applyFilter(rows, view.filter, fields).length : undefined)}
      onNew={() => setPanel('new')}
      onEdit={() => setPanel('edit')}
    />
  );

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

  const bar = (search: ReactNode) => (
    <FilterBar fields={fields} value={views.filter} onChange={setFilter} showChips={views.edited} actions={saveActions}>
      {search}
    </FilterBar>
  );

  const editing = panel === 'edit';
  const panelEl = panel ? (
    <PresetPanel
      title={editing ? `Edit “${views.current.name}”` : 'New filter preset'}
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
    panel: panelEl,
    filter: views.filter,
    sort: views.sort,
    setSort: views.setSort,
    apply: (all: T[]) => applyFilter(all, views.filter, fields),
  };
}

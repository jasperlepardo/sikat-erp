import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { TableSort } from '@jasperlepardo/sikat-design-system';
import { filterPresets, type FilterPreset } from '../../services/filterPresets';
import { useCollection } from '../form/MasterLookup';
import { formatFilter, parseFilter } from './aip160';
import { decodeFilter, encodeFilter, type FilterField, type FilterGroup } from './engine';

/** A list view: a built-in preset (declared in code) or a saved one. */
export interface ListView {
  id: string;
  name: string;
  filter: FilterGroup;
  sort: TableSort | null;
  builtIn: boolean;
}

export type BuiltInView = Omit<ListView, 'builtIn' | 'sort'> & { sort?: TableSort | null };

const sameSort = (a: TableSort | null, b: TableSort | null) =>
  a === b || (!!a && !!b && a.key === b.key && a.direction === b.direction);

/**
 * Filter presets for one list. The header picks a view; the filter and sort start from it
 * and can be changed on top (`edited`), then saved back or as a new preset.
 *
 * URL: `?view=<id>` is the picked view; `?filter=…` holds the filter as AIP-160 text
 * (`status = "Open" AND total > 1000`) only while it differs from the view's — so a filtered
 * list can be bookmarked, survives a refresh, and can be edited by hand in the address bar.
 */
export function useListViews<T>({
  list,
  fields,
  builtIns,
  defaultSort,
}: {
  list: string;
  fields: FilterField<T>[];
  builtIns: BuiltInView[];
  defaultSort: TableSort | null;
}) {
  const [params, setParams] = useSearchParams();
  const saved = useCollection(filterPresets);

  const views = useMemo<ListView[]>(
    () => [
      ...builtIns.map((v) => ({ ...v, sort: v.sort ?? defaultSort, builtIn: true })),
      ...(saved ?? []).filter((p) => p.list === list).map((p) => ({ ...p, builtIn: false })),
    ],
    // builtIns / defaultSort are static per list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, list],
  );

  const [viewId, setViewId] = useState(() => params.get('view') ?? builtIns[0].id);
  const current = views.find((v) => v.id === viewId);

  const [filter, setFilter] = useState<FilterGroup>(() => {
    const fromUrl = params.get('filter');
    const parsed = fromUrl ? parseFilter(fromUrl, fields) : undefined;
    if (parsed?.ok) return parsed.filter;
    // Links from before AIP-160 text carry the old compact JSON in `?f=`.
    const legacy = params.get('f');
    if (legacy) return decodeFilter(legacy);
    return builtIns.find((v) => v.id === viewId)?.filter ?? builtIns[0].filter;
  });
  const [sort, setSort] = useState<TableSort | null>(defaultSort);

  // A saved preset in the URL loads asynchronously: adopt its filter/sort once it arrives.
  const [adopted, setAdopted] = useState(() => builtIns.some((v) => v.id === viewId));
  useEffect(() => {
    if (adopted || saved === undefined) return;
    setAdopted(true);
    if (!current) {
      setViewId(builtIns[0].id); // deleted or someone else's link
      return;
    }
    if (!params.get('filter') && !params.get('f')) setFilter(current.filter);
    setSort(current.sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, adopted]);

  const viewFilter = encodeFilter(current?.filter ?? { match: 'all', rules: [] });
  const encoded = encodeFilter(filter);
  const edited = !!current && (encoded !== viewFilter || !sameSort(sort, current.sort));

  // Mirror the view and any unsaved filter to the URL.
  const filterParam = encoded !== viewFilter ? formatFilter(filter, fields) : '';
  const viewParam = viewId === builtIns[0].id ? '' : viewId;
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const put = (key: string, value: string) => (value ? next.set(key, value) : next.delete(key));
        put('view', viewParam);
        put('filter', filterParam);
        next.delete('f');
        return next.toString() === prev.toString() ? prev : next;
      },
      { replace: true },
    );
  }, [viewParam, filterParam, setParams]);

  const select = useCallback(
    (id: string) => {
      const view = views.find((v) => v.id === id);
      if (!view) return;
      setViewId(id);
      setFilter(view.filter);
      setSort(view.sort);
    },
    [views],
  );

  const saveNew = async (name: string, nextFilter: FilterGroup, nextSort: TableSort | null) => {
    const preset = await filterPresets.save({ list, name: name.trim(), filter: nextFilter, sort: nextSort });
    setViewId(preset.id);
    setFilter(preset.filter);
    setSort(preset.sort);
    return preset;
  };

  /** Update a saved preset (the current one by default) — name, filter and sort. */
  const update = async (id: string, patch: Partial<Pick<FilterPreset, 'name' | 'filter' | 'sort'>>) => {
    const preset = saved?.find((p) => p.id === id);
    if (!preset) return;
    const next = await filterPresets.save({ ...preset, ...patch, name: (patch.name ?? preset.name).trim() });
    if (id === viewId) {
      setFilter(next.filter);
      setSort(next.sort);
    }
  };

  const saveChanges = () => (current && !current.builtIn ? update(current.id, { filter, sort }) : Promise.resolve());

  const remove = async (id: string) => {
    await filterPresets.remove(id);
    if (id === viewId) {
      setViewId(builtIns[0].id);
      setFilter(builtIns[0].filter);
      setSort(builtIns[0].sort ?? defaultSort);
    }
  };

  /** Back to the view as saved, dropping unsaved changes. */
  const reset = () => current && select(current.id);

  return {
    views,
    current: current ?? views[0],
    filter,
    setFilter,
    sort,
    setSort,
    edited,
    select,
    saveNew,
    update,
    saveChanges,
    remove,
    reset,
  };
}

export type ListViews = ReturnType<typeof useListViews>;

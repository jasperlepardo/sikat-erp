import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import type { TableSort } from '@jasperlepardo/sikat-design-system';
import { filterPresets, type FilterPreset } from '../../services/filterPresets';
import { useCollection } from '../form/MasterLookup';
import { useInSplitList } from '../form/SplitPage';
import { formatFilter, parseFilter } from './aip160';
import { decodeFilter, encodeFilter, type FilterField, type FilterGroup } from './engine';
import { listMemoryKey, recallList, rememberList } from './listMemory';

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
 *
 * Memory (`listMemory`): the view, filter and sort are also kept per list for the session. A list
 * URL without `?view=` / `?filter=` restores them, and the compact list beside an open record uses
 * only the memory — so opening a record, stepping through records and closing it keep the filter.
 */
export function useListViews<T>({
  list,
  fields,
  builtIns,
  defaultSort,
  urlSync = true,
}: {
  list: string;
  fields: FilterField<T>[];
  builtIns: BuiltInView[];
  defaultSort: TableSort | null;
  /**
   * Mirror the filter/view to the page URL. Turn OFF for an embedded filter (e.g. the
   * item-search modal) so a selection doesn't rewrite the host page's URL — on a `/new/`
   * detail page a replace-navigation mints a new `location.key` and remounts the form,
   * closing the modal/popover mid-selection.
   */
  urlSync?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const saved = useCollection(filterPresets);
  // Beside an open record the URL is the record's: carry the list's state through memory alone.
  const remember = urlSync;
  const inSplit = useInSplitList();
  urlSync = urlSync && !inSplit;

  // The All ↔ Drafts sub-tabs reuse one list component with different built-in sets, so the built-ins
  // are no longer static per list — track them by id so `views` recomputes when the set changes.
  const builtInKey = builtIns.map((v) => v.id).join(',');
  const memoryKey = listMemoryKey(list, builtIns.map((v) => v.id));
  // The URL wins when it names a view or filter; otherwise pick up where this list was left.
  const [recalled] = useState(() => {
    if (!remember) return undefined;
    if (urlSync && (params.has('view') || params.has('filter') || params.has('f'))) return undefined;
    return recallList(memoryKey);
  });
  const views = useMemo<ListView[]>(
    () => [
      ...builtIns.map((v) => ({ ...v, sort: v.sort ?? defaultSort, builtIn: true })),
      ...(saved ?? []).filter((p) => p.list === list).map((p) => ({ ...p, builtIn: false })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, list, builtInKey],
  );

  const [viewId, setViewId] = useState(() => recalled?.viewId ?? (urlSync ? params.get('view') : null) ?? builtIns[0].id);
  const current = views.find((v) => v.id === viewId);

  const [filter, setFilter] = useState<FilterGroup>(() => {
    if (recalled) return recalled.filter;
    if (urlSync) {
      const fromUrl = params.get('filter');
      const parsed = fromUrl ? parseFilter(fromUrl, fields) : undefined;
      if (parsed?.ok) return parsed.filter;
      // Links from before AIP-160 text carry the old compact JSON in `?f=`.
      const legacy = params.get('f');
      if (legacy) return decodeFilter(legacy);
    }
    return builtIns.find((v) => v.id === viewId)?.filter ?? builtIns[0].filter;
  });
  const [sort, setSort] = useState<TableSort | null>(() => (recalled ? recalled.sort : defaultSort));

  // A saved preset in the URL loads asynchronously: adopt its filter/sort once it arrives.
  // A remembered view comes with its own filter and sort, so there is nothing to adopt.
  const [adopted, setAdopted] = useState(() => !urlSync || !!recalled || builtIns.some((v) => v.id === viewId));
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

  // When the page swaps its built-in set (the All ↔ Drafts sub-tabs reuse the same list component,
  // so React keeps this state rather than remounting), a selected view that no longer exists snaps
  // back to the default — otherwise its stale `?view=` lingers on the other sub-tab's URL. Done in
  // render (not an effect) so the invalid view never reaches the URL-sync effect below.
  if (saved !== undefined && adopted && !views.some((v) => v.id === viewId)) {
    setViewId(builtIns[0].id);
    setFilter(builtIns[0].filter);
  }

  const viewFilter = useMemo(
    () => encodeFilter(current?.filter ?? { match: 'all', rules: [] }),
    [current],
  );
  const encoded = useMemo(() => encodeFilter(filter), [filter]);
  const edited = !!current && (encoded !== viewFilter || !sameSort(sort, current.sort));

  // Mirror the view and any unsaved filter to the URL.
  const filterParam = useMemo(
    () => (encoded !== viewFilter ? formatFilter(filter, fields) : ''),
    [encoded, viewFilter, filter, fields],
  );
  const viewParam = viewId === builtIns[0].id ? '' : viewId;
  useEffect(() => {
    if (!urlSync) return;
    const next = new URLSearchParams(params);
    const put = (key: string, value: string) => (value ? next.set(key, value) : next.delete(key));
    put('view', viewParam);
    put('filter', filterParam);
    next.delete('f');
    // Only when it changes: even an unchanged replace is a navigation, and it drops the state the
    // page was opened with — the "saved" / "rejected" notice a detail page sends back to its list.
    // Keep that state when the restored filter is written back on arrival.
    if (next.toString() !== params.toString()) setParams(next, { replace: true, state: location.state });
  }, [urlSync, viewParam, filterParam, params, setParams, location.state]);

  useEffect(() => {
    if (remember && adopted) rememberList(memoryKey, { viewId, filter, sort });
  }, [remember, adopted, memoryKey, viewId, filter, sort]);

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
    memoryKey: remember ? memoryKey : undefined,
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

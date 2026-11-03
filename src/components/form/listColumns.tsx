import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Dropdown, Icon, IconButton, Link, Text, useDropdown, type TableColumn } from '@jasperlepardo/sikat-design-system';

/**
 * A list-page column that can be reordered and shown/hidden through the column
 * manager. `defaultHidden` starts it in the "All columns" pane; `locked` keeps it
 * always shown (no remove button) — e.g. the record's identifier column.
 */
export type ListColumn<T> = TableColumn<T> & {
  defaultHidden?: boolean;
  locked?: boolean;
};

/**
 * Per-list column order + visibility, persisted under `sikat-ui:` (not `sikat-erp:`)
 * so a seed-version bump leaves the layout untouched — same convention as the
 * document-table column prefs.
 */
const STORAGE_PREFIX = 'sikat-ui:listcols:';

interface Layout {
  order: string[];
  hidden: string[];
  /** The default column order when this layout was saved. When the code's default order has
   *  changed since, the new default order wins (the user's hidden columns are kept). */
  base?: string[];
}

function load(listKey: string): Layout | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + listKey);
    if (raw) return JSON.parse(raw) as Layout;
  } catch {
    /* storage unavailable — fall back to defaults */
  }
  return null;
}

function store(listKey: string, layout: Layout): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + listKey, JSON.stringify(layout));
  } catch {
    /* storage unavailable — layout stays in-session only */
  }
}

export interface ListColumns<T> {
  /** Visible columns, in the user's order — pass straight to `Table`. */
  columns: ListColumn<T>[];
  /** The column-manager button (▦) and its two-pane popover. */
  manager: ReactNode;
}

/**
 * Owns the column order + visibility for one list page and renders the column
 * manager. Pass the full superset of columns (tagging `defaultHidden` / `locked`);
 * the hook persists the layout and hands back the visible, ordered subset.
 *
 * New filter UX — see `docs/list-filter-ux-plan.md`.
 */
export function useListColumns<T>(listKey: string, allColumns: ListColumn<T>[]): ListColumns<T> {
  const defaults = useMemo<Layout>(
    () => ({ order: allColumns.map((c) => c.key), hidden: allColumns.filter((c) => c.defaultHidden).map((c) => c.key) }),
    [allColumns],
  );
  const [layout, setLayout] = useState<Layout>(() => {
    const saved = load(listKey);
    if (!saved) return defaults;
    return saved.base?.join() === defaults.order.join() ? saved : { order: defaults.order, hidden: saved.hidden };
  });
  const update = (next: Layout) => {
    setLayout(next);
    store(listKey, { ...next, base: defaults.order });
  };

  const byKey = useMemo(() => new Map(allColumns.map((c) => [c.key, c])), [allColumns]);
  // Persisted order (dropping columns that no longer exist). A column added since the layout was
  // saved goes in after the column it follows in `allColumns`, not at the end.
  const orderedKeys = layout.order.filter((k) => byKey.has(k));
  allColumns.forEach((c, i) => {
    if (orderedKeys.includes(c.key)) return;
    const after = i > 0 ? orderedKeys.indexOf(allColumns[i - 1].key) : -1;
    orderedKeys.splice(after + 1, 0, c.key);
  });
  const hidden = new Set(layout.hidden);
  const columns = orderedKeys.filter((k) => !hidden.has(k)).map((k) => byKey.get(k)!);

  const show = (key: string, on: boolean) => {
    const next = new Set(hidden);
    on ? next.delete(key) : next.add(key);
    update({ order: orderedKeys, hidden: [...next] });
  };
  const move = (key: string, beforeKey: string | null) => {
    const rest = orderedKeys.filter((k) => k !== key);
    const at = beforeKey ? rest.indexOf(beforeKey) : rest.length;
    rest.splice(at < 0 ? rest.length : at, 0, key);
    update({ order: rest, hidden: [...hidden] });
  };
  const reset = () => update(defaults);

  const isDefault = orderedKeys.join() === defaults.order.join()
    && defaults.hidden.length === hidden.size && defaults.hidden.every((k) => hidden.has(k));

  const manager = (
    <ColumnManager
      active={orderedKeys.filter((k) => !hidden.has(k)).map((k) => byKey.get(k)!)}
      inactive={orderedKeys.filter((k) => hidden.has(k)).map((k) => byKey.get(k)!)}
      onShow={show}
      onMove={move}
      onReset={isDefault ? undefined : reset}
    />
  );

  return { columns, manager };
}

function ColumnManager<T>({
  active,
  inactive,
  onShow,
  onMove,
  onReset,
}: {
  active: ListColumn<T>[];
  inactive: ListColumn<T>[];
  onShow: (key: string, on: boolean) => void;
  onMove: (key: string, beforeKey: string | null) => void;
  onReset?: () => void;
}) {
  const { open, toggle, rootRef, panelRef, anchor, side, hSide } = useDropdown();
  const [drag, setDrag] = useState<string | null>(null);

  const onDrop = (beforeKey: string | null) => (e: DragEvent) => {
    e.preventDefault();
    if (drag) onMove(drag, beforeKey);
    setDrag(null);
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <IconButton
        label="Columns"
        intent="default"
        variant="ghost"
        size="small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon size={20}>view_column</Icon>
      </IconButton>
      {open && anchor ? (
        <Dropdown
          ref={panelRef}
          role="menu"
          anchor={anchor}
          side={side}
          hSide={hSide}
          style={{ width: 460 }}
          header={
            onReset ? (
              <div className="flex items-center justify-end px-3 py-1">
                <Link intent="primary" onClick={onReset}>
                  Reset to default
                </Link>
              </div>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-4 p-3" onDragOver={(e) => e.preventDefault()}>
            <section className="flex flex-col gap-1">
              <Text variant="small" tone="muted">Active columns</Text>
              {active.map((c) => (
                <div
                  key={c.key}
                  draggable
                  onDragStart={() => setDrag(c.key)}
                  onDragEnd={() => setDrag(null)}
                  onDrop={onDrop(c.key)}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-subtle"
                >
                  <Icon size={16}>drag_indicator</Icon>
                  <Text variant="small" className="flex-1 truncate">{c.header}</Text>
                  {c.locked ? null : (
                    <IconButton label={`Hide ${String(c.header)}`} intent="default" variant="ghost" size="2xs" onClick={() => onShow(c.key, false)}>
                      <Icon size={16}>remove_circle</Icon>
                    </IconButton>
                  )}
                </div>
              ))}
              {/* Drop at the end of the list. */}
              <div className="h-2" onDrop={onDrop(null)} onDragOver={(e) => e.preventDefault()} />
            </section>
            <section className="flex flex-col gap-1">
              <Text variant="small" tone="muted">All columns</Text>
              {inactive.length === 0 ? (
                <Text tone="muted" className="px-2 py-1.5">All columns shown.</Text>
              ) : (
                inactive.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-subtle">
                    <Text variant="small" className="flex-1 truncate">{c.header}</Text>
                    <IconButton label={`Show ${String(c.header)}`} intent="default" variant="ghost" size="2xs" onClick={() => onShow(c.key, true)}>
                      <Icon size={16}>add_circle</Icon>
                    </IconButton>
                  </div>
                ))
              )}
            </section>
          </div>
        </Dropdown>
      ) : null}
    </div>
  );
}

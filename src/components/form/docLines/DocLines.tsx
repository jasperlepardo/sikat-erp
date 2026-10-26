import { useState, type ReactNode } from 'react';
import { Combobox, Link, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../DataTable';
import { useColumnPrefs, type PrefColumn } from '../columnPrefs';
import { RowMenu } from '../RowMenu';
import { LineItemText } from '../LineItemText';

/**
 * The minimal constraint the shared table and column builders need: a stable row id
 * and the item foreign key (columns render nothing until an item is picked). Shared
 * across purchasing and sales line-item tables.
 */
export type DocLineBase = { id: string; itemId: string };

type ComboOption = { value: string; label: ReactNode; text?: string };

/**
 * Config for the shared item cell + actions column. When supplied, `DocLines`
 * owns the layout every lines table repeats — the item lookup/description
 * cell (first column), the inline add-row, the ⋯ row menu (Edit / Change / Remove,
 * last column), and the edit state — so cards don't re-author it. The document just
 * supplies these callbacks.
 */
export interface ItemCellConfig<T> {
  /** Item-picker options for a line (pass the line's current itemId to keep it selectable). */
  options: (current: string) => ComboOption[];
  /** The line's item identity, or null when no item is picked yet. */
  resolve: (line: T) => { itemNo: string; name: string } | null;
  /** The line's editable description. */
  description: (line: T) => string;
  /** Mark the item picker invalid (validation). */
  invalid?: (line: T) => boolean;
  /** Inline validation message shown under the item picker. */
  errorText?: (line: T) => string | undefined;
  /** Pick or clear the item on a line (null = cleared via "Change item"). */
  onPick: (line: T, itemId: string | null) => void;
  /** Write the edited description. */
  onDescription: (line: T, value: string) => void;
  /** Build a new line from an item id, for the add-row. */
  fromItem: (itemId: string) => T | undefined;
  /** Append a newly-built line. */
  onAdd: (line: T) => void;
  /** Remove a single line (the ⋯ menu's "Remove line"). */
  onRemoveLine: (line: T) => void;
  /** Whether "Change item"/"Remove line" are offered (e.g. copied lines keep their item). Default: true. */
  canChange?: (line: T) => boolean;
  /** Extra note under the item cell (e.g. the vendor catalog no.). */
  hint?: (line: T) => ReactNode;
  /** Disable the add-row (e.g. until a vendor is picked). */
  addDisabled?: boolean;
  header?: string;
  width?: string;
  addPlaceholder?: string;
}

/**
 * The shared contents-table shell for line documents (purchasing + sales). It owns the
 * parts every line card repeats: the per-document column-visibility engine (`useColumnPrefs`),
 * the `DataTable` wiring, the totals footer, read-only handling — and, when an `item`
 * config is supplied, the item cell, inline add-row, ⋯ actions menu and edit state.
 * The document supplies its own middle `columns` (via the `docColumns` builders)
 * and services. See `docs/purchasing-lines-table-unification.md`.
 */
export interface DocLinesProps<T extends DocLineBase> {
  /** Column-prefs key, one per document type: 'pr', 'rfq', 'po', 'gr', 'qt', 'so', … */
  prefsKey: string;
  /** The middle columns (doc-specific + catalog). The item + actions columns are added when `item` is set. */
  columns: PrefColumn<T>[];
  rows: T[];
  getRowId?: (row: T) => string;
  icon?: string;
  title?: string;
  description?: ReactNode;
  empty: ReactNode;
  /** Locks editing: the item cell, add-row and ⋯ menu are hidden/disabled. */
  readOnly?: boolean;
  /** Bulk (checkbox) remove handler; omit to hide it. */
  onRemove?: (picked: T[]) => void;
  /** Shared item cell + actions + add-row. Omit to let the card pass its own `addRow`/`menuColumn`. */
  item?: ItemCellConfig<T>;
  /** Inline add-row control; used only when `item` is not supplied. */
  addRow?: ReactNode;
  /** Totals footer (usually `<PurchTotalsFooter>` / `<SalesTotalsFooter>`). */
  footer?: ReactNode;
  /** Content rendered above the table, inside the card wrapper (e.g. a summary-type picker). */
  header?: ReactNode;
  /** Keys that stay sortable; every other visible column becomes unsortable. Default: all sortable. */
  sortableKeys?: string[];
  sortValue?: (row: T, key: string) => string | number;
  /** Fold the settings menu into this column's header. Defaults to the actions column when `item` is set. */
  menuColumn?: string;
  /** Contents tables don't paginate by default. */
  noPagination?: boolean;
}

export function DocLines<T extends DocLineBase>({
  prefsKey,
  columns,
  rows,
  getRowId = (row) => row.id,
  icon,
  title,
  description,
  empty,
  readOnly = false,
  onRemove,
  item,
  addRow,
  footer,
  header,
  sortableKeys,
  sortValue,
  menuColumn,
  noPagination = true,
}: DocLinesProps<T>) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const stopEditing = (id: string) => setEditing((s) => { const n = new Set(s); n.delete(id); return n; });

  // The shared item cell (first column): pick → edit description → read-only display.
  const itemColumn: PrefColumn<T> | null = item
    ? {
        key: 'item',
        header: item.header ?? 'Item / Description',
        cell: (l: T) => {
          const r = item.resolve(l);
          const width = item.width ?? 'w-64';
          if (!r) {
            const error = item.errorText?.(l);
            return (
              <div className={`flex flex-col gap-1 ${width} whitespace-normal`}>
                <Combobox aria-label="Item No." placeholder="Search items" options={item.options(l.itemId)} value={l.itemId || null} invalid={item.invalid?.(l)} onValueChange={(v) => item.onPick(l, v)} />
                {error ? <Text variant="small" tone="danger">{error}</Text> : null}
              </div>
            );
          }
          if (editing.has(l.id) && !readOnly) {
            return (
              <div className={`flex flex-col gap-1 ${width} whitespace-normal`}>
                <Text variant="caption">{r.itemNo}</Text>
                <TextField aria-label="Description" placeholder="Description" value={item.description(l)} onChange={(e) => item.onDescription(l, e.currentTarget.value)} />
                <Link intent="primary" onClick={() => stopEditing(l.id)}>Done</Link>
              </div>
            );
          }
          return (
            <div className={`flex flex-col gap-1 ${width} whitespace-normal`}>
              <LineItemText itemNo={r.itemNo} description={item.description(l)} name={r.name} />
              {item.hint?.(l) ?? null}
            </div>
          );
        },
      }
    : null;

  // The shared ⋯ actions column (last): Edit description / Change item / Remove line.
  const actionsColumn: PrefColumn<T> | null = item
    ? {
        key: 'actions',
        header: '',
        align: 'end',
        cell: (l: T) => {
          if (readOnly || !item.resolve(l)) return null;
          const changeable = item.canChange?.(l) ?? true;
          return (
            <RowMenu
              label={`Actions for ${item.resolve(l)?.itemNo ?? 'line'}`}
              size="2xs"
              items={[
                { label: 'Edit description', icon: 'edit', onSelect: () => setEditing((s) => new Set(s).add(l.id)) },
                ...(changeable
                  ? [
                      { label: 'Change item', icon: 'swap_horiz', onSelect: () => { item.onPick(l, null); stopEditing(l.id); } },
                      { label: 'Remove line', icon: 'delete', onSelect: () => item.onRemoveLine(l) },
                    ]
                  : []),
              ]}
            />
          );
        },
      }
    : null;

  const allColumns: PrefColumn<T>[] = [
    ...(itemColumn ? [itemColumn] : []),
    ...columns,
    ...(actionsColumn ? [actionsColumn] : []),
  ];

  const effectiveMenuColumn = item ? 'actions' : menuColumn;
  const effectiveAddRow = item && !readOnly ? (
    <Combobox
      key={addKey}
      aria-label="Search items to add a line"
      placeholder={item.addPlaceholder ?? 'Search items to add a line…'}
      disabled={item.addDisabled}
      options={item.options('')}
      value={null}
      onValueChange={(id) => {
        const line = id ? item.fromItem(id) : undefined;
        if (!line) return;
        item.onAdd(line);
        setAddKey((k) => k + 1);
      }}
    />
  ) : addRow;

  const prefs = useColumnPrefs(prefsKey, allColumns);
  // Either fold the settings menu into a column header, or render it as a toolbar button.
  const visible = effectiveMenuColumn
    ? prefs.columns.map((c) => (c.key === effectiveMenuColumn ? { ...c, header: prefs.iconMenu } : c))
    : prefs.columns;
  const unsortable = sortableKeys
    ? visible.map((c) => c.key).filter((k) => !sortableKeys.includes(k))
    : undefined;

  return (
    <div className="flex flex-col gap-2">
      {header}
      <DataTable
        noPagination={noPagination}
        icon={icon}
        title={title}
        description={description}
        rows={rows}
        getRowId={getRowId}
        columns={visible}
        empty={empty}
        onRemove={readOnly ? undefined : onRemove}
        spanRow={effectiveAddRow}
        cardFooter={footer}
        {...(unsortable ? { unsortable } : {})}
        {...(sortValue ? { sortValue } : {})}
        {...(effectiveMenuColumn ? {} : { columnMenu: prefs.menu })}
      />
    </div>
  );
}

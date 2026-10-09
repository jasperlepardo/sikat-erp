import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Icon, Table, TableLink, Text, type TableColumn, type TableSort } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../../components/form/RowMenu';
import { holdsStock } from '../../../../mocks/itemMasters';
import { newItemWarehouse, type ItemWarehouse } from '../../../../mocks/items';
import { Stat } from '../../../../components/Stat';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { listVariants } from '../../../../services/items';
import { useAsync } from '../../../../services/useAsync';
import type { Draft } from './types';

const qty = (n: number) => n.toLocaleString('en-PH');

interface StockRow {
  /** Warehouse code, or `warehouse/bin` for a bin row. */
  id: string;
  kind: 'warehouse' | 'bin';
  /** The warehouse the row belongs to (its own code for a warehouse row). */
  warehouse: string;
  /** Warehouse or bin code. */
  code: string;
  name: string;
  /** Warehouse id, or bin id for a bin row: what the row's page opens. */
  recordId?: string;
  inStock: number;
  committed: number;
  ordered: number;
  available: number;
  /** Variants stocked here (parent items only). */
  variants: number;
  /** A bin-managed warehouse's bins holding the stock. */
  bins?: StockRow[];
}

const blankRow = (id: string, kind: StockRow['kind'], warehouse: string, code: string, name: string, recordId?: string): StockRow => ({
  id, kind, warehouse, code, name, recordId, inStock: 0, committed: 0, ordered: 0, available: 0, variants: 0,
});

const addStock = (row: StockRow, w: ItemWarehouse) => {
  row.inStock += w.inStock;
  row.committed += w.committed;
  row.ordered += w.ordered;
  row.available += w.inStock - w.committed + w.ordered;
  row.variants += 1;
};

/**
 * The item's stock per warehouse: in stock, committed, ordered and available. A bin-managed
 * warehouse expands to its bins. Per-bin quantities aren't tracked yet, so the stock counts as
 * sitting in the default bin (as in `binStock`).
 * A parent item has no stock of its own, so it sums its variants' warehouses, and its rows open
 * the warehouse's page. Otherwise rows open `WarehousePanel` (via `onOpen`) to edit the
 * preferred vendor and default bin.
 */
export function StockTab({
  draft,
  update,
  inv,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  inv: InventoryMasters;
  onOpen: (row: ItemWarehouse, isNew: boolean) => void;
}) {
  const navigate = useNavigate();
  const isParent = draft.variantAxes.length > 0;
  const variants = useAsync(() => (isParent && draft.id ? listVariants(draft.id) : Promise.resolve([])), [draft.id, isParent]);
  const [sort, setSort] = useState<TableSort | null>({ key: 'code', direction: 'asc' });
  const [selected, setSelected] = useState<string[]>([]);

  // A parent item keeps no stock itself (its variants do), so it isn't an inventory item.
  if (!draft.inventoryItem && !isParent) {
    return (
      <Text variant="small" tone="muted" className="p-4">
        Not an inventory item, so no stock is kept. Turn on Inventory item on the General tab to track stock.
      </Text>
    );
  }
  if (isParent && !variants) return <Text tone="muted" className="p-4">Loading stock…</Text>;

  // One row per warehouse, summed across variants for a parent item; bins nest under it.
  const sources = isParent ? (variants ?? []).map((v) => v.warehouses) : [draft.warehouses];
  const byCode = new Map<string, StockRow>();
  for (const list of sources) {
    for (const w of list) {
      const wh = inv.warehouses.find((x) => x.code === w.code);
      const row = byCode.get(w.code) ?? blankRow(w.code, 'warehouse', w.code, w.code, wh?.name ?? 'Unknown warehouse', wh?.id);
      addStock(row, w);
      if (wh?.binEnabled && w.defaultBinId) {
        const id = `${w.code}/${w.defaultBinId}`;
        let bin = row.bins?.find((b) => b.id === id);
        if (!bin) {
          const b = inv.bins.find((x) => x.warehouse === w.code && x.id === w.defaultBinId);
          bin = blankRow(id, 'bin', w.code, b?.code ?? w.defaultBinId, b?.description || 'Default bin', b?.id);
          row.bins = [...(row.bins ?? []), bin];
        }
        addStock(bin, w);
      }
      byCode.set(w.code, row);
    }
  }
  const rows = [...byCode.values()];
  const total = (key: 'inStock' | 'committed' | 'ordered' | 'available') => rows.reduce((n, r) => n + r[key], 0);
  const uom = draft.inventoryUom;
  const where = (n: number) => `Across ${n} warehouse${n === 1 ? '' : 's'}`;

  const dir = sort?.direction === 'asc' ? 1 : -1;
  const sortKey = sort?.key as keyof StockRow | undefined;
  const sortRows = (list: StockRow[]): StockRow[] =>
    sortKey
      ? [...list].sort((a, b) => {
          const x = a[sortKey] ?? '';
          const y = b[sortKey] ?? '';
          return (x < y ? -1 : x > y ? 1 : 0) * dir;
        })
      : list;
  const sorted = sortRows(rows).map((r) => (r.bins ? { ...r, bins: sortRows(r.bins) } : r));
  const openPage = (r: StockRow) =>
    r.recordId && navigate(`/inventory/warehouses-and-bins/${r.kind === 'bin' ? 'bin-locations' : 'warehouses'}/${r.recordId}`);
  // A row opens its warehouse's panel, where the default bin is set too. A parent item has no
  // warehouse rows of its own, so its rows open the warehouse's or bin's page instead.
  const open = (r: StockRow) => {
    const w = isParent ? undefined : draft.warehouses.find((x) => x.code === r.warehouse);
    if (w) onOpen(w, false);
    else openPage(r);
  };
  const free = inv.warehouses.filter((w) => w.active && holdsStock(w) && !draft.warehouses.some((x) => x.code === w.code));
  const busy = (r: StockRow) => r.inStock + r.committed + r.ordered > 0;
  // Selected rows still on the item, and those that can go (no stock or open documents).
  // Only warehouse rows count: bins go with their warehouse.
  const liveSelection = selected.filter((id) => rows.some((r) => r.id === id));
  const removable = rows.filter((r) => liveSelection.includes(r.code) && !busy(r));
  const removeSelected = () => {
    const codes = removable.map((r) => r.code);
    update({ warehouses: draft.warehouses.filter((w) => !codes.includes(w.code)) });
    setSelected([]);
  };
  const figure = (n: number) => <span className={`tabular-nums ${n < 0 ? 'text-danger' : n === 0 ? 'text-muted' : ''}`}>{qty(n)}</span>;

  const columns: TableColumn<StockRow>[] = [
    {
      key: 'code',
      header: 'Location',
      cell: (r) => <span className="whitespace-nowrap">{r.code}</span>,
    },
    // The name shares the Location header; sorting is on the code.
    {
      key: 'name',
      header: '',
      sortable: false,
      cell: (r) => (
        <span className="whitespace-nowrap">
          <TableLink onClick={() => open(r)}>{r.name}</TableLink>
        </span>
      ),
    },
    ...(isParent ? [{ key: 'variants', header: 'Variants', cell: (r: StockRow) => qty(r.variants) }] : []),
    { key: 'inStock', header: `In stock (${uom})`, cell: (r) => figure(r.inStock) },
    { key: 'committed', header: 'Committed', cell: (r) => figure(r.committed) },
    { key: 'ordered', header: 'Ordered', cell: (r) => figure(r.ordered) },
    { key: 'available', header: 'Available', cell: (r) => figure(r.available) },
    ...(isParent
      ? []
      : [
          {
            key: 'actions',
            header: '',
            sortable: false,
            cell: (r: StockRow) =>
              r.kind === 'bin' ? null : (
                <RowMenu
                  label={`Actions for ${r.code}`}
                  items={[
                    { label: 'Edit', icon: 'edit', onSelect: () => open(r) },
                    {
                      label: 'Open warehouse',
                      icon: 'open_in_new',
                      disabled: !r.recordId,
                      onSelect: () => openPage(r),
                    },
                    {
                      label: busy(r) ? 'Remove (has stock or open documents)' : 'Remove',
                      icon: 'delete',
                      disabled: busy(r),
                      onSelect: () => update({ warehouses: draft.warehouses.filter((x) => x.code !== r.code) }),
                    },
                  ]}
                />
              ),
          },
        ]),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
        <Stat icon="inventory_2" label="In stock" value={`${qty(total('inStock'))} ${uom}`} sub={where(rows.length)} />
        <Stat icon="assignment" label="Committed" value={`${qty(total('committed'))} ${uom}`} sub="On open sales and production orders" />
        <Stat icon="local_shipping" label="Ordered" value={`${qty(total('ordered'))} ${uom}`} sub="On open purchase orders" />
        <Stat icon="task_alt" label="Available" value={`${qty(total('available'))} ${uom}`} sub="In stock − committed + ordered" />
      </div>

      {!isParent ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {liveSelection.length ? (
            <>
              <Text variant="small" tone="muted">
                {liveSelection.length} selected
              </Text>
              <Button
                type="button"
                intent="danger"
                variant="ghost"
                size="large"
                disabled={!removable.length}
                onClick={removeSelected}
              >
                {removable.length === liveSelection.length
                  ? 'Remove selected'
                  : `Remove ${removable.length} without stock or open documents`}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            intent="default"
            variant="outline"
            size="large"
            leadingIcon={<Icon size={18}>add</Icon>}
            disabled={!free.length}
            onClick={() => onOpen(newItemWarehouse(''), true)}
          >
            Add warehouse
          </Button>
        </div>
      ) : null}

      {/* Fills the rest of the panel; the table scrolls inside it. */}
      <Card className="min-h-72 flex-1">
        {rows.length ? (
          <Table
            caption="Stock by warehouse"
            columns={columns.map((c) => ({ sortable: true, ...c }))}
            rows={sorted}
            getRowId={(r) => r.id}
            getSubRows={(r) => r.bins}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            onRowAction={open}
            {...(!isParent ? { selectable: true, selectedIds: liveSelection, onSelectionChange: setSelected } : {})}
          />
        ) : (
          <Card.Content>
            <Text variant="small" tone="muted">
              {isParent ? 'No variant is stocked in any warehouse yet.' : 'Not stocked in any warehouse yet.'}
            </Text>
          </Card.Content>
        )}
      </Card>
    </div>
  );
}

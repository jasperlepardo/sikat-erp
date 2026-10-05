import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Card,
  Combobox,
  Icon,
  Panel,
  PanelHeader,
  Select,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Tabs,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../mocks/items';
import { formatAmount } from '../../services/format';
import { loadInventoryMasters } from '../../services/inventoryMasters';
import { isLowStock, listItems, stockTotals } from '../../services/items';
import { useAsync } from '../../services/useAsync';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../components/form/DataTable';
import { warehouseOptions } from './transfers/TransferLines';

/**
 * Stock on Hand — SAP B1's Inventory Status report: In Stock, Committed, Ordered and Available
 * per item and warehouse (OITW), or per item across all warehouses (OITM). Read-only; stock
 * changes through documents such as inventory transfers.
 */

type View = 'warehouse' | 'item';
type Filter = 'all' | 'low' | 'out';

interface Row {
  id: string;
  item: Item;
  /** '' on a per-item row (all warehouses). */
  warehouse: string;
  inStock: number;
  committed: number;
  ordered: number;
  /** In stock − Committed + Ordered, as on the item's Inventory Data tab. */
  available: number;
  /** In stock × item cost (PHP). */
  value: number;
}

const ITEMS_PATH = '/inventory/items';
const ALL_GROUPS = '';

const statusOf = (r: Row) =>
  r.inStock <= 0
    ? ({ label: 'Out of stock', intent: 'danger' } as const)
    : isLowStock(r.item)
      ? ({ label: 'Below minimum', intent: 'warning' } as const)
      : ({ label: 'In stock', intent: 'success' } as const);

export function StockOnHandPage() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listItems(), loadInventoryMasters()]), []);
  const [view, setView] = useState<View>('warehouse');
  const [filter, setFilter] = useState<Filter>('all');
  const [warehouse, setWarehouse] = useState('');
  const [group, setGroup] = useState(ALL_GROUPS);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'item', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [items, inv] = data ?? [undefined, undefined];
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  /** Every row for the view and warehouse, before the tab and search filters. */
  const base = useMemo<Row[]>(() => {
    const stocked = (items ?? []).filter((i) => i.inventoryItem && (!group || i.itemGroup === group));
    if (view === 'warehouse') {
      return stocked.flatMap((item) =>
        item.warehouses
          .filter((w) => !warehouse || w.code === warehouse)
          .map((w) => ({
            id: `${item.id}:${w.code}`,
            item,
            warehouse: w.code,
            inStock: w.inStock,
            committed: w.committed,
            ordered: w.ordered,
            available: w.inStock - w.committed + w.ordered,
            value: w.inStock * item.itemCost,
          })),
      );
    }
    return stocked.map((item) => {
      const t = stockTotals(item);
      return { id: item.id, item, warehouse: '', ...t, value: t.inStock * item.itemCost };
    });
  }, [items, view, warehouse, group]);

  const matches = (r: Row, f: Filter) => f === 'all' || (f === 'out' ? r.inStock <= 0 : r.inStock > 0 && isLowStock(r.item));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = base.filter(
      (r) =>
        matches(r, filter) &&
        (!q || `${r.item.itemNo} ${r.item.name} ${r.item.description} ${r.warehouse}`.toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: Row): string | number =>
      sort.key === 'item' ? r.item.itemNo : sort.key === 'warehouse' ? r.warehouse : (r[sort.key as keyof Row] as number);
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, filter, query, sort]);

  const count = (f: Filter) => (items ? String(base.filter((r) => matches(r, f)).length) : '');
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);
  const totals = rows.reduce(
    (t, r) => ({ inStock: t.inStock + r.inStock, available: t.available + r.available, value: t.value + r.value }),
    { inStock: 0, available: 0, value: 0 },
  );
  const whName = (code: string) => inv?.warehouses.find((w) => w.code === code)?.name ?? '';
  const qty = (n: number) => n.toLocaleString('en-PH');
  const open = (r: Row) => navigate(`${ITEMS_PATH}/${r.item.id}`);

  const columns: TableColumn<Row>[] = [
    {
      key: 'item',
      header: 'Item',
      sortable: true,
      cell: (r) => (
        <TableSubcontent subcopy={r.item.description}>
          <TableLink onClick={() => open(r)}>{r.item.itemNo}</TableLink>
        </TableSubcontent>
      ),
    },
    ...(view === 'warehouse'
      ? [
          {
            key: 'warehouse',
            header: 'Warehouse',
            sortable: true,
            cell: (r: Row) => <TableSubcontent subcopy={whName(r.warehouse)}>{r.warehouse}</TableSubcontent>,
          },
        ]
      : [
          {
            key: 'warehouses',
            header: 'Warehouses',
            cell: (r: Row) => {
              const holding = r.item.warehouses.filter((w) => w.inStock > 0);
              return (
                <TableSubcontent subcopy={holding.map((w) => `${w.code} ${qty(w.inStock)}`).join(' · ') || undefined}>
                  {holding.length} holding stock
                </TableSubcontent>
              );
            },
          },
        ]),
    { key: 'inStock', header: 'In stock', sortable: true, cell: (r) => `${qty(r.inStock)} ${r.item.inventoryUom}` },
    { key: 'committed', header: 'Committed', sortable: true, cell: (r) => qty(r.committed) },
    { key: 'ordered', header: 'Ordered', sortable: true, cell: (r) => qty(r.ordered) },
    {
      key: 'available',
      header: 'Available',
      sortable: true,
      cell: (r) => (view === 'item' ? <TableSubcontent subcopy={`Min ${qty(r.item.minStock)}`}>{qty(r.available)}</TableSubcontent> : qty(r.available)),
    },
    { key: 'value', header: 'Value at cost', sortable: true, cell: (r) => <TableAmount currency="PHP">{formatAmount(r.value)}</TableAmount> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => {
        const s = statusOf(r);
        return <TableStatus intent={s.intent}>{s.label}</TableStatus>;
      },
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="inventory"
        title="Stock on Hand"
        subcopy="In stock, committed, ordered and available — per warehouse or per item."
        tabs={
          <Tabs
            variant="outline"
            value={filter}
            onValueChange={(v) => resetPage(setFilter)(v as Filter)}
            items={[
              { value: 'all', label: 'All', badge: count('all') },
              { value: 'low', label: 'Below minimum', badge: count('low') },
              { value: 'out', label: 'Out of stock', badge: count('out') },
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <TextField
            aria-label="Search stock"
            placeholder="Search by item no., name or warehouse"
            leadingIcon={<Icon size={20}>search</Icon>}
            value={query}
            onChange={(e) => resetPage(setQuery)(e.currentTarget.value)}
          />
          <Select
            aria-label="View"
            className="md:w-44"
            options={[
              { value: 'warehouse', label: 'By warehouse' },
              { value: 'item', label: 'By item (all warehouses)' },
            ]}
            value={view}
            onValueChange={(v) => resetPage(setView)(v as View)}
          />
          <div className="md:w-64">
            <Combobox
              aria-label="Warehouse"
              placeholder="All warehouses"
              clearable
              disabled={view === 'item'}
              options={inv ? warehouseOptions(inv.warehouses, warehouse) : []}
              value={view === 'item' ? null : warehouse || null}
              onValueChange={(v) => resetPage(setWarehouse)(v ?? '')}
            />
          </div>
          <Select
            aria-label="Item group"
            className="md:w-44"
            options={[{ value: ALL_GROUPS, label: 'All item groups' }, ...(inv?.groups ?? []).map((g) => ({ value: g.name, label: g.name }))]}
            value={group}
            onValueChange={resetPage(setGroup)}
          />
        </div>
        {items ? (
          <Text variant="small" tone="muted">
            {qty(rows.length)} row{rows.length === 1 ? '' : 's'} · {qty(totals.inStock)} in stock · {qty(totals.available)} available · PHP{' '}
            {formatAmount(totals.value)} at cost
          </Text>
        ) : null}
        <Card className={fillCardClass(onPage.length)}>
          {items ? (
            <Table
              caption="Stock on hand"
              columns={columns}
              rows={onPage}
              getRowId={(r) => r.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{
                page,
                pageSize,
                total: rows.length,
                pageSizes: PAGE_SIZES,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading stock…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}

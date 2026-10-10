import { useMemo, useState, type ReactNode } from 'react';
import { binCodeOf, binLocations } from '../../services/binLocations';
import { useNavigate } from 'react-router';
import {
  Card,
  Combobox,
  Panel,
  PanelHeader,
  Select,
  Table,
  TableStatus,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../mocks/items';
import { formatAmount } from '../../services/format';
import { itemGroupName, loadInventoryMasters } from '../../services/inventoryMasters';
import { isLowStock, listItems, stockTotals } from '../../services/items';
import { useAsync } from '../../services/useAsync';
import { Stat } from '../../components/Stat';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../components/form/DataTable';
import { EMPTY_FILTER, oneRule } from '../../components/filter/engine';
import { choiceField, numberField, textField } from '../../components/filter/fieldKit';
import { useListPresets } from '../../components/filter/useListPresets';
import type { BuiltInView } from '../../components/filter/useListViews';
import { warehouseOptions } from './transfers/TransferLines';

/**
 * Stock on Hand — SAP B1's Inventory Status report: In Stock, Committed, Ordered and Available
 * per item (OITM), expanding to one row per warehouse (OITW) and, in bin-managed warehouses, per
 * bin. Read-only; stock changes through
 * documents such as inventory transfers.
 */

interface Row {
  id: string;
  item: Item;
  /** '' on an item row (all warehouses); the warehouse code on its child rows. */
  warehouse: string;
  /** The bin code on a bin row; '' otherwise. */
  bin: string;
  /** Warehouse rows under an item row; bin rows under a warehouse row. */
  children?: Row[];
  inStock: number;
  committed: number;
  ordered: number;
  /** In stock − Committed + Ordered, as on the item's Inventory Data tab. */
  available: number;
  /** In stock × item cost (PHP). */
  value: number;
}

/** Right-aligned numeric column (see `.table-num` in index.css). */
const numHeader = (label: string) => <span className="table-num">{label}</span>;
const num = (content: ReactNode) => <div className="table-num gap-1">{content}</div>;
/** A unit or currency beside a number, styled like a field's prefix/suffix. */
const affix = (text: string) => <span className="text-(--color-text-caption)">{text}</span>;

/** The item's full variant name, e.g. "AirTag, 1 pack". */
const itemName = (item: Item) => item.description || item.name;

/** A zero in a table cell: a muted dash, so the figures that matter stand out. */
const DASH = <span className="text-(--color-text-caption)">-</span>;

const ITEMS_PATH = '/inventory/items';
const ALL_GROUPS = '';

const statusOf = (r: Row) =>
  r.inStock <= 0
    ? ({ label: 'Out of stock', intent: 'danger' } as const)
    : !r.warehouse && isLowStock(r.item)
      ? ({ label: 'Below minimum', intent: 'warning' } as const)
      : ({ label: 'In stock', intent: 'success' } as const);

const STOCK_FIELDS = [
  textField<Row>('itemNo', 'Item no.', (r) => r.item.itemNo),
  textField<Row>('name', 'Item name', (r) => [r.item.name, r.item.description]),
  textField<Row>('itemGroup', 'Item group', (r) => itemGroupName(r.item.itemGroupId)),
  textField<Row>('warehouse', 'Warehouse', (r) => r.children?.map((c) => c.warehouse) ?? r.warehouse),
  choiceField<Row>('stockStatus', 'Stock status', ['In stock', 'Below minimum', 'Out of stock'], (r) => statusOf(r).label),
  numberField<Row>('inStock', 'In stock', (r) => r.inStock),
  numberField<Row>('committed', 'Committed', (r) => r.committed),
  numberField<Row>('ordered', 'Ordered', (r) => r.ordered),
  numberField<Row>('available', 'Available', (r) => r.available),
  numberField<Row>('value', 'Value at cost', (r) => r.value),
];

const STOCK_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All stock', filter: EMPTY_FILTER },
  { id: 'low', name: 'Below minimum', filter: oneRule('stockStatus', 'is', 'Below minimum') },
  { id: 'out', name: 'Out of stock', filter: oneRule('stockStatus', 'is', 'Out of stock') },
];

export function StockOnHandPage() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listItems(), loadInventoryMasters()]), []);
  const [warehouse, setWarehouse] = useState('');
  const [group, setGroup] = useState(ALL_GROUPS);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  /** Selected warehouse rows; the Table checks an item row when all its warehouses are. */
  const [selected, setSelected] = useState<string[]>([]);

  const [items, inv] = data ?? [undefined, undefined];
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  /** One row per item (totals over the shown warehouses), before the tab and search filters. */
  const base = useMemo<Row[]>(() => {
    const stocked = (items ?? []).filter((i) => i.inventoryItem && (!group || i.itemGroupId === group));
    return stocked.flatMap((item) => {
      const shown = item.warehouses.filter((w) => !warehouse || w.code === warehouse);
      if (warehouse && !shown.length) return [];
      const children = shown.map((w): Row => {
        const value = w.inStock * item.itemCost;
        return {
          id: `${item.id}:${w.code}`,
          item,
          warehouse: w.code,
          bin: '',
          inStock: w.inStock,
          committed: w.committed,
          ordered: w.ordered,
          available: w.inStock - w.committed + w.ordered,
          value,
          // Per-bin quantities aren't tracked yet: the warehouse's stock sits in its default bin
          // (as binStock() counts it). Committed and ordered are warehouse-level, so a bin has neither.
          children: w.defaultBinId
            ? [{ id: `${item.id}:${w.code}:${w.defaultBinId}`, item, warehouse: w.code, bin: binCodeOf(binLocations.snapshot(), w.defaultBinId), inStock: w.inStock, committed: 0, ordered: 0, available: 0, value }]
            : undefined,
        };
      });
      const t = stockTotals({ warehouses: shown });
      return [{ id: item.id, item, warehouse: '', bin: '', children, ...t, value: t.inStock * item.itemCost }];
    });
  }, [items, warehouse, group]);

  const whName = (code: string) => inv?.warehouses.find((w) => w.code === code)?.name ?? '';

  const rowLabel = (r: Row) => r.bin || (r.warehouse ? whName(r.warehouse) || r.warehouse : itemName(r.item));

  const presets = useListPresets({
    list: 'stock-on-hand',
    fields: STOCK_FIELDS,
    builtIns: STOCK_VIEWS,
    defaultSort: { key: 'item', direction: 'asc' },
    rows: items ? base : undefined,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(base).filter(
      (r) =>
        !q ||
        `${r.item.itemNo} ${r.item.name} ${r.item.description} ${r.children?.map((c) => `${c.warehouse} ${whName(c.warehouse)} ${c.children?.[0]?.bin ?? ''}`).join(' ')}`
          .toLowerCase()
          .includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: Row): string | number =>
      sort.key === 'item'
        ? rowLabel(r).toLowerCase()
        : sort.key === 'minStock'
          ? r.item.minStock
          : (r[sort.key as keyof Row] as number);
    const byKey = (a: Row, b: Row) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    };
    const sortTree = (list: Row[]): Row[] => list.map((r) => ({ ...r, children: r.children && sortTree(r.children) })).sort(byKey);
    return sortTree(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, presets.filter, query, sort, inv]);

  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);
  const totals = rows.reduce(
    (t, r) => ({
      inStock: t.inStock + r.inStock,
      committed: t.committed + r.committed,
      ordered: t.ordered + r.ordered,
      available: t.available + r.available,
      value: t.value + r.value,
    }),
    { inStock: 0, committed: 0, ordered: 0, available: 0, value: 0 },
  );
  /** Selected ids include fully-checked item rows and bins; count only the warehouse rows (`item:wh`). */
  const picked = selected.filter((id) => id.split(':').length === 2).length;
  const qty = (n: number) => n.toLocaleString('en-PH');
  const cellQty = (n: number) => (n ? qty(n) : DASH);
  const open = (r: Row) => navigate(`${ITEMS_PATH}/${r.item.id}`);

  const columns: TableColumn<Row>[] = [
    {
      key: 'item',
      header: 'Item / Warehouse / Bin',
      sortable: true,
      // Cells don't wrap, so a long name would widen the column and push Status off the card:
      // cap the width and let the name wrap instead.
      cell: (r) => <span className="block max-w-64 whitespace-normal">{rowLabel(r)}</span>,
    },
    { key: 'inStock', header: numHeader('In stock'), sortable: true, cell: (r) => num(r.inStock ? <>{qty(r.inStock)}{affix(r.item.inventoryUom)}</> : DASH) },
    { key: 'committed', header: numHeader('Committed'), sortable: true, cell: (r) => (r.bin ? null : num(cellQty(r.committed))) },
    { key: 'ordered', header: numHeader('Ordered'), sortable: true, cell: (r) => (r.bin ? null : num(cellQty(r.ordered))) },
    {
      key: 'available',
      header: numHeader('Available'),
      sortable: true,
      cell: (r) => (r.bin ? null : num(cellQty(r.available))),
    },
    {
      key: 'minStock',
      header: numHeader('Minimum'),
      sortable: true,
      // The minimum is set per item, so warehouse rows leave it blank.
      cell: (r) => (r.warehouse ? null : num(cellQty(r.item.minStock))),
    },
    {
      key: 'value',
      header: numHeader('Value at cost'),
      sortable: true,
      cell: (r) => num(r.value ? <>{affix('PHP')}{formatAmount(r.value)}</> : DASH),
    },
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
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        showSearch
        searchLabel="Search stock"
        searchPlaceholder="Search by item no., name, warehouse or bin"
        searchValue={query}
        onSearchChange={resetPage(setQuery)}
      />
      <Panel.Body className="flex flex-col gap-2">
        {presets.bar(
          <div className="flex gap-2">
            <div className="w-64">
              <Combobox
                aria-label="Warehouse"
                placeholder="All warehouses"
                clearable
                options={inv ? warehouseOptions(inv.warehouses, warehouse) : []}
                value={warehouse || null}
                onValueChange={(v) => resetPage(setWarehouse)(v ?? '')}
              />
            </div>
            <Select
              aria-label="Item group"
              className="w-44"
              options={[{ value: ALL_GROUPS, label: 'All item groups' }, ...(inv?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
              value={group}
              onValueChange={resetPage(setGroup)}
            />
          </div>,
        )}
        {items ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat icon="category" label="Items" value={qty(rows.length)} sub={warehouse || group !== ALL_GROUPS || query ? 'Matching the filters' : 'Stocked items'} />
            <Stat icon="inventory_2" label="In stock" value={qty(totals.inStock)} sub="Units on hand, inventory UoM" />
            <Stat icon="task_alt" label="Available" value={qty(totals.available)} sub={`${qty(totals.committed)} committed · ${qty(totals.ordered)} ordered`} />
            <Stat icon="payments" label="Value at cost" value={`PHP ${formatAmount(totals.value)}`} sub="In stock × item cost" />
          </div>
        ) : null}
        {picked ? (
          <Text variant="small" tone="muted">
            {qty(picked)} warehouse row{picked === 1 ? '' : 's'} selected
          </Text>
        ) : null}
        <Card className={fillCardClass(onPage.length)}>
          {items ? (
            <Table
              caption="Stock on hand"
              columns={columns}
              rows={onPage}
              getRowId={(r) => r.id}
              getSubRows={(r) => r.children}
              selectable
              selectedIds={selected}
              onSelectionChange={setSelected}
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
      {presets.panel}
    </Panel>
  );
}

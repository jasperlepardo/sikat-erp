import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../../mocks/items';
import { isValidToday, listItems, stockTotals } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { formatAmount } from '../../../services/format';
import { EMPTY_FILTER, oneRule } from '../../../components/filter/engine';
import { boolField, numberField, textField } from '../../../components/filter/fieldKit';
import { useListPresets } from '../../../components/filter/useListPresets';
import type { BuiltInView } from '../../../components/filter/useListViews';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';

const ITEM_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All items', filter: EMPTY_FILTER },
  { id: 'stocked', name: 'Inventory items', filter: oneRule('inventoryItem', 'isTrue') },
  { id: 'low', name: 'Low stock', filter: oneRule('lowStock', 'isTrue') },
  { id: 'services', name: 'Non-stock items', filter: oneRule('inventoryItem', 'isFalse') },
  { id: 'inactive', name: 'Items not valid today', filter: oneRule('valid', 'isFalse') },
];

type StockTotals = { inStock: number; committed: number; ordered: number; available: number };

/** Aggregate stock totals across all variants for parent items, or direct totals for standalone/variant items. */
function effectiveStock(item: Item, variantStockMap: Map<string, StockTotals>): StockTotals {
  if (item.variantAxes.length > 0) return variantStockMap.get(item.id) ?? { inStock: 0, committed: 0, ordered: 0, available: 0 };
  return stockTotals(item);
}

export function ItemList({ basePath = '/inventory/items' }: { basePath?: string }) {
  const navigate = useNavigate();
  const items = useAsync(listItems, []);

  // Aggregate stock totals for parent items, summed across all their variants.
  const variantStockMap = useMemo(() => {
    const map = new Map<string, StockTotals>();
    for (const i of items ?? []) {
      if (!i.parentItemId) continue;
      const t = stockTotals(i);
      const cur = map.get(i.parentItemId) ?? { inStock: 0, committed: 0, ordered: 0, available: 0 };
      map.set(i.parentItemId, {
        inStock: cur.inStock + t.inStock,
        committed: cur.committed + t.committed,
        ordered: cur.ordered + t.ordered,
        available: cur.available + t.available,
      });
    }
    return map;
  }, [items]);

  // Variant descriptions indexed by parent id, for search matching.
  const variantSearchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items ?? []) {
      if (!i.parentItemId) continue;
      const cur = map.get(i.parentItemId) ?? '';
      map.set(i.parentItemId, `${cur} ${i.itemNo} ${i.description} ${i.gtin} ${i.barcodes.map((b) => b.barcode).join(' ')}`);
    }
    return map;
  }, [items]);

  // Filter fields — stock fields use aggregate for parent items.
  const fields = useMemo(() => [
    textField<Item>('itemNo', 'Item no.', (i) => i.itemNo),
    textField<Item>('description', 'Description', (i) => i.description),
    textField<Item>('foreignName', 'Foreign name', (i) => i.foreignName),
    textField<Item>('itemGroup', 'Item group', (i) => i.itemGroup),
    textField<Item>('barcode', 'Barcode', (i) => [i.gtin, ...i.barcodes.map((b) => b.barcode)]),
    boolField<Item>('inventoryItem', 'Inventory item', (i) => i.variantAxes.length > 0 ? true : i.inventoryItem),
    boolField<Item>('valid', 'Valid today', (i) => isValidToday(i)),
    boolField<Item>('lowStock', 'Low stock', (i) => {
      if (!isValidToday(i)) return false;
      const stock = effectiveStock(i, variantStockMap);
      return i.minStock > 0 && stock.inStock <= i.minStock;
    }),
    numberField<Item>('inStock', 'In stock', (i) => effectiveStock(i, variantStockMap).inStock),
    numberField<Item>('available', 'Available', (i) => effectiveStock(i, variantStockMap).available),
    numberField<Item>('basePrice', 'Base price', (i) => i.basePrice),
  ], [variantStockMap]);

  const presets = useListPresets({
    list: 'items',
    fields,
    builtIns: ITEM_VIEWS,
    defaultSort: { key: 'description', direction: 'asc' },
    rows: items,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const q = normalize(query);
    const filtered = presets.apply(items ?? []).filter((i) => {
      if (i.parentItemId) return false; // hide variants from list
      if (!q) return true;
      const own = normalize([i.itemNo, i.description, i.foreignName, i.itemGroup, i.gtin, ...i.barcodes.map((b) => b.barcode)].join(' '));
      const variantText = normalize(variantSearchMap.get(i.id) ?? '');
      return own.includes(q) || variantText.includes(q);
    });
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let x: string | number;
      let y: string | number;
      if (sort.key === 'inStock') { x = effectiveStock(a, variantStockMap).inStock; y = effectiveStock(b, variantStockMap).inStock; }
      else if (sort.key === 'available') { x = effectiveStock(a, variantStockMap).available; y = effectiveStock(b, variantStockMap).available; }
      else { const v = a[sort.key as keyof Item]; const w = b[sort.key as keyof Item]; x = typeof v === 'number' ? v : String(v ?? '').toLowerCase(); y = typeof w === 'number' ? w : String(w ?? '').toLowerCase(); }
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [items, presets.filter, query, sort, variantStockMap, variantSearchMap]);

  const open = (i: Item) => navigate(`${basePath}/${i.id}`);

  const columns: TableColumn<Item>[] = [
    {
      key: 'description',
      header: 'Item',
      sortable: true,
      cell: (i) => (
        <TableSubcontent subcopy={i.itemNo}>
          <TableLink onClick={() => open(i)}>{i.description}</TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'itemGroup',
      header: 'Group',
      sortable: true,
      cell: (i) => <TableSubcontent subcopy={i.itemType === 'Items' ? undefined : i.itemType}>{i.itemGroup}</TableSubcontent>,
    },
    {
      key: 'inStock',
      header: 'In stock',
      sortable: true,
      cell: (i) => {
        if (i.variantAxes.length > 0) {
          const vc = items?.filter((x) => x.parentItemId === i.id).length ?? 0;
          return <span className="text-muted">{vc} variant{vc !== 1 ? 's' : ''}</span>;
        }
        if (!i.inventoryItem) return <span className="text-muted">Not stocked</span>;
        const s = effectiveStock(i, variantStockMap);
        return <TableSubcontent subcopy={`Min ${i.minStock}`}>{s.inStock.toLocaleString('en-PH')} {i.inventoryUom}</TableSubcontent>;
      },
    },
    {
      key: 'available',
      header: 'Available',
      sortable: true,
      cell: (i) => {
        if (i.variantAxes.length > 0) return '—';
        if (!i.inventoryItem) return '—';
        const a = effectiveStock(i, variantStockMap).available;
        return <span className={a < 0 ? 'text-danger' : undefined}>{a.toLocaleString('en-PH')}</span>;
      },
    },
    {
      key: 'basePrice',
      header: 'Base price',
      sortable: true,
      cell: (i) =>
        i.salesItem ? (
          <TableSubcontent subcopy={`per ${i.salesUom}`}>
            <TableAmount currency="PHP">{formatAmount(i.basePrice)}</TableAmount>
          </TableSubcontent>
        ) : (
          <span className="text-muted">Not sold</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => {
        if (i.variantAxes.length > 0) return <TableStatus intent="primary">Parent item</TableStatus>;
        if (!isValidToday(i)) return <TableStatus intent="default">Not valid</TableStatus>;
        if (!i.inventoryItem) return <TableStatus intent="primary">{i.itemType === 'Items' ? 'Non-stock' : i.itemType}</TableStatus>;
        const s = effectiveStock(i, variantStockMap);
        if (s.inStock === 0) return <TableStatus intent="danger">Out of stock</TableStatus>;
        if (i.minStock > 0 && s.inStock <= i.minStock) return <TableStatus intent="warning">Low stock</TableStatus>;
        return <TableStatus intent="success">In stock</TableStatus>;
      },
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search items"
        searchPlaceholder="Search by item no., description, group, barcode, or variant"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="inventory_2"
        title={presets.menu}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="extra-large"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${basePath}/new`)}
          >
            New item
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {presets.bar(null)}
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {items ? (
            <Table
              caption="Items"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(i) => i.id}
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
            <Text tone="muted" className="p-4">Loading items…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}

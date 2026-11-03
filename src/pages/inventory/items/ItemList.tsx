import { useCallback, useMemo } from 'react';
import {
  TableContent,
  TableStatus,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { ITEM_NOUN } from '../paths';
import type { Item } from '../../../mocks/items';
import { isValidToday, listItems, stockTotals } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { formatMoney } from '../../../services/format';
import { itemGroupName } from '../../../services/inventoryMasters';
import { EMPTY_FILTER, oneRule } from '../../../components/filter/engine';
import { boolField, numberField, textField } from '../../../components/filter/fieldKit';
import type { BuiltInView } from '../../../components/filter/useListViews';

const ITEM_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All items', filter: EMPTY_FILTER },
  { id: 'stocked', name: 'Inventory items', filter: oneRule('inventoryItem', 'isTrue') },
  { id: 'low', name: 'Low stock', filter: oneRule('lowStock', 'isTrue') },
  { id: 'services', name: 'Non-stock items', filter: oneRule('inventoryItem', 'isFalse') },
  { id: 'inactive', name: 'Items not valid today', filter: oneRule('valid', 'isFalse') },
];

type StockTotals = { inStock: number; committed: number; ordered: number; available: number };

function effectiveStock(item: Item, variantStockMap: Map<string, StockTotals>): StockTotals {
  if (item.variantAxes.length > 0) return variantStockMap.get(item.id) ?? { inStock: 0, committed: 0, ordered: 0, available: 0 };
  return stockTotals(item);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

export function ItemList({ basePath = '/inventory/items', compact = false, selectedId }: {
  basePath?: string;
  compact?: boolean;
  selectedId?: string;
}) {
  const items = useAsync(listItems, []);

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

  const variantSearchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items ?? []) {
      if (!i.parentItemId) continue;
      const cur = map.get(i.parentItemId) ?? '';
      map.set(i.parentItemId, `${cur} ${i.itemNo} ${i.description} ${i.gtin} ${i.barcodes.map((b) => b.barcode).join(' ')}`);
    }
    return map;
  }, [items]);

  const fields = useMemo(() => [
    textField<Item>('itemNo', 'Item no.', (i) => i.itemNo),
    textField<Item>('description', 'Description', (i) => i.description),
    textField<Item>('foreignName', 'Foreign name', (i) => i.foreignName),
    textField<Item>('itemGroup', 'Item group', (i) => itemGroupName(i.itemGroupId)),
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

  const allColumns = useMemo((): ListColumn<Item>[] => [
    {
      key: 'description',
      locked: true,
      header: 'Item',
      cell: (i) => (
        <TableContent href={`#${basePath}/${i.id}`}>{i.description}</TableContent>
      ),
    },
    { key: 'itemNo', header: 'Item no.', cell: (i) => i.itemNo || '—' },
    {
      key: 'itemGroupId',
      header: 'Group',
      cell: (i) => <TableContent subcopy={i.itemType === 'Items' ? undefined : i.itemType}>{itemGroupName(i.itemGroupId)}</TableContent>,
    },
    {
      key: 'inStock',
      header: 'In stock',
      align: 'end',
      cell: (i) => {
        if (i.variantAxes.length > 0) {
          const vc = items?.filter((x) => x.parentItemId === i.id).length ?? 0;
          return <span className="text-muted">{vc} variant{vc !== 1 ? 's' : ''}</span>;
        }
        if (!i.inventoryItem) return <span className="text-muted">Not stocked</span>;
        const s = effectiveStock(i, variantStockMap);
        return <TableContent subcopy={`Min ${i.minStock}`}>{s.inStock.toLocaleString('en-PH')} {i.inventoryUom}</TableContent>;
      },
    },
    {
      key: 'available',
      header: 'Available',
      align: 'end',
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
      align: 'end',
      cell: (i) =>
        i.salesItem ? (
          <TableContent subcopy={`per ${i.salesUom}`}>
            {formatMoney(i.basePrice)}
          </TableContent>
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
  ], [basePath, items, variantStockMap]);

  const { columns, manager } = useListColumns('items', allColumns);

  const filterFn = useCallback((i: Item, q: string) => {
    if (i.parentItemId) return false;
    if (!q) return true;
    const own = norm([i.itemNo, i.description, i.foreignName, itemGroupName(i.itemGroupId), i.gtin, ...i.barcodes.map((b) => b.barcode)].join(' '));
    const variantText = norm(variantSearchMap.get(i.id) ?? '');
    return own.includes(norm(q)) || variantText.includes(norm(q));
  }, [variantSearchMap]);

  const sortFn = useCallback((a: Item, b: Item, sort: TableSort) => {
    let x: string | number;
    let y: string | number;
    if (sort.key === 'inStock') { x = effectiveStock(a, variantStockMap).inStock; y = effectiveStock(b, variantStockMap).inStock; }
    else if (sort.key === 'available') { x = effectiveStock(a, variantStockMap).available; y = effectiveStock(b, variantStockMap).available; }
    else { const v = a[sort.key as keyof Item]; const w = b[sort.key as keyof Item]; x = typeof v === 'number' ? v : String(v ?? '').toLowerCase(); y = typeof w === 'number' ? w : String(w ?? '').toLowerCase(); }
    return x < y ? -1 : x > y ? 1 : 0;
  }, [variantStockMap]);

  return (
    <ListPage
      rows={items}
      columns={columns}
      fields={fields}
      noun={ITEM_NOUN}
      icon="inventory_2"
      basePath={basePath}
      listKey="items"
      builtIns={ITEM_VIEWS}
      defaultSort={{ key: 'description', direction: 'asc' }}
      search={{ placeholder: 'Search by item no., description, group, barcode, or variant', label: 'Search items' }}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      filterFn={filterFn}
      sortFn={sortFn}
    />
  );
}

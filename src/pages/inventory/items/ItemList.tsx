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
  TextField,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../../mocks/items';
import { isLowStock, isValidToday, listItems, stockTotals } from '../../../services/items';
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

const ITEM_FIELDS = [
  textField<Item>('itemNo', 'Item no.', (i) => i.itemNo),
  textField<Item>('description', 'Description', (i) => i.description),
  textField<Item>('foreignName', 'Foreign name', (i) => i.foreignName),
  textField<Item>('itemGroup', 'Item group', (i) => i.itemGroup),
  textField<Item>('barcode', 'Barcode', (i) => [i.gtin, ...i.barcodes.map((b) => b.barcode)]),
  boolField<Item>('inventoryItem', 'Inventory item', (i) => i.inventoryItem),
  boolField<Item>('valid', 'Valid today', (i) => isValidToday(i)),
  boolField<Item>('lowStock', 'Low stock', (i) => isValidToday(i) && isLowStock(i)),
  numberField<Item>('inStock', 'In stock', (i) => stockTotals(i).inStock),
  numberField<Item>('available', 'Available', (i) => stockTotals(i).available),
  numberField<Item>('basePrice', 'Base price', (i) => i.basePrice),
];

/** Sort key → comparable value. */
function sortValue(i: Item, key: string): string | number {
  if (key === 'inStock') return stockTotals(i).inStock;
  if (key === 'available') return stockTotals(i).available;
  const v = i[key as keyof Item];
  return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
}

export function ItemList({ basePath = '/inventory/items' }: { basePath?: string }) {
  const navigate = useNavigate();
  const items = useAsync(listItems, []);
  const fields = ITEM_FIELDS;
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
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(items ?? []).filter(
      (i) =>
        (!q ||
          [i.itemNo, i.description, i.foreignName, i.itemGroup, i.gtin, ...i.barcodes.map((b) => b.barcode)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [items, presets.filter, query, sort]);

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
      cell: (i) =>
        i.inventoryItem ? (
          <TableSubcontent subcopy={`Min ${i.minStock}`}>
            {stockTotals(i).inStock.toLocaleString('en-PH')} {i.inventoryUom}
          </TableSubcontent>
        ) : (
          <span className="text-muted">Not stocked</span>
        ),
    },
    {
      key: 'available',
      header: 'Available',
      sortable: true,
      cell: (i) => {
        if (!i.inventoryItem) return '—';
        const a = stockTotals(i).available;
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
      cell: (i) =>
        !isValidToday(i) ? (
          <TableStatus intent="default">Not valid</TableStatus>
        ) : !i.inventoryItem ? (
          <TableStatus intent="primary">{i.itemType === 'Items' ? 'Non-stock' : i.itemType}</TableStatus>
        ) : stockTotals(i).inStock === 0 ? (
          <TableStatus intent="danger">Out of stock</TableStatus>
        ) : isLowStock(i) ? (
          <TableStatus intent="warning">Low stock</TableStatus>
        ) : (
          <TableStatus intent="success">In stock</TableStatus>
        ),
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="inventory_2"
        title={presets.menu}
        subcopy="The item master: products, materials and services you buy, sell and stock."
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
        {presets.bar(
          <TextField
            aria-label="Search items"
            placeholder="Search by item no., description, group or barcode"
            leadingIcon={<Icon size={20}>search</Icon>}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setPage(1);
            }}
          />,
        )}
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

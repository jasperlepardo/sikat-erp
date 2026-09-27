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
  Tabs,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../../mocks/items';
import { isLowStock, isValidToday, listItems, stockTotals } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { formatAmount } from '../../../services/format';

type Filter = 'all' | 'stocked' | 'low' | 'services' | 'inactive';

const FILTERS: Record<Filter, (i: Item) => boolean> = {
  all: () => true,
  stocked: (i) => i.inventoryItem,
  low: (i) => isValidToday(i) && isLowStock(i),
  services: (i) => !i.inventoryItem,
  inactive: (i) => !isValidToday(i),
};

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  stocked: 'Inventory',
  low: 'Low stock',
  services: 'Non-stock',
  inactive: 'Not valid',
};

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
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'description', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (items ?? []).filter(
      (i) =>
        FILTERS[filter](i) &&
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
  }, [items, filter, query, sort]);

  const count = (f: Filter) => String(items?.filter(FILTERS[f]).length ?? '');
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
        title="Items"
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
        tabs={
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            items={(Object.keys(FILTERS) as Filter[]).map((f) => ({ value: f, label: FILTER_LABELS[f], badge: count(f) }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <TextField
          aria-label="Search items"
          placeholder="Search by item no., description, group or barcode"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card>
          {items ? (
            <Table
              caption="Items"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(i) => i.id}
              sort={sort}
              onSortChange={setSort}
              onRowAction={open}
              pagination={{
                page,
                pageSize,
                total: rows.length,
                pageSizes: [10, 25, 50],
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
            />
          ) : (
            <p className="p-4 text-muted">Loading items…</p>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}

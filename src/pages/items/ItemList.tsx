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
import type { Item } from '../../mocks/items';
import { isLowStock, listItems } from '../../services/items';
import { useAsync } from '../../services/useAsync';
import { formatAmount } from '../../services/format';

type Filter = 'all' | 'active' | 'inactive' | 'low';

const FILTERS: Record<Filter, (i: Item) => boolean> = {
  all: () => true,
  active: (i) => i.status === 'Active',
  inactive: (i) => i.status === 'Inactive',
  low: (i) => i.status === 'Active' && isLowStock(i),
};

export function ItemList() {
  const navigate = useNavigate();
  const items = useAsync(listItems, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (items ?? []).filter(
      (i) => FILTERS[filter](i) && (!q || `${i.sku} ${i.name} ${i.category}`.toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const key = sort.key as keyof Item;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => (a[key]! < b[key]! ? -dir : a[key]! > b[key]! ? dir : 0));
  }, [items, filter, query, sort]);

  const count = (f: Filter) => String(items?.filter(FILTERS[f]).length ?? '');
  const open = (i: Item) => navigate(`/items/${i.id}`);

  const columns: TableColumn<Item>[] = [
    {
      key: 'name',
      header: 'Item',
      sortable: true,
      cell: (i) => (
        <TableSubcontent subcopy={i.sku}>
          <TableLink onClick={() => open(i)}>{i.name}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, cell: (i) => i.category },
    {
      key: 'onHand',
      header: 'On hand',
      sortable: true,
      cell: (i) => (
        <TableSubcontent subcopy={`Reorder at ${i.reorderLevel}`}>
          {i.onHand} {i.uom}
        </TableSubcontent>
      ),
    },
    {
      key: 'unitPrice',
      header: 'Unit price',
      sortable: true,
      cell: (i) => <TableAmount currency="PHP">{formatAmount(i.unitPrice)}</TableAmount>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) =>
        i.status === 'Inactive' ? (
          <TableStatus intent="default">Inactive</TableStatus>
        ) : i.onHand === 0 ? (
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
        subcopy="Products and materials you buy, sell, and stock."
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="extra-large"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate('/items/new')}
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
            items={[
              { value: 'all', label: 'All', badge: count('all') },
              { value: 'active', label: 'Active', badge: count('active') },
              { value: 'low', label: 'Low stock', badge: count('low') },
              { value: 'inactive', label: 'Inactive', badge: count('inactive') },
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <TextField
          aria-label="Search items"
          placeholder="Search by name, SKU, or category"
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

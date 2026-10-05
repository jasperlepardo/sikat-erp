import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
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
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { COUNT_STATUSES, type CountStatus, type InventoryCounting } from '../../../mocks/inventoryCountings';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { countNumber, countSummary, countWarehouses, listCountings } from '../../../services/inventoryCountings';
import { listItems } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { COUNT_LIST_PATH, COUNT_STATUS_INTENT } from './StockCountDetail';

type Filter = 'all' | CountStatus;

export function StockCountList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listCountings(), listItems()]), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'countDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const counts = data?.[0];
  const items = data?.[1] ?? [];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (counts ?? []).filter(
      (c) =>
        (filter === 'all' || c.status === filter) &&
        (!q ||
          [countNumber(c), c.counter, c.reference, c.remarks, ...countWarehouses(c), ...c.lines.map((l) => `${l.itemNo} ${l.name}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (c: InventoryCounting): string | number =>
      sort.key === 'value' ? countSummary(c, items).value : sort.key === 'docNum' ? c.docNum : String(c[sort.key as keyof InventoryCounting] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [counts, items, filter, query, sort]);

  const open = (c: InventoryCounting) => navigate(`${COUNT_LIST_PATH}/${c.id}`);
  const count = (f: Filter) => String(counts?.filter((c) => f === 'all' || c.status === f).length ?? '');
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<InventoryCounting>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (c) => <TableLink onClick={() => open(c)}>{countNumber(c)}</TableLink> },
    {
      key: 'warehouses',
      header: 'Warehouse',
      cell: (c) => <TableSubcontent subcopy={c.remarks || undefined}>{countWarehouses(c).join(', ') || '—'}</TableSubcontent>,
    },
    { key: 'countDate', header: 'Count date', sortable: true, cell: (c) => formatDate(c.countDate) },
    { key: 'counter', header: 'Counted by', sortable: true, cell: (c) => c.counter },
    {
      key: 'progress',
      header: 'Counted',
      cell: (c) => {
        const s = countSummary(c, items);
        return (
          <TableSubcontent subcopy={s.withVariance ? `${s.withVariance} with variance` : undefined}>
            {s.counted} of {s.lines}
          </TableSubcontent>
        );
      },
    },
    {
      key: 'value',
      header: 'Net variance',
      sortable: true,
      cell: (c) => <TableAmount currency="PHP">{formatAmount(countSummary(c, items).value)}</TableAmount>,
    },
    { key: 'status', header: 'Status', sortable: true, cell: (c) => <TableStatus intent={COUNT_STATUS_INTENT[c.status]}>{c.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="inventory"
        title="Stock Counts"
        subcopy="Physical counts compared with In Stock. Posting a count sets stock to what was counted and books the difference at cost."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${COUNT_LIST_PATH}/new`)}>
            New count
          </Button>
        }
        tabs={
          <Tabs
            variant="outline"
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            items={(['all', ...COUNT_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        <TextField
          aria-label="Search counts"
          placeholder="Search by count no., warehouse, counter, item or remarks"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card className={fillCardClass(onPage.length)}>
          {counts ? (
            <Table
              caption="Stock counts"
              columns={columns}
              rows={onPage}
              getRowId={(c) => c.id}
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
            <Text tone="muted" className="p-4">Loading counts…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}

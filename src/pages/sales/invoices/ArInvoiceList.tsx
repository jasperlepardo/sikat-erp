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
import { AR_STATUSES, type ArInvoice, type ArStatus } from '../../../mocks/arInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { arNumber, arTotal, listArInvoices } from '../../../services/arInvoices';
import { useAsync } from '../../../services/useAsync';
import { AR_STATUS_INTENT } from './detail/ArInvoiceDetail';
import { AR_LIST_PATH } from './detail/types';

type Filter = 'all' | ArStatus;

export function ArInvoiceList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listArInvoices(), taxCodes.list()]), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'postingDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (so: ArInvoice) => arTotal(so, codes);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (orders ?? []).filter(
      (so) =>
        (filter === 'all' || so.status === filter) &&
        (!q || [arNumber(so), so.customerCode, so.customerName, so.customerRef, so.orderNumber, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (so: ArInvoice): string | number => (sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof ArInvoice] ?? ''));
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, query, sort, codes]);

  const open = (so: ArInvoice) => navigate(`${AR_LIST_PATH}/${so.id}`);
  const count = (f: Filter) => String(orders?.filter((so) => f === 'all' || so.status === f).length ?? '');
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<ArInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableSubcontent subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>
          <TableLink onClick={() => open(so)}>{arNumber(so)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableSubcontent subcopy={so.customerCode}>{so.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (so) => formatDate(so.postingDate) },
    { key: 'orderNumber', header: 'Order', cell: (so) => so.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (so) => formatDate(so.dueDate) },
    { key: 'total', header: 'Total', sortable: true, cell: (so) => <TableAmount currency={so.currency}>{formatAmount(totalOf(so))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={AR_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="receipt"
        title="Sales Orders"
        subcopy="A/R invoices: billing customers for deliveries, orders or services. Adding one posts the receivable, revenue and output VAT."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${AR_LIST_PATH}/new`)}>
            New A/R invoice
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
            items={(['all', ...AR_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
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
          aria-label="Search invoices"
          placeholder="Search by invoice no., customer, order or item"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card className={fillCardClass(onPage.length)}>
          {orders ? (
            <Table
              caption="A/R invoices"
              columns={columns}
              rows={onPage}
              getRowId={(so) => so.id}
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
            <Text tone="muted" className="p-4">Loading invoices…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}

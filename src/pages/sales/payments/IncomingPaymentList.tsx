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
import { INCOMING_STATUSES, type IncomingPayment, type IncomingStatus } from '../../../mocks/incomingPayments';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { amountDue, incomingNumber, listIncomingPayments } from '../../../services/incomingPayments';
import { useAsync } from '../../../services/useAsync';
import { RC_LIST_PATH, RC_STATUS_INTENT } from './detail/IncomingPaymentDetail';

type Filter = 'all' | IncomingStatus;

export function IncomingPaymentList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listIncomingPayments(), taxCodes.list()]), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'postingDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (so: IncomingPayment) => amountDue(so);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (orders ?? []).filter(
      (so) =>
        (filter === 'all' || so.status === filter) &&
        (!q || [incomingNumber(so), so.customerCode, so.customerName, so.reference, so.remarks, ...so.rows.map((r) => r.docNo)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (so: IncomingPayment): string | number => (sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof IncomingPayment] ?? ''));
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, query, sort, codes]);

  const open = (so: IncomingPayment) => navigate(`${RC_LIST_PATH}/${so.id}`);
  const count = (f: Filter) => String(orders?.filter((so) => f === 'all' || so.status === f).length ?? '');
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<IncomingPayment>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableSubcontent subcopy={so.reference ? `Ref. ${so.reference}` : undefined}>
          <TableLink onClick={() => open(so)}>{incomingNumber(so)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableSubcontent subcopy={so.type === 'Account' ? 'Account' : so.customerCode}>{so.customerName || (so.type === 'Account' ? so.accountRows.map((r) => r.account).join(', ') || '—' : '—')}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (so) => formatDate(so.postingDate) },
    { key: 'transNo', header: 'Trans. No.', cell: (so) => (so.transNo ? String(so.transNo) : '—') },
    {
      key: 'means',
      header: 'Means',
      cell: (so) =>
        [so.means.transfer.amount ? 'Transfer' : '', so.means.cash.amount ? 'Cash' : '', so.means.checks.length ? `${so.means.checks.length} check${so.means.checks.length === 1 ? '' : 's'}` : '', so.means.cards.length ? 'Card' : ''].filter(Boolean).join(' · ') || '—',
    },
    { key: 'total', header: 'Total', sortable: true, cell: (so) => <TableAmount currency={so.currency}>{formatAmount(totalOf(so))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={RC_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="savings"
        title="Sales Orders"
        subcopy="Incoming payments: money received from customers against their invoices or on account, or to G/L accounts. Adding one posts Dr the bank or clearing account / Cr the customer."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${RC_LIST_PATH}/new`)}>
            New incoming payment
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
            items={(['all', ...INCOMING_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
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
          aria-label="Search payments"
          placeholder="Search by payment no., customer, reference or invoice"
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
              caption="Incoming payments"
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
            <Text tone="muted" className="p-4">Loading payments…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}

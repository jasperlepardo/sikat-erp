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
  TextField,
  type TableColumn,
  type TableSort,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PAYMENT_STATUSES, type OutgoingPayment, type PaymentStatus } from '../../../mocks/outgoingPayments';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPayments, overallAmount, paymentNumber } from '../../../services/outgoingPayments';
import { useAsync } from '../../../services/useAsync';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { PAYMENT_LIST_PATH, PAYMENT_STATUS_INTENT } from './detail/PaymentDetail';

type Filter = 'all' | PaymentStatus;

/** How a payment went out, in words: "Bank transfer", "2 checks", "Cash + card". */
const meansText = (p: OutgoingPayment) =>
  [
    p.means.transfer.amount ? 'Bank transfer' : '',
    p.means.cash.amount ? 'Cash' : '',
    p.means.checks.length ? (p.means.checks.length === 1 ? `Check ${p.means.checks[0].checkNo || ''}`.trim() : `${p.means.checks.length} checks`) : '',
    p.means.cards.length ? 'Credit card' : '',
  ]
    .filter(Boolean)
    .join(' + ') || '—';

export function PaymentList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const payments = useAsync(listPayments, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'postingDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (payments ?? []).filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!q || [paymentNumber(p), p.vendorCode, p.payeeName, p.reference, ...p.rows.map((r) => `${r.docNo} ${r.vendorRef}`)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (p: OutgoingPayment): string | number =>
      sort.key === 'amount' ? overallAmount(p) : sort.key === 'docNum' ? p.docNum : String(p[sort.key as keyof OutgoingPayment] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [payments, filter, query, sort]);

  const open = (p: OutgoingPayment) => navigate(`${PAYMENT_LIST_PATH}/${p.id}`);
  const count = (f: Filter) => String(payments?.filter((p) => f === 'all' || p.status === f).length ?? '');

  const columns: TableColumn<OutgoingPayment>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (p) => (
        <TableSubcontent subcopy={p.reference || undefined}>
          <TableLink onClick={() => open(p)}>{paymentNumber(p)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'payeeName', header: 'Paid to', sortable: true, cell: (p) => <TableSubcontent subcopy={p.type === 'Vendor' ? p.vendorCode : 'G/L accounts'}>{p.payeeName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (p) => formatDate(p.postingDate) },
    {
      key: 'invoices',
      header: 'Paid',
      cell: (p) => {
        const paid = p.rows.filter((r) => r.selected && r.amount > 0);
        return p.type === 'Account'
          ? `${p.accountRows.length} account${p.accountRows.length === 1 ? '' : 's'}`
          : [paid.length ? `${paid.length} invoice${paid.length === 1 ? '' : 's'}` : '', p.onAccount ? 'on account' : ''].filter(Boolean).join(' + ') || '—';
      },
    },
    { key: 'means', header: 'Means', cell: meansText },
    { key: 'amount', header: 'Amount', sortable: true, cell: (p) => <TableAmount currency={p.currency}>{formatAmount(overallAmount(p))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (p) => <TableStatus intent={PAYMENT_STATUS_INTENT[p.status]}>{p.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="payments"
        title="Payments Made"
        subcopy="Outgoing payments: money paid to vendors against their bills (or on account), or straight to G/L accounts."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${PAYMENT_LIST_PATH}/new`)}>
            New outgoing payment
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
            items={(['all', ...PAYMENT_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
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
          placeholder="Search by payment no., payee, reference or invoice no."
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {payments ? (
            rows.length || payments.length ? (
              <Table
                caption="Outgoing payments"
                columns={columns}
                rows={rows.slice((page - 1) * pageSize, page * pageSize)}
                getRowId={(p) => p.id}
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
              <Text tone="muted" className="p-4">
                No payments yet. Pay a bill from Purchasing › Bills (You can also › Pay), from a vendor's Transactions tab, or with New outgoing payment.
              </Text>
            )
          ) : (
            <Text tone="muted" className="p-4">Loading payments…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}

import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Card, Panel, PanelHeader, Table, TableAmount, TableContent, TableStatus, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { fillCardClass, useListPage } from '../../../components/form/DataTable';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { PAYMENT_STATUSES, type OutgoingPayment } from '../../../mocks/outgoingPayments';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPayments, overallAmount, paymentNumber } from '../../../services/outgoingPayments';
import { useAsync } from '../../../services/useAsync';
import { OutgoingTabs, PAYMENT_RUN_PATH } from './PayablesPage';
import { BANK_PAYMENTS_PATH, OP_STATUS_INTENT, houseBankText, loadPayablesMasters, type PayablesMasters } from './payables';

/** The account the money left from, named: the transfer's or check's bank, the cash fund, or the card. */
export function paidFromText(p: OutgoingPayment, m: Pick<PayablesMasters, 'houseBanks' | 'bankNames' | 'accounts'>) {
  if (p.means.checks.length) return `${houseBankText(p.means.checks[0].account, m)} · check`;
  if (p.means.cards.length) return 'Credit card';
  if (p.means.cash.amount) return houseBankText(p.means.cash.account, m) || 'Cash';
  return houseBankText(p.means.transfer.account, m) || '—';
}

/** Every outgoing payment — drafts, posted and cancelled — newest first. */
export function PaymentsList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPayments(), loadPayablesMasters()]), []);
  const payments = data?.[0].filter((p) => p.type === 'Vendor');
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const fields = [
    textField<OutgoingPayment>('no', 'No.', paymentNumber),
    textField<OutgoingPayment>('payee', 'Vendor', (p) => `${p.payeeName} ${p.vendorCode}`),
    dateField<OutgoingPayment>('postingDate', 'Posting date', (p) => p.postingDate),
    textField<OutgoingPayment>('invoice', 'A/P no.', (p) => p.rows.map((r) => `${r.docNo} ${r.vendorRef}`)),
    numberField<OutgoingPayment>('amount', 'Amount', overallAmount),
    statusField<OutgoingPayment>(PAYMENT_STATUSES),
  ];
  const presets = useListPresets({
    list: 'bank-outgoing-payments',
    fields,
    builtIns: statusViews('payments', PAYMENT_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: payments,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets
      .apply(payments ?? [])
      .filter((p) => !q || [paymentNumber(p), p.payeeName, p.vendorCode, p.means.transfer.reference, ...p.rows.map((r) => `${r.docNo} ${r.vendorRef}`)].join(' ').toLowerCase().includes(q));
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (p: OutgoingPayment): string | number => (sort.key === 'amount' ? overallAmount(p) : String(p[sort.key as keyof OutgoingPayment] ?? ''));
    return [...filtered].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, presets.filter, query, sort]);

  const columns: TableColumn<OutgoingPayment>[] = [
    { key: 'docNum', header: 'No.', cell: (p) => <TableContent href={`#${BANK_PAYMENTS_PATH}/${p.docNum ? paymentNumber(p) : p.id}`}>{paymentNumber(p)}</TableContent> },
    { key: 'payeeName', header: 'Vendor', sortable: true, cell: (p) => <TableContent subcopy={p.vendorCode}>{p.payeeName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (p) => formatDate(p.postingDate) },
    { key: 'paidFrom', header: 'Paid from', cell: (p) => (data ? paidFromText(p, data[1]) : '') },
    {
      key: 'bills',
      header: 'Bills',
      cell: (p) => {
        const n = p.rows.filter((r) => r.selected && r.amount > 0).length;
        return [n ? `${n} bill${n === 1 ? '' : 's'}` : '', p.onAccount ? 'on account' : ''].filter(Boolean).join(' + ') || '—';
      },
    },
    { key: 'amount', header: 'Amount', sortable: true, align: 'end', cell: (p) => <TableAmount currency={p.currency}>{formatAmount(overallAmount(p))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (p) => <TableStatus intent={OP_STATUS_INTENT[p.status]}>{p.status}</TableStatus> },
  ];
  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search payments"
        searchPlaceholder="Search by payment no., vendor, reference or A/P no."
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="payments"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        tabs={<OutgoingTabs value="payments" />}
        actions={
          <MoreMenu
            label="New Payment"
            button={{ intent: 'primary' }}
            items={[
              { label: 'Payment', icon: 'payments', onSelect: () => navigate(`${BANK_PAYMENTS_PATH}/new`) },
              { label: 'Payment run', icon: 'checklist', onSelect: () => navigate(PAYMENT_RUN_PATH) },
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        <Card className={fillCardClass(visible.length)}>
          {!payments ? (
            <Text tone="muted" className="p-4">Loading payments…</Text>
          ) : rows.length ? (
            <Table caption="Outgoing payments" columns={columns} rows={visible} getRowId={(p) => p.id} sort={sort} onSortChange={setSort} layout="fill" pagination={pagination} />
          ) : (
            <Text tone="muted" className="p-4">No payments yet. Tick bills on Payables to pay them.</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}

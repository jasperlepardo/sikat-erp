import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { PAYMENT_STATUSES, type OutgoingPayment } from '../../../mocks/outgoingPayments';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPayments, overallAmount, paymentNumber } from '../../../services/outgoingPayments';
import { useAsync } from '../../../services/useAsync';
import { choiceField, dateField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef } from '../../settings/masterDefs';
import { PAYMENT_LIST_PATH, PAYMENT_NOUN, PAYMENT_STATUS_INTENT } from '../paths';

const meansText = (p: OutgoingPayment) =>
  [
    p.means.transfer.amount ? 'Bank transfer' : '',
    p.means.cash.amount ? 'Cash' : '',
    p.means.checks.length ? (p.means.checks.length === 1 ? `Check ${p.means.checks[0].checkNo || ''}`.trim() : `${p.means.checks.length} checks`) : '',
    p.means.cards.length ? 'Credit card' : '',
  ].filter(Boolean).join(' + ') || '—';

export function PaymentList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const payments = useAsync(listPayments, []);

  const fields = [
    textField<OutgoingPayment>('no', 'No.', paymentNumber),
    choiceField<OutgoingPayment>('type', 'Type', ['Vendor', 'Account'], (d) => d.type),
    textField<OutgoingPayment>('payee', 'Paid to', (d) => d.payeeName),
    textField<OutgoingPayment>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    dateField<OutgoingPayment>('postingDate', 'Posting date', (d) => d.postingDate),
    textField<OutgoingPayment>('reference', 'Reference', (d) => d.reference),
    textField<OutgoingPayment>('invoice', 'Invoice no.', (d) => d.rows.map((r) => r.docNo)),
    numberField<OutgoingPayment>('amount', 'Amount', overallAmount),
    statusField<OutgoingPayment>(scopeStatuses(draftsOnly, PAYMENT_STATUSES)),
    masterField<OutgoingPayment>('currency', 'Currency', currencyDef, (d) => d.currency),
    textField<OutgoingPayment>('remarks', 'Remarks', (d) => d.remarks),
  ];

  const columns: TableColumn<OutgoingPayment>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (p) => <TableContent href={`#${PAYMENT_LIST_PATH}/${p.docNum ? paymentNumber(p) : p.id}`} subcopy={p.reference || undefined}>{paymentNumber(p)}</TableContent> },
    { key: 'payeeName', header: 'Paid to', sortable: true, cell: (p) => <TableContent subcopy={p.type === 'Vendor' ? p.vendorCode : 'G/L accounts'}>{p.payeeName || '—'}</TableContent> },
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
    <ListPage
      rows={payments}
      columns={columns}
      fields={fields}
      noun={PAYMENT_NOUN}
      icon="payments"
      basePath={PAYMENT_LIST_PATH}
      listKey="outgoing-payments"
      builtIns={draftSplit(draftsOnly, PAYMENT_NOUN.many, PAYMENT_STATUSES)}
      scope={draftScope(draftsOnly, PAYMENT_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by payment no., payee, reference or invoice no.', label: 'Search payments' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${PAYMENT_NOUN.many} yet. Pay a bill from Purchasing › Bills (More actions › Pay), from a vendor's Transactions tab, or with New ${PAYMENT_NOUN.one}.`}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? paymentNumber(r) : r.id}
      filterFn={(p, q) => !q || [paymentNumber(p), p.vendorCode, p.payeeName, p.reference, ...p.rows.map((r) => `${r.docNo} ${r.vendorRef}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (p: OutgoingPayment): string | number =>
          sort.key === 'amount' ? overallAmount(p) : sort.key === 'docNum' ? p.docNum : String(p[sort.key as keyof OutgoingPayment] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

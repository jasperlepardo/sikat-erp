import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { PAYMENT_STATUSES, type OutgoingPayment } from '../../../mocks/outgoingPayments';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { listPayments, overallAmount, paymentNumber } from '../../../services/outgoingPayments';
import { useAsync } from '../../../services/useAsync';
import { choiceField, dateField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef } from '../../settings/masterDefs';
import { PAYMENT_LIST_PATH, PAYMENT_NOUN, PAYMENT_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

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
    textField<OutgoingPayment>('no', `${cap(PAYMENT_NOUN.one)} no.`, paymentNumber),
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

  const allColumns: ListColumn<OutgoingPayment>[] = [
    { key: 'docNum', header: `${cap(PAYMENT_NOUN.one)} no.`, locked: true, cell: (p) => <TableContent href={`#${PAYMENT_LIST_PATH}/${p.docNum ? paymentNumber(p) : p.id}`}>{paymentNumber(p)}</TableContent> },
    { key: 'reference', header: 'Reference', cell: (p) => p.reference || '—' },
    {
      key: 'invoices',
      header: 'Applied to',
      cell: (p) => {
        const paid = p.rows.filter((r) => r.selected && r.amount > 0);
        return p.type === 'Account'
          ? `${p.accountRows.length} account${p.accountRows.length === 1 ? '' : 's'}`
          : [paid.length ? `${paid.length} invoice${paid.length === 1 ? '' : 's'}` : '', p.onAccount ? 'on account' : ''].filter(Boolean).join(' + ') || '—';
      },
    },
    { key: 'payeeName', header: 'Paid to', cell: (p) => p.payeeName || '—' },
    { key: 'status', header: 'Status', cell: (p) => <TableStatus intent={PAYMENT_STATUS_INTENT[p.status]}>{p.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (p) => formatDate(p.postingDate) },
    { key: 'means', header: 'Means', defaultHidden: true, cell: meansText },
    { key: 'amount', header: 'Amount', align: 'end', cell: (p) => formatMoney(overallAmount(p), p.currency) },
  ];
  const { columns, manager } = useListColumns('outgoing-payments', allColumns);

  return (
    <ListPage
      rows={payments}
      columns={columns}
      fields={fields}
      noun={PAYMENT_NOUN}
      icon="payments"
      basePath={PAYMENT_LIST_PATH}
      listKey="outgoing-payments"
      builtIns={draftSplit(draftsOnly, PAYMENT_STATUSES)}
      scope={draftScope(draftsOnly, PAYMENT_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by payment no., payee, reference or invoice no.', label: 'Search payments' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${PAYMENT_NOUN.many} yet. Pay a bill from Purchasing › Bills (More actions › Pay), from a vendor's Transactions tab, or with New ${PAYMENT_NOUN.one}.`}
      toolbarExtra={manager}
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

import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { INCOMING_STATUSES, type IncomingPayment } from '../../../mocks/incomingPayments';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { amountDue, incomingNumber, listIncomingPayments } from '../../../services/incomingPayments';
import { useAsync } from '../../../services/useAsync';
import { choiceField, dateField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef } from '../../settings/masterDefs';
import { RC_LIST_PATH, RC_NOUN, RC_STATUS_INTENT } from '../paths';

export function IncomingPaymentList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listIncomingPayments(), taxCodes.list()]), []);
  const [orders] = data ?? [undefined];

  const fields = [
    textField<IncomingPayment>('no', 'No.', incomingNumber),
    choiceField<IncomingPayment>('type', 'Type', ['Customer', 'Account'], (d) => d.type),
    partnerField<IncomingPayment>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, orders),
    textField<IncomingPayment>('customerCode', 'Customer code', (d) => d.customerCode),
    dateField<IncomingPayment>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<IncomingPayment>('dueDate', 'Due date', (d) => d.dueDate),
    textField<IncomingPayment>('reference', 'Reference', (d) => d.reference),
    textField<IncomingPayment>('invoice', 'Invoice no.', (d) => d.rows.map((r) => r.docNo)),
    numberField<IncomingPayment>('total', 'Total', amountDue),
    statusField<IncomingPayment>(scopeStatuses(draftsOnly, INCOMING_STATUSES)),
    masterField<IncomingPayment>('currency', 'Currency', currencyDef, (d) => d.currency),
    textField<IncomingPayment>('remarks', 'Remarks', (d) => d.remarks),
  ];

  const columns: TableColumn<IncomingPayment>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (so) => <TableContent href={`#${RC_LIST_PATH}/${so.docNum ? incomingNumber(so) : so.id}`} subcopy={so.reference ? `Ref. ${so.reference}` : undefined}>{incomingNumber(so)}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableContent subcopy={so.type === 'Account' ? 'Account' : so.customerCode}>{so.customerName || (so.type === 'Account' ? so.accountRows.map((r) => r.account).join(', ') || '—' : '—')}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'transNo', header: 'Trans. No.', cell: (so) => (so.transNo ? String(so.transNo) : '—') },
    { key: 'means', header: 'Means', cell: (so) => [so.means.transfer.amount ? 'Transfer' : '', so.means.cash.amount ? 'Cash' : '', so.means.checks.length ? `${so.means.checks.length} check${so.means.checks.length === 1 ? '' : 's'}` : '', so.means.cards.length ? 'Card' : ''].filter(Boolean).join(' · ') || '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => `${so.currency} ${formatAmount(amountDue(so))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={RC_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={orders}
      columns={columns}
      fields={fields}
      noun={RC_NOUN}
      icon="savings"
      basePath={RC_LIST_PATH}
      listKey="incoming-payments"
      builtIns={draftSplit(draftsOnly, RC_NOUN.many, INCOMING_STATUSES)}
      scope={draftScope(draftsOnly, INCOMING_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by payment no., customer, reference or invoice', label: `Search ${RC_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${RC_NOUN.many} yet. Record one from an A/R invoice or a customer's Transactions tab, or with New ${RC_NOUN.one}.`}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? incomingNumber(r) : r.id}
      filterFn={(so, q) => !q || [incomingNumber(so), so.customerCode, so.customerName, so.reference, so.remarks, ...so.rows.map((r) => r.docNo)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (so: IncomingPayment): string | number =>
          sort.key === 'total' ? amountDue(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof IncomingPayment] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { DPR_STATUSES, type DownPaymentRequest } from '../../../mocks/apDownPayments';
import { dprNumber, dprTotal, listDownPayments } from '../../../services/apDownPayments';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DPR_LIST_PATH, DPR_NOUN, DPR_STATUS_INTENT } from '../paths';

export function DprList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDownPayments(), taxCodes.list()]), []);
  const [requests, codes] = data ?? [undefined, []];
  const totalOf = (d: DownPaymentRequest) => dprTotal(d, codes);

  const fields = [
    textField<DownPaymentRequest>('no', 'No.', dprNumber),
    partnerField<DownPaymentRequest>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, requests),
    textField<DownPaymentRequest>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<DownPaymentRequest>('vendorRef', 'Vendor proforma no.', (d) => d.vendorRef),
    dateField<DownPaymentRequest>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<DownPaymentRequest>('dueDate', 'Due date', (d) => d.dueDate),
    textField<DownPaymentRequest>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<DownPaymentRequest>('total', 'Total', totalOf),
    statusField<DownPaymentRequest>(DPR_STATUSES),
    masterField<DownPaymentRequest>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<DownPaymentRequest>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<DownPaymentRequest>(),
  ];

  const columns: TableColumn<DownPaymentRequest>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (d) => <TableContent href={`#${DPR_LIST_PATH}/${d.docNum ? dprNumber(d) : d.id}`} subcopy={d.vendorRef || undefined}>{dprNumber(d)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (d) => <TableContent subcopy={d.vendorCode}>{d.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (d) => formatDate(d.postingDate) },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (d) => (d.dueDate ? formatDate(d.dueDate) : '—') },
    { key: 'orderNumber', header: 'Purchase order', cell: (d) => (d.orderNumber ? `PO ${d.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'dpmPct', header: 'DPM %', cell: (d) => `${d.dpmPct}%` },
    { key: 'total', header: 'Total payment due', sortable: true, cell: (d) => <TableAmount currency={d.currency}>{formatAmount(totalOf(d))}</TableAmount> },
    { key: 'paid', header: 'Paid / drawn', cell: (d) => <TableContent subcopy={d.drawnAmount ? `${formatAmount(d.drawnAmount)} drawn` : undefined}>{d.appliedAmount ? (d.appliedAmount >= totalOf(d) - 0.005 ? 'Paid' : `${formatAmount(d.appliedAmount)} paid`) : 'Unpaid'}</TableContent> },
    { key: 'status', header: 'Status', sortable: true, cell: (d) => <TableStatus intent={DPR_STATUS_INTENT[d.status]}>{d.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={requests}
      columns={columns}
      fields={fields}
      noun={DPR_NOUN}
      icon="request_quote"
      basePath={DPR_LIST_PATH}
      listKey="ap-down-payment-requests"
      builtIns={statusViews(DPR_NOUN.many, DPR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor, vendor ref., PO no. or item', label: `Search ${DPR_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${DPR_NOUN.many} yet. Start one from a purchase order (More actions › Create ${DPR_NOUN.one}), or with New ${DPR_NOUN.one}.`}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? dprNumber(r) : r.id}
      filterFn={(d, q) => !q || [dprNumber(d), d.vendorCode, d.vendorName, d.vendorRef, d.orderNumber, ...d.lines.map((l) => l.itemNo)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (d: DownPaymentRequest): string | number =>
          sort.key === 'total' ? totalOf(d) : sort.key === 'docNum' ? d.docNum : String(d[sort.key as keyof DownPaymentRequest] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

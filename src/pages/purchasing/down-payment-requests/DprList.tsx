import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { DPR_STATUSES, type DownPaymentRequest } from '../../../mocks/apDownPayments';
import { dprNumber, dprTotal, listDownPayments } from '../../../services/apDownPayments';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DPR_LIST_PATH, DPR_NOUN, DPR_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function DprList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDownPayments(), taxCodes.list()]), []);
  const [requests, codes] = data ?? [undefined, []];
  const totalOf = (d: DownPaymentRequest) => dprTotal(d, codes);

  const fields = [
    textField<DownPaymentRequest>('no', `${cap(DPR_NOUN.one)} no.`, dprNumber),
    partnerField<DownPaymentRequest>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, requests),
    textField<DownPaymentRequest>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<DownPaymentRequest>('vendorRef', 'Vendor proforma no.', (d) => d.vendorRef),
    dateField<DownPaymentRequest>('postingDate', 'Request date', (d) => d.postingDate),
    dateField<DownPaymentRequest>('dueDate', 'Due date', (d) => d.dueDate),
    textField<DownPaymentRequest>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<DownPaymentRequest>('total', 'Total', totalOf),
    statusField<DownPaymentRequest>(DPR_STATUSES),
    masterField<DownPaymentRequest>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<DownPaymentRequest>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<DownPaymentRequest>(),
  ];

  const allColumns: ListColumn<DownPaymentRequest>[] = [
    { key: 'docNum', header: `${cap(DPR_NOUN.one)} no.`, locked: true, cell: (d) => <TableContent href={`#${DPR_LIST_PATH}/${d.docNum ? dprNumber(d) : d.id}`}>{dprNumber(d)}</TableContent> },
    { key: 'vendorRef', header: 'Vendor proforma no.', cell: (d) => d.vendorRef || '—' },
    { key: 'vendorName', header: 'Vendor', cell: (d) => d.vendorName || '—' },
    { key: 'status', header: 'Status', cell: (d) => <TableStatus intent={DPR_STATUS_INTENT[d.status]}>{d.status}</TableStatus> },
    { key: 'postingDate', header: 'Request date', align: 'end', cell: (d) => formatDate(d.postingDate) },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (d) => (d.dueDate ? formatDate(d.dueDate) : '—') },
    { key: 'orderNumber', header: 'Purchase order', defaultHidden: true, cell: (d) => (d.orderNumber ? `${d.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'dpmPct', header: 'DPM %', defaultHidden: true, cell: (d) => `${d.dpmPct}%` },
    { key: 'total', header: 'Total payment due', align: 'end', cell: (d) => formatMoney(totalOf(d), d.currency) },
    { key: 'paid', header: 'Paid / drawn', cell: (d) => <TableContent subcopy={d.drawnAmount ? `${formatMoney(d.drawnAmount, d.currency)} drawn` : undefined}>{d.appliedAmount ? (d.appliedAmount >= totalOf(d) - 0.005 ? 'Paid' : `${formatMoney(d.appliedAmount, d.currency)} paid`) : 'Unpaid'}</TableContent> },
  ];
  const { columns, manager } = useListColumns('ap-down-payment-requests', allColumns);

  return (
    <ListPage
      rows={requests}
      columns={columns}
      fields={fields}
      noun={DPR_NOUN}
      icon="request_quote"
      basePath={DPR_LIST_PATH}
      listKey="ap-down-payment-requests"
      builtIns={statusViews(DPR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor, vendor ref., PO no. or item', label: `Search ${DPR_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${DPR_NOUN.many} yet. Start one from a purchase order (More actions › Create ${DPR_NOUN.one}), or with New ${DPR_NOUN.one}.`}
      toolbarExtra={manager}
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

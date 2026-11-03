import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { DI_STATUSES, type ArDownPaymentInvoice } from '../../../mocks/arDownPaymentInvoices';
import { rateAt, type TaxCode } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { diNumber, diTotals, listArDownPaymentInvoices } from '../../../services/arDownPaymentInvoices';
import { useAsync } from '../../../services/useAsync';
import { dateField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DI_LIST_PATH, DI_NOUN, DI_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

const rateOfOn = (codes: readonly TaxCode[], date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};

export function DiList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listArDownPaymentInvoices(), taxCodes.list()]), []);
  const [rows_, codes] = data ?? [undefined, []];
  const totalOf = (d: ArDownPaymentInvoice) => diTotals(d, rateOfOn(codes, d.postingDate)).total;

  const fields = [
    textField<ArDownPaymentInvoice>('no', `${cap(DI_NOUN.one)} no.`, diNumber),
    partnerField<ArDownPaymentInvoice>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, rows_),
    textField<ArDownPaymentInvoice>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<ArDownPaymentInvoice>('customerRef', 'Customer PO no.', (d) => d.customerRef),
    dateField<ArDownPaymentInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ArDownPaymentInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ArDownPaymentInvoice>('order', 'Sales order', (d) => d.orderNumber),
    numberField<ArDownPaymentInvoice>('total', 'Total', totalOf),
    statusField<ArDownPaymentInvoice>(scopeStatuses(draftsOnly, DI_STATUSES)),
    masterField<ArDownPaymentInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ArDownPaymentInvoice>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
  ];

  const allColumns: ListColumn<ArDownPaymentInvoice>[] = [
    { key: 'docNum', header: `${cap(DI_NOUN.one)} no.`, locked: true, cell: (d) => <TableContent href={`#${DI_LIST_PATH}/${d.docNum ? diNumber(d) : d.id}`}>{diNumber(d)}</TableContent> },
    { key: 'customerRef', header: 'Customer PO no.', cell: (d) => d.customerRef || '—' },
    { key: 'customerName', header: 'Customer', cell: (d) => d.customerName || '—' },
    { key: 'status', header: 'Status', cell: (d) => <TableStatus intent={DI_STATUS_INTENT[d.status]}>{d.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (d) => formatDate(d.postingDate) },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (d) => (d.dueDate ? formatDate(d.dueDate) : '—') },
    { key: 'orderNumber', header: 'Sales order', defaultHidden: true, cell: (d) => d.orderNumber || <span className="text-muted">Without SO</span> },
    { key: 'total', header: 'Total', align: 'end', cell: (d) => formatMoney(totalOf(d), d.currency) },
    { key: 'paid', header: 'Paid / drawn', cell: (d) => <TableContent subcopy={d.drawnAmount ? `${formatMoney(d.drawnAmount, d.currency)} drawn` : undefined}>{d.appliedAmount ? (d.appliedAmount >= totalOf(d) - 0.005 ? 'Paid' : `${formatMoney(d.appliedAmount, d.currency)} paid`) : 'Unpaid'}</TableContent> },
  ];
  const { columns, manager } = useListColumns('ar-down-payment-invoices', allColumns);

  return (
    <ListPage
      rows={rows_}
      columns={columns}
      fields={fields}
      noun={DI_NOUN}
      icon="receipt_long"
      basePath={DI_LIST_PATH}
      listKey="ar-down-payment-invoices"
      builtIns={draftSplit(draftsOnly, DI_STATUSES)}
      scope={draftScope(draftsOnly, DI_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., customer or order', label: `Search ${DI_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${DI_NOUN.many} yet. Start one from a sales order (More actions › Create ${DI_NOUN.one}), or with New ${DI_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? diNumber(r) : r.id}
      filterFn={(d, q) => !q || [diNumber(d), d.customerCode, d.customerName, d.orderNumber].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (d: ArDownPaymentInvoice): string | number =>
          sort.key === 'total' ? totalOf(d) : sort.key === 'docNum' ? d.docNum : String(d[sort.key as keyof ArDownPaymentInvoice] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

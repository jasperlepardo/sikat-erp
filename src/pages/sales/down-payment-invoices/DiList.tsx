import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { DI_STATUSES, type ArDownPaymentInvoice } from '../../../mocks/arDownPaymentInvoices';
import { rateAt, type TaxCode } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { diNumber, diTotals, listArDownPaymentInvoices } from '../../../services/arDownPaymentInvoices';
import { useAsync } from '../../../services/useAsync';
import { dateField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DI_LIST_PATH, DI_NOUN, DI_STATUS_INTENT } from '../paths';

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
    textField<ArDownPaymentInvoice>('no', 'No.', diNumber),
    partnerField<ArDownPaymentInvoice>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, rows_),
    textField<ArDownPaymentInvoice>('customerCode', 'Customer code', (d) => d.customerCode),
    dateField<ArDownPaymentInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ArDownPaymentInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ArDownPaymentInvoice>('order', 'Order', (d) => d.orderNumber),
    numberField<ArDownPaymentInvoice>('total', 'Total', totalOf),
    statusField<ArDownPaymentInvoice>(scopeStatuses(draftsOnly, DI_STATUSES)),
    masterField<ArDownPaymentInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ArDownPaymentInvoice>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
  ];

  const columns: TableColumn<ArDownPaymentInvoice>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (d) => <TableContent href={`#${DI_LIST_PATH}/${d.docNum ? diNumber(d) : d.id}`}>{diNumber(d)}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (d) => <TableContent subcopy={d.customerCode}>{d.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (d) => formatDate(d.postingDate) },
    { key: 'orderNumber', header: 'Order', cell: (d) => d.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (d) => d.dueDate ? formatDate(d.dueDate) : '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (d) => `${d.currency} ${formatAmount(totalOf(d))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (d) => <TableStatus intent={DI_STATUS_INTENT[d.status]}>{d.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={rows_}
      columns={columns}
      fields={fields}
      noun={DI_NOUN}
      icon="receipt_long"
      basePath={DI_LIST_PATH}
      listKey="ar-down-payment-invoices"
      builtIns={draftSplit(draftsOnly, DI_NOUN.many, DI_STATUSES)}
      scope={draftScope(draftsOnly, DI_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., customer or order', label: `Search ${DI_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${DI_NOUN.many} yet. Start one from a sales order (More actions › Create ${DI_NOUN.one}), or with New ${DI_NOUN.one}.`}
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

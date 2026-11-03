import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { RI_STATUSES, type ReserveInvoice } from '../../../mocks/reserveInvoices';
import { rateAt, type TaxCode } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { riNumber, riTotals, listReserveInvoices } from '../../../services/reserveInvoices';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { RI_LIST_PATH, RI_NOUN, RI_STATUS_INTENT } from '../paths';

const rateOfOn = (codes: readonly TaxCode[], date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};

export function ReserveInvoiceList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listReserveInvoices(), taxCodes.list()]), []);
  const [rows_, codes] = data ?? [undefined, []];
  const totalOf = (r: ReserveInvoice) => riTotals(r, rateOfOn(codes, r.postingDate)).total;

  const fields = [
    textField<ReserveInvoice>('no', 'No.', riNumber),
    partnerField<ReserveInvoice>('customer', 'Customer', (r) => r.customerId, (r) => r.customerName, rows_),
    textField<ReserveInvoice>('customerCode', 'Customer code', (r) => r.customerCode),
    textField<ReserveInvoice>('customerRef', 'Customer PO no.', (r) => r.customerRef),
    dateField<ReserveInvoice>('postingDate', 'Posting date', (r) => r.postingDate),
    dateField<ReserveInvoice>('dueDate', 'Due date', (r) => r.dueDate),
    textField<ReserveInvoice>('order', 'Order', (r) => r.orderNumber),
    numberField<ReserveInvoice>('total', 'Total', totalOf),
    statusField<ReserveInvoice>(scopeStatuses(draftsOnly, RI_STATUSES)),
    masterField<ReserveInvoice>('currency', 'Currency', currencyDef, (r) => r.currency),
    masterField<ReserveInvoice>('salesEmployee', 'Sales employee', salesEmployeeDef, (r) => r.salesEmployeeId),
    linesField<ReserveInvoice>(),
  ];

  const allColumns: ListColumn<ReserveInvoice>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (r) => <TableContent href={`#${RI_LIST_PATH}/${r.docNum ? riNumber(r) : r.id}`} subcopy={r.customerRef ? `Customer PO no. ${r.customerRef}` : undefined}>{riNumber(r)}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <TableContent subcopy={r.customerCode}>{r.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'orderNumber', header: 'Order', defaultHidden: true, cell: (r) => r.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (r) => formatDate(r.dueDate) },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => `${r.currency} ${formatAmount(totalOf(r))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={RI_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('reserve-invoices', allColumns);

  return (
    <ListPage
      rows={rows_}
      columns={columns}
      fields={fields}
      noun={RI_NOUN}
      icon="receipt_long"
      basePath={RI_LIST_PATH}
      listKey="reserve-invoices"
      builtIns={draftSplit(draftsOnly, RI_NOUN.many, RI_STATUSES)}
      scope={draftScope(draftsOnly, RI_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by invoice no., customer, order or item', label: `Search ${RI_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${RI_NOUN.many} yet. Start one from a sales order (More actions › Create ${RI_NOUN.one}), or with New ${RI_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? riNumber(r) : r.id}
      filterFn={(r, q) => !q || [riNumber(r), r.customerCode, r.customerName, r.customerRef, r.orderNumber, ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (r: ReserveInvoice): string | number =>
          sort.key === 'total' ? totalOf(r) : sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof ReserveInvoice] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { AR_STATUSES, type ArInvoice } from '../../../mocks/arInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { arNumber, arTotal, listArInvoices } from '../../../services/arInvoices';
import { useAsync } from '../../../services/useAsync';
import { listDeliveries } from '../../../services/deliveries';
import { listSalesOrders, soNumber } from '../../../services/salesOrders';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { AR_LIST_PATH, AR_NOUN, AR_STATUS_INTENT } from '../paths';

export function ArInvoiceList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listArInvoices(), taxCodes.list(), listSalesOrders(), listDeliveries()]), []);
  const [orders, codes, salesOrders, deliveries] = data ?? [undefined, [], [], []];

  const baseOrders = (inv: ArInvoice) => {
    const ids = new Set<string>();
    for (const l of inv.lines) {
      if (l.baseType === 'SO' && l.baseId) ids.add(l.baseId);
      if (l.baseType === 'DN' && l.baseId) {
        const dn = deliveries.find((d) => d.id === l.baseId);
        const dnLine = dn?.lines.find((x) => x.id === l.baseLineId);
        if (dnLine?.baseType === 'SO' && dnLine.baseId) ids.add(dnLine.baseId);
      }
    }
    return [...ids].map((id) => salesOrders.find((o) => o.id === id)).filter((o) => o !== undefined).map(soNumber);
  };
  const totalOf = (so: ArInvoice) => arTotal(so, codes);

  const fields = [
    textField<ArInvoice>('no', 'No.', arNumber),
    partnerField<ArInvoice>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, orders),
    textField<ArInvoice>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<ArInvoice>('customerRef', 'Customer PO no.', (d) => d.customerRef),
    dateField<ArInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ArInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ArInvoice>('order', 'Order', (d) => d.orderNumber),
    numberField<ArInvoice>('total', 'Total', totalOf),
    statusField<ArInvoice>(scopeStatuses(draftsOnly, AR_STATUSES)),
    masterField<ArInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ArInvoice>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    linesField<ArInvoice>(),
  ];

  const allColumns: ListColumn<ArInvoice>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (so) => <TableContent href={`#${AR_LIST_PATH}/${so.docNum ? arNumber(so) : so.id}`} subcopy={so.customerRef ? `Customer PO no. ${so.customerRef}` : undefined}>{arNumber(so)}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableContent subcopy={so.customerCode}>{so.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'orderNumber', header: 'Order', defaultHidden: true, cell: (so) => baseOrders(so).join(', ') || so.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (so) => formatDate(so.dueDate) },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => `${so.currency} ${formatAmount(totalOf(so))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={AR_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('ar-invoices', allColumns);

  return (
    <ListPage
      rows={orders}
      columns={columns}
      fields={fields}
      noun={AR_NOUN}
      icon="receipt"
      basePath={AR_LIST_PATH}
      listKey="ar-invoices"
      builtIns={draftSplit(draftsOnly, AR_NOUN.many, AR_STATUSES)}
      scope={draftScope(draftsOnly, AR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by invoice no., customer, order or item', label: `Search ${AR_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${AR_NOUN.many} yet. Start one from a sales order or delivery (More actions › Create ${AR_NOUN.one}), or with New ${AR_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? arNumber(r) : r.id}
      filterFn={(so, q) => !q || [arNumber(so), so.customerCode, so.customerName, so.customerRef, so.orderNumber, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (so: ArInvoice): string | number =>
          sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof ArInvoice] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

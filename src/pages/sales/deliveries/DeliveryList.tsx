import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { DN_STATUSES, type Delivery } from '../../../mocks/deliveries';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { dnNumber, dnTotal, listDeliveries } from '../../../services/deliveries';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DN_LIST_PATH, DN_NOUN, DN_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function DeliveryList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDeliveries(), taxCodes.list()]), []);
  const [orders, codes] = data ?? [undefined, []];

  const totalOf = (so: Delivery) => dnTotal(so, codes);

  const fields = [
    textField<Delivery>('no', `${cap(DN_NOUN.one)} no.`, dnNumber),
    partnerField<Delivery>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, orders),
    textField<Delivery>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<Delivery>('customerRef', 'Customer PO no.', (d) => d.customerRef),
    dateField<Delivery>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<Delivery>('deliveryDate', 'Delivery date', (d) => d.deliveryDate),
    textField<Delivery>('order', 'Sales order', (d) => d.orderNumber),
    textField<Delivery>('trackingNo', 'Tracking no.', (d) => d.trackingNo),
    numberField<Delivery>('total', 'Total', totalOf),
    statusField<Delivery>(scopeStatuses(draftsOnly, DN_STATUSES)),
    masterField<Delivery>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<Delivery>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    linesField<Delivery>(),
  ];

  const allColumns: ListColumn<Delivery>[] = [
    { key: 'docNum', header: `${cap(DN_NOUN.one)} no.`, locked: true, cell: (so) => <TableContent href={`#${DN_LIST_PATH}/${so.docNum ? dnNumber(so) : so.id}`}>{dnNumber(so)}</TableContent> },
    { key: 'customerRef', header: 'Customer PO no.', cell: (so) => so.customerRef || '—' },
    { key: 'orderNumber', header: 'Sales order', cell: (so) => so.orderNumber || <span className="text-muted">Without SO</span> },
    { key: 'customerName', header: 'Customer', cell: (so) => so.customerName || '—' },
    { key: 'status', header: 'Status', cell: (so) => <TableStatus intent={DN_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'trackingNo', header: 'Tracking no.', defaultHidden: true, cell: (so) => so.trackingNo || '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => formatMoney(totalOf(so), so.currency) },
  ];
  const { columns, manager } = useListColumns('deliveries', allColumns);

  return (
    <ListPage
      rows={orders}
      columns={columns}
      fields={fields}
      noun={DN_NOUN}
      icon="local_shipping"
      basePath={DN_LIST_PATH}
      listKey="deliveries"
      builtIns={draftSplit(draftsOnly, DN_STATUSES)}
      scope={draftScope(draftsOnly, DN_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by delivery no., customer, order, tracking no. or item', label: `Search ${DN_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${DN_NOUN.many} yet. Start one from a sales order (More actions › Create ${DN_NOUN.one}), or with New ${DN_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? dnNumber(r) : r.id}
      filterFn={(so, q) => !q || [dnNumber(so), so.customerCode, so.customerName, so.customerRef, so.orderNumber, so.trackingNo, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (so: Delivery): string | number =>
          sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof Delivery] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

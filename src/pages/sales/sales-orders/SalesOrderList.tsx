import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, Tooltip, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { SO_STATUSES, type SalesOrder } from '../../../mocks/salesOrders';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listSalesOrders, openQty, soNumber, soTotal } from '../../../services/salesOrders';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { SO_LIST_PATH, SO_NOUN, SO_STATUS_INTENT } from '../paths';

export function SalesOrderList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listSalesOrders(), taxCodes.list()]), []);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (so: SalesOrder) => soTotal(so, codes);

  const fields = [
    textField<SalesOrder>('no', 'No.', soNumber),
    partnerField<SalesOrder>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, orders),
    textField<SalesOrder>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<SalesOrder>('customerRef', 'Customer PO no.', (d) => d.customerRef),
    dateField<SalesOrder>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<SalesOrder>('deliveryDate', 'Delivery date', (d) => d.deliveryDate),
    numberField<SalesOrder>('total', 'Total', totalOf),
    statusField<SalesOrder>(scopeStatuses(draftsOnly, SO_STATUSES)),
    masterField<SalesOrder>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<SalesOrder>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    linesField<SalesOrder>(),
  ];

  const allColumns: ListColumn<SalesOrder>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (so) => <TableContent href={`#${SO_LIST_PATH}/${so.docNum ? soNumber(so) : so.id}`} subcopy={so.customerRef ? `Customer PO no. ${so.customerRef}` : undefined}>{soNumber(so)}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableContent subcopy={so.customerCode}>{so.customerName || '—'}</TableContent> },
    { key: 'customerRef', header: 'Customer PO no.', defaultHidden: true, cell: (so) => so.customerRef || '—' },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'deliveryDate', header: 'Delivery date', align: 'end', defaultHidden: true, cell: (so) => (so.deliveryDate ? formatDate(so.deliveryDate) : '—') },
    {
      key: 'open',
      header: 'Open qty',
      align: 'end',
      cell: (so) => {
        if (so.docType === 'Service') return 'Service';
        const open = so.lines.filter((l) => openQty(l) > 0);
        const total = open.reduce((n, l) => n + openQty(l), 0).toLocaleString('en-PH');
        if (!open.length) return <span className="text-caption">-</span>;
        return (
          <Tooltip position="bottom" message={<div className="flex flex-col gap-1">{open.map((l) => <span key={l.id}>{openQty(l).toLocaleString('en-PH')} {l.uomCode} · {l.description || l.itemNo}</span>)}</div>}>
            {total}
          </Tooltip>
        );
      },
    },
    { key: 'currency', header: 'Currency', defaultHidden: true, cell: (so) => so.currency },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => `${so.currency} ${formatAmount(totalOf(so))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={SO_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('sales-orders', allColumns);

  return (
    <ListPage
      rows={orders}
      columns={columns as TableColumn<SalesOrder>[]}
      fields={fields}
      noun={SO_NOUN}
      icon="shopping_bag"
      basePath={SO_LIST_PATH}
      listKey="sales-orders"
      builtIns={draftSplit(draftsOnly, '', SO_STATUSES)}
      scope={draftScope(draftsOnly, SO_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by order no., customer, customer ref. or item', label: `Search ${SO_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      toolbarExtra={manager}
      emptyMessage={`No ${SO_NOUN.many} yet. Start one from a quotation (More actions › Create ${SO_NOUN.one}), or with New ${SO_NOUN.one}.`}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? soNumber(r) : r.id}
      filterFn={(so, q) => !q || [soNumber(so), so.customerCode, so.customerName, so.customerRef, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (so: SalesOrder): string | number =>
          sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof SalesOrder] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

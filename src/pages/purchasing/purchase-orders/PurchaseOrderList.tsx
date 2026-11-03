import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { PO_STATUSES, type PurchaseOrder } from '../../../mocks/purchaseOrders';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, openQty, poNumber, poTotal } from '../../../services/purchaseOrders';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { PO_LIST_PATH, PO_NOUN, PO_STATUS_INTENT } from '../paths';

export function PurchaseOrderList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseOrders(), taxCodes.list()]), []);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (po: PurchaseOrder) => poTotal(po, codes);

  const fields = [
    textField<PurchaseOrder>('no', 'No.', poNumber),
    partnerField<PurchaseOrder>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, orders),
    textField<PurchaseOrder>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<PurchaseOrder>('vendorRef', 'Vendor sales order no.', (d) => d.vendorRef),
    dateField<PurchaseOrder>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<PurchaseOrder>('deliveryDate', 'Delivery date', (d) => d.deliveryDate),
    numberField<PurchaseOrder>('total', 'Total', totalOf),
    statusField<PurchaseOrder>(scopeStatuses(draftsOnly, PO_STATUSES)),
    masterField<PurchaseOrder>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<PurchaseOrder>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<PurchaseOrder>(),
  ];

  const allColumns: ListColumn<PurchaseOrder>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (po) => <TableContent href={`#${PO_LIST_PATH}/${po.docNum ? poNumber(po) : po.id}`} subcopy={po.vendorRef ? `Vendor sales order no. ${po.vendorRef}` : undefined}>{poNumber(po)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (po) => <TableContent subcopy={po.vendorCode}>{po.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (po) => formatDate(po.postingDate) },
    { key: 'deliveryDate', header: 'Delivery date', sortable: true, defaultHidden: true, cell: (po) => (po.deliveryDate ? formatDate(po.deliveryDate) : '—') },
    {
      key: 'received',
      header: 'Received',
      cell: (po) => {
        const ordered = po.lines.reduce((n, l) => n + l.quantity, 0);
        const left = po.lines.reduce((n, l) => n + openQty(l), 0);
        return <TableContent subcopy={`${po.lines.length} line${po.lines.length === 1 ? '' : 's'}`}>{ordered - left} of {ordered}</TableContent>;
      },
    },
    { key: 'total', header: 'Total', sortable: true, cell: (po) => <TableAmount currency={po.currency}>{formatAmount(totalOf(po))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (po) => <TableStatus intent={PO_STATUS_INTENT[po.status]}>{po.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('purchase-orders', allColumns);

  return (
    <ListPage
      rows={orders}
      columns={columns}
      fields={fields}
      noun={PO_NOUN}
      icon="receipt_long"
      basePath={PO_LIST_PATH}
      listKey="purchase-orders"
      builtIns={draftSplit(draftsOnly, PO_STATUSES)}
      scope={draftScope(draftsOnly, PO_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by PO no., vendor, vendor ref. or item', label: 'Search purchase orders' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${PO_NOUN.many} yet. Start one from a purchase request or RFQ (More actions › Create ${PO_NOUN.one}), or with New ${PO_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? poNumber(r) : r.id}
      filterFn={(po, q) => !q || [poNumber(po), po.vendorCode, po.vendorName, po.vendorRef, ...po.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (po: PurchaseOrder): string | number =>
          sort.key === 'total' ? totalOf(po) : sort.key === 'docNum' ? po.docNum : String(po[sort.key as keyof PurchaseOrder] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}

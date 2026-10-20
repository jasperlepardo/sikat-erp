import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { formatDate } from '../../../services/dates';
import {
  Alert,
  Button,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PO_STATUSES, type PurchaseOrder } from '../../../mocks/purchaseOrders';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, openQty, poNumber, poTotal } from '../../../services/purchaseOrders';
import { useAsync } from '../../../services/useAsync';
import { PO_LIST_PATH, STATUS_INTENT } from './detail/PurchaseOrderDetail';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { useListPage } from '../../../components/form/DataTable';

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseOrders(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (po: PurchaseOrder) => poTotal(po, codes);
  const fields = [
    textField<PurchaseOrder>('no', 'No.', poNumber),
    textField<PurchaseOrder>('vendor', 'Vendor', (d) => d.vendorName),
    textField<PurchaseOrder>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<PurchaseOrder>('vendorRef', 'Vendor ref.', (d) => d.vendorRef),
    dateField<PurchaseOrder>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<PurchaseOrder>('deliveryDate', 'Delivery date', (d) => d.deliveryDate),
    numberField<PurchaseOrder>('total', 'Total', totalOf),
    statusField<PurchaseOrder>(PO_STATUSES),
    masterField<PurchaseOrder>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<PurchaseOrder>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<PurchaseOrder>(),
  ];
  const presets = useListPresets({
    list: 'purchase-orders',
    fields,
    builtIns: statusViews('purchase orders', PO_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: orders,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(orders ?? []).filter(
      (po) =>
        (!q ||
          [poNumber(po), po.vendorCode, po.vendorName, po.vendorRef, ...po.lines.map((l) => `${l.itemNo} ${l.description}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (po: PurchaseOrder): string | number =>
      sort.key === 'total' ? totalOf(po) : sort.key === 'docNum' ? po.docNum : String(po[sort.key as keyof PurchaseOrder] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, presets.filter, query, sort, codes]);

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (po) => (
        <TableContent href={`#${PO_LIST_PATH}/${po.docNum ? poNumber(po) : po.id}`} subcopy={po.vendorRef ? `Vendor ref. ${po.vendorRef}` : undefined}>{poNumber(po)}</TableContent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (po) => <TableContent subcopy={po.vendorCode}>{po.vendorName || '—'}</TableContent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (po) => formatDate(po.postingDate) },
    { key: 'deliveryDate', header: 'Delivery date', sortable: true, cell: (po) => (po.deliveryDate ? formatDate(po.deliveryDate) : '—') },
    {
      key: 'received',
      header: 'Received',
      cell: (po) => {
        const ordered = po.lines.reduce((n, l) => n + l.quantity, 0);
        const left = po.lines.reduce((n, l) => n + openQty(l), 0);
        return (
          <TableContent subcopy={`${po.lines.length} line${po.lines.length === 1 ? '' : 's'}`}>
            {ordered - left} of {ordered}
          </TableContent>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      cell: (po) => <TableAmount currency={po.currency}>{formatAmount(totalOf(po))}</TableAmount>,
    },
    { key: 'status', header: 'Status', sortable: true, cell: (po) => <TableStatus intent={STATUS_INTENT[po.status]}>{po.status}</TableStatus> },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search purchase orders"
        searchPlaceholder="Search by PO no., vendor, vendor ref. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="receipt_long"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="medium"
            shape="pill"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${PO_LIST_PATH}/new`)}
          >
            New purchase order
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        {orders ? (
          <Table
            caption="Purchase orders"
            columns={columns}
            rows={visible}
            getRowId={(po) => po.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading purchase orders…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}

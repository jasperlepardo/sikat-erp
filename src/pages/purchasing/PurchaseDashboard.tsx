import { useNavigate } from 'react-router';
import {
  Card,
  Icon,
  Panel,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { type PurchaseOrder } from '../../mocks/purchaseOrders';
import { type ApInvoice } from '../../mocks/apInvoices';
import { formatDate } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { taxCodes } from '../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../services/purchaseOrders';
import { apNumber, apTotal, listApInvoices } from '../../services/apInvoices';
import { useAsync } from '../../services/useAsync';
import { Stat } from '../../components/Stat';
import { STATUS_INTENT as PO_STATUS_INTENT, PO_LIST_PATH } from './orders/detail/PurchaseOrderDetail';
import { AP_LIST_PATH, AP_STATUS_INTENT } from './invoices/detail/ApInvoiceDetail';

export function PurchaseDashboard() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listPurchaseOrders(), listApInvoices(), taxCodes.list()]), []);
  const [orders, invoices, codes] = data ?? [undefined, undefined, []];

  const openOrders = orders?.filter((o) => o.status === 'Open' || o.status === 'Not Confirmed') ?? [];
  const openInvoices = invoices?.filter((i) => i.status === 'Open') ?? [];

  const openOrdersValue = openOrders.reduce((sum, o) => sum + poTotal(o, codes), 0);
  const outstandingPayables = openInvoices.reduce((sum, i) => sum + apTotal(i, codes), 0);

  const recentOrders = [...(orders ?? [])].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).slice(0, 6);
  const recentInvoices = [...(invoices ?? [])].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).slice(0, 6);

  const poColumns: TableColumn<PurchaseOrder>[] = [
    {
      key: 'docNum',
      header: 'No.',
      cell: (po) => <TableLink onClick={() => navigate(`${PO_LIST_PATH}/${po.docNum ? poNumber(po) : po.id}`)}>{poNumber(po)}</TableLink>,
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      cell: (po) => <TableSubcontent subcopy={po.vendorCode}>{po.vendorName || '—'}</TableSubcontent>,
    },
    { key: 'postingDate', header: 'Date', cell: (po) => formatDate(po.postingDate) },
    { key: 'total', header: 'Total', cell: (po) => <TableAmount currency={po.currency}>{formatAmount(poTotal(po, codes))}</TableAmount> },
    { key: 'status', header: 'Status', cell: (po) => <TableStatus intent={PO_STATUS_INTENT[po.status]}>{po.status}</TableStatus> },
  ];

  const apColumns: TableColumn<ApInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      cell: (a) => <TableLink onClick={() => navigate(`${AP_LIST_PATH}/${a.docNum ? apNumber(a) : a.id}`)}>{apNumber(a)}</TableLink>,
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      cell: (a) => <TableSubcontent subcopy={a.vendorCode}>{a.vendorName || '—'}</TableSubcontent>,
    },
    { key: 'dueDate', header: 'Due date', cell: (a) => formatDate(a.dueDate) },
    { key: 'total', header: 'Total', cell: (a) => <TableAmount currency={a.currency}>{formatAmount(apTotal(a, codes))}</TableAmount> },
    { key: 'status', header: 'Status', cell: (a) => <TableStatus intent={AP_STATUS_INTENT[a.status]}>{a.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <Panel.Body>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            icon="receipt_long"
            label="Open orders"
            value={orders ? String(openOrders.length) : '—'}
            sub="purchase orders"
          />
          <Stat
            icon="payments"
            label="Open order value"
            value={orders ? formatAmount(openOrdersValue) : '—'}
            sub="PHP"
          />
          <Stat
            icon="description"
            label="Open bills"
            value={invoices ? String(openInvoices.length) : '—'}
            sub="A/P invoices"
          />
          <Stat
            icon="account_balance_wallet"
            label="Outstanding payables"
            value={invoices ? formatAmount(outstandingPayables) : '—'}
            sub="PHP"
          />
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          <Card>
            <Card.Header icon={<Icon size={24}>shopping_cart</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(PO_LIST_PATH)}>See all</Text>}>
              Recent purchase orders
            </Card.Header>
            <Card.Content>
              {recentOrders.length ? (
                <Table columns={poColumns} rows={recentOrders} getRowId={(po) => po.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No purchase orders yet.</Text>
              )}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header icon={<Icon size={24}>description</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(AP_LIST_PATH)}>See all</Text>}>
              Recent bills
            </Card.Header>
            <Card.Content>
              {recentInvoices.length ? (
                <Table columns={apColumns} rows={recentInvoices} getRowId={(a) => a.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No bills yet.</Text>
              )}
            </Card.Content>
          </Card>
        </div>
      </Panel.Body>
    </Panel>
  );
}

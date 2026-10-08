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
import { type SalesOrder } from '../../mocks/salesOrders';
import { type ArInvoice } from '../../mocks/arInvoices';
import { formatDate } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { taxCodes } from '../../services/masterData';
import { listSalesOrders, soNumber, soTotal } from '../../services/salesOrders';
import { arNumber, arTotal, listArInvoices } from '../../services/arInvoices';
import { useAsync } from '../../services/useAsync';
import { Stat } from '../../components/Stat';
import { SO_STATUS_INTENT } from './orders/detail/SalesOrderDetail';
import { AR_STATUS_INTENT } from './invoices/detail/ArInvoiceDetail';
import { SO_LIST_PATH } from './orders/detail/types';
import { AR_LIST_PATH } from './invoices/detail/types';

export function SalesDashboard() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listSalesOrders(), listArInvoices(), taxCodes.list()]), []);
  const [orders, invoices, codes] = data ?? [undefined, undefined, []];

  const openOrders = orders?.filter((o) => o.status === 'Open') ?? [];
  const openInvoices = invoices?.filter((i) => i.status === 'Open') ?? [];

  const openOrdersValue = openOrders.reduce((sum, o) => sum + soTotal(o, codes), 0);
  const outstandingReceivables = openInvoices.reduce((sum, i) => sum + arTotal(i, codes), 0);

  const recentOrders = [...(orders ?? [])].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).slice(0, 6);
  const recentInvoices = [...(invoices ?? [])].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).slice(0, 6);

  const soColumns: TableColumn<SalesOrder>[] = [
    {
      key: 'docNum',
      header: 'No.',
      cell: (so) => <TableLink onClick={() => navigate(`${SO_LIST_PATH}/${so.id}`)}>{soNumber(so)}</TableLink>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      cell: (so) => <TableSubcontent subcopy={so.customerCode}>{so.customerName || '—'}</TableSubcontent>,
    },
    { key: 'postingDate', header: 'Date', cell: (so) => formatDate(so.postingDate) },
    { key: 'total', header: 'Total', cell: (so) => <TableAmount currency={so.currency}>{formatAmount(soTotal(so, codes))}</TableAmount> },
    { key: 'status', header: 'Status', cell: (so) => <TableStatus intent={SO_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  const arColumns: TableColumn<ArInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      cell: (a) => <TableLink onClick={() => navigate(`${AR_LIST_PATH}/${a.id}`)}>{arNumber(a)}</TableLink>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      cell: (a) => <TableSubcontent subcopy={a.customerCode}>{a.customerName || '—'}</TableSubcontent>,
    },
    { key: 'dueDate', header: 'Due date', cell: (a) => formatDate(a.dueDate) },
    { key: 'total', header: 'Total', cell: (a) => <TableAmount currency={a.currency}>{formatAmount(arTotal(a, codes))}</TableAmount> },
    { key: 'status', header: 'Status', cell: (a) => <TableStatus intent={AR_STATUS_INTENT[a.status]}>{a.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <Panel.Body>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            icon="receipt_long"
            label="Open orders"
            value={orders ? String(openOrders.length) : '—'}
            sub="sales orders"
          />
          <Stat
            icon="payments"
            label="Open order value"
            value={orders ? formatAmount(openOrdersValue) : '—'}
            sub="PHP"
          />
          <Stat
            icon="description"
            label="Open invoices"
            value={invoices ? String(openInvoices.length) : '—'}
            sub="A/R invoices"
          />
          <Stat
            icon="account_balance_wallet"
            label="Outstanding receivables"
            value={invoices ? formatAmount(outstandingReceivables) : '—'}
            sub="PHP"
          />
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          <Card>
            <Card.Header icon={<Icon size={24}>shopping_bag</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(SO_LIST_PATH)}>See all</Text>}>
              Recent sales orders
            </Card.Header>
            <Card.Content>
              {recentOrders.length ? (
                <Table columns={soColumns} rows={recentOrders} getRowId={(so) => so.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No sales orders yet.</Text>
              )}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header icon={<Icon size={24}>description</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(AR_LIST_PATH)}>See all</Text>}>
              Recent A/R invoices
            </Card.Header>
            <Card.Content>
              {recentInvoices.length ? (
                <Table columns={arColumns} rows={recentInvoices} getRowId={(a) => a.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No invoices yet.</Text>
              )}
            </Card.Content>
          </Card>
        </div>
      </Panel.Body>
    </Panel>
  );
}

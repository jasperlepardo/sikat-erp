import { useNavigate } from 'react-router';
import {
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { type Item } from '../../mocks/items';
import { type InventoryTransfer } from '../../mocks/inventoryTransfers';
import { formatDate } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { isLowStock, isValidToday, listItems, stockTotals } from '../../services/items';
import { listTransfers, transferNumber, transferValue } from '../../services/inventoryTransfers';
import { useAsync } from '../../services/useAsync';
import { Stat } from '../../components/Stat';
import { TRANSFER_LIST_PATH, TRANSFER_STATUS_INTENT } from './transfers/InventoryTransferDetail';

const ITEM_LIST_PATH = '/inventory/items';

export function InventoryDashboard() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listItems(), listTransfers()]), []);
  const [items, transfers] = data ?? [undefined, undefined];

  const activeItems = items?.filter((i) => i.inventoryItem && isValidToday(i)) ?? [];
  const lowStockItems = activeItems.filter(isLowStock).slice(0, 6);
  const inventoryValue = activeItems.reduce((sum, i) => sum + stockTotals(i).inStock * i.itemCost, 0);

  const recentTransfers = [...(transfers ?? [])].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).slice(0, 6);

  const transferColumns: TableColumn<InventoryTransfer>[] = [
    {
      key: 'docNum',
      header: 'No.',
      cell: (t) => <TableLink onClick={() => navigate(`${TRANSFER_LIST_PATH}/${t.id}`)}>{transferNumber(t)}</TableLink>,
    },
    {
      key: 'fromWarehouse',
      header: 'From / To',
      cell: (t) => (
        <TableSubcontent subcopy={t.toWarehouse || '—'}>
          {t.fromWarehouse || '—'}
        </TableSubcontent>
      ),
    },
    { key: 'postingDate', header: 'Date', cell: (t) => formatDate(t.postingDate) },
    { key: 'value', header: 'Value', cell: (t) => <TableAmount currency="PHP">{formatAmount(transferValue(t))}</TableAmount> },
    { key: 'status', header: 'Status', cell: (t) => <TableStatus intent={TRANSFER_STATUS_INTENT[t.status]}>{t.status}</TableStatus> },
  ];

  const itemColumns: TableColumn<Item>[] = [
    {
      key: 'itemNo',
      header: 'Item',
      cell: (i) => (
        <TableSubcontent subcopy={i.itemNo}>
          <TableLink onClick={() => navigate(`${ITEM_LIST_PATH}/${i.id}`)}>{i.name}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'inStock', header: 'In stock', cell: (i) => stockTotals(i).inStock.toLocaleString('en-PH') },
    { key: 'minStock', header: 'Min stock', cell: (i) => i.minStock.toLocaleString('en-PH') },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => {
        const inStock = stockTotals(i).inStock;
        return inStock <= 0
          ? <TableStatus intent="danger">Out of stock</TableStatus>
          : <TableStatus intent="warning">Low stock</TableStatus>;
      },
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader icon="inventory_2" title="Dashboard" subcopy="Inventory at a glance." />
      <Panel.Body>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            icon="inventory_2"
            label="Active items"
            value={items ? String(activeItems.length) : '—'}
            sub="stocked items"
          />
          <Stat
            icon="warning"
            label="Low or out of stock"
            value={items ? String(activeItems.filter(isLowStock).length) : '—'}
            sub="items below min"
          />
          <Stat
            icon="payments"
            label="Inventory value"
            value={items ? formatAmount(inventoryValue) : '—'}
            sub="PHP at cost"
          />
          <Stat
            icon="swap_horiz"
            label="Stock movements"
            value={transfers ? String(transfers.length) : '—'}
            sub="total transfers"
          />
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          <Card>
            <Card.Header icon={<Icon size={24}>swap_horiz</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(TRANSFER_LIST_PATH)}>See all</Text>}>
              Recent stock movements
            </Card.Header>
            <Card.Content>
              {recentTransfers.length ? (
                <Table columns={transferColumns} rows={recentTransfers} getRowId={(t) => t.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No stock movements yet.</Text>
              )}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header icon={<Icon size={24}>warning</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(ITEM_LIST_PATH)}>See all</Text>}>
              Low &amp; out of stock
            </Card.Header>
            <Card.Content>
              {lowStockItems.length ? (
                <Table columns={itemColumns} rows={lowStockItems} getRowId={(i) => i.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">All items are adequately stocked.</Text>
              )}
            </Card.Content>
          </Card>
        </div>
      </Panel.Body>
    </Panel>
  );
}

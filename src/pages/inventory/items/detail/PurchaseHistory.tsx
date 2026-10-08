import { useNavigate } from 'react-router';
import { Card, Icon, Table, TableLink, TableSubcontent, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { listCostLayers } from '../../../../services/costLayers';
import { formatAmount } from '../../../../services/format';
import { grNumber, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { useAsync } from '../../../../services/useAsync';
import { GR_LIST_PATH } from '../../../purchasing/receipts/detail/GoodsReceiptDetail';
import type { Draft } from './types';

const qty = (n: number) => n.toLocaleString('en-PH');

interface Batch {
  id: string;
  date: string;
  vendor: string;
  receiptId: string;
  receiptNo: string;
  orderNo: string;
  /** In the item's inventory unit. */
  quantity: number;
  /** As bought: per purchasing unit, in the receipt's currency, after the line discount. */
  price: number;
  unit: string;
  currency: string;
  /** Landed cost per inventory unit, PHP. */
  cost: number;
  /** Change from the batch before, in percent (undefined for the first). */
  change?: number;
  /** FIFO: what's left of this batch across all warehouses. */
  onHand?: number;
}

/**
 * Every batch the item was bought in, newest first: vendor, price as bought, landed cost per unit
 * and the move from the batch before. For a FIFO item, also how much of each batch is still on hand.
 */
export function PurchaseHistory({ draft }: { draft: Draft }) {
  const navigate = useNavigate();
  const fifo = draft.valuationMethod === 'FIFO';
  const data = useAsync(async () => (draft.id ? { receipts: await listGoodsReceipts(), layers: await listCostLayers() } : undefined), [draft.id]);
  if (!draft.id) return null;
  if (!data) return <Text tone="muted">Loading purchase history…</Text>;

  const oldestFirst: Batch[] = data.receipts
    .filter((gr) => gr.status !== 'Draft' && gr.status !== 'Cancelled')
    .flatMap((gr) =>
      gr.lines
        .filter((l) => l.itemId === draft.id)
        .map((l) => ({
          id: `${gr.id}:${l.id}`,
          date: gr.postingDate,
          vendor: gr.vendorName,
          receiptId: gr.id,
          receiptNo: grNumber(gr),
          orderNo: l.baseDocNo,
          quantity: l.quantity * (l.itemsPerUnit || 1),
          price: l.unitPrice * (1 - l.discountPct / 100),
          unit: l.uomCode,
          currency: gr.currency,
          cost: l.unitCostLc,
          onHand: fifo ? data.layers.filter((c) => c.itemId === draft.id && c.receiptId === gr.id).reduce((n, c) => n + c.qty, 0) : undefined,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.receiptNo.localeCompare(b.receiptNo));
  oldestFirst.forEach((b, i) => {
    const before = oldestFirst[i - 1];
    if (before?.cost) b.change = ((b.cost - before.cost) / before.cost) * 100;
  });
  const batches = [...oldestFirst].reverse();

  const bought = oldestFirst.reduce((n, b) => n + b.quantity, 0);
  const average = bought ? oldestFirst.reduce((n, b) => n + b.quantity * b.cost, 0) / bought : 0;
  const costs = oldestFirst.map((b) => b.cost);
  const peso = (n: number) => `₱${formatAmount(n)}`;

  const priceColumn: TableColumn<Batch> = {
    key: 'price',
    header: 'Price',
    cell: (b) => (
      <span className="whitespace-nowrap tabular-nums">
        {b.currency} {formatAmount(b.price)} <span className="text-muted">/ {b.unit}</span>
      </span>
    ),
  };
  const columns: TableColumn<Batch>[] = [
    {
      key: 'receiptNo',
      header: 'Batch',
      cell: (b) => (
        <TableSubcontent subcopy={`${b.date} · ${b.orderNo || 'No PO'}`}>
          <TableLink onClick={() => navigate(`${GR_LIST_PATH}/${b.receiptId}`)}>{b.receiptNo}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'vendor', header: 'Vendor', cell: (b) => b.vendor },
    { key: 'quantity', header: 'Bought', cell: (b) => <span className="whitespace-nowrap tabular-nums">{qty(b.quantity)} {draft.inventoryUom}</span> },
    // As bought, only when it differs from the cost: another currency, or bought by the box.
    ...(batches.some((b) => Math.abs(b.price - b.cost) > 0.005) ? [priceColumn] : []),
    { key: 'cost', header: `Cost / ${draft.inventoryUom}`, cell: (b) => <span className="whitespace-nowrap tabular-nums">{peso(b.cost)}</span> },
    {
      key: 'change',
      header: 'Change',
      cell: (b) =>
        b.change === undefined || Math.abs(b.change) < 0.005 ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={`whitespace-nowrap tabular-nums ${b.change > 0 ? 'text-danger' : 'text-success'}`}>
            {b.change > 0 ? '▲' : '▼'} {Math.abs(b.change).toFixed(1)}%
          </span>
        ),
    },
    ...(fifo
      ? [{ key: 'onHand', header: 'On hand', cell: (b: Batch) => <span className={`tabular-nums ${b.onHand ? '' : 'text-muted'}`}>{qty(b.onHand ?? 0)}</span> }]
      : []),
  ];

  return (
    <Card>
      <Card.Header icon={<Icon size={24}>history</Icon>}>Purchase history</Card.Header>
      <Card.Content>
        <Text variant="small" tone="muted">
          {batches.length
            ? `${batches.length} batch${batches.length === 1 ? '' : 'es'}, ${qty(bought)} ${draft.inventoryUom} bought. Last ${peso(oldestFirst.at(-1)!.cost)}, low ${peso(Math.min(...costs))}, high ${peso(Math.max(...costs))}, average ${peso(average)} per ${draft.inventoryUom}.` +
              (fifo ? ' On hand is what’s left of each batch: FIFO sells the oldest first.' : '')
            : 'Not bought yet. Each goods receipt adds a batch here.'}
        </Text>
      </Card.Content>
      {batches.length ? <Table caption="Purchase history" columns={columns} rows={batches} getRowId={(b) => b.id} layout="scroll" /> : null}
    </Card>
  );
}

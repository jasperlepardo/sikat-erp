import { TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import type { GoodsReturn, ReturnBaseType } from '../../../../mocks/goodsReturns';
import type { PoLine } from '../../../../mocks/purchaseOrders';
import { apNumber, listApInvoices } from '../../../../services/apInvoices';
import { formatDate } from '../../../../services/dates';
import { grNumber, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { listGoodsReturns, returnNumber } from '../../../../services/goodsReturns';
import { useAsync } from '../../../../services/useAsync';
import type { PoDraft } from './types';
import {
  AP_LIST_PATH,
  AP_STATUS_INTENT,
  GR_LIST_PATH,
  GR_STATUS_INTENT,
  RETURN_LIST_PATH,
  RETURN_STATUS_INTENT,
} from '../../paths';

type Intent = 'default' | 'primary' | 'success' | 'danger' | 'warning';

/** A document under a PO line: a receipt or PO-based invoice, or a return under one of those. */
interface DocRow {
  kind: 'receipt' | 'return';
  id: string;
  /** Shown under the number when it isn't a goods receipt or return, e.g. "A/P invoice". */
  type: string;
  no: string;
  href: string;
  /** The invoice a return was copied from, shown after its number. */
  via?: { no: string; href: string };
  date: string;
  status: string;
  intent: Intent;
  /** In the document line's unit. */
  quantity: number;
  uomCode: string;
  /** Inventory units in one of the document line's units. */
  itemsPerUnit: number;
  returns: DocRow[];
}

type Row = { kind: 'line'; id: string; line: PoLine; docs: DocRow[] } | DocRow;

const qty = (n: number, uom: string) => `${n.toLocaleString('en-PH')} ${uom}`;
const counts = (d: { status: string }) => d.status !== 'Draft' && d.status !== 'Cancelled';
/** Returned quantities, converted to `itemsPerUnit` units. */
const returnedIn = (returns: DocRow[], itemsPerUnit: number) =>
  returns.reduce((n, r) => n + (r.quantity * r.itemsPerUnit) / (itemsPerUnit || 1), 0);

export function PoReceiptsTab({ draft }: { draft: PoDraft }) {
  const receipts = useAsync(listGoodsReceipts, []);
  const invoices = useAsync(listApInvoices, []);
  const goodsReturns = useAsync(listGoodsReturns, []);

  // Goods returns copied from one receipt or invoice line.
  const returnsOf = (baseType: ReturnBaseType, baseId: string, baseLineId: string, via?: DocRow['via']): DocRow[] =>
    (goodsReturns ?? []).filter(counts).flatMap((r: GoodsReturn) =>
      r.lines
        .filter((rl) => rl.baseType === baseType && rl.baseId === baseId && rl.baseLineId === baseLineId)
        .map((rl): DocRow => ({
          kind: 'return',
          id: `${baseLineId}:${rl.id}`,
          type: '',
          no: returnNumber(r),
          href: `#${RETURN_LIST_PATH}/${r.docNum ? returnNumber(r) : r.id}`,
          date: r.postingDate,
          status: r.status,
          intent: RETURN_STATUS_INTENT[r.status],
          quantity: rl.quantity,
          uomCode: rl.uomCode,
          itemsPerUnit: rl.itemsPerUnit,
          via,
          returns: [],
        })),
    );
  // A receipt's returns: those copied from it, and those copied from invoices billed from it
  // (once billed, the return is made against the invoice).
  const receiptReturns = (grId: string, grLineId: string) => [
    ...returnsOf('GRPO', grId, grLineId),
    ...(invoices ?? []).filter(counts).flatMap((inv) =>
      inv.lines
        .filter((al) => al.baseType === 'GRPO' && al.baseId === grId && al.baseLineId === grLineId)
        .flatMap((al) => returnsOf('APINV', inv.id, al.id, { no: apNumber(inv), href: `#${AP_LIST_PATH}/${inv.docNum ? apNumber(inv) : inv.id}` })),
    ),
  ];

  // Only documents that moved the received quantity: added, not cancelled. A/P invoices
  // count when copied straight from the PO (one copied from a receipt doesn't receive again).
  const docsFor = (l: PoLine): DocRow[] => [
    ...(receipts ?? []).filter(counts).flatMap((gr) =>
      gr.lines
        .filter((gl) => gl.baseId === draft.id && gl.baseLineId === l.id)
        .map((gl): DocRow => ({
          kind: 'receipt',
          id: `${l.id}:${gl.id}`,
          type: '',
          no: grNumber(gr),
          href: `#${GR_LIST_PATH}/${gr.docNum ? grNumber(gr) : gr.id}`,
          date: gr.postingDate,
          status: gr.status,
          intent: GR_STATUS_INTENT[gr.status],
          quantity: gl.quantity,
          uomCode: gl.uomCode,
          itemsPerUnit: gl.itemsPerUnit,
          returns: receiptReturns(gr.id, gl.id),
        })),
    ),
    ...(invoices ?? []).filter(counts).flatMap((inv) =>
      inv.lines
        .filter((al) => al.baseType === 'PO' && al.baseId === draft.id && al.baseLineId === l.id)
        .map((al): DocRow => ({
          kind: 'receipt',
          id: `${l.id}:${al.id}`,
          type: 'A/P invoice',
          no: apNumber(inv),
          href: `#${AP_LIST_PATH}/${inv.docNum ? apNumber(inv) : inv.id}`,
          date: inv.postingDate,
          status: inv.status,
          intent: AP_STATUS_INTENT[inv.status],
          quantity: al.quantity,
          uomCode: al.uomCode,
          itemsPerUnit: al.itemsPerUnit,
          returns: returnsOf('APINV', inv.id, al.id),
        })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const rows: Row[] = draft.lines
    .filter((l) => !!l.itemId)
    .map((l) => ({ kind: 'line', id: l.id, line: l, docs: draft.id ? docsFor(l) : [] }));
  const children = (r: Row) => (r.kind === 'line' ? r.docs : r.returns);
  // Each document row shows its own quantity; only the line totals its returns. A receipt's
  // returns are its child rows, so a subtotal there would repeat them.
  const returned = (r: Row): [number, string] | undefined => {
    if (r.kind === 'return') return [r.quantity, r.uomCode];
    if (r.kind !== 'line') return undefined;
    const returns = r.docs.flatMap((d) => d.returns);
    return returns.length ? [returnedIn(returns, r.line.itemsPerUnit), r.line.uomCode] : undefined;
  };

  return (
    <DataTable
      noPagination
      rows={rows}
      getRowId={(r) => r.id}
      getSubRows={(r) => (children(r).length ? children(r) : undefined)}
      unsortable={['item', 'date', 'ordered', 'received', 'returned', 'balance', 'status']}
      empty={<Text variant="small" tone="muted">No lines yet.</Text>}
      columns={[
        {
          key: 'item',
          header: 'Item / Document',
          expandToggle: rows.some((r) => children(r).length > 0),
          cell: (r) =>
            r.kind === 'line' ? (
              <div className="flex flex-col">
                <Text variant="caption">{r.line.itemNo}</Text>
                <Text variant="small">{r.line.description || r.line.name}</Text>
              </div>
            ) : r.via ? (
              <div className="flex items-center whitespace-nowrap">
                <TableContent href={r.href}>{r.no}</TableContent>
                <span className="ml-1">(</span>
                <TableContent href={r.via.href}>{r.via.no}</TableContent>
                <span>)</span>
              </div>
            ) : (
              <TableContent href={r.href} subcopy={r.type || undefined}>{r.no}</TableContent>
            ),
        },
        {
          key: 'date',
          header: 'Date',
          cell: (r) =>
            r.kind === 'line' ? null : (
              <Text variant="small" className="whitespace-nowrap">{formatDate(r.date)}</Text>
            ),
        },
        {
          key: 'ordered',
          header: 'Ordered',
          align: 'end' as const,
          cell: (r) =>
            r.kind === 'line' ? (
              <Text variant="small" className="whitespace-nowrap tabular-nums">{qty(r.line.quantity, r.line.uomCode)}</Text>
            ) : null,
        },
        {
          key: 'received',
          header: 'Received',
          align: 'end' as const,
          cell: (r) => {
            if (r.kind === 'return') return null;
            const [n, uom] = r.kind === 'line' ? [r.line.receivedQty, r.line.uomCode] : [r.quantity, r.uomCode];
            return (
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {n ? qty(n, uom) : '—'}
              </Text>
            );
          },
        },
        {
          key: 'returned',
          header: 'Returned',
          align: 'end' as const,
          cell: (r) => {
            if (r.kind === 'receipt') return null;
            const ret = returned(r);
            return (
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {ret && ret[0] ? qty(ret[0], ret[1]) : '—'}
              </Text>
            );
          },
        },
        {
          key: 'balance',
          header: 'Open qty',
          align: 'end' as const,
          cell: (r) => {
            if (r.kind !== 'line') return null;
            const balance = r.line.quantity - r.line.receivedQty;
            return (
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {balance > 0 ? qty(balance, r.line.uomCode) : '—'}
              </Text>
            );
          },
        },
        {
          key: 'status',
          header: 'Status',
          cell: (r) =>
            r.kind === 'line' ? (
              <TableStatus intent={r.line.status === 'Open' ? 'primary' : 'success'}>{r.line.status}</TableStatus>
            ) : (
              <TableStatus intent={r.intent}>{r.status}</TableStatus>
            ),
        },
      ]}
    />
  );
}

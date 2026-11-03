import { TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import type { Item } from '../../../../mocks/items';
import type { SalesReturn } from '../../../../mocks/salesReturns';
import { arNumber, listArInvoices, shipsStock } from '../../../../services/arInvoices';
import { formatDate } from '../../../../services/dates';
import { dnNumber, listDeliveries } from '../../../../services/deliveries';
import { listSalesReturns, srNumber } from '../../../../services/salesReturns';
import { useAsync } from '../../../../services/useAsync';
import type { SoDraft } from './types';
import {
  AR_LIST_PATH,
  AR_STATUS_INTENT,
  DN_LIST_PATH,
  DN_NOUN,
  DN_STATUS_INTENT,
  SR_LIST_PATH,
  SR_STATUS_INTENT,
} from '../../paths';
import { cap } from '../../../../components/form/noun';
import type { SoLine } from '../../../../mocks/salesOrders';

type Intent = 'default' | 'primary' | 'success' | 'danger' | 'warning';

/** A document under an SO line: a delivery or AR invoice, or a return under a delivery. */
interface DocRow {
  kind: 'delivery' | 'return';
  id: string;
  /** 'A/R invoice' for AR invoices shipped directly from SO; '' for DNs and SRs. */
  type: string;
  no: string;
  href: string;
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

type Row = { kind: 'line'; id: string; line: SoLine; docs: DocRow[] } | DocRow;

const qty = (n: number, uom: string) => `${n.toLocaleString('en-PH')} ${uom}`;
const counts = (d: { status: string }) => d.status !== 'Draft' && d.status !== 'Cancelled';
/** Returned quantities, converted to `itemsPerUnit` units. */
const returnedIn = (returns: DocRow[], itemsPerUnit: number) =>
  returns.reduce((n, r) => n + (r.quantity * r.itemsPerUnit) / (itemsPerUnit || 1), 0);

/** The documents the Deliveries tab lists; undefined until all three have loaded. */
export type SoDeliveryDocs = {
  deliveries: Awaited<ReturnType<typeof listDeliveries>>;
  arInvoices: Awaited<ReturnType<typeof listArInvoices>>;
  salesReturns: Awaited<ReturnType<typeof listSalesReturns>>;
};

/**
 * Loads the Deliveries tab's documents. Call it from the SO page, not the tab, so they are
 * ready before the tab opens: rendering lines first and adding their documents later made
 * the expand column appear late and shift the table.
 */
export function useSoDeliveryDocs(): SoDeliveryDocs | undefined {
  const deliveries = useAsync(listDeliveries, []);
  const arInvoices = useAsync(listArInvoices, []);
  const salesReturns = useAsync(listSalesReturns, []);
  return deliveries && arInvoices && salesReturns ? { deliveries, arInvoices, salesReturns } : undefined;
}

export function SoDeliveriesTab({
  draft,
  docs,
  items,
}: {
  draft: SoDraft;
  docs: SoDeliveryDocs | undefined;
  items: readonly Item[];
}) {
  const { deliveries, arInvoices, salesReturns } = docs ?? { deliveries: [], arInvoices: [], salesReturns: [] };

  // Sales returns copied from a delivery line.
  const returnsOf = (baseId: string, baseLineId: string): DocRow[] =>
    salesReturns.filter(counts).flatMap((r: SalesReturn) =>
      r.lines
        .filter((rl) => rl.baseType === 'DN' && rl.baseId === baseId && rl.baseLineId === baseLineId)
        .map((rl): DocRow => ({
          kind: 'return',
          id: `${baseLineId}:${rl.id}`,
          type: '',
          no: srNumber(r),
          href: `#${SR_LIST_PATH}/${r.docNum ? srNumber(r) : r.id}`,
          date: r.postingDate,
          status: r.status,
          intent: SR_STATUS_INTENT[r.status],
          quantity: rl.quantity,
          uomCode: rl.uomCode,
          itemsPerUnit: rl.itemsPerUnit,
          returns: [],
        })),
    );

  // Documents that moved the delivered quantity: DNs and AR invoices shipped directly from SO.
  const docsFor = (l: SoLine): DocRow[] => [
    ...deliveries.filter(counts).flatMap((dn) =>
      dn.lines
        .filter((dl) => dl.baseType === 'SO' && dl.baseId === draft.id && dl.baseLineId === l.id)
        .map((dl): DocRow => ({
          kind: 'delivery',
          id: `${l.id}:${dl.id}`,
          type: '',
          no: dnNumber(dn),
          href: `#${DN_LIST_PATH}/${dn.docNum ? dnNumber(dn) : dn.id}`,
          date: dn.postingDate,
          status: dn.status,
          intent: DN_STATUS_INTENT[dn.status],
          quantity: dl.quantity,
          uomCode: dl.uomCode,
          itemsPerUnit: dl.itemsPerUnit,
          returns: returnsOf(dn.id, dl.id),
        })),
    ),
    ...arInvoices.filter(counts).flatMap((inv) =>
      inv.lines
        .filter((al) => al.baseType === 'SO' && al.baseId === draft.id && al.baseLineId === l.id && shipsStock(al, items))
        .map((al): DocRow => ({
          kind: 'delivery',
          id: `${l.id}:${al.id}`,
          type: 'A/R invoice',
          no: arNumber(inv),
          href: `#${AR_LIST_PATH}/${inv.docNum ? arNumber(inv) : inv.id}`,
          date: inv.postingDate,
          status: inv.status,
          intent: AR_STATUS_INTENT[inv.status],
          quantity: al.quantity,
          uomCode: al.uomCode,
          itemsPerUnit: al.itemsPerUnit ?? 1,
          returns: [],
        })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Nothing until the documents are in, so every row and the expand column arrive together.
  const rows: Row[] = !docs ? [] : draft.lines
    .filter((l) => !!l.itemId)
    .map((l) => ({ kind: 'line', id: l.id, line: l, docs: draft.id ? docsFor(l) : [] }));
  const children = (r: Row) => (r.kind === 'line' ? r.docs : r.returns);
  // Each document row shows its own quantity; only the line totals its returns.
  const returned = (r: Row): [number, string] | undefined => {
    if (r.kind === 'return') return [r.quantity, r.uomCode];
    if (r.kind !== 'line') return undefined;
    const returns = r.docs.flatMap((d) => d.returns);
    return returns.length ? [returnedIn(returns, r.line.itemsPerUnit), r.line.uomCode] : undefined;
  };

  return (
    <DataTable
      variant="card"
      icon="list_alt"
      title={cap(DN_NOUN.many)}
      noPagination
      rows={rows}
      getRowId={(r) => r.id}
      getSubRows={(r) => (children(r).length ? children(r) : undefined)}
      unsortable={['item', 'date', 'ordered', 'delivered', 'returned', 'balance', 'status']}
      empty={<Text variant="small" tone="muted">{docs ? 'No lines yet.' : 'Loading deliveries…'}</Text>}
      columns={[
        {
          key: 'item',
          header: 'Item / Document',
          expandToggle: rows.some((r) => children(r).length > 0),
          cell: (r) =>
            r.kind === 'line' ? (
              <div className="flex flex-col">
                <Text variant="caption">{r.line.itemNo}</Text>
                <Text variant="small">{r.line.description}</Text>
              </div>
            ) : (
              <TableContent href={r.href} subcopy={r.type || undefined}>{r.no}</TableContent>
            ),
        },
        {
          key: 'date',
          header: 'Date',
          align: 'end',
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
          key: 'delivered',
          header: 'Shipped',
          align: 'end' as const,
          cell: (r) => {
            if (r.kind === 'return') return null;
            const [n, uom] = r.kind === 'line' ? [r.line.deliveredQty, r.line.uomCode] : [r.quantity, r.uomCode];
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
            if (r.kind === 'delivery') return null;
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
            const balance = r.line.quantity - r.line.deliveredQty;
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

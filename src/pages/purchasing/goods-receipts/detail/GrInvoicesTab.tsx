import { TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import type { ApInvoice } from '../../../../mocks/apInvoices';
import type { GrLine } from '../../../../mocks/goodsReceipts';
import type { GoodsReturn } from '../../../../mocks/goodsReturns';
import { apNumber } from '../../../../services/apInvoices';
import { formatDate } from '../../../../services/dates';
import { returnNumber } from '../../../../services/goodsReturns';
import type { GrDraft } from './types';
import {
  AP_LIST_PATH,
  AP_NOUN,
  AP_STATUS_INTENT,
  RETURN_LIST_PATH,
  RETURN_STATUS_INTENT,
} from '../../paths';
import { cap } from '../../../../components/form/noun';

type Intent = 'default' | 'primary' | 'success' | 'danger' | 'warning';

interface DocRow {
  kind: 'invoice' | 'return';
  id: string;
  no: string;
  href: string;
  date: string;
  status: string;
  intent: Intent;
  quantity: number;
  uomCode: string;
  itemsPerUnit: number;
  returns: DocRow[];
}

type Row = { kind: 'line'; id: string; line: GrLine; docs: DocRow[] } | DocRow;

const qty = (n: number, uom: string) => `${n.toLocaleString('en-PH')} ${uom}`;
const counts = (d: { status: string }) => d.status !== 'Draft' && d.status !== 'Cancelled';
const returnedIn = (returns: DocRow[], itemsPerUnit: number) =>
  returns.reduce((n, r) => n + (r.quantity * r.itemsPerUnit) / (itemsPerUnit || 1), 0);

export function GrInvoicesTab({
  gr,
  apInvoices,
  goodsReturns,
}: {
  gr: GrDraft;
  apInvoices: ApInvoice[] | undefined;
  goodsReturns: GoodsReturn[] | undefined;
}) {
  const docs = apInvoices && goodsReturns;
  const invList = apInvoices ?? [];
  const retList = goodsReturns ?? [];

  const returnsOf = (baseId: string, baseLineId: string): DocRow[] =>
    retList.filter(counts).flatMap((r: GoodsReturn) =>
      r.lines
        .filter((rl) => rl.baseType === 'APINV' && rl.baseId === baseId && rl.baseLineId === baseLineId)
        .map((rl): DocRow => ({
          kind: 'return',
          id: `${baseLineId}:${rl.id}`,
          no: returnNumber(r),
          href: `#${RETURN_LIST_PATH}/${r.docNum ? returnNumber(r) : r.id}`,
          date: r.postingDate,
          status: r.status,
          intent: RETURN_STATUS_INTENT[r.status],
          quantity: rl.quantity,
          uomCode: rl.uomCode,
          itemsPerUnit: rl.itemsPerUnit,
          returns: [],
        })),
    );

  const docsFor = (l: GrLine): DocRow[] => [
    ...invList.filter(counts).flatMap((inv) =>
      inv.lines
        .filter((al) => al.baseType === 'GRPO' && al.baseId === gr.id && al.baseLineId === l.id)
        .map((al): DocRow => ({
          kind: 'invoice',
          id: `${l.id}:${al.id}`,
          no: apNumber(inv),
          href: `#${AP_LIST_PATH}/${inv.docNum ? apNumber(inv) : inv.id}`,
          date: inv.postingDate,
          status: inv.status,
          intent: AP_STATUS_INTENT[inv.status],
          quantity: al.quantity,
          uomCode: al.uomCode,
          itemsPerUnit: al.itemsPerUnit,
          returns: returnsOf(inv.id, al.id),
        })),
    ),
    ...retList.filter(counts).flatMap((r) =>
      r.lines
        .filter((rl) => rl.baseType === 'GRPO' && rl.baseId === gr.id && rl.baseLineId === l.id)
        .map((rl): DocRow => ({
          kind: 'return',
          id: `${l.id}:${rl.id}`,
          no: returnNumber(r),
          href: `#${RETURN_LIST_PATH}/${r.docNum ? returnNumber(r) : r.id}`,
          date: r.postingDate,
          status: r.status,
          intent: RETURN_STATUS_INTENT[r.status],
          quantity: rl.quantity,
          uomCode: rl.uomCode,
          itemsPerUnit: rl.itemsPerUnit,
          returns: [],
        })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const rows: Row[] = !docs ? [] : gr.lines
    .filter((l) => !!l.itemId)
    .map((l) => ({ kind: 'line', id: l.id, line: l, docs: gr.id ? docsFor(l) : [] }));
  const children = (r: Row) => (r.kind === 'line' ? r.docs : r.returns);

  const returned = (r: Row): [number, string] | undefined => {
    if (r.kind === 'return') return [r.quantity, r.uomCode];
    if (r.kind !== 'line') return undefined;
    const all = r.docs.flatMap((d) => (d.kind === 'return' ? [d] : d.returns));
    return all.length ? [returnedIn(all, r.line.itemsPerUnit), r.line.uomCode] : undefined;
  };

  return (
    <DataTable
      variant="card"
      icon="list_alt"
      title={cap(AP_NOUN.many)}
      noPagination
      rows={rows}
      getRowId={(r) => r.id}
      getSubRows={(r) => (children(r).length ? children(r) : undefined)}
      unsortable={['item', 'date', 'received', 'invoiced', 'returned', 'balance', 'status']}
      empty={<Text variant="small" tone="muted">{docs ? 'No lines yet.' : 'Loading…'}</Text>}
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
            ) : (
              <TableContent href={r.href}>{r.no}</TableContent>
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
          key: 'received',
          header: 'Received',
          align: 'end' as const,
          cell: (r) =>
            r.kind === 'line' ? (
              <Text variant="small" className="whitespace-nowrap tabular-nums">{qty(r.line.quantity, r.line.uomCode)}</Text>
            ) : null,
        },
        {
          key: 'invoiced',
          header: 'Invoiced',
          align: 'end' as const,
          cell: (r) => {
            if (r.kind === 'return') return null;
            const [n, uom] = r.kind === 'line' ? [r.line.invoicedQty, r.line.uomCode] : [r.quantity, r.uomCode];
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
            if (r.kind === 'invoice') return null;
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
            const balance = r.line.quantity - r.line.invoicedQty;
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
            r.kind === 'line' ? null : (
              <TableStatus intent={r.intent}>{r.status}</TableStatus>
            ),
        },
      ]}
    />
  );
}

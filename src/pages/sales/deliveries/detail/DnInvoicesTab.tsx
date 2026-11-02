import { TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import type { ArInvoice } from '../../../../mocks/arInvoices';
import type { DnLine } from '../../../../mocks/deliveries';
import type { SalesReturn } from '../../../../mocks/salesReturns';
import { arNumber } from '../../../../services/arInvoices';
import { formatDate } from '../../../../services/dates';
import { srNumber } from '../../../../services/salesReturns';
import type { DnDraft } from './types';
import {
  AR_LIST_PATH,
  AR_NOUN,
  AR_STATUS_INTENT,
  SR_LIST_PATH,
  SR_STATUS_INTENT,
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

type Row = { kind: 'line'; id: string; line: DnLine; docs: DocRow[] } | DocRow;

const qty = (n: number, uom: string) => `${n.toLocaleString('en-PH')} ${uom}`;
const counts = (d: { status: string }) => d.status !== 'Draft' && d.status !== 'Cancelled';

export function DnInvoicesTab({
  dn,
  arInvoices,
  salesReturns,
}: {
  dn: DnDraft;
  arInvoices: ArInvoice[] | undefined;
  salesReturns: SalesReturn[] | undefined;
}) {
  const docs = arInvoices && salesReturns;
  const invList = arInvoices ?? [];
  const retList = salesReturns ?? [];

  // SrBaseType is 'DN' | '' — returns always base on the DN directly, never on an AR invoice.
  const docsFor = (l: DnLine): DocRow[] => [
    ...invList.filter(counts).flatMap((inv) =>
      inv.lines
        .filter((al) => al.baseType === 'DN' && al.baseId === dn.id && al.baseLineId === l.id)
        .map((al): DocRow => ({
          kind: 'invoice',
          id: `${l.id}:${al.id}`,
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
    ...retList.filter(counts).flatMap((r: SalesReturn) =>
      r.lines
        .filter((rl) => rl.baseType === 'DN' && rl.baseId === dn.id && rl.baseLineId === l.id)
        .map((rl): DocRow => ({
          kind: 'return',
          id: `${l.id}:${rl.id}`,
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
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const rows: Row[] = !docs ? [] : dn.lines
    .filter((l) => !!l.itemId)
    .map((l) => ({ kind: 'line', id: l.id, line: l, docs: dn.id ? docsFor(l) : [] }));
  const children = (r: Row) => (r.kind === 'line' ? r.docs : r.returns);

  const returned = (r: Row): [number, string] | undefined => {
    if (r.kind === 'return') return [r.quantity, r.uomCode];
    if (r.kind !== 'line') return undefined;
    const rets = r.docs.filter((d) => d.kind === 'return');
    return rets.length
      ? [rets.reduce((n, d) => n + (d.quantity * d.itemsPerUnit) / (r.line.itemsPerUnit || 1), 0), r.line.uomCode]
      : undefined;
  };

  return (
    <DataTable
      variant="card"
      icon="list_alt"
      title={cap(AR_NOUN.many)}
      noPagination
      rows={rows}
      getRowId={(r) => r.id}
      getSubRows={(r) => (children(r).length ? children(r) : undefined)}
      unsortable={['item', 'date', 'shipped', 'invoiced', 'returned', 'balance', 'status']}
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
                <Text variant="small">{r.line.description}</Text>
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
          key: 'shipped',
          header: 'Shipped',
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

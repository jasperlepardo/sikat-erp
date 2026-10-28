import { useState, type ReactNode } from 'react';
import { TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../../components/form/DataTable';
import { useColumnPrefs, type PrefColumn } from '../../../../../components/form/columnPrefs';
import type { PurchaseOrder } from '../../../../../mocks/purchaseOrders';
import type { PrLine, PurchaseRequest } from '../../../../../mocks/purchaseRequests';
import type { Rfq, RfqLine } from '../../../../../mocks/rfqs';
import { formatDate, todayISO } from '../../../../../services/dates';
import { formatAmount } from '../../../../../services/format';
import { rateOn } from '../../../../../services/masterData';
import { copiedQty } from '../../../../../services/purchaseRequests';
import { lineNet, rfqNumber } from '../../../../../services/rfqs';
import { RFQ_LIST_PATH, RFQ_STATUS_INTENT } from '../../../paths';
import { CurrencyToggle, amountsIn } from '../../../shared/CurrencyToggle';
import { orderedByRfqLine, prLineFor } from '../../../shared/poFromRfq';
import { layoutQuoteCols, quoteLineCols } from './quoteColumns';
import type { PrMasters } from '../types';

/** What to award from one quotation: quantity by quotation line (the Award panel's choice). */
export interface Award {
  rfq: Rfq;
  lineQtys: Record<string, number>;
}

/** One vendor's answer for one request line. */
interface QuoteRow {
  id: string;
  rfq: Rfq;
  line: RfqLine;
  awaiting: boolean;
}

/** A row of the comparison: a request line, or (expanded beneath it) one vendor's quote for it. */
type Row =
  | { kind: 'line'; id: string; prLine: PrLine; quotes: QuoteLine[] }
  | QuoteLine;
type QuoteLine = QuoteRow & { kind: 'quote'; prLine: PrLine };

/** Every quote for each open request line. */
function quoteGroups(pr: PurchaseRequest, rfqs: readonly Rfq[]) {
  return pr.lines
    .filter((l) => l.itemId)
    .map((prLine) => ({
      prLine,
      rows: rfqs.flatMap((rfq) =>
        rfq.lines
          .filter((l) => prLineFor(pr, l)?.id === prLine.id)
          .map((line): QuoteRow => ({ id: line.id, rfq, line, awaiting: line.quotedQty <= 0 })),
      ),
    }))
    .filter((g) => g.rows.length);
}

/**
 * Quote comparison, laid out like a purchase order's Receipts: each request line, and under it one
 * row per quotation that answers it, with the quotation's line columns in its own order (the rest
 * in the Columns menu), its validity and status. Read-only: it is the Contents card's Comparison
 * view, and `tabs` is the Item / Comparison switch, shown at the top of that card.
 */
export function ComparisonCard({
  pr,
  m,
  rfqs,
  pos,
  tabs,
}: {
  pr: PurchaseRequest;
  m: PrMasters;
  rfqs: readonly Rfq[];
  /** Purchase orders, for how much was ordered from each quotation. */
  pos: readonly PurchaseOrder[];
  tabs?: ReactNode;
}) {
  // Every quote is shown in one currency, so they read side by side: pesos, or any quote's own.
  const [view, setView] = useState('PHP');
  const choices = ['PHP', ...new Set(rfqs.map((q) => q.currency).filter((c) => c !== 'PHP'))];
  const groups = quoteGroups(pr, rfqs);

  // One row per request line; its vendors' quotes expand beneath it.
  const quotesByLine = new Map(groups.map(({ prLine, rows }) => [prLine.id, rows.map((q): QuoteLine => ({ ...q, kind: 'quote', prLine }))]));
  const quotesOf = (prLine: PrLine) => quotesByLine.get(prLine.id) ?? [];
  const lines: Row[] = groups.map(({ prLine }) => ({ kind: 'line', id: prLine.id, prLine, quotes: quotesOf(prLine) }));

  const today = todayISO();
  // Column registries per quotation (amounts and tax are in each quotation's own currency and rates).
  const lineCols = new Map<string, ReturnType<typeof quoteLineCols>>();
  const lineColsOf = (rfq: Rfq) => {
    if (!lineCols.has(rfq.id)) lineCols.set(rfq.id, quoteLineCols(rfq, m));
    return lineCols.get(rfq.id)!;
  };
  const orderedByRfq = new Map<string, Map<string, number>>();
  const orderedOf = (rfq: Rfq) => {
    if (!orderedByRfq.has(rfq.id)) orderedByRfq.set(rfq.id, orderedByRfqLine(pos, rfq));
    return orderedByRfq.get(rfq.id)!;
  };
  // From a quotation's currency to the one shown, at the quotation's own date (0 without a rate).
  const factorOf = (rfq: Rfq) => {
    const fx = rfq.currency === 'PHP' ? 1 : (rateOn(m.rates, rfq.currency, rfq.postingDate)?.rate ?? 0);
    return amountsIn(view, rfq.currency, fx, m.rates, rfq.postingDate).factor;
  };
  // A quote as the comparison shows it: in the chosen currency, for what the vendor quoted (the
  // required qty is the request's, on the item row), so its total and tax are what it would cost.
  const shown = (r: QuoteLine) => ({ ...r.line, quantity: r.line.quotedQty, unitPrice: r.line.unitPrice * factorOf(r.rfq) });
  const money = (n: number, factor: number) => (factor ? formatAmount(n) : '—');
  const qtyText = (n: number, uom: string) => <Text variant="small" className="whitespace-nowrap tabular-nums">{n.toLocaleString('en-PH')} {uom}</Text>;

  // The quotation's own line columns, in its order; a request line's row fills only the ones
  // that mean something for the request (its quantity and how much of it is ordered).
  const own: Record<string, PrefColumn<Row>> = {
    qty: {
      key: 'qty',
      header: 'Required qty',
      align: 'end',
      cell: (r) => (r.kind === 'line' ? qtyText(r.prLine.quantity, r.prLine.uomCode) : null),
    },
    // Hidden on the quotation, shown here: what each vendor will supply.
    quotedQty: {
      key: 'quotedQty',
      header: 'Quoted qty',
      align: 'end',
      optional: true,
      defaultHidden: false,
      cell: (r) =>
        r.kind === 'line' ? null : r.awaiting ? (
          <Text variant="small" tone="muted" title="Awaiting the vendor's response">Awaiting</Text>
        ) : (
          qtyText(r.line.quotedQty, r.line.uomCode)
        ),
    },
    // The request line's ordered quantity (what POs drew from it); under it, what each quotation supplied.
    orderedQty: {
      key: 'orderedQty',
      header: 'Ordered qty',
      align: 'end',
      cell: (r) => (r.kind === 'line' ? qtyText(copiedQty(r.prLine), r.prLine.uomCode) : qtyText(orderedOf(r.rfq).get(r.line.id) ?? 0, r.line.uomCode)),
    },
    unitPrice: {
      key: 'unitPrice',
      header: `Info price (${view})`,
      align: 'end',
      cell: (r) => {
        // Prices are each vendor's.
        if (r.kind === 'line') return null;
        if (r.awaiting) return '—';
        return (
          <Text variant="small" className="whitespace-nowrap tabular-nums" title={factorOf(r.rfq) ? undefined : `No ${view} rate on ${formatDate(r.rfq.postingDate)}`}>{money(shown(r).unitPrice, factorOf(r.rfq))}</Text>
        );
      },
    },
    total: {
      key: 'total',
      header: `Total (${view})`,
      align: 'end',
      cell: (r) => (r.kind === 'quote' && !r.awaiting ? <Text variant="small" className="whitespace-nowrap tabular-nums">{money(lineNet(shown(r)), factorOf(r.rfq))}</Text> : null),
    },
  };

  // After the quotation's columns: its validity and status.
  const validUntil: PrefColumn<Row> = {
    key: 'validUntil',
    header: 'Valid until',
    optional: true,
    // Like the quotations list: an open quote past its date has lapsed, so say so.
    cell: (r) =>
      r.kind !== 'quote' || !r.rfq.validUntil ? null : r.rfq.status === 'Open' && r.rfq.validUntil < today ? (
        <div className="flex flex-col">
          <Text variant="small" tone="danger" className="whitespace-nowrap">{formatDate(r.rfq.validUntil)}</Text>
          <Text variant="caption" tone="muted">Expired</Text>
        </div>
      ) : (
        <Text variant="small" className="whitespace-nowrap">{formatDate(r.rfq.validUntil)}</Text>
      ),
  };
  const status: PrefColumn<Row> = {
    key: 'status',
    header: 'Status',
    cell: (r) =>
      r.kind === 'line' ? (
        <TableStatus intent={r.prLine.status === 'Open' ? 'primary' : 'success'}>{r.prLine.status}</TableStatus>
      ) : (
        <TableStatus intent={RFQ_STATUS_INTENT[r.rfq.status]}>{r.rfq.status}</TableStatus>
      ),
  };

  const lineColumns = rfqs.length
    ? layoutQuoteCols<Row>(lineColsOf(rfqs[0]), (_c, name) => (r) => (r.kind === 'quote' ? (lineColsOf(r.rfq)[name].cell?.(shown(r)) ?? null) : null), own, view)
    : [];
  // Quoted qty sits beside the required qty, not at the end with the quotation's hidden columns.
  const quoted = lineColumns.find((c) => c.key === 'quotedQty');
  const ordered = lineColumns.filter((c) => c !== quoted);
  if (quoted) ordered.splice(ordered.findIndex((c) => c.key === 'qty') + 1, 0, quoted);
  const totalAt = ordered.findIndex((c) => c.key === 'total') + 1;

  const columns: PrefColumn<Row>[] = [
    {
      key: 'item',
      header: 'Item / Document',
      expandToggle: true,
      // Like a purchase order's Receipts: the request line, and under it each quotation that answers it.
      cell: (r) =>
        r.kind === 'line' ? (
          <div className="flex flex-col">
            <Text variant="caption">{r.prLine.itemNo}</Text>
            <Text variant="small">{r.prLine.description}</Text>
          </div>
        ) : (
          <TableContent href={`#${RFQ_LIST_PATH}/${r.rfq.docNum ? rfqNumber(r.rfq) : r.rfq.id}`}>
            {r.rfq.docNum ? rfqNumber(r.rfq) : 'Draft purchase quotation'}
          </TableContent>
        ),
    },
    ...ordered.slice(0, totalAt),
    validUntil,
    status,
    ...ordered.slice(totalAt),
  ];

  // Show / hide optional columns (the quote date starts hidden) — the same Columns menu as a
  // document's item table.
  const prefs = useColumnPrefs('pr-comparison', columns);

  return (
    <DataTable
      variant="card"
      icon="list_alt"
      title="Contents"
      noPagination
      rows={lines}
      getRowId={(r) => r.id}
      getSubRows={(r) => (r.kind === 'line' && r.quotes.length ? r.quotes : undefined)}
      // A short request opens with every line's quotes showing; a long one starts collapsed.
      defaultExpandedIds={lines.length <= 5 ? lines.map((l) => l.id) : []}
      columns={prefs.columns}
      columnMenu={prefs.menu}
      unsortable={columns.map((c) => c.key)}
      empty={<Text variant="small" tone="muted">No purchase quotations for this request yet. Use More actions › Create purchase quotations to ask vendors for quotes.</Text>}
      actions={<CurrencyToggle choices={choices} value={view} onChange={setView} />}
    >
      {tabs}
      <Text variant="small" tone="muted">Each vendor's quotation for every item. Expand an item to see who quoted and at what price.</Text>
    </DataTable>
  );
}

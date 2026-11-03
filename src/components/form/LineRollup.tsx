import type { ReactNode } from 'react';
import { TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from './DataTable';
import { formatDate } from '../../services/dates';

type RollupIntent = 'default' | 'primary' | 'success' | 'danger' | 'warning';

/** A downstream document line routed to one base line (a receipt, invoice, return, order…). */
export interface RollupDocRow {
  /** Unique within the base line's children. */
  id: string;
  no: string;
  href: string;
  /** Shown under the number, e.g. the document type. */
  subcopy?: string;
  date: string;
  status: string;
  intent: RollupIntent;
  /** In the document line's own unit. */
  quantity: number;
  uomCode: string;
}

/** The minimal base line the rollup renders: an item identity and its ordered/requested quantity. */
export interface RollupLine {
  id: string;
  itemNo: string;
  description: string;
  quantity: number;
  uomCode: string;
}

type Row<T extends RollupLine> =
  | { kind: 'line'; id: string; line: T; docs: RollupDocRow[] }
  | ({ kind: 'doc' } & RollupDocRow);

const qty = (n: number, uom: string) => `${n.toLocaleString('en-PH')} ${uom}`;

/**
 * Read-only per-line rollup of downstream documents: one row per base line, each expanding to the
 * documents routed to it. Drives the second content tab on documents that spawn downstream docs
 * per line (goods receipt → A/P invoices / goods returns, delivery → A/R invoices / sales returns,
 * RFQ → purchase orders, goods return request → goods returns). See `docs/line-rollup-tabs-plan.md`.
 */
export function LineRollup<T extends RollupLine>({
  title,
  icon = 'list_alt',
  lines,
  docsFor,
  loading = false,
  empty,
}: {
  title: string;
  icon?: string;
  lines: readonly T[];
  /** The per-line filter + mapping of downstream document lines. */
  docsFor: (line: T) => RollupDocRow[];
  /** True until the downstream collections are loaded, so rows and the expand column arrive together. */
  loading?: boolean;
  empty: ReactNode;
}) {
  // Nothing until the documents are in, so every row and the expand column arrive together.
  // Callers pass lines already filtered to those with an item.
  const rows: Row<T>[] = loading ? [] : lines.map((l) => ({ kind: 'line', id: l.id, line: l, docs: docsFor(l) }));
  const children = (r: Row<T>): Row<T>[] =>
    r.kind === 'line' ? r.docs.map((d) => ({ kind: 'doc', ...d, id: `${r.line.id}:${d.id}` })) : [];

  return (
    <DataTable
      variant="card"
      icon={icon}
      title={title}
      noPagination
      rows={rows}
      getRowId={(r) => r.id}
      getSubRows={(r) => (children(r).length ? children(r) : undefined)}
      unsortable={['item', 'date', 'quantity', 'status']}
      empty={<Text variant="small" tone="muted">{loading ? 'Loading…' : empty}</Text>}
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
              <TableContent href={r.href} subcopy={r.subcopy || undefined}>{r.no}</TableContent>
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
          key: 'quantity',
          header: 'Quantity',
          align: 'end' as const,
          cell: (r) => (
            <Text variant="small" className="whitespace-nowrap tabular-nums">
              {r.kind === 'line' ? qty(r.line.quantity, r.line.uomCode) : qty(r.quantity, r.uomCode)}
            </Text>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (r) => (r.kind === 'line' ? null : <TableStatus intent={r.intent}>{r.status}</TableStatus>),
        },
      ]}
    />
  );
}

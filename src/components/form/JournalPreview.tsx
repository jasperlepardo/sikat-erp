import type { ReactNode } from 'react';
import { Card, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from './DataTable';
import { accountText, type Account } from '../../mocks/chartOfAccounts';
import { formatAmount } from '../../services/format';
import { round2 } from '../../services/num';

export interface JournalPreviewLine {
  account: string;
  debit?: number;
  credit?: number;
  /** Row id, needed when two rows post to the same account (e.g. one control account per partner). Defaults to the account. */
  id?: string;
  /** Context under the account name, e.g. the business partner on a control-account row. */
  sublabel?: ReactNode;
}

/**
 * A document's "Journal entry" card — the same self-contained Table-in-a-Card pattern as the
 * Payment means card, never nested inside another Section: an `account_balance` header, any
 * editable journal fields (`children`) and the `note`, then the Account · Debit · Credit entry
 * over a balanced Total bar. Before any lines exist, the `note` stands in as the card body.
 */
export function JournalPreview({
  journal,
  accounts,
  children,
  actions,
  footer,
  remarks,
  journalFields,
  journalRemark,
}: {
  journal: JournalPreviewLine[];
  accounts: Account[];
  /** Editable journal fields and document-specific alerts, rendered above the entry table. */
  children?: ReactNode;
  /** Header actions (top-right), e.g. a Post button — matches the Payment means card's add buttons. */
  actions?: ReactNode;
  /** Extra content below the Total bar, e.g. a posting-period warning. */
  footer?: ReactNode;
  /** The journal remark field, rendered below the entry table. */
  remarks?: ReactNode;
  /**
   * Editable journal fields injected by `DocumentJournalEntry` (which clones this element to set
   * `journalFields`/`journalRemark`). Rendered above the table, before `children`. This lets a
   * document pass `<JournalPreview .../>` directly as the `posting` — no per-document wrapper.
   */
  journalFields?: ReactNode;
  /** The journal remark field, injected by `DocumentJournalEntry`. Falls back to `remarks`. */
  journalRemark?: ReactNode;
}) {
  const remark = remarks ?? journalRemark;
  const hasLines = journal.length > 0;
  // Foot both sides independently so the entry can be eyeballed as balanced (and flagged if not).
  const debitTotal = round2(journal.reduce((n, j) => n + (j.debit ?? 0), 0));
  const creditTotal = round2(journal.reduce((n, j) => n + (j.credit ?? 0), 0));
  const balanced = debitTotal === creditTotal;
  // The totals ride in a real table row (id `TOTAL`) so the Debit/Credit figures line up
  // exactly under their columns — a floating footer bar can't track the auto-sized columns.
  const TOTAL = '__total__';
  const rows: JournalPreviewLine[] = hasLines
    ? [...journal, { id: TOTAL, account: TOTAL, debit: debitTotal, credit: creditTotal }]
    : journal;
  const totalTone = balanced ? 'heading' : 'danger';
  // The total row's surface + top rule come from a scoped CSS rule (index.css) keyed on the
  // `data-journal-total` marker below: `tr:has([data-journal-total]) > td`. That styles the whole
  // row edge-to-edge — the tertiary bar of the totals component — while staying column-aligned.
  const amtCell = (j: JournalPreviewLine, side: 'debit' | 'credit') => {
    const v = j[side];
    if (j.id !== TOTAL) return <span className="tabular-nums">{v ? formatAmount(v) : ''}</span>;
    return <Text as="span" variant="small" weight="semibold" tone={totalTone} className="tabular-nums">{v ? formatAmount(v) : ''}</Text>;
  };
  const columns: TableColumn<JournalPreviewLine>[] = [
    {
      key: 'account',
      header: 'Account',
      // General-journal convention: debit accounts flush-left, credited accounts indented.
      // A leading spacer cell (20px — the design system's table indent unit) does the indent.
      cell: (j) =>
        j.id === TOTAL ? (
          <span data-journal-total>
            <Text as="span" variant="small" weight="semibold" tone={totalTone}>{balanced ? 'Total' : 'Out of balance'}</Text>
          </span>
        ) : (
          <div className="flex items-start">
            {j.credit && !j.debit ? <span className="w-5 flex-none" aria-hidden /> : null}
            <div className="flex flex-col">
              {(() => {
                // Account code over its name, two lines (mirrors LineItemText); fall back to the
                // combined label for an account that isn't in the chart.
                const a = accounts.find((x) => x.code === j.account);
                return a ? (
                  <Text variant="small">{a.code}{a.active ? '' : ' (inactive)'} {a.name}</Text>
                ) : (
                  <Text variant="small">{accountText(j.account, accounts)}</Text>
                );
              })()}
              {j.sublabel ? <Text variant="small" tone="muted">{j.sublabel}</Text> : null}
            </div>
          </div>
        ),
    },
    { key: 'debit', header: 'Debit', align: 'end', cell: (j) => amtCell(j, 'debit') },
    { key: 'credit', header: 'Credit', align: 'end', cell: (j) => amtCell(j, 'credit') },
  ];

  return (
    <DataTable<JournalPreviewLine>
      variant="card"
      icon="account_balance"
      title="Journal entry"
      actions={actions}
      rows={rows}
      getRowId={(j) => j.id ?? j.account}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      noPagination
      cardFooter={
        hasLines || footer ? (
          <>
            {footer}
            {hasLines && remark ? <Card.Content>{remark}</Card.Content> : null}
          </>
        ) : undefined
      }
      empty={null}
    >
      {journalFields}
      {children}
      {!hasLines ? remark : null}
    </DataTable>
  );
}

import { Card, Checkbox, Table, TableAmount, TableContent, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import type { PaymentRow } from '../../../../mocks/outgoingPayments';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { rowSettled } from '../../../../services/outgoingPayments';
import { daysBetween } from '../payables';
import type { OpSectionProps } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => (v === '' ? 0 : Number(v));

/** What a row's overdue column reads, as of today. */
function overdue(r: PaymentRow) {
  const days = r.dueDate ? daysBetween(r.dueDate, todayISO()) : 0;
  return days > 0 ? <span className="text-(--color-text-danger) tabular-nums">{days}d</span> : '—';
}

function TotalLine({ cells }: { cells: [string, string?, string?] }) {
  const [label, balance, pay] = cells;
  return (
    <div className="flex items-center gap-4 px-2 py-2 font-semibold">
      <span className="flex-1">{label}</span>
      {balance !== undefined ? <span className="w-40 text-right tabular-nums">{balance}</span> : null}
      {pay !== undefined ? <span className="w-40 text-right tabular-nums">{pay}</span> : null}
    </div>
  );
}

/**
 * Bills to Pay: the vendor's open bills. Ticking one pays its balance; the amount can be lowered
 * for a partial payment, never raised above the balance. Payment on account sits last.
 */
export function OpBillsCard({
  draft,
  update,
  errors,
  ctx,
  onAccountOn,
  setOnAccountOn,
  onOpenBill,
}: OpSectionProps & { onAccountOn: boolean; setOnAccountOn: (on: boolean) => void; onOpenBill: (invoiceId: string) => void }) {
  const code = draft.currency;
  const rows = draft.rows;
  const patch = (id: string, p: Partial<PaymentRow>) => update({ rows: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const ticked = rows.filter((r) => r.selected);
  const totalBalance = round2(rows.reduce((n, r) => n + r.balanceDue, 0));
  const totalPay = round2(ticked.reduce((n, r) => n + r.amount, 0) + draft.onAccount);

  const billCell = (r: PaymentRow) => <TableContent onClick={() => onOpenBill(r.invoiceId)} subcopy={r.vendorRef || undefined}>{r.docNo}</TableContent>;

  if (ctx.readOnly) {
    const settled = rows.filter((r) => r.selected && r.amount > 0);
    const columns: TableColumn<PaymentRow>[] = [
      { key: 'docNo', header: 'A/P No.', cell: billCell },
      { key: 'dueDate', header: 'Due date', cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
      { key: 'total', header: 'Total', align: 'end', cell: (r) => <TableAmount currency={code}>{formatAmount(r.total)}</TableAmount> },
      { key: 'paid', header: 'Amount paid', align: 'end', cell: (r) => <TableAmount currency={code}>{formatAmount(rowSettled(r))}</TableAmount> },
      { key: 'remaining', header: 'Remaining', align: 'end', cell: (r) => <TableAmount currency={code}>{formatAmount(Math.max(0, round2(r.balanceDue - rowSettled(r))))}</TableAmount> },
    ];
    return (
      <Section icon="checklist" title="Bills settled">
        {settled.length ? (
          <Card>
            <Table
              caption="Bills settled"
              columns={columns}
              rows={settled}
              getRowId={(r) => r.id}
              footerRow={
                <>
                  {draft.onAccount ? <TotalLine cells={['Payment on account', undefined, `${code} ${formatAmount(draft.onAccount)}`]} /> : null}
                  <TotalLine cells={['TOTAL', undefined, `${code} ${formatAmount(totalPay)}`]} />
                </>
              }
            />
          </Card>
        ) : (
          <Text tone="muted">No bills — the whole amount was paid on account ({code} {formatAmount(draft.onAccount)}).</Text>
        )}
      </Section>
    );
  }

  const columns: TableColumn<PaymentRow>[] = [
    { key: 'docNo', header: 'A/P No.', cell: billCell },
    { key: 'dueDate', header: 'Due date', cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
    { key: 'overdue', header: 'Overdue', align: 'end', cell: overdue },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => <TableAmount currency={code}>{formatAmount(r.total)}</TableAmount> },
    { key: 'balanceDue', header: 'Balance due', align: 'end', cell: (r) => <TableAmount currency={code}>{formatAmount(r.balanceDue)}</TableAmount> },
    {
      key: 'amount',
      header: 'Amount to pay',
      align: 'end',
      cell: (r) =>
        r.selected ? (
          <div className="flex w-40 flex-col items-end gap-0.5 py-1">
            <TextField
              aria-label={`Amount to pay on ${r.docNo}`}
              type="number"
              min={0}
              max={r.balanceDue}
              step="0.01"
              className="w-40 text-right"
              invalid={Boolean(errors[`row:${r.id}`])}
              value={String(r.amount)}
              onChange={(e) => patch(r.id, { amount: round2(num(e.currentTarget.value)) })}
            />
            {r.amount > 0 && r.amount < r.balanceDue ? (
              <Text as="span" variant="small" tone="muted" className="tabular-nums">Remaining {formatAmount(round2(r.balanceDue - r.amount))}</Text>
            ) : null}
            {errors[`row:${r.id}`] ? <Text as="span" variant="small" tone="danger">{errors[`row:${r.id}`]}</Text> : null}
          </div>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <Section icon="checklist" title="Bills to Pay">
      {!draft.vendorId ? (
        <Text tone="muted">Select a vendor to see their open bills.</Text>
      ) : (
        <Card>
          <Table
            caption="Bills to pay"
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            selectable
            selectedIds={ticked.map((r) => r.id)}
            onSelectionChange={(ids) =>
              update({
                rows: rows.map((r) => {
                  const on = ids.includes(r.id) && !r.blocked;
                  return { ...r, selected: on, amount: on ? (r.selected ? r.amount : r.balanceDue) : 0 };
                }),
              })
            }
            footerRow={
              <>
                {!rows.length ? <Text tone="muted" className="px-2 py-2">No open bills for this vendor.</Text> : null}
                <div className="flex items-center gap-4 px-2 py-1">
                  <Checkbox
                    checked={onAccountOn}
                    onChange={(e) => {
                      setOnAccountOn(e.currentTarget.checked);
                      if (!e.currentTarget.checked) update({ onAccount: 0 });
                    }}
                  >
                    Payment on account
                  </Checkbox>
                  <span className="flex-1" />
                  <TextField
                    aria-label="Amount on account"
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-40 text-right"
                    disabled={!onAccountOn}
                    invalid={Boolean(errors.onAccount)}
                    value={String(draft.onAccount)}
                    onChange={(e) => update({ onAccount: round2(num(e.currentTarget.value)) })}
                  />
                </div>
                <TotalLine cells={['TOTAL', `${code} ${formatAmount(totalBalance)}`, `${code} ${formatAmount(totalPay)}`]} />
              </>
            }
          />
        </Card>
      )}
      {errors.rows ? <Text variant="small" tone="danger">{errors.rows}</Text> : null}
    </Section>
  );
}

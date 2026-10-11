import { useState } from 'react';
import { Link, Text, TextField, Tooltip } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../../services/format';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { soTotals, soWithholding } from '../../../../services/salesOrders';
import { determineTax } from '../../../../services/taxDetermination';
import type { SoTabProps } from './types';

export function TotalsFooter({ draft, update, ctx, m }: SoTabProps) {
  const [editDiscount, setEditDiscount] = useState(false);
  const [editFreight, setEditFreight] = useState(false);

  const customer = ctx.customer;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = soTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const withholdingLines = soWithholding(draft, customer, m.items, m.tax);
  const withholdingTotal = withholdingLines.reduce((n, w) => n + w.amount, 0);
  const totalLc = totals.total * ctx.fx;
  const taxNotes = [
    ...new Set(
      draft.lines.flatMap((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item && customer ? determineTax('Sales', item, customer, m.tax, draft.postingDate).notes : [];
      }),
    ),
  ];

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <div className="flex flex-col gap-1 px-2 py-1">
        <div className="flex items-center justify-between gap-4">
          <Text variant="small" tone="muted">Subtotal</Text>
          <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.beforeDiscount)}</Text>
        </div>
        {draft.discountPct > 0 || editDiscount ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Text variant="small" tone="muted">Discount</Text>
              <TextField aria-label="Document discount %" type="number" min={0} className="w-20" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />
            </div>
            <Text variant="small" className="tabular-nums">{totals.discount ? `–${draft.currency} ${formatAmount(totals.discount)}` : '—'}</Text>
          </div>
        ) : (
          <Link onClick={() => setEditDiscount(true)}>+ Add discount</Link>
        )}
        {SALES_SETTINGS.manageFreightInDocuments ? (
          draft.freight > 0 || editFreight ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Text variant="small" tone="muted">Freight</Text>
                <TextField aria-label="Freight amount" type="number" min={0} className="w-24" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
              </div>
              <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.freight)}</Text>
            </div>
          ) : (
            <Link onClick={() => setEditFreight(true)}>+ Add freight</Link>
          )
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Text variant="small" tone="muted">Tax</Text>
            {taxNotes.length > 0 && (
              <Tooltip message={<div className="flex flex-col gap-1">{taxNotes.map((n) => <span key={n}>{n}</span>)}</div>} icon="info" />
            )}
          </div>
          <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.tax)}</Text>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
          <Text variant="small" weight="semibold" tone="heading">Total</Text>
          <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{draft.currency} {formatAmount(totals.total)}</Text>
        </div>
        {withholdingLines.map((w) => (
          <div key={w.atc} className="flex items-center justify-between gap-4">
            <Text variant="small" tone="muted">{w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — {w.atc} ({w.rate}%)</Text>
            <Text variant="small" tone="danger" className="tabular-nums">–{draft.currency} {formatAmount(w.amount)}</Text>
          </div>
        ))}
        {withholdingLines.length > 0 && (
          <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
            <Text variant="small" weight="semibold" tone="heading">Net to receive</Text>
            <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{draft.currency} {formatAmount(totals.total - withholdingTotal)}</Text>
          </div>
        )}
        {draft.currency !== 'PHP' ? (
          <Text variant="small" tone="muted" className="text-right">≈ PHP {formatAmount(totalLc)}</Text>
        ) : null}
      </div>
    </fieldset>
  );
}

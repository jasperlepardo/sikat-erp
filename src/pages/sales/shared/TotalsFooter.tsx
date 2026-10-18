import type { ReactNode } from 'react';
import { Checkbox, Text, TextField, Tooltip } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../services/format';
import { SALES_SETTINGS } from '../../../mocks/salesOrders';
import { soTotals, soWithholding } from '../../../services/salesOrders';
import { determineTax } from '../../../services/taxDetermination';
import type { Currency } from '../../../mocks/currencies';
import type { Item } from '../../../mocks/items';
import type { Partner } from '../../../mocks/partners';
import type { TaxMasterData } from '../../../services/taxDetermination';

type SoTotalsInput = Parameters<typeof soTotals>[0];

/** What the footer reads; sales orders and quotations both carry it (quotation lines are a subset of an order's). */
interface TotalsFooterProps {
  draft: Omit<SoTotalsInput, 'lines'> & { lines: { itemId: string }[]; currency: string; postingDate: string };
  update: (patch: { discountPct?: number; freight?: number; rounding?: boolean }) => void;
  ctx: { customer?: Partner; rateOf: (taxCode: string) => number; fx: number; readOnly: boolean };
  m: { currencies: Currency[]; items: Item[]; tax: TaxMasterData };
  /** Shows the rounding switch (the currency's rounding rule) above Tax. */
  withRounding?: boolean;
  /** The document's own withholding lines, in place of the sales order's per-ATC estimate. */
  withholding?: { label: string; amount: number }[];
  /** Rows after the total and net, e.g. what's been applied and the balance due. */
  extraRows?: ReactNode;
}

/** Subtotal, discount, freight, tax, total and withholding under a sales document's lines. */
export function SalesTotalsFooter({ draft, update, ctx, m, withRounding, withholding, extraRows }: TotalsFooterProps) {
  const doc = draft as unknown as SoTotalsInput;


  const customer = ctx.customer;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = soTotals(doc, ctx.rateOf, docCurrency?.rounding);
  const withholdingLines = withholding ?? soWithholding(doc, customer, m.items, m.tax).map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount }));
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
        {draft.discountPct > 0 ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Text variant="small" tone="muted">Discount</Text>
              <TextField aria-label="Document discount %" type="number" min={0} className="w-20" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />
            </div>
            <Text variant="small" className="tabular-nums">{totals.discount ? `–${draft.currency} ${formatAmount(totals.discount)}` : '—'}</Text>
          </div>
        ) : null}
        {SALES_SETTINGS.manageFreightInDocuments && draft.freight > 0 ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Text variant="small" tone="muted">Freight</Text>
              <TextField aria-label="Freight amount" type="number" min={0} className="w-24" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
            </div>
            <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.freight)}</Text>
          </div>
        ) : null}
        {withRounding ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Text variant="small" tone="muted">Rounding</Text>
              <Checkbox aria-label="Apply rounding" checked={draft.rounding} onChange={(e) => update({ rounding: e.currentTarget.checked })}>{docCurrency?.rounding ?? 'No rounding'}</Checkbox>
            </div>
            <Text variant="small" className="tabular-nums">{totals.rounding ? `${draft.currency} ${formatAmount(totals.rounding)}` : '—'}</Text>
          </div>
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
          <div key={w.label} className="flex items-center justify-between gap-4">
            <Text variant="small" tone="muted">{w.label}</Text>
            <Text variant="small" tone="danger" className="tabular-nums">–{draft.currency} {formatAmount(w.amount)}</Text>
          </div>
        ))}
        {withholdingLines.length > 0 && (
          <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
            <Text variant="small" weight="semibold" tone="heading">Net to receive</Text>
            <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{draft.currency} {formatAmount(totals.total - withholdingTotal)}</Text>
          </div>
        )}
        {extraRows}
        {draft.currency !== 'PHP' ? (
          <Text variant="small" tone="muted" className="text-right">≈ PHP {formatAmount(totalLc)}</Text>
        ) : null}
      </div>
    </fieldset>
  );
}

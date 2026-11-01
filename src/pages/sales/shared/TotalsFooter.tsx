import type { ReactNode } from 'react';
import { Checkbox, TextField, Tooltip } from '@jasperlepardo/sikat-design-system';
import { amt, TotalsBar, TotalsRow } from '../../../components/form/TotalsFooterParts';
import { SALES_SETTINGS } from '../../../mocks/salesOrders';
import { soTotals, soVatBreakdown, soWithholding, type SoTotals } from '../../../services/salesOrders';
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
  /** The document's totals, computed once by the page (so the footer shows exactly what's posted/saved). */
  totals: SoTotals;
  /** Label for the strong total bar. Default "Total"; a credit memo passes "Total credit". */
  totalLabel?: string;
  /** Currency view: when its code differs from the document currency, amounts are converted and inputs lock. */
  view?: { code: string; convert: (n: number) => number };
}

/** Subtotal, discount, freight, tax, total and withholding under a sales document's lines. */
export function SalesTotalsFooter({ draft, update, ctx, m, withRounding, withholding, extraRows, totals, totalLabel = 'Total', view }: TotalsFooterProps) {
  const doc = draft as unknown as SoTotalsInput;

  // When a foreign-currency document is viewed in PHP, amounts convert and the inline editors lock.
  const code = view?.code ?? draft.currency;
  const conv = view?.convert ?? ((n: number) => n);
  const converted = code !== draft.currency;
  const ro = ctx.readOnly || converted;

  const customer = ctx.customer;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  // BIR invoice breakdown — only shown when a VAT-registered sale genuinely mixes categories.
  const vat = soVatBreakdown(doc, m.tax.codes, ctx.rateOf);
  const showVatBreakdown = vat.vatable > 0 && (vat.zeroRated > 0 || vat.exempt > 0);
  const withholdingLines = withholding ?? soWithholding({ ...doc, postingDate: draft.postingDate }, customer, m.items, m.tax).map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount }));
  const withholdingTotal = withholdingLines.reduce((n, w) => n + w.amount, 0);
  const taxNotes = [
    ...new Set(
      draft.lines.flatMap((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item && customer ? determineTax('Sales', item, customer, m.tax, draft.postingDate).notes : [];
      }),
    ),
  ];

  return (
    <div className="flex flex-col">
      <TotalsRow label="Subtotal" value={amt(conv(totals.beforeDiscount), code)} />
      {draft.discountPct > 0 ? (
        <TotalsRow
          label="Discount"
          input={<TextField aria-label="Document discount %" type="number" min={0} className="w-20" suffix="%" readOnly={ro} value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />}
          value={totals.discount ? amt(-conv(totals.discount), code) : '—'}
        />
      ) : null}
      {SALES_SETTINGS.manageFreightInDocuments && draft.freight > 0 ? (
        <TotalsRow
          label="Freight"
          input={converted ? undefined : <TextField aria-label="Freight amount" type="number" min={0} className="w-24" prefix={draft.currency} readOnly={ctx.readOnly} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />}
          value={amt(conv(totals.freight), code)}
        />
      ) : null}
      {withRounding ? (
        <TotalsRow
          label="Rounding"
          input={<Checkbox aria-label="Apply rounding" readOnly={ro} checked={draft.rounding} onChange={(e) => update({ rounding: e.currentTarget.checked })}>{docCurrency?.rounding ?? 'No rounding'}</Checkbox>}
          value={totals.rounding ? amt(conv(totals.rounding), code) : '—'}
        />
      ) : null}
      {showVatBreakdown ? (
        <>
          <TotalsRow label="VATable sales" value={amt(conv(vat.vatable), code)} />
          {vat.zeroRated > 0 ? <TotalsRow label="Zero-rated sales" value={amt(conv(vat.zeroRated), code)} /> : null}
          {vat.exempt > 0 ? <TotalsRow label="VAT-exempt sales" value={amt(conv(vat.exempt), code)} /> : null}
        </>
      ) : null}
      <TotalsRow
        label={showVatBreakdown ? 'VAT (12%)' : 'Tax'}
        input={taxNotes.length > 0 ? <Tooltip message={<div className="flex flex-col gap-1">{taxNotes.map((n) => <span key={n}>{n}</span>)}</div>} icon="info" /> : undefined}
        value={amt(conv(totals.tax), code)}
      />
      <TotalsBar label={totalLabel} value={amt(conv(totals.total), code)} />
      {withholdingLines.length > 0 ? (
        <>
          {withholdingLines.map((w) => (
            <TotalsRow key={w.label} label={w.label} tone="danger" value={amt(-conv(w.amount), code)} />
          ))}
          <TotalsBar label="Net to receive" value={amt(conv(totals.total - withholdingTotal), code)} />
        </>
      ) : null}
      {extraRows}
    </div>
  );
}

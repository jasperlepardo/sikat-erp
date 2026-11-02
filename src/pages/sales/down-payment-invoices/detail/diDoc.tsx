import { Button, Icon, TextField } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { invoiceDoc, type InvoiceDocProps, type InvoiceLine } from '../../shared/invoiceDoc';
import { type SalesView } from '../../shared/salesView';
import { amt, TotalsBar, TotalsNote, TotalsRow } from '../../../../components/form/TotalsFooterParts';
import { diTotals } from '../../../../services/arDownPaymentInvoices';
import { formatAmount } from '../../../../services/format';
import { round2 } from '../../../../services/num';
import { cap } from '../../../../components/form/noun';
import { DI_NOUN } from '../../paths';
import { type DiSectionProps } from './types';

export interface DiDocProps extends DiSectionProps {
  onCopyClick: () => void;
  canCopy: boolean;
  /** Customer withholding on the billed share, document currency. */
  withholding: { label: string; amount: number }[];
}

/**
 * The A/R down payment invoice contents: the sales line table (reused from `invoiceDoc`, copy-from a
 * sales order only) with a down-payment-invoice footer — the DPM % that sets the advance, the
 * creditable withholding, what's been paid, and what's left to draw on the final invoice.
 */
export function diDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy, withholding }: DiDocProps, view: SalesView): DocLinesProps<InvoiceLine> {
  const base = invoiceDoc(
    { kind: 'RI', draft, update, errors, m, ctx, onCopyClick, canCopy } as unknown as InvoiceDocProps,
    view,
  );

  const totals = diTotals(draft, ctx.rateOf);
  const locked = ctx.readOnly || view.converted;
  const wtaxTotal = withholding.reduce((n, w) => n + w.amount, 0);
  const balance = round2(totals.total - wtaxTotal - draft.appliedAmount);

  const footer = (
    <div className="flex flex-col">
      <TotalsRow label="Subtotal" value={amt(view.convert(totals.beforeDiscount), view.code)} />
      {draft.discountPct > 0 ? (
        <TotalsRow label="Discount" value={totals.discount ? amt(-view.convert(totals.discount), view.code) : '—'} />
      ) : null}
      <TotalsRow
        label={ctx.readOnly ? `Down payment (${draft.dpmPct}%)` : 'Down payment'}
        value={amt(view.convert(totals.dpm), view.code)}
        input={locked ? undefined : (
          <TextField aria-label="Down payment %" type="number" min={0} className="w-24" suffix="%" value={String(draft.dpmPct)} onChange={(e) => update({ dpmPct: Math.min(100, Number(e.currentTarget.value)) })} />
        )}
      />
      <TotalsRow label="Tax" value={amt(view.convert(totals.tax), view.code)} />
      <TotalsBar label="Total" value={amt(view.convert(totals.total), view.code)} />
      {withholding.map((w) => (
        <TotalsRow key={w.label} label={w.label} tone="danger" value={amt(-view.convert(w.amount), view.code)} />
      ))}
      {draft.appliedAmount ? <TotalsRow label="Applied amount" value={amt(-view.convert(draft.appliedAmount), view.code)} /> : null}
      <TotalsBar label="Balance due" value={amt(view.convert(balance), view.code)} />
      {ctx.readOnly && draft.drawnAmount > 0 ? (
        <TotalsNote>Drawn on A/R invoices: {view.code} {formatAmount(view.convert(draft.drawnAmount))} of {formatAmount(view.convert(draft.appliedAmount))} paid.</TotalsNote>
      ) : null}
    </div>
  );

  return {
    ...base,
    prefsKey: 'ar-di',
    title: cap(DI_NOUN.lineLabel!),
    footer,
    header: locked ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
          Copy from SO
        </Button>
      </div>
    ),
  };
}

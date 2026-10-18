import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Combobox, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../../components/form/fields';
import { formatAmount } from '../../../../services/format';
import { apTotals, netDue } from '../../../../services/apInvoices';
import { drawableAmount } from '../../../../services/apDownPayments';
import { getPurchasingSettings, poWithholding } from '../../../../services/purchaseOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { PurchTotalsFooter, PurchPurchTotalNote, PurchPurchTotalRow } from '../../../shared/PurchTotalsFooter';
import { DrawPanel } from './DrawPanel';
import type { ApSectionProps } from './types';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

export function ApTotalsCard({ draft, update, m, ctx }: ApSectionProps) {
  const h = bind(draft, update);
  const [drawing, setDrawing] = useState(false);
  const code = draft.currency;
  const docCurrency = m.currencies.find((c) => c.code === code);
  const totals = apTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = poWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const due = netDue(totals.total, withholding, draft.downPayment);
  const balance = Math.round((due - draft.appliedAmount) * 100) / 100;
  const drawable = m.downPayments
    .filter((d) => d.vendorId === draft.vendorId && d.currency === code && (d.status === 'Open' || (draft.drawnDownPayments ?? []).some((x) => x.requestId === d.id)))
    .filter((d) => drawableAmount(d) > 0 || (draft.drawnDownPayments ?? []).some((x) => x.requestId === d.id));
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';

  return (
    <Section icon="functions" title="Totals">
      <Fields cols={1}>
        <fieldset disabled={ctx.readOnly} className="contents">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who bought the goods.' })}
            {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
          </div>
        </fieldset>
        <PurchTotalsFooter
          totals={totals}
          currency={code}
          readOnly={ctx.readOnly}
          discountPct={draft.discountPct}
          onDiscountChange={(discountPct) => update({ discountPct })}
          freightInput={showFreight ? (
            <div className="flex gap-1">
              <TextField aria-label={`Freight (${code}, net)`} type="number" min={0} className="w-32" prefix={code} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
              <Combobox
                aria-label="Freight tax code"
                className="w-28"
                options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                value={draft.freightTaxCode}
                onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
              />
            </div>
          ) : undefined}
          roundingLabel={showRounding ? `Rounding (${docCurrency?.rounding ?? 'No rounding'})` : undefined}
          extraRows={<>
            {withholding.filter((w) => w.deducted).map((w) => (
              <PurchTotalRow key={w.atc} label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`} value={-w.amount} code={code} />
            ))}
            {withholding.filter((w) => !w.deducted).map((w) => (
              <PurchTotalNote key={w.atc}>
                VAT withheld — {w.atc} ({w.rate}%): {code} {formatAmount(w.amount)} remitted by you on BIR 1600-VT, not deducted from the vendor.
              </PurchTotalNote>
            ))}
            <PurchTotalRow
              label="Total down payment"
              value={-draft.downPayment}
              code={code}
              input={
                !ctx.readOnly && drawable.length ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => setDrawing(true)}>
                    {draft.downPayment ? 'Change…' : `Draw… (${drawable.length})`}
                  </Button>
                ) : undefined
              }
            />
            {(draft.drawnDownPayments ?? []).length ? (
              <PurchTotalNote>
                Drawn from {(draft.drawnDownPayments ?? []).map((d) => `request ${d.docNo} (${code} ${formatAmount(d.amount)})`).join(', ')} — clears PHP{' '}
                {formatAmount((draft.drawnDownPayments ?? []).reduce((n, d) => n + d.amountLc, 0))} from the advance account.
              </PurchTotalNote>
            ) : null}
            <PurchTotalRow label="Net payment due" value={due} code={code} strong />
            <PurchTotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
            <PurchTotalRow label="Balance due" value={balance} code={code} strong />
            {code !== 'PHP' ? <PurchTotalNote>≈ PHP {formatAmount(balance * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.</PurchTotalNote> : null}
          </>}
        />
        <Flags>
          {h.check('paymentBlock', 'Payment block (keep out of payment runs)')}
          {h.check('paymentOrderRun', 'Include in payment runs (Payment Order Ref.)')}
        </Flags>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the invoice is added.' })}
      </Fields>
      {drawing
        ? createPortal(
            <DrawPanel
              code={code}
              requests={drawable}
              current={draft.drawnDownPayments ?? []}
              max={Math.max(0, Math.round((totals.total - withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0)) * 100) / 100)}
              onCancel={() => setDrawing(false)}
              onDone={(draws) => {
                update({ drawnDownPayments: draws, downPayment: Math.round(draws.reduce((n, d) => n + d.amount, 0) * 100) / 100 });
                setDrawing(false);
              }}
            />,
            document.body,
          )
        : null}
    </Section>
  );
}

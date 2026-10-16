import { Combobox, List, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { getPurchasingSettings, poTotals, poWithholding } from '../../../../services/purchaseOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { TotalNote, TotalRow } from '../../shared/TotalRow';
import { viewCurrency, type PoSectionProps } from './types';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

export function TotalsCard({ draft, update, m, ctx }: PoSectionProps) {
  const h = bind(draft, update);
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = poTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholdingLines = poWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const withholdingTotal = withholdingLines.filter((w) => w.deducted).reduce((s, w) => s + w.amount, 0);
  const view = viewCurrency(draft, ctx, m);

  return (
    <Section icon="functions" title="Totals">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Fields cols={1}>
          <fieldset disabled={ctx.readOnly} className="contents">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who placed the order.' })}
              {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
            </div>
          </fieldset>
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the PO is added.' })}
        </Fields>
        <fieldset disabled={ctx.readOnly} className="contents">
          <List.Group divider>
            <TotalRow label="Total before discount" value={view.convert(totals.beforeDiscount)} code={view.code} />
            <TotalRow
              label="Discount"
              value={totals.discount ? -view.convert(totals.discount) : 0}
              code={view.code}
              input={
                <TextField
                  aria-label="Document discount %"
                  type="number"
                  min={0}
                  className="w-24"
                  suffix="%"
                  value={String(draft.discountPct)}
                  onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })}
                />
              }
            />
            {getPurchasingSettings().manageFreightInDocuments ? (
              <TotalRow
                label="Freight"
                value={view.convert(totals.freight)}
                code={view.code}
                input={
                  <div className="flex gap-1">
                    <TextField
                      aria-label={`Freight (${draft.currency}, net)`}
                      type="number"
                      min={0}
                      className="w-32"
                      prefix={draft.currency}
                      value={String(draft.freight)}
                      onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                    />
                    <Combobox
                      aria-label="Freight tax code"
                      className="w-28"
                      options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                      value={draft.freightTaxCode}
                      onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                    />
                  </div>
                }
              />
            ) : null}
            {getPurchasingSettings().roundingMethod === 'By Currency' ? (
              <TotalRow label={`Rounding (${docCurrency?.rounding ?? 'No rounding'})`} value={view.convert(totals.rounding)} code={view.code} />
            ) : null}
            <TotalRow label="Tax" value={view.convert(totals.tax)} code={view.code} />
            {totals.reverseCharge ? (
              <TotalNote>
                VAT of {view.code} {formatAmount(view.convert(totals.reverseCharge))} isn't paid to the vendor: reverse-charge VAT
                you withhold and remit (BIR 1600-VT), and import VAT is paid to the Bureau of Customs. Both are claimed as input VAT.
              </TotalNote>
            ) : null}
            {withholdingLines.filter((w) => w.deducted).map((w) => (
              <TotalRow
                key={w.atc}
                label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`}
                value={-view.convert(w.amount)}
                code={view.code}
              />
            ))}
            {withholdingLines.filter((w) => !w.deducted).map((w) => (
              <TotalNote key={w.atc}>
                VAT withheld — {w.atc} ({w.rate}%): {view.code} {formatAmount(view.convert(w.amount))} remitted by you on BIR 1600-VT, not
                deducted from the vendor.
              </TotalNote>
            ))}
            <TotalRow
              label="Net payment due"
              value={view.convert(totals.total - withholdingTotal)}
              code={view.code}
              strong
            />
            {draft.currency !== 'PHP' && draft.currencyView === 'BP' ? (
              <Text variant="small" tone="muted">
                ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${formatDate(ctx.fxDate)} rate)` : '—'}.
              </Text>
            ) : null}
          </List.Group>
        </fieldset>
      </div>
    </Section>
  );
}

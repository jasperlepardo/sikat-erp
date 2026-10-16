import { Combobox, List, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { formatAmount } from '../../../../services/format';
import { grTotals } from '../../../../services/goodsReceipts';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { TotalNote, TotalRow } from '../../shared/TotalRow';
import type { GrSectionProps } from './types';

export function GrTotalsCard({ draft, update, m, ctx }: GrSectionProps) {
  const h = bind(draft, update);
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = grTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);

  return (
    <Section icon="functions" title="Totals">
      <Fields cols={1}>
        <fieldset disabled={ctx.readOnly} className="contents">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who bought the goods.' })}
            {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
          </div>
        </fieldset>
        <fieldset disabled={ctx.readOnly} className="contents">
          <List.Group divider>
            <TotalRow label="Total before discount" value={totals.beforeDiscount} code={draft.currency} />
            <TotalRow
              label="Discount"
              value={totals.discount ? -totals.discount : 0}
              code={draft.currency}
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
                value={totals.freight}
                code={draft.currency}
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
              <TotalRow label={`Rounding (${docCurrency?.rounding ?? 'No rounding'})`} value={totals.rounding} code={draft.currency} />
            ) : null}
            <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
            {totals.reverseCharge ? (
              <TotalNote>
                VAT of {draft.currency} {formatAmount(totals.reverseCharge)} isn't paid to the vendor (reverse charge or import VAT).
              </TotalNote>
            ) : null}
            <TotalRow label="Total payment due" value={totals.total} code={draft.currency} strong />
            {draft.currency !== 'PHP' ? (
              <Text variant="small" tone="muted">
                ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.
              </Text>
            ) : null}
          </List.Group>
        </fieldset>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the receipt is added.' })}
      </Fields>
    </Section>
  );
}

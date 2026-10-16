import { List, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { rfqTotals } from '../../../../services/rfqs';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { TotalNote, TotalRow } from '../../shared/TotalRow';
import type { RfqSectionProps } from './types';

export function TotalsCard({ draft, update, m, ctx }: RfqSectionProps) {
  const h = bind(draft, update);
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = rfqTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);

  return (
    <Section icon="functions" title="Totals">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Fields cols={1}>
          <fieldset disabled={ctx.readOnly} className="contents">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who placed the RFQ.' })}
              {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
            </div>
          </fieldset>
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the RFQ is added.' })}
        </Fields>
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
                  <TextField
                    aria-label={`Freight (${draft.currency}, net)`}
                    type="number"
                    min={0}
                    className="w-32"
                    prefix={draft.currency}
                    value={String(draft.freight)}
                    onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                  />
                }
              />
            ) : null}
            <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
            {totals.reverseCharge ? (
              <TotalNote>
                VAT of {draft.currency} {formatAmount(totals.reverseCharge)} won't be paid to the vendor: reverse-charge or import VAT remitted separately.
              </TotalNote>
            ) : null}
            <TotalRow label="Total payment due" value={totals.total} code={draft.currency} strong />
            {draft.currency !== 'PHP' && ctx.fx ? (
              <Text variant="small" tone="muted">
                ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx} ({formatDate(ctx.fxDate)} rate).
              </Text>
            ) : null}
          </List.Group>
        </fieldset>
      </div>
    </Section>
  );
}

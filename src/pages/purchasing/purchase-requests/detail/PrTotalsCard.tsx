import { TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { prTotals } from '../../../../services/purchaseRequests';
import { PurchTotalsFooter } from '../../shared/PurchTotalsFooter';
import type { PrSectionProps } from './types';

export function PrTotalsCard({ draft, update, ctx }: PrSectionProps) {
  const h = bind(draft, update);
  const totals = prTotals(draft, ctx.rateOf);

  return (
    <Section icon="functions" title="Totals">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Fields cols={1}>
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document for access control.' })}
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the request is added.' })}
        </Fields>
        <PurchTotalsFooter
          totals={{ ...totals, rounding: 0 }}
          currency="PHP"
          readOnly={ctx.readOnly}
          discountPct={0}
          onDiscountChange={() => {}}
          freightInput={
            <TextField
              aria-label="Freight estimate"
              type="number"
              min={0}
              className="w-32"
              prefix="PHP"
              value={String(draft.freight)}
              onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
            />
          }
          totalLabel="Total payment due (estimate)"
        />
      </div>
    </Section>
  );
}

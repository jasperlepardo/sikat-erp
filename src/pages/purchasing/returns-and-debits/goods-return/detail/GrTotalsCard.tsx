import { Fields, Section, bind } from '../../../../../components/form/fields';
import { returnTotals } from '../../../../../services/goodsReturns';
import { salesEmployeeDef } from '../../../../settings/masterDefs';
import { PurchTotalsFooter } from '../../../shared/PurchTotalsFooter';
import type { GrSectionProps } from './types';

interface GrTotalsCardProps extends GrSectionProps {
  locked: boolean;
}

export function GrTotalsCard({ draft, update, ctx, locked }: GrTotalsCardProps) {
  const h = bind(draft, update);
  const code = draft.currency;
  const totals = returnTotals(draft, ctx.rateOf, ctx.isReverseCharge);

  return (
    <Section icon="functions" title="Totals">
      <Fields cols={1}>
        <fieldset disabled={locked} className="contents">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {h.master('buyerId', 'Buyer', salesEmployeeDef)}
            {h.master('ownerId', 'Owner', salesEmployeeDef)}
          </div>
        </fieldset>
        <PurchTotalsFooter
          totals={totals}
          currency={code}
          readOnly={locked}
          discountPct={draft.discountPct}
          onDiscountChange={(discountPct) => update({ discountPct })}
          totalLabel="Total credit"
        />
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the return is added.' })}
      </Fields>
    </Section>
  );
}

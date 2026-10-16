import { List, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../components/form/fields';
import { formatAmount } from '../../../services/format';
import { dprTotals } from '../../../services/apDownPayments';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { TotalNote, TotalRow } from '../shared/TotalRow';
import type { DprSectionProps } from './types';

export function DprTotalsCard({ draft, update, ctx }: DprSectionProps) {
  const h = bind(draft, update);
  const code = draft.currency;
  const totals = dprTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const balance = Math.round((totals.total - draft.appliedAmount) * 100) / 100;

  return (
    <Section icon="functions" title="Totals">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Fields cols={1}>
          <fieldset disabled={ctx.readOnly} className="contents">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {h.master('buyerId', 'Buyer', salesEmployeeDef)}
              {h.master('ownerId', 'Owner', salesEmployeeDef)}
              {h.num('dpmPct', 'DPM %', { required: true, suffix: '%', error: undefined, hint: 'The share of the order requested up front.' })}
            </div>
          </fieldset>
          <Flags>{h.check('paymentOrderRun', 'Include in payment runs (Payment Order Run)')}</Flags>
          {h.area('remarks', 'Remarks', { rows: 3 })}
        </Fields>
        <fieldset disabled={ctx.readOnly} className="contents">
          <List.Group divider>
            <TotalRow label="Total before discount" value={totals.beforeDiscount} code={code} />
            <TotalRow label="Discount" value={totals.discount ? -totals.discount : 0} code={code} input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />} />
            <TotalRow label={`Down payment (${draft.dpmPct}%)`} value={totals.dpm} code={code} />
            <TotalRow label="Tax" value={totals.tax} code={code} />
            {totals.reverseCharge ? <TotalNote>VAT of {code} {formatAmount(totals.reverseCharge)} isn't paid to the vendor (reverse charge or import VAT).</TotalNote> : null}
            <TotalRow label="Total payment due" value={totals.total} code={code} strong />
            <TotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
            <TotalRow label="Balance due" value={balance} code={code} strong />
            {ctx.readOnly && draft.appliedAmount ? <TotalNote>Drawn on A/P invoices: {code} {formatAmount(draft.drawnAmount)} of {formatAmount(draft.appliedAmount)} paid.</TotalNote> : null}
          </List.Group>
        </fieldset>
      </div>
    </Section>
  );
}

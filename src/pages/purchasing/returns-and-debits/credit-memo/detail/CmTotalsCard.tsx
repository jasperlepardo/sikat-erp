import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../../../components/form/fields';
import { formatAmount } from '../../../../../services/format';
import { formatDate } from '../../../../../services/dates';
import { salesEmployeeDef } from '../../../../settings/masterDefs';
import { PurchTotalsFooter, PurchTotalRow } from '../../../shared/PurchTotalsFooter';
import type { CmSectionProps } from './types';

const WITHHELD_LABEL: Record<string, string> = { 'Expanded (EWT)': 'EWT', 'Final (FWT)': 'Final tax', 'Withholding VAT': 'VAT', 'Percentage tax': 'Percentage tax' };

interface CmTotalsCardProps extends CmSectionProps {
  locked: boolean;
  totals: { beforeDiscount: number; discount: number; tax: number; total: number; reverseCharge?: number };
  withholding: { atc: string; kind: string; rate: number; amount: number; deducted: boolean }[];
  credit: number;
  openBalance: number;
}

export function CmTotalsCard({ draft, update, locked, totals, withholding, credit, openBalance }: CmTotalsCardProps) {
  const h = bind(draft, update);
  const code = draft.currency;

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
          totals={{ ...totals, freight: 0, rounding: 0 }}
          currency={code}
          readOnly={locked}
          discountPct={draft.discountPct}
          onDiscountChange={(discountPct) => update({ discountPct })}
          midRows={<PurchTotalRow label="Total down payment" value={-draft.downPayment} code={code} />}
          totalLabel="Total credit"
          extraRows={<>
            {withholding.filter((w) => w.deducted).map((w) => (
              <PurchTotalRow key={w.atc} label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} reversed — ${w.atc} (${w.rate}%)`} value={-w.amount} code={code} />
            ))}
            <PurchTotalRow label="Net credit" value={credit} code={code} strong />
            <PurchTotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
            <PurchTotalRow label="Open balance" value={openBalance} code={code} strong />
          </>}
        />
        {draft.applications.length ? (
          <Text variant="small" tone="muted">
            Applied to {draft.applications.map((a) => `A/P invoice ${a.docNo} (${code} ${formatAmount(a.amount)}, ${formatDate(a.date)})`).join('; ')}.
          </Text>
        ) : null}
        <Flags>
          {h.check('paymentBlock', 'Payment block')}
          {h.check('paymentOrderRun', 'Include in payment runs (Payment Order Run)')}
        </Flags>
        {h.area('remarks', 'Remarks', { rows: 3 })}
      </Fields>
    </Section>
  );
}

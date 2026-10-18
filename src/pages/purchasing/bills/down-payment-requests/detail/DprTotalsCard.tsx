import { FieldStack, Flags, Section, bind } from '../../../../../components/form/fields';
import { salesEmployeeDef } from '../../../../settings/masterDefs';
import type { DprSectionProps } from './types';

export function DprTotalsCard({ draft, update, ctx }: DprSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <fieldset disabled={ctx.readOnly} className="contents">
        <FieldStack>
          {h.master('buyerId', 'Buyer', salesEmployeeDef)}
          {h.master('ownerId', 'Owner', salesEmployeeDef)}
          {h.num('dpmPct', 'DPM %', { required: true, suffix: '%', error: undefined, hint: 'The share of the order requested up front.' })}
        </FieldStack>
      </fieldset>
      <Flags>{h.check('paymentOrderRun', 'Include in payment runs (Payment Order Run)')}</Flags>
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3 })}
      </FieldStack>
    </Section>
  );
}

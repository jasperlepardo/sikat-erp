import { FieldStack, Flags, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { ApSectionProps } from './types';

export function ApTotalsCard({ draft, update, ctx }: ApSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <fieldset disabled={ctx.readOnly} className="contents">
        <FieldStack>
          {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who bought the goods.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
        </FieldStack>
      </fieldset>
      <Flags>
        {h.check('paymentBlock', 'Payment block (keep out of payment runs)')}
        {h.check('paymentOrderRun', 'Include in payment runs (Payment Order Ref.)')}
      </Flags>
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the invoice is added.' })}
      </FieldStack>
    </Section>
  );
}

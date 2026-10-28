import { FieldStack, Flags, Section, SideFields, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { CmSectionProps } from './types';

/** Buyer, owner, payment flags and remarks. The totals sit in the Contents footer (memoDoc). */
export function CmTotalsCard({ draft, update, locked }: CmSectionProps & { locked: boolean }) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <fieldset disabled={locked} className="contents">
        <SideFields>
          {h.master('buyerId', 'Buyer', salesEmployeeDef)}
          {h.master('ownerId', 'Owner', salesEmployeeDef)}
        </SideFields>
      </fieldset>
      <Flags>
        {h.check('paymentBlock', 'Payment block')}
        {h.check('paymentOrderRun', 'Include in payment runs (Payment Order Run)')}
      </Flags>
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the credit memo is added.' })}
      </FieldStack>
    </Section>
  );
}

import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { GrSectionProps } from './types';

export function GrTotalsCard({ draft, update, ctx }: GrSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <fieldset disabled={ctx.readOnly} className="contents">
        <FieldStack>
          {h.master('buyerId', 'Buyer', salesEmployeeDef, { hint: 'Who bought the goods.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the receipt is added.' })}
        </FieldStack>
      </fieldset>
    </Section>
  );
}

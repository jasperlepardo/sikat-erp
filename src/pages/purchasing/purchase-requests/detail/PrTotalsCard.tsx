import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { PrSectionProps } from './types';

export function PrTotalsCard({ draft, update }: PrSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <FieldStack>
        {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document for access control.' })}
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the request is added.' })}
      </FieldStack>
    </Section>
  );
}

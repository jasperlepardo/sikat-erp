import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { GrSectionProps } from './types';

interface GrTotalsCardProps extends GrSectionProps {
  locked: boolean;
}

/** Buyer, owner and remarks. The totals sit in the Contents footer (returnDoc). */
export function GrTotalsCard({ draft, update, locked }: GrTotalsCardProps) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <fieldset disabled={locked} className="contents">
        <FieldStack>
          {h.master('buyerId', 'Buyer', salesEmployeeDef)}
          {h.master('ownerId', 'Owner', salesEmployeeDef)}
        </FieldStack>
      </fieldset>
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the return is added.' })}
      </FieldStack>
    </Section>
  );
}

import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { QtTabProps } from './types';

export function QtAssignmentCard({ draft, update, ctx }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="person_search" title="Assignment">
        <FieldStack>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, hint: 'Defaults from the customer.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document (data access).' })}
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the quotation is added.' })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}

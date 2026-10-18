import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { NO_SALES_EMPLOYEE } from '../../../../mocks/salesOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { RiSectionProps } from './types';

export function RiAssignmentCard({ draft, update, ctx }: RiSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="person_search" title="Assignment">
      <fieldset disabled={ctx.readOnly} className="contents">
        <FieldStack>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the reserve invoice is added.' })}
        </FieldStack>
      </fieldset>
    </Section>
  );
}

import { Fields, Section, bind } from '../../../../components/form/fields';
import { NO_SALES_EMPLOYEE } from '../../../../mocks/salesOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { DnSectionProps } from './types';

export function DnAssignmentCard({ draft, update, ctx }: DnSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="person_search" title="Assignment">
        <Fields cols={1}>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
        </Fields>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the delivery is added.' })}
      </Section>
    </fieldset>
  );
}

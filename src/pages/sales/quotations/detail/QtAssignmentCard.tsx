import { Fields, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { QtTabProps } from './types';

export function QtAssignmentCard({ draft, update, ctx }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="person_search" title="Assignment">
        <Fields cols={1}>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true })}
          {h.master('ownerId', 'Owner', salesEmployeeDef)}
        </Fields>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the quotation is added.' })}
      </Section>
    </fieldset>
  );
}

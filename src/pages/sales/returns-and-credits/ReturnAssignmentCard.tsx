import { FieldStack, Section, bind } from '../../../components/form/fields';
import { NO_SALES_EMPLOYEE } from '../../../mocks/salesOrders';
import { salesEmployeeDef } from '../../settings/masterDefs';

interface ReturnFields {
  salesEmployeeId: string;
  ownerId: string;
  remarks: string;
}

interface Props {
  draft: ReturnFields;
  update: (patch: Partial<ReturnFields>) => void;
  readOnly: boolean;
  noun: string;
}

export function ReturnAssignmentCard({ draft, update, readOnly, noun }: Props) {
  const h = bind(draft, update);
  return (
    <Section icon="person_search" title="Assignment">
      <fieldset disabled={readOnly} className="contents">
        <FieldStack>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
          {h.area('remarks', 'Remarks', { rows: 3, hint: `Can be changed after the ${noun} is added.` })}
        </FieldStack>
      </fieldset>
    </Section>
  );
}

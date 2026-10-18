import { useNavigate } from 'react-router';
import { Icon, Link, type Option } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { employeeName } from '../../../../services/employees';
import { employeeStatusDef, terminationReasonDef } from '../../../settings/masterDefs';
import { HistoryCards } from '../HistoryCards';
import type { TabProps } from '../types';

const NAME_ORDERS: Option[] = [
  { value: 'first-last', label: 'First name, last name' },
  { value: 'last-first', label: 'Last name, first name' },
];

/** Employment dates and status, how the name displays, and the employee's history lists. */
export function AdministrationTab({
  draft,
  update,
  errors,
  employees,
  employeeNameOf,
}: TabProps & { employees: Option[]; employeeNameOf: (id: string) => string }) {
  const navigate = useNavigate();
  const h = bind(draft, update);
  return (
    <>
      <Section icon="work" title="Employment">
        <Fields cols={2}>
          {h.date('startDate', 'Start date', { hint: 'When the employee joined the company.' })}
          {h.master('statusId', 'Status', employeeStatusDef, { clearable: true })}
          {h.date('terminationDate', 'Termination date', { error: errors.terminationDate, hint: 'Last day of employment, set on offboarding.' })}
          {h.master('terminationReasonId', 'Termination reason', terminationReasonDef, {
            clearable: true,
            disabled: !draft.terminationDate,
            error: errors.terminationReasonId,
            hint: draft.terminationDate ? undefined : 'Set a termination date first.',
          })}
        </Fields>
      </Section>

      <Section icon="badge" title="Name positioning">
        <Fields cols={2}>
          {h.choose('nameOrder', 'Order', NAME_ORDERS, { hint: 'How the name shows in lists and pickers.' })}
          <ReadOnly label="Displays as" value={employeeName(draft) || '—'} />
        </Fields>
        <Flags>
          {h.check('nameComma', 'Display comma', { disabled: draft.nameOrder === 'first-last' })}
          {h.check('showMiddleName', 'Display middle name')}
        </Flags>
      </Section>

      <HistoryCards draft={draft} update={update} employees={employees} employeeName={employeeNameOf} />

      <Section icon="timer" title="Time sheet">
        <Link leadingIcon={<Icon size={20}>open_in_new</Icon>} onClick={() => navigate('/projects/timesheets')}>
          Open time sheets
        </Link>
      </Section>
    </>
  );
}

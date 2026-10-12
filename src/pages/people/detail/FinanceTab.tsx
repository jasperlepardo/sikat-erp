import { Fields, Section, bind } from '../../../components/form/fields';
import { PAY_PERIODS } from '../../../mocks/employees';
import { bankDef } from '../../settings/masterDefs';
import type { TabProps } from './types';

const PERIODS = PAY_PERIODS.map((p) => ({ value: p, label: `Per ${p.toLowerCase()}` }));

/** Pay, cost to the company, and the payroll bank account. */
export function FinanceTab({ draft, update, errors }: TabProps) {
  const h = bind(draft, update);
  return (
    <>
      <Section icon="payments" title="Pay">
        <Fields cols={2}>
          {h.num('salary', 'Salary (PHP)', { error: errors.salary, hint: 'Base pay.' })}
          {h.choose('salaryPeriod', 'Salary period', PERIODS)}
          {h.num('employeeCost', 'Employee costs (PHP)', {
            error: errors.employeeCost,
            hint: 'Full cost to the company: pay plus contributions and benefits. Used for cost allocation.',
          })}
          {h.choose('employeeCostPeriod', 'Cost period', PERIODS)}
        </Fields>
      </Section>
      <Section icon="account_balance" title="Payroll bank account">
        <Fields cols={2}>
          {h.master('bankId', 'Bank', bankDef, { clearable: true })}
          {h.text('bankBranch', 'Branch', { placeholder: 'e.g. Ortigas Center' })}
          {h.text('bankAccountNo', 'Account no.', { placeholder: 'e.g. 0012 3456 7890', hint: 'Where pay is deposited.' })}
        </Fields>
      </Section>
    </>
  );
}

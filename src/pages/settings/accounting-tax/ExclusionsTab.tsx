import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { FieldStack, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { EXCLUSION_KINDS, EXCLUSION_LINES, type CompensationExclusion } from '../../../mocks/compensation';
import { formatAmount } from '../../../services/format';
import { compensationExclusions } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const cap = (x: CompensationExclusion) => (x.annualCap > 0 ? `PHP ${formatAmount(x.annualCap)}` : 'No limit');

export function ExclusionsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(compensationExclusions);
  return (
    <MasterList<CompensationExclusion>
      {...route}
      icon="money_off"
      title="Tax-free compensation"
      noun="exclusion"
      description="Exemptions and exclusions from gross income, and the minimum wage earner exemption, as published by BIR. Each is deducted on one line of the year-end adjustment; an annual limit caps how much is excluded."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'id', header: 'No.', cell: (x) => Number(x.id.replace(/\D/g, '')) || '—' },
        { key: 'description', header: 'Compensation', cell: (x) => <span className="line-clamp-2 max-w-2xl whitespace-normal">{x.description}</span> },
        { key: 'kind', header: 'Applies to', cell: (x) => (x.kind === 'Minimum wage earner' ? 'Minimum wage earners' : 'All employees') },
        { key: 'line', header: 'Year-end line', cell: (x) => x.line },
        { key: 'annualCap', header: 'Annual limit', cell: cap },
        {
          key: 'active',
          header: 'Status',
          cell: (x) => <TableStatus intent={x.active ? 'success' : 'default'}>{x.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      sortValue={(x, key) => (key === 'annualCap' ? x.annualCap : String(x[key as keyof CompensationExclusion] ?? '').toLowerCase())}
      searchText={(x) => `${x.description} ${x.kind} ${x.line}`}
      blank={() => ({ id: newId('cx'), description: '', kind: 'Exemption / exclusion', line: 'Other non-taxable', annualCap: 0, active: true })}
      label={(x) => x.description.slice(0, 60)}
      validate={(x) => {
        const e: Record<string, string> = {};
        if (!x.description.trim()) e.description = 'Describe the compensation.';
        if (x.annualCap < 0) e.annualCap = 'The limit can’t be negative.';
        return e;
      }}
      onSave={(x) => save(x)}
      editor={(x, update, errors) => {
        const f = bind(x, update);
        return (
          <>
            <FieldStack>
              {f.area('description', 'Compensation', { required: true, error: errors.description, rows: 3,  })}
              {f.pick('kind', 'Kind', EXCLUSION_KINDS, { hint: 'Minimum wage earner items are exempt only for MWEs.' })}
              {f.pick('line', 'Year-end line', EXCLUSION_LINES)}
              {f.num('annualCap', 'Annual limit', { prefix: 'PHP', error: errors.annualCap, hint: '0 = no limit.' })}
            </FieldStack>
            {f.check('active', 'Active')}
          </>
        );
      }}
    />
  );
}

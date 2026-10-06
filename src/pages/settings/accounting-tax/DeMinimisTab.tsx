import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { FieldStack, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import type { DeMinimisBenefit } from '../../../mocks/compensation';
import { deMinimisBenefits } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

export function DeMinimisTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(deMinimisBenefits);
  return (
    <MasterList<DeMinimisBenefit>
      {...route}
      icon="redeem"
      title="De minimis benefits"
      noun="de minimis benefit"
      description="De minimis benefits not subject to withholding tax, as published by BIR."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'id', header: 'No.', cell: (d) => Number(d.id.replace(/\D/g, '')) || '—' },
        { key: 'description', header: 'Benefit', cell: (d) => <span className="line-clamp-2 max-w-3xl whitespace-normal">{d.description}</span> },
        {
          key: 'active',
          header: 'Status',
          cell: (d) => <TableStatus intent={d.active ? 'success' : 'default'}>{d.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      searchText={(d) => d.description}
      blank={() => ({ id: newId('dm'), description: '', active: true })}
      label={(d) => d.description.slice(0, 60)}
      validate={(d) => { const e: Record<string, string> = {}; if (!d.description.trim()) e.description = 'Describe the benefit.'; return e; }}
      onSave={(d) => save(d)}
      editor={(d, update, errors) => {
        const f = bind(d, update);
        return (
          <>
            <FieldStack>{f.area('description', 'Benefit', { required: true, error: errors.description, rows: 4 })}</FieldStack>
            {f.check('active', 'Active')}
          </>
        );
      }}
    />
  );
}

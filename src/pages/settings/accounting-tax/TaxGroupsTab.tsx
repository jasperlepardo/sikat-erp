import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList } from '../../../components/form/MasterList';
import { currentRate, type TaxGroup } from '../../../mocks/taxes';
import { taxCodes, taxGroups } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from './useCollectionRows';

const blank = (): TaxGroup => ({ id: newId('tg'), code: '', name: '', direction: 'Sales', taxCode: '', active: true });

export function TaxGroupsTab() {
  const { rows, save, setActive } = useCollectionRows(taxGroups);
  const codes = useAsync(taxCodes.list, []) ?? [];
  const codeOf = (code: string) => codes.find((c) => c.code === code);

  return (
    <MasterList<TaxGroup>
      icon="account_tree"
      title="Tax groups"
      noun="tax group"
      description="Items carry a sales and a purchase tax group: the default code for what the item is (goods, services, capital goods, exempt…). The partner’s or company’s tax status can override it — see Determination rules."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (g) => g.code },
        { key: 'name', header: 'Name', cell: (g) => g.name },
        { key: 'direction', header: 'Used on', cell: (g) => g.direction },
        {
          key: 'taxCode',
          header: 'Default tax code',
          cell: (g) => {
            const c = codeOf(g.taxCode);
            return c ? (
              `${c.code} · ${c.name} (${currentRate(c) ?? '—'}%)`
            ) : (
              <span className="text-warning">Missing</span>
            );
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (g) => (
            <TableStatus intent={g.active ? 'success' : 'default'}>{g.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(g) => `${g.code} ${g.name} ${g.taxCode}`}
      blank={blank}
      label={(g) => `${g.code} · ${g.name}`}
      validate={(g, all) => {
        const e: Record<string, string> = {};
        if (!g.code.trim()) e.code = 'Code is required.';
        else if (all.some((x) => x.id !== g.id && x.code.toLowerCase() === g.code.trim().toLowerCase()))
          e.code = `${g.code} already exists.`;
        if (!g.name.trim()) e.name = 'Name is required.';
        const c = codeOf(g.taxCode);
        if (!c) e.taxCode = 'Pick a tax code.';
        else if (c.direction !== g.direction) e.taxCode = `${c.code} is a ${c.direction.toLowerCase()} code.`;
        return e;
      }}
      onSave={(g) => save({ ...g, code: g.code.trim().toUpperCase() })}
      editor={(g, update, errors) => {
        const f = bind(g, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. S-VAT12' })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.pick('direction', 'Used on', ['Sales', 'Purchase'])}
              {f.choose(
                'taxCode',
                'Default tax code',
                codes
                  .filter((c) => c.direction === g.direction && (c.active || c.code === g.taxCode))
                  .map((c) => ({ value: c.code, label: `${c.code} · ${c.name} (${currentRate(c) ?? '—'}%)` })),
                { required: true, error: errors.taxCode, placeholder: 'Pick a tax code', className: 'md:col-span-3' },
              )}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

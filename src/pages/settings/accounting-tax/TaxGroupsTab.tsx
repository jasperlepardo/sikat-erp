import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { FieldStack, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { currentRate, type TaxGroup } from '../../../mocks/taxes';
import { taxCodes, taxGroups } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { useCollectionRows } from '../../../services/useCollectionRows';

// The id is set from the code on save: the code is the key.
const blank = (): TaxGroup => ({ id: '', code: '', name: '', direction: 'Sales', taxCode: '', zeroRated: false, active: true });

export function TaxGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(taxGroups);
  const codes = useAsync(taxCodes.list, []) ?? [];
  const codeOf = (code: string) => codes.find((c) => c.code === code);

  return (
    <MasterList<TaxGroup>
      {...route}
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
      onSave={(g) => save({ ...g, id: g.id || g.code.trim().toUpperCase(), code: g.code.trim().toUpperCase() })}
      editor={(g, update, errors, isNew) => {
        const f = bind(g, update);
        return (
          <>
            <FieldStack>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. S-VAT12', disabled: !isNew, hint: !isNew ? "Can't change once saved — items, partners and documents store it." : undefined })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.pick('direction', 'Used on', ['Sales', 'Purchase'])}
              {f.lookup(
                'taxCode',
                'Default tax code',
                codes
                  .filter((c) => c.direction === g.direction && (c.active || c.code === g.taxCode))
                  .map((c) => ({ value: c.code, label: `${c.code} · ${c.name} (${currentRate(c) ?? '—'}%)` })),
                { required: true, error: errors.taxCode, placeholder: 'Pick a tax code',  },
              )}
              {f.status('active', 'Status')}
            </FieldStack>
            {f.check('zeroRated', 'Zero-rated — suppliers may zero-rate it only for a registered export enterprise')}
          </>
        );
      }}
    />
  );
}
